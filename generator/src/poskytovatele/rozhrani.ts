// Rozhraní poskytovatele generování — jediné místo, kde je definované.
// Implementace: api.ts (@anthropic-ai/sdk), claude-cli.ts (lokální binárka claude),
// mock.ts (deterministické otázky pro testy). Výběr a autodetekce: vyber.ts.

import type { Obtiznost, Tema } from '@questor/sdilene';
import type { Kapitola } from '../ingest';
import type { LlmOtazka } from '../llm-schema';
import type { LlmLekce } from '../llm-schema-vyuka';

export type NazevPoskytovatele = 'api' | 'claude-cli' | 'mock';

export const NAZVY_POSKYTOVATELU: NazevPoskytovatele[] = ['api', 'claude-cli', 'mock'];

/** Pásmo obtížnosti jedné dávky otázek (1–2, 3, 4–5; při dogenerování min = max). */
export interface PasmoObtiznosti {
  min: Obtiznost;
  max: Obtiznost;
}

export interface VstupTemat {
  nazevPredmetu: string;
  kapitoly: Kapitola[];
}

export interface VstupGenerovani {
  nazevPredmetu: string;
  tema: Tema;
  pasmo: PasmoObtiznosti;
  pocet: number;
  /** Výřez učiva relevantní k tématu. */
  kontext: string;
}

export interface VstupOvereni {
  nazevPredmetu: string;
  tema: Tema;
  otazky: LlmOtazka[];
  kontext: string;
}

export interface VstupLekce {
  nazevPredmetu: string;
  tema: Tema;
  /** Pořadové číslo lekce od 1 (do promptu). */
  cisloLekce: number;
  celkemLekci: number;
  /** Výřez učiva relevantní k tématu. */
  kontext: string;
}

export interface Poskytovatel {
  nazev: NazevPoskytovatele;
  /** Z osnovy učiva vytěží názvy témat. */
  extrahujTemata(vstup: VstupTemat): Promise<string[]>;
  /**
   * Vygeneruje dávku otázek (mix typů) pro téma × pásmo obtížnosti.
   * Vrací null, když model dávku odmítl nebo nevrátil použitelný výstup — dávka se přeskočí.
   */
  vygenerujOtazky(vstup: VstupGenerovani): Promise<LlmOtazka[] | null>;
  /**
   * Verifikační průchod: zkontroluje klíč správnosti a vysvětlení, opraví nebo vyřadí.
   * Vrací null, když ověření neproběhlo (volající si rozhodne, co s neověřenou dávkou).
   */
  overOtazky(vstup: VstupOvereni): Promise<LlmOtazka[] | null>;
  /**
   * Vygeneruje JEDNU výukovou lekci k tématu (režim --vyuka; po lekci kvůli
   * max_tokens). Vrací null, když model lekci odmítl nebo nevrátil použitelný
   * výstup — lekce se přeskočí.
   */
  vygenerujLekci(vstup: VstupLekce): Promise<LlmLekce | null>;
}
