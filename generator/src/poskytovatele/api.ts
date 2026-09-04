// Poskytovatel 'api' — Claude API přes @anthropic-ai/sdk se structured outputem.
// Závazné vzory (docs/ARCHITEKTURA.md): messages.parse + zodOutputFormat,
// max_tokens 16000, žádný thinking parametr, žádný prefill, typované chyby,
// RateLimitError → 2 opakování s pauzou, refusal → dávka se přeskočí (null).

import Anthropic, { AnthropicError, APIError, RateLimitError } from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod/v4';
import { davkaOtazekSchema, seznamTematSchema } from '../llm-schema';
import { promptOtazky, promptOvereni, promptTemata, SYSTEM_GENERATOR } from '../prompty';
import type { Poskytovatel } from './rozhrani';

export const VYCHOZI_MODEL = 'claude-opus-5';

const MAX_OPAKOVANI_RATE_LIMIT = 2;
const PAUZA_MS = 20_000;

function pauza(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ApiVolby {
  model?: string;
  /** Hlášky o průběhu (přeskočené dávky, opakování). */
  log?: (zprava: string) => void;
  /** Pauza mezi opakováními — injektuje se v testech. */
  cekej?: (ms: number) => Promise<void>;
}

export function vytvorPoskytovateleApi(volby: ApiVolby = {}): Poskytovatel {
  const model = volby.model ?? VYCHOZI_MODEL;
  const log = volby.log ?? (() => {});
  const cekej = volby.cekej ?? pauza;
  // Klíč si klient bere z env ANTHROPIC_API_KEY — nikdy ho nelogovat.
  const client = new Anthropic();

  async function zavolej<S extends z.ZodType<{ [k: string]: unknown }>>(
    prompt: string,
    schema: S,
    popis: string,
  ): Promise<z.infer<S> | null> {
    let pokus = 0;
    for (;;) {
      try {
        const odpoved = await client.messages.parse({
          model,
          max_tokens: 16000,
          system: SYSTEM_GENERATOR,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(schema) },
        });
        if (odpoved.stop_reason === 'refusal') {
          const duvod = odpoved.stop_details?.explanation ?? 'bez vysvětlení';
          log(`POZOR: model odmítl (${popis}): ${duvod} — dávka se přeskakuje.`);
          return null;
        }
        if (odpoved.parsed_output == null) {
          log(`POZOR: model nevrátil parsovatelný výstup (${popis}) — dávka se přeskakuje.`);
          return null;
        }
        return odpoved.parsed_output;
      } catch (chyba) {
        if (chyba instanceof RateLimitError && pokus < MAX_OPAKOVANI_RATE_LIMIT) {
          pokus += 1;
          log(`Rate limit (${popis}) — pauza a pokus ${pokus}/${MAX_OPAKOVANI_RATE_LIMIT}.`);
          await cekej(PAUZA_MS * pokus);
          continue;
        }
        if (chyba instanceof APIError) {
          throw new Error(
            `Volání Claude API selhalo (${popis}): HTTP ${chyba.status ?? '?'} — ${chyba.message}`,
          );
        }
        if (chyba instanceof AnthropicError) {
          // Např. výstup nešel zparsovat podle schématu — dávku přeskočíme, pipeline běží dál.
          log(`POZOR: výstup modelu nešel zpracovat (${popis}): ${chyba.message} — dávka se přeskakuje.`);
          return null;
        }
        throw chyba;
      }
    }
  }

  return {
    nazev: 'api',
    async extrahujTemata(vstup) {
      const vysledek = await zavolej(
        promptTemata(vstup.nazevPredmetu, vstup.kapitoly),
        seznamTematSchema,
        'extrakce témat',
      );
      if (!vysledek) {
        throw new Error('Extrakce témat selhala — bez témat nejde generovat banku.');
      }
      return vysledek.temata;
    },
    async vygenerujOtazky(vstup) {
      const vysledek = await zavolej(
        promptOtazky(vstup),
        davkaOtazekSchema,
        `otázky „${vstup.tema.nazev}“ ${vstup.pasmo.min}–${vstup.pasmo.max}`,
      );
      return vysledek ? vysledek.otazky : null;
    },
    async overOtazky(vstup) {
      const vysledek = await zavolej(
        promptOvereni(vstup),
        davkaOtazekSchema,
        `ověření „${vstup.tema.nazev}“`,
      );
      return vysledek ? vysledek.otazky : null;
    },
  };
}
