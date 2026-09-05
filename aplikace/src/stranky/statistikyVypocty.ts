// Ciste vypocty pro stranku Statistiky — filtrovani per studijni banka.
// Oddelene od komponenty kvuli testovatelnosti (aplikace/test).
import type { TestVysledek } from '@questor/sdilene';

/** Testy z historie patrici dane bance (podle konfigurace.predmetId). */
export function testyBanky(historie: TestVysledek[], predmetId: string | null): TestVysledek[] {
  if (!predmetId) return historie;
  return historie.filter((v) => v.konfigurace.predmetId === predmetId);
}

/**
 * Tydenni XP z testu vybrane banky z prubezneho agregatu
 * `tydenniXpTestuPodleBank` (predmetId → pondeli tydne → soucet ziskaneXp),
 * ktery vede hraSlice.zapocitejTest. Presny za celou historii — na rozdil od
 * odvozovani z historieTestu (jen poslednich 10 testu). Bez banky (null)
 * se tydny scitaji pres vsechny banky. Globalni rekordy.tydenniXp zustavaji
 * netknute (gamifikace je jedna) — tohle je pohled pro graf ve Statistikach.
 */
export function tydenniXpBanky(
  agregat: Record<string, Record<string, number>>,
  predmetId: string | null,
): Record<string, number> {
  if (predmetId) return { ...(agregat[predmetId] ?? {}) };
  const soucet: Record<string, number> = {};
  for (const banka of Object.values(agregat)) {
    for (const [klic, xp] of Object.entries(banka)) {
      soucet[klic] = (soucet[klic] ?? 0) + xp;
    }
  }
  return soucet;
}
