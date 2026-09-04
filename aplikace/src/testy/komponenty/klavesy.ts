// Pomůcky pro klávesové ovládání otázek (1–4 / A–D, Enter).
// Hráč nesmí potřebovat myš (viz DESIGN.md).

/** True, když událost přišla z textového pole — tam klávesy nepřebíráme. */
export function jeVstupniPole(cil: EventTarget | null): boolean {
  return (
    cil instanceof HTMLElement &&
    (cil.tagName === 'INPUT' || cil.tagName === 'TEXTAREA' || cil.isContentEditable)
  );
}

/** Převede klávesu '1'–'9' nebo 'a'–'f' na index možnosti (null = nepatří sem). */
export function indexZKlavesy(klavesa: string, pocetMoznosti: number): number | null {
  const k = klavesa.toLowerCase();
  let index: number | null = null;
  if (/^[1-9]$/.test(k)) index = Number(k) - 1;
  else if (/^[a-f]$/.test(k)) index = k.charCodeAt(0) - 97;
  if (index === null || index >= pocetMoznosti) return null;
  return index;
}

/** Popisek klávesy pro danou možnost (1/A, 2/B, …). */
export function popisekKlavesy(index: number): string {
  return String(index + 1);
}
