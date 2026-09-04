// Ingest učiva — načtení souboru (.md/.txt/.pdf/.docx) a členění na kapitoly.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface Kapitola {
  nadpis: string;
  text: string;
}

/** Maximální délka jedné kapitoly ve znacích (delší sekce se dělí po odstavcích). */
export const MAX_DELKA_KAPITOLY = 3000;

const PRIPONY_TEXT = new Set(['.md', '.markdown', '.txt']);

/** Načte učivo ze souboru podle přípony: .md/.txt přímo, .pdf přes unpdf, .docx přes mammoth. */
export async function nactiText(cesta: string): Promise<string> {
  const pripona = path.extname(cesta).toLowerCase();

  if (PRIPONY_TEXT.has(pripona)) {
    return fs.readFile(cesta, 'utf8');
  }

  if (pripona === '.pdf') {
    const { extractText } = await import('unpdf');
    const data = new Uint8Array(await fs.readFile(cesta));
    const { text } = await extractText(data, { mergePages: true });
    return text;
  }

  if (pripona === '.docx') {
    const { default: mammoth } = await import('mammoth');
    const { value } = await mammoth.extractRawText({ path: cesta });
    return value;
  }

  throw new Error(
    `Nepodporovaná přípona „${pripona || '(žádná)'}“ — podporuji .md, .txt, .pdf a .docx.`,
  );
}

interface Sekce {
  nadpis: string;
  radky: string[];
}

/** Rozdělí text učiva podle nadpisů (#/##/…) a odstavců na kapitoly ~≤ maxDelka znaků. */
export function rozdelNaKapitoly(text: string, maxDelka: number = MAX_DELKA_KAPITOLY): Kapitola[] {
  const radky = text.split(/\r?\n/);
  const sekce: Sekce[] = [];
  let aktualni: Sekce | null = null;

  for (const radek of radky) {
    const nadpis = radek.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (nadpis) {
      aktualni = { nadpis: nadpis[1], radky: [] };
      sekce.push(aktualni);
      continue;
    }
    if (!aktualni) {
      if (radek.trim() === '') continue;
      aktualni = { nadpis: '', radky: [] };
      sekce.push(aktualni);
    }
    aktualni.radky.push(radek);
  }

  const kapitoly: Kapitola[] = [];
  for (const s of sekce) {
    const obsah = s.radky.join('\n').trim();
    if (obsah === '' && s.nadpis === '') continue;
    const nadpis = s.nadpis || odvodNadpis(obsah);
    if (obsah.length <= maxDelka) {
      if (obsah !== '' || s.nadpis !== '') {
        kapitoly.push({ nadpis, text: obsah });
      }
      continue;
    }
    const casti = rozdelText(obsah, maxDelka);
    casti.forEach((cast, i) => {
      kapitoly.push({ nadpis: i === 0 ? nadpis : `${nadpis} (část ${i + 1})`, text: cast });
    });
  }
  return kapitoly;
}

/** Fallback nadpis pro text bez nadpisů — první neprázdný řádek zkrácený na 60 znaků. */
function odvodNadpis(obsah: string): string {
  const prvniRadek = obsah.split('\n').find((r) => r.trim() !== '')?.trim() ?? 'Učivo';
  return prvniRadek.length > 60 ? `${prvniRadek.slice(0, 57)}…` : prvniRadek;
}

/** Rozdělí dlouhý text po odstavcích (a v nouzi po větách/znacích) na kusy ≤ maxDelka. */
function rozdelText(text: string, maxDelka: number): string[] {
  const odstavce = text.split(/\n{2,}/);
  const casti: string[] = [];
  let buffer = '';

  const uloz = () => {
    if (buffer.trim() !== '') casti.push(buffer.trim());
    buffer = '';
  };

  for (const odstavec of odstavce) {
    const kusy = odstavec.length > maxDelka ? rozdelOdstavec(odstavec, maxDelka) : [odstavec];
    for (const kus of kusy) {
      if (buffer !== '' && buffer.length + kus.length + 2 > maxDelka) uloz();
      buffer = buffer === '' ? kus : `${buffer}\n\n${kus}`;
    }
  }
  uloz();
  return casti;
}

/** Odstavec delší než maxDelka rozseká po větách, v krajním případě po znacích. */
function rozdelOdstavec(odstavec: string, maxDelka: number): string[] {
  const vety = odstavec.split(/(?<=[.!?])\s+/);
  const kusy: string[] = [];
  let buffer = '';
  for (const veta of vety) {
    if (veta.length > maxDelka) {
      if (buffer !== '') {
        kusy.push(buffer);
        buffer = '';
      }
      for (let i = 0; i < veta.length; i += maxDelka) {
        kusy.push(veta.slice(i, i + maxDelka));
      }
      continue;
    }
    if (buffer !== '' && buffer.length + veta.length + 1 > maxDelka) {
      kusy.push(buffer);
      buffer = '';
    }
    buffer = buffer === '' ? veta : `${buffer} ${veta}`;
  }
  if (buffer !== '') kusy.push(buffer);
  return kusy;
}
