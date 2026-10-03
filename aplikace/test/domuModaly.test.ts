// Fullscreen modaly na mobilu (Domů — Nová výprava a truhla, Sbírka — detail
// karty) + denní questy při studeném startu.
//
// CSS kontroly hlídají vrstvy a kaskádu, které se v jednotlivém souboru
// nedají poznat: spodní lišta (App.css) je fixní se z-indexem a modal pod
// ní ležel — ťuk na „Jdeme na to!“ trefil ikonu navigace. A global.css je
// v bundlu POSLEDNÍ, takže jednotřídní safe-area padding modalu tiše
// přebíjel mobilní .panel { padding: 14px } (proto dvě třídy).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bankaQuestuNactena, questyDne } from '../src/stranky/Domu';

function nactiCss(cesta: string): string {
  const soubor = fileURLToPath(new URL(`../src/${cesta}`, import.meta.url));
  return readFileSync(soubor, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Rozsahy bloků @media (max-width: 760px) { … } (párování závorek). */
function rozsahyMobilnichBloku(css: string): { od: number; obsahOd: number; do: number }[] {
  const rozsahy: { od: number; obsahOd: number; do: number }[] = [];
  const zacatek = /@media\s*\(max-width:\s*760px\)\s*\{/g;
  let shoda: RegExpExecArray | null;
  while ((shoda = zacatek.exec(css)) !== null) {
    let hloubka = 1;
    let i = zacatek.lastIndex;
    while (i < css.length && hloubka > 0) {
      if (css[i] === '{') hloubka += 1;
      else if (css[i] === '}') hloubka -= 1;
      i += 1;
    }
    rozsahy.push({ od: shoda.index, obsahOd: zacatek.lastIndex, do: i });
  }
  return rozsahy;
}

/** Obsah všech mobilních bloků. */
function mobilniBloky(css: string): string {
  return rozsahyMobilnichBloku(css)
    .map((r) => css.slice(r.obsahOd, r.do - 1))
    .join('\n');
}

/** CSS bez mobilních bloků (= co platí i na desktopu). */
function bezMobilnichBloku(css: string): string {
  let vysledek = '';
  let pozice = 0;
  for (const r of rozsahyMobilnichBloku(css)) {
    vysledek += css.slice(pozice, r.od);
    pozice = r.do;
  }
  return vysledek + css.slice(pozice);
}

/** Deklarace pravidel, jejichž seznam selektorů obsahuje přesně `selektor`. */
function deklarace(css: string, selektor: string): Record<string, string> {
  const vysledek: Record<string, string> = {};
  const pravidlo = /([^{}]+)\{([^{}]*)\}/g;
  let shoda: RegExpExecArray | null;
  while ((shoda = pravidlo.exec(css)) !== null) {
    const selektory = shoda[1].split(',').map((s) => s.trim());
    if (!selektory.includes(selektor)) continue;
    for (const radek of shoda[2].split(';')) {
      const dvojtecka = radek.indexOf(':');
      if (dvojtecka < 0) continue;
      vysledek[radek.slice(0, dvojtecka).trim()] = radek.slice(dvojtecka + 1).trim();
    }
  }
  return vysledek;
}

const APP_MOBIL = mobilniBloky(nactiCss('App.css'));
const DOMU = nactiCss('stranky/Domu.css');
const DOMU_MOBIL = mobilniBloky(DOMU);
const SBIRKA_MOBIL = mobilniBloky(nactiCss('stranky/Sbirka.css'));
const TRUHLA = nactiCss('hra/TruhlaOdmena.css');

describe('fullscreen modaly na mobilu — vrstvy nad spodní lištou', () => {
  const zListy = Number(deklarace(APP_MOBIL, '.hlavicka__nav')['z-index']);

  it('spodní lišta má na mobilu číselný z-index (předpoklad kontroly)', () => {
    expect(Number.isFinite(zListy)).toBe(true);
  });

  it('pozadí modalů Domů leží nad lištou', () => {
    const z = Number(deklarace(DOMU_MOBIL, '.domu__pozadi-modalu')['z-index']);
    expect(z).toBeGreaterThan(zListy);
  });

  it('pozadí detailu karty ve Sbírce leží nad lištou', () => {
    const z = Number(deklarace(SBIRKA_MOBIL, '.sbirka__pozadi-modalu')['z-index']);
    expect(z).toBeGreaterThan(zListy);
  });
});

describe('fullscreen modaly na mobilu — safe-area přebije .panel z global.css', () => {
  it('modal Domů: safe-area nahoře i dole se dvěma třídami + overscroll contain', () => {
    const d = deklarace(DOMU_MOBIL, '.panel.domu__modal');
    expect(d.padding).toContain('env(safe-area-inset-top');
    expect(d.padding).toContain('env(safe-area-inset-bottom');
    expect(d['overscroll-behavior']).toBe('contain');
  });

  it('detail karty ve Sbírce: safe-area nahoře i dole se dvěma třídami', () => {
    const d = deklarace(SBIRKA_MOBIL, '.panel.sbirka__detail');
    expect(d['padding-top']).toContain('env(safe-area-inset-top');
    expect(d['padding-bottom']).toContain('env(safe-area-inset-bottom');
  });

  it('pata s „Jdeme na to!“ je přilepená ke spodku a nese spodní safe-area', () => {
    const d = deklarace(DOMU_MOBIL, '.domu__modal-pata');
    expect(d.position).toBe('sticky');
    expect(d.padding).toContain('env(safe-area-inset-bottom');
  });

  it('pata dosedne ke spodní hraně: záporný bottom vyrovná padding modalu', () => {
    // Sticky obdélník je zmenšený o padding scroll kontejneru (14 px +
    // safe-area) — s bottom: 0 by pod patou zůstal pruh, kterým projíždí obsah.
    const normuj = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
    const pata = deklarace(DOMU_MOBIL, '.domu__modal-pata');
    expect(normuj(pata.bottom)).toBe('calc(-14px - env(safe-area-inset-bottom, 0px))');
    // Kompenzace musí sedět se spodním paddingem modalu.
    const padding = normuj(deklarace(DOMU_MOBIL, '.panel.domu__modal').padding);
    expect(padding.endsWith('calc(14px + env(safe-area-inset-bottom, 0px))')).toBe(true);
  });

  it('pata je stylovaná jen v mobilním bloku (desktop beze změny)', () => {
    expect(deklarace(bezMobilnichBloku(DOMU), '.domu__modal-pata')).toEqual({});
  });
});

describe('truhla — odměna a konfety nepřetékají do šířky', () => {
  it('konfety po doletu nedrží koncový transform (fill-mode backwards)', () => {
    const animace = deklarace(TRUHLA, '.truhla__konfeta').animation;
    expect(animace).toContain('backwards');
    expect(animace).not.toMatch(/\b(both|forwards)\b/);
  });

  it('karta odměny se na mobilu nestáhne do úzkého sloupce', () => {
    const d = deklarace(mobilniBloky(TRUHLA), '.truhla__odmena');
    expect(d.width).toBe('max-content');
    expect(d['max-width']).toBeDefined();
  });
});

describe('bankaQuestuNactena — denní questy čekají na načtení banky', () => {
  const banka = { predmetId: 'ekonomika' };

  it('prázdné banky při studeném startu → ještě negenerovat', () => {
    expect(bankaQuestuNactena({}, 'ekonomika')).toBe(false);
    expect(bankaQuestuNactena({}, null)).toBe(false);
  });

  it('aktivní banka načtená → generovat', () => {
    expect(bankaQuestuNactena({ ekonomika: banka }, 'ekonomika')).toBe(true);
  });

  it('načtená jen jiná banka než aktivní → čekat na aktivní', () => {
    expect(bankaQuestuNactena({ ucetnictvi: banka }, 'ekonomika')).toBe(false);
  });

  it('bez aktivní banky stačí jakákoli načtená (jako kontextQuestu)', () => {
    expect(bankaQuestuNactena({ ucetnictvi: banka }, null)).toBe(true);
  });
});

describe('questyDne — Domů neukazuje včerejší questy', () => {
  const vcera = [
    { datum: '2026-10-03', splneno: true },
    { datum: '2026-10-03', splneno: true },
    { datum: '2026-10-03', splneno: true },
  ];

  it('včerejší questy (i splněné) se do přegenerování nezobrazí', () => {
    expect(questyDne(vcera, '2026-10-04')).toEqual([]);
  });

  it('dnešní questy se zobrazí beze změny', () => {
    const dnes = vcera.map((q) => ({ ...q, datum: '2026-10-04' }));
    expect(questyDne(dnes, '2026-10-04')).toBe(dnes);
  });

  it('žádné questy → prázdno', () => {
    expect(questyDne([], '2026-10-04')).toEqual([]);
  });
});
