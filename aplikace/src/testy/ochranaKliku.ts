// Ochranna prodleva po zobrazeni nove otazky (test vsech rezimu, duel, host).
// Po odpovedi (Zkouska, duel) nebo po „Dalsi" se nova otazka vykresli hned
// a jeji moznosti lezi na stejnych mistech — dvoji/rychle ťuknuti by tak
// naslepo odpovedelo na otazku, kterou student ani nevidel. Kliky (mys,
// dotyk) v prvnich OCHRANNA_PRODLEVA_MS po zobrazeni se proto tise zahodi
// (hook pouzijOchranuKliku). Klavesnice (1–4 / A–D / Enter) ochranou
// neprochazi — desktopovy hrac o rychlost neprijde. Cas duelu se meri
// syrove od zobrazeni otazky (duely/engine.ts casOtazkyMs) — prodleva ho
// neposouva, server i starsi klienti tak pocitaji stejne. Tenhle modul je
// cisty (bez Reactu).

/** Delka ochranne prodlevy po zobrazeni otazky (ms). */
export const OCHRANNA_PRODLEVA_MS = 350;

/**
 * Je okamzik `tedMs` jeste v ochranne prodleve po zobrazeni otazky
 * v `zobrazenoMs`? Cista funkce (cas se injektuje). Bez znameho okamziku
 * zobrazeni nebo s casem „pred zobrazenim" (jiny zdroj hodin) se neblokuje.
 */
export function jeVOchranneProdleve(
  zobrazenoMs: number | null,
  tedMs: number,
  prodlevaMs: number = OCHRANNA_PRODLEVA_MS,
): boolean {
  if (zobrazenoMs === null) return false;
  const uplynulo = tedMs - zobrazenoMs;
  return uplynulo >= 0 && uplynulo < prodlevaMs;
}
