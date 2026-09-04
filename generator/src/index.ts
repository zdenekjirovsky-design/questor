// Veřejné rozhraní @questor/generator — knihovna pro server (dogenerování
// otázek na vyžádání) + exporty pipeline pro CLI a testy.

import type { Obtiznost, Otazka, Tema } from '@questor/sdilene';
import { vytvorPoskytovateleApi } from './poskytovatele/api';
import { sestavOtazky } from './pipeline';

export { nactiText, rozdelNaKapitoly, MAX_DELKA_KAPITOLY, type Kapitola } from './ingest';
export {
  OTAZEK_NA_DAVKU,
  PASMA,
  sestavOtazky,
  sestavTemata,
  vyberKontextProTema,
  vygenerujBanku,
  vytvorIdTematu,
  type StatistikyGenerovani,
  type VstupPipeline,
} from './pipeline';
export {
  prevedBlok,
  sestavLekci,
  vygenerujVyuku,
  type StatistikyVyuky,
  type VstupPipelineVyuky,
} from './pipeline-vyuka';
export { vyberPoskytovatele, type VybranyPoskytovatel } from './poskytovatele/vyber';
export {
  type NazevPoskytovatele,
  type PasmoObtiznosti,
  type Poskytovatel,
  type VstupLekce,
} from './poskytovatele/rozhrani';
export { vytvorPoskytovateleApi, VYCHOZI_MODEL } from './poskytovatele/api';
export { vytvorPoskytovateleClaudeCli, jeClaudeCliDostupny } from './poskytovatele/claude-cli';
export { vytvorPoskytovateleMock } from './poskytovatele/mock';
export { type LlmOtazka } from './llm-schema';
export { llmLekceSchema, type LlmBlok, type LlmLekce } from './llm-schema-vyuka';

export interface DogenerovaniVstup {
  nazevPredmetu: string;
  tema: Tema;
  obtiznost: Obtiznost;
  pocet: number;
  kontextUciva?: string;
}

/**
 * Dogeneruje otázky na vyžádání (volá server z POST /api/generovani/dogenerovat).
 * Používá poskytovatele 'api' — bez ANTHROPIC_API_KEY vyhodí srozumitelnou chybu.
 * Vrací hotové otázky (id, temaId, validace); prázdné pole, když model dávku odmítl.
 */
export async function dogenerujOtazky(vstup: DogenerovaniVstup): Promise<Otazka[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'Dogenerování otázek vyžaduje ANTHROPIC_API_KEY v prostředí serveru — bez klíče je funkce vypnutá.',
    );
  }
  const poskytovatel = vytvorPoskytovateleApi();
  const pasmo = { min: vstup.obtiznost, max: vstup.obtiznost };
  const spolecne = {
    nazevPredmetu: vstup.nazevPredmetu,
    tema: vstup.tema,
    kontext: vstup.kontextUciva ?? '',
  };

  const surove = await poskytovatel.vygenerujOtazky({
    ...spolecne,
    pasmo,
    pocet: vstup.pocet,
  });
  if (surove === null) return [];

  const overene = (await poskytovatel.overOtazky({ ...spolecne, otazky: surove })) ?? surove;
  return sestavOtazky(overene, vstup.tema, pasmo).otazky;
}
