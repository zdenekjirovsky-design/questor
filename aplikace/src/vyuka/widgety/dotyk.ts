// Detekce dotykoveho zarizeni. HTML5 drag & drop na dotyku nefunguje,
// widgety (Tridicka) proto na hrubem pointeru prepinaji na rezim klik-klik.
// Zaklad je cista funkce s injektovanym matchMedia — testovatelna bez DOM.

export type MatchMediaFn = (dotaz: string) => { matches: boolean };

/**
 * Vyhodnoti `(pointer: coarse)` nad dodanym matchMedia.
 * Fail-safe: bez matchMedia nebo pri jeho chybe vraci false (desktopove
 * chovani s drag & drop zustava vychozi).
 */
export function jeHrubyPointer(matchMediaFn: MatchMediaFn | undefined | null): boolean {
  if (typeof matchMediaFn !== 'function') return false;
  try {
    return matchMediaFn('(pointer: coarse)').matches === true;
  } catch {
    return false;
  }
}

/** Pohodli pro komponenty — cte window.matchMedia aktualniho prostredi. */
export function jeDotykoveZarizeni(): boolean {
  if (typeof window === 'undefined') return false;
  const matchMediaFn = window.matchMedia;
  return jeHrubyPointer(matchMediaFn ? matchMediaFn.bind(window) : undefined);
}
