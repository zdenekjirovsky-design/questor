// Poskytovatel 'claude-cli' — lokální binárka `claude` (využije předplatné,
// bez API klíče): spawn claude -p <prompt> --output-format json, z stdout JSON
// se vezme pole `result` a z něj vytěží JSON blok (model je instruovaný vracet
// čistý JSON, ale pro jistotu umíme i ohrazení ``` a okolní text).

import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { davkaOtazekSchema, seznamTematSchema } from '../llm-schema';
import {
  POPIS_TVARU_OTAZEK,
  POPIS_TVARU_TEMAT,
  promptOtazky,
  promptOvereni,
  promptTemata,
} from '../prompty';
import type { Poskytovatel } from './rozhrani';

/** Je binárka `claude` dostupná v PATH? (pro autodetekci poskytovatele) */
export function jeClaudeCliDostupny(): boolean {
  for (const slozka of (process.env.PATH ?? '').split(path.delimiter)) {
    if (slozka === '') continue;
    try {
      accessSync(path.join(slozka, 'claude'), constants.X_OK);
      return true;
    } catch {
      // není tady, hledá se dál
    }
  }
  return false;
}

/** Z textu odpovědi modelu vytěží JSON blok (čistý JSON, ohrazení ```, nebo okolní text). */
export function vytezJsonBlok(text: string): unknown {
  const orezany = text.trim();
  try {
    return JSON.parse(orezany);
  } catch {
    // zkusí se ohrazení a výřez níže
  }

  const ohrazeni = orezany.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (ohrazeni) {
    try {
      return JSON.parse(ohrazeni[1].trim());
    } catch {
      // spadne se na výřez níže
    }
  }

  const zacatekObjektu = orezany.indexOf('{');
  const zacatekPole = orezany.indexOf('[');
  const zacatek =
    zacatekObjektu === -1
      ? zacatekPole
      : zacatekPole === -1
        ? zacatekObjektu
        : Math.min(zacatekObjektu, zacatekPole);
  const konec = Math.max(orezany.lastIndexOf('}'), orezany.lastIndexOf(']'));
  if (zacatek !== -1 && konec > zacatek) {
    try {
      return JSON.parse(orezany.slice(zacatek, konec + 1));
    } catch {
      // propadne se k chybě níže
    }
  }
  throw new Error('V odpovědi claude-cli se nepodařilo najít platný JSON blok.');
}

/** Zpracuje kompletní stdout `claude --output-format json`: vezme pole result a vytěží z něj JSON. */
export function zpracujStdoutClaudeCli(stdout: string): unknown {
  let obalka: unknown;
  try {
    obalka = JSON.parse(stdout);
  } catch (chyba) {
    throw new Error(
      `Výstup claude-cli není platný JSON: ${chyba instanceof Error ? chyba.message : String(chyba)}`,
    );
  }
  const result = (obalka as { result?: unknown }).result;
  if (typeof result !== 'string') {
    throw new Error('Výstup claude-cli neobsahuje textové pole „result“.');
  }
  return vytezJsonBlok(result);
}

function spustClaude(prompt: string, model?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const argumenty = ['-p', prompt, '--output-format', 'json'];
    if (model) argumenty.push('--model', model);
    const proces = spawn('claude', argumenty, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proces.stdout.on('data', (kus: Buffer) => {
      stdout += kus.toString('utf8');
    });
    proces.stderr.on('data', (kus: Buffer) => {
      stderr += kus.toString('utf8');
    });
    proces.on('error', (chyba) => {
      reject(new Error(`Binárku claude se nepodařilo spustit: ${chyba.message}`));
    });
    proces.on('close', (kod) => {
      if (kod !== 0) {
        reject(new Error(`claude-cli skončilo s kódem ${kod}: ${stderr.trim().slice(0, 500)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export interface ClaudeCliVolby {
  /** Model se binárce předá jen, když ho uživatel výslovně zadal (--model). */
  model?: string;
  log?: (zprava: string) => void;
}

export function vytvorPoskytovateleClaudeCli(volby: ClaudeCliVolby = {}): Poskytovatel {
  const log = volby.log ?? (() => {});

  async function zavolejDavku(prompt: string, popis: string) {
    let data: unknown;
    try {
      data = zpracujStdoutClaudeCli(await spustClaude(prompt, volby.model));
    } catch (chyba) {
      log(
        `POZOR: claude-cli selhalo (${popis}): ${chyba instanceof Error ? chyba.message : String(chyba)} — dávka se přeskakuje.`,
      );
      return null;
    }
    const vysledek = davkaOtazekSchema.safeParse(data);
    if (!vysledek.success) {
      log(`POZOR: odpověď claude-cli neodpovídá tvaru otázek (${popis}) — dávka se přeskakuje.`);
      return null;
    }
    return vysledek.data.otazky;
  }

  return {
    nazev: 'claude-cli',
    async extrahujTemata(vstup) {
      const prompt = `${promptTemata(vstup.nazevPredmetu, vstup.kapitoly)}\n\n${POPIS_TVARU_TEMAT}`;
      const data = zpracujStdoutClaudeCli(await spustClaude(prompt, volby.model));
      const vysledek = seznamTematSchema.safeParse(data);
      if (!vysledek.success) {
        throw new Error('Odpověď claude-cli na extrakci témat neodpovídá očekávanému tvaru.');
      }
      return vysledek.data.temata;
    },
    async vygenerujOtazky(vstup) {
      const prompt = `${promptOtazky(vstup)}\n\n${POPIS_TVARU_OTAZEK}`;
      return zavolejDavku(prompt, `otázky „${vstup.tema.nazev}“ ${vstup.pasmo.min}–${vstup.pasmo.max}`);
    },
    async overOtazky(vstup) {
      const prompt = `${promptOvereni(vstup)}\n\n${POPIS_TVARU_OTAZEK}`;
      return zavolejDavku(prompt, `ověření „${vstup.tema.nazev}“`);
    },
  };
}
