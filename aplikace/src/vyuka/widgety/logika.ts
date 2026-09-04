// Čistá logika výukových widgetů — bez Reactu a bez DOM, aby šla testovat
// vitestem. Náhoda se VŽDY injektuje (`() => number`), viz ARCHITEKTURA.md.

import type { CasovaOsaParametry, PexesoParametry } from '@questor/sdilene';

// ---------------------------------------------------------------------------
// Společné

/** Fisher–Yates zamíchání s injektovanou náhodou. Vrací NOVÉ pole. */
export function zamichej<T>(pole: readonly T[], nahoda: () => number): T[] {
  const kopie = [...pole];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(nahoda() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

// ---------------------------------------------------------------------------
// Třídička — drag & drop třídění položek do kategorií

export interface TridickaStav {
  /** Indexy položek (do parametry.polozky), které čekají v zásobníku. */
  zbyva: number[];
  /** kategorieId → indexy správně zařazených položek (v pořadí zařazení). */
  zarazeno: Record<string, number[]>;
  /** Počet špatných pokusů (pro závěrečné hodnocení). */
  chyby: number;
}

export function vytvorTridickaStav(pocetPolozek: number, poradi?: number[]): TridickaStav {
  return {
    zbyva: poradi ?? Array.from({ length: pocetPolozek }, (_, i) => i),
    zarazeno: {},
    chyby: 0,
  };
}

/**
 * Pokus o zařazení položky do kategorie. Správně → položka se přesune ze
 * zásobníku do kategorie; špatně → zůstává a roste počítadlo chyb.
 * Vrací NOVÝ stav (imutabilně) + příznak `spravne`.
 */
export function zaradPolozku(
  stav: TridickaStav,
  indexPolozky: number,
  kategorieId: string,
  polozky: readonly { text: string; kategorieId: string }[],
): { stav: TridickaStav; spravne: boolean } {
  if (!stav.zbyva.includes(indexPolozky)) return { stav, spravne: false };
  const polozka = polozky[indexPolozky];
  if (!polozka || polozka.kategorieId !== kategorieId) {
    return { stav: { ...stav, chyby: stav.chyby + 1 }, spravne: false };
  }
  return {
    stav: {
      zbyva: stav.zbyva.filter((i) => i !== indexPolozky),
      zarazeno: {
        ...stav.zarazeno,
        [kategorieId]: [...(stav.zarazeno[kategorieId] ?? []), indexPolozky],
      },
      chyby: stav.chyby,
    },
    spravne: true,
  };
}

export function tridickaHotovo(stav: TridickaStav): boolean {
  return stav.zbyva.length === 0;
}

// ---------------------------------------------------------------------------
// Pexeso — párování pojem ↔ definice

export interface PexesoKarta {
  /** Index dvojice v parametrech (páruje se podle něj). */
  parId: number;
  /** Která strana dvojice (a = pojem, b = protějšek). */
  strana: 'a' | 'b';
  text: string;
}

/** Rozloží dvojice na zamíchaný balíček karet (každá dvojice = 2 karty). */
export function vytvorBalicek(
  dvojice: PexesoParametry['dvojice'],
  nahoda: () => number,
): PexesoKarta[] {
  const karty: PexesoKarta[] = dvojice.flatMap((d, i) => [
    { parId: i, strana: 'a' as const, text: d.a },
    { parId: i, strana: 'b' as const, text: d.b },
  ]);
  return zamichej(karty, nahoda);
}

/** Dvě otočené karty tvoří pár, když patří ke stejné dvojici. */
export function jePar(a: PexesoKarta, b: PexesoKarta): boolean {
  return a.parId === b.parId && a.strana !== b.strana;
}

/**
 * Hodnocení hry hvězdami (1–3) podle počtu tahů. Minimum tahů = počet dvojic;
 * do 1,5× minima ***, do 2,5× minima **, jinak *.
 */
export function hvezdyZaTahy(pocetDvojic: number, tahy: number): 1 | 2 | 3 {
  if (tahy <= Math.ceil(pocetDvojic * 1.5)) return 3;
  if (tahy <= Math.ceil(pocetDvojic * 2.5)) return 2;
  return 1;
}

/** Počet sloupců mřížky pexesa podle počtu karet (ať je zhruba čtvercová). */
export function sloupcePexesa(pocetKaret: number): number {
  if (pocetKaret <= 6) return 3;
  if (pocetKaret <= 12) return 4;
  if (pocetKaret <= 18) return 5;
  return 6;
}

// ---------------------------------------------------------------------------
// Průběh procesu — krokování

/** Posun na další/předchozí krok; drží se v mezích. */
export function posunKroku(aktualni: number, pocet: number, smer: 1 | -1): number {
  return Math.min(pocet - 1, Math.max(0, aktualni + smer));
}

export function vsechnyKrokyNavstiveny(navstivene: ReadonlySet<number>, pocet: number): boolean {
  for (let i = 0; i < pocet; i++) if (!navstivene.has(i)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Popisovačka — hotspoty nad SVG

export interface ViewBox {
  minX: number;
  minY: number;
  sirka: number;
  vyska: number;
}

/**
 * Vytáhne viewBox z SVG řetězce (fallback: width/height atributy, jinak
 * 0 0 100 100). Hotspoty se pak umisťují procenty vůči téhle soustavě.
 */
export function extrahujViewBox(svg: string): ViewBox {
  const vb = /viewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+)\s*["']/i.exec(svg);
  if (vb) {
    const cisla = [vb[1], vb[2], vb[3], vb[4]].map(Number);
    if (cisla.every((c) => Number.isFinite(c)) && cisla[2] > 0 && cisla[3] > 0) {
      return { minX: cisla[0], minY: cisla[1], sirka: cisla[2], vyska: cisla[3] };
    }
  }
  const w = /<svg[^>]*\swidth\s*=\s*["']?([\d.]+)/i.exec(svg);
  const h = /<svg[^>]*\sheight\s*=\s*["']?([\d.]+)/i.exec(svg);
  const sirka = w ? Number(w[1]) : NaN;
  const vyska = h ? Number(h[1]) : NaN;
  if (Number.isFinite(sirka) && sirka > 0 && Number.isFinite(vyska) && vyska > 0) {
    return { minX: 0, minY: 0, sirka, vyska };
  }
  return { minX: 0, minY: 0, sirka: 100, vyska: 100 };
}

/** Pozice hotspotu v procentech kontejneru (překrývá SVG roztažené na 100 %). */
export function pozicniProcenta(bod: { x: number; y: number }, vb: ViewBox): { levaPct: number; horniPct: number } {
  return {
    levaPct: ((bod.x - vb.minX) / vb.sirka) * 100,
    horniPct: ((bod.y - vb.minY) / vb.vyska) * 100,
  };
}

// ---------------------------------------------------------------------------
// Časová osa

/** Události stabilně seřazené podle roku (při shodě podle názvu). */
export function seradUdalosti(
  udalosti: CasovaOsaParametry['udalosti'],
): CasovaOsaParametry['udalosti'] {
  return [...udalosti].sort((a, b) => a.rok - b.rok || a.nazev.localeCompare(b.nazev, 'cs'));
}

/** Formát roku: záporné = př. n. l. */
export function formatujRok(rok: number): string {
  return rok < 0 ? `${-rok} př. n. l.` : String(rok);
}

// ---------------------------------------------------------------------------
// Srovnávač

/** Sjednocený seznam názvů vlastností přes všechny položky (v pořadí výskytu). */
export function seznamVlastnosti(
  polozky: readonly { vlastnosti: Record<string, string> }[],
): string[] {
  const videne = new Set<string>();
  const vysledek: string[] = [];
  for (const p of polozky) {
    for (const klic of Object.keys(p.vlastnosti)) {
      if (!videne.has(klic)) {
        videne.add(klic);
        vysledek.push(klic);
      }
    }
  }
  return vysledek;
}

/** Hodnoty jedné vlastnosti napříč položkami (chybějící → null). */
export function hodnotyVlastnosti(
  polozky: readonly { vlastnosti: Record<string, string> }[],
  klic: string,
): (string | null)[] {
  return polozky.map((p) => (klic in p.vlastnosti ? p.vlastnosti[klic] : null));
}

/** True, když se přítomné hodnoty liší (řádek stojí za zvýraznění rozdílu). */
export function jsouRozdilne(hodnoty: readonly (string | null)[]): boolean {
  const pritomne = hodnoty.filter((h): h is string => h !== null);
  if (pritomne.length < 2) return false;
  return new Set(pritomne.map((h) => h.trim().toLowerCase())).size > 1;
}
