// Ovládání průběhu bleskovek — čisté pomůcky, které volá BleskPrubeh
// (bez Reactu, kvůli testům v Node bez DOM):
//  - akceKlavesy: co znamená stisk klávesy v dané fázi otázky,
//  - naplanujAutoPosun: po správné odpovědi sám přejde na další otázku,
//  - tridyMoznostiBlesku: vzhled tlačítka možnosti po odpovědi,
//  - oznameniBlesku: text pro čtečky obrazovky (živá oblast).
import { doplnZadani, moznostZKlavesy, PRODLEVA_PO_SPRAVNE_MS, rozdelZadani } from './blesk';

/** Fáze jedné bleskové otázky: čeká na odpověď / správně (běží auto-posun) / špatně (čeká na „Rozumím, dál“). */
export type FazeBlesku = 'otazka' | 'spravne' | 'spatne';

/** Fáze otázky z výsledku odpovědi (null = ještě neodpovězeno). */
export function fazeBlesku(spravne: boolean | null): FazeBlesku {
  if (spravne === null) return 'otazka';
  return spravne ? 'spravne' : 'spatne';
}

export type AkceKlavesy = { typ: 'odpoved'; index: number } | { typ: 'dalsi' };

/** Z události klávesy stačí tohle (KeyboardEvent to splňuje). */
export interface StiskKlavesy {
  key: string;
  /** Fyzická klávesa (Digit1…) — horní řada české klávesnice bez Shiftu číslice nepíše. */
  code?: string;
  repeat?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

/**
 * Co má stisk klávesy udělat (null = nic, klávesu nechat být):
 *  - čeká se na odpověď: 1/2/3 podle pozice (i fyzickou klávesou horní
 *    řady na české klávesnici), případně písmeno možnosti (moznostZKlavesy)
 *    → odpověď s DATOVÝM indexem,
 *  - po chybě: Enter = „Rozumím, dál“,
 *  - po správné odpovědi nic (další otázka naskočí sama).
 * Držená klávesa (auto-repeat) se ignoruje vždy — jinak by po auto-posunu
 * naslepo odpověděla na další otázku. Klávesové zkratky s Ctrl/Cmd/Alt
 * patří prohlížeči.
 */
export function akceKlavesy(
  stisk: StiskKlavesy,
  kontext: { faze: FazeBlesku; moznosti: readonly string[]; poradi: readonly number[] },
): AkceKlavesy | null {
  if (stisk.repeat || stisk.metaKey || stisk.ctrlKey || stisk.altKey) return null;
  if (kontext.faze === 'otazka') {
    const index = moznostZKlavesy(stisk.key, kontext.moznosti, kontext.poradi, stisk.code);
    return index === null ? null : { typ: 'odpoved', index };
  }
  if (kontext.faze === 'spatne' && stisk.key === 'Enter') return { typ: 'dalsi' };
  return null;
}

/**
 * Po SPRÁVNÉ odpovědi naplánuje přechod na další otázku za `prodlevaMs`
 * a vrátí úklid, který časovač zruší (odmontování komponenty, další otázka).
 * Po chybě ani před odpovědí neplánuje nic (vrací undefined) — po chybě se
 * pokračuje až tlačítkem. Tvar návratu sedí přímo do useEffect.
 */
export function naplanujAutoPosun(
  spravne: boolean | null,
  dalsi: () => void,
  prodlevaMs: number = PRODLEVA_PO_SPRAVNE_MS,
): (() => void) | undefined {
  if (spravne !== true) return undefined;
  const casovac = setTimeout(dalsi, prodlevaMs);
  return () => clearTimeout(casovac);
}

/**
 * Třídy tlačítka možnosti. Před odpovědí jen základ; po odpovědi je správná
 * možnost zelená (a když ji student trefil, krátce „poskočí“), zvolená
 * špatná červená se zatřesením a ostatní zeslábnou. `vybrana` = datový index
 * zvolené možnosti, null když ho neznáme (stránka obnovená ve zpětné vazbě).
 */
export function tridyMoznostiBlesku(
  index: number,
  stav: { faze: FazeBlesku; spravna: number; vybrana: number | null },
): string {
  if (stav.faze === 'otazka') return 'blesk-moznost';
  if (index === stav.spravna) {
    return index === stav.vybrana
      ? 'blesk-moznost blesk-moznost--spravne blesk-moznost--trefa'
      : 'blesk-moznost blesk-moznost--spravne';
  }
  return index === stav.vybrana
    ? 'blesk-moznost blesk-moznost--spatne'
    : 'blesk-moznost blesk-moznost--ostatni';
}

/**
 * Text pro čtečky obrazovky (jedna trvalá živá oblast v BleskPrubeh): nová
 * otázka naskakuje po správné odpovědi SAMA, takže ji nevidomému nikdo
 * neoznámí — oblast proto čte zadání a možnosti každé otázky, „Správně.“
 * a po chybě správné znění s vysvětlením. Téma se před odpovědí neříká
 * (stejně jako se neukazuje).
 */
export function oznameniBlesku(vstup: {
  faze: FazeBlesku;
  /** Pořadí otázky (od 1) a délka kola. */
  cislo: number;
  celkem: number;
  /** Zadání s podtržítkem, jak je v bance. */
  zadani: string;
  /** Texty možností v pořadí na obrazovce. */
  moznosti: readonly string[];
  /** Text správné možnosti. */
  spravnyText: string;
  vysvetleni: string;
  /** Název tématu — čte se jen po chybě. */
  nazevTematu?: string;
}): string {
  if (vstup.faze === 'spravne') return 'Správně.';
  if (vstup.faze === 'spatne') {
    const spravne = (
      rozdelZadani(vstup.zadani) ? doplnZadani(vstup.zadani, vstup.spravnyText) : vstup.spravnyText
    ).trim();
    // Samotná možnost (zadání bez mezery) nekončí tečkou — doplní se.
    const veta = /[.!?…]$/.test(spravne) ? spravne : `${spravne}.`;
    const tema = vstup.nazevTematu ? ` Téma: ${vstup.nazevTematu}.` : '';
    return `Špatně. Správně: ${veta} ${vstup.vysvetleni}${tema}`;
  }
  return `Otázka ${vstup.cislo} z ${vstup.celkem}: ${zadaniProCtecku(vstup.zadani)} Možnosti: ${vstup.moznosti.join(', ')}.`;
}

/**
 * Zadání, jak ho má čtečka přečíst: místo k doplnění jako „(doplň)“. Mezera
 * za ním jen tam, kde slovo pokračuje („b (doplň) liny“) — před interpunkcí
 * ne („s pytl (doplň).“).
 */
function zadaniProCtecku(zadani: string): string {
  const casti = rozdelZadani(zadani);
  if (!casti) return zadani.trim();
  const mezeraZa = /^[\p{L}\p{N}]/u.test(casti.po) ? ' ' : '';
  return `${casti.pred} (doplň)${mezeraZa}${casti.po}`.replace(/\s+/g, ' ').trim();
}
