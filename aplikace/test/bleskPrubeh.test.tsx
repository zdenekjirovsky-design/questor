// Průběh bleskovek (src/testy/BleskPrubeh.tsx + bleskOvladani.ts).
// Prostředí testů je Node bez DOM (projekt nemá jsdom), proto po vzoru
// ostatních testů:
//  - komponenta se vykresluje přes renderToStaticMarkup v každé fázi otázky
//    (stav kola posouvají skutečné akce store),
//  - chování, které komponenta spouští ze svých efektů, se testuje na
//    čistých pomůckách, které ty efekty volají (auto-posun s falešnými
//    časovači, klávesy),
//  - zapojení pomůcek do komponenty a mobilní pravidla CSS hlídá zdroják.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { BankaOtazek, Otazka, OtazkaVyber } from '@questor/sdilene';
import BleskPrubeh from '../src/testy/BleskPrubeh';
import BleskZneni from '../src/testy/BleskZneni';
import { PRODLEVA_PO_SPRAVNE_MS } from '../src/testy/blesk';
import {
  akceKlavesy,
  fazeBlesku,
  naplanujAutoPosun,
  oznameniBlesku,
  tridyMoznostiBlesku,
} from '../src/testy/bleskOvladani';
import {
  aktualniOtazka,
  fazeTestu,
  inicializujBlesk,
  inicializujBleskZOtazek,
  type TestStav,
} from '../src/testy/engine';
import { zamichaneIndexy } from '../src/testy/komponenty/michani';

// Sync se podvrhne — dokončení kola nesmí sahat na síť.
vi.mock('../src/sync/sync', async (puvodni) => ({
  ...(await puvodni<typeof import('../src/sync/sync')>()),
  zaznamenejDokoncenyTest: vi.fn(),
}));

const { pouzijStav } = await import('../src/stav/store');

// ---------------------------------------------------------------------------
// Fixtury a pomůcky

function iy(id: string, zadani: string, spravna: number, prepis: Partial<OtazkaVyber> = {}): OtazkaVyber {
  return {
    id,
    temaId: 't-vyjmenovana',
    obtiznost: 1,
    typ: 'vyber',
    zadani,
    moznosti: ['i', 'y'],
    spravna,
    vysvetleni: `Vysvětlení k otázce ${id}.`,
    ...prepis,
  };
}

const OTAZKY: Otazka[] = [
  iy('o1', 'Na louce rostly b_liny.', 1),
  iy('o2', 'Petr rozb_l okno.', 0),
  iy('o3', 'Ml_nář mele obilí.', 1),
];

const BANKA: BankaOtazek = {
  predmetId: 'pravopis',
  nazev: 'Pravopis',
  verze: 1,
  vytvoreno: '2026-11-22',
  temata: [{ id: 't-vyjmenovana', nazev: 'Vyjmenovaná slova B a L', poradi: 0 }],
  otazky: OTAZKY,
};

const nahodaNula = () => 0;
const ZACATEK = '2026-11-22T10:00:00.000Z';

/** Čerstvé kolo nad BANKA (otázky v pořadí o1, o2, o3) vložené do store. */
function zalozKolo(otazky: Otazka[] = OTAZKY): TestStav {
  const banka = { ...BANKA, otazky };
  const stav = inicializujBlesk(banka, { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);
  pouzijStav.setState({ banky: { pravopis: banka }, aktualniTest: stav });
  return stav;
}

function kolo(): TestStav {
  const stav = pouzijStav.getState().aktualniTest;
  if (!stav) throw new Error('kolo neběží');
  return stav;
}

/** Odpoví na aktuální otázku přes store (správně / špatně) a vrátí nový stav kola. */
function odpovez(spravne: boolean): TestStav {
  const otazka = aktualniOtazka(kolo());
  if (!otazka || otazka.typ !== 'vyber') throw new Error('čekám výběrovou otázku');
  const spatna = otazka.moznosti.findIndex((_, i) => i !== otazka.spravna);
  pouzijStav.getState().odpovez({ typ: 'vyber', vybrana: spravne ? otazka.spravna : spatna }, 900);
  return kolo();
}

/**
 * Zustand při vykreslení na serveru (renderToStaticMarkup) nečte aktuální,
 * ale POČÁTEČNÍ stav store (getServerSnapshot). Komponenta potřebuje banku
 * (název tématu), proto se před vykreslením aktuální stav propíše do objektu
 * počátečního stavu; po testu se vrací záloha (afterEach).
 */
const POCATECNI_STAV = { ...pouzijStav.getInitialState() };

function vykresli(stav: TestStav): string {
  Object.assign(pouzijStav.getInitialState(), pouzijStav.getState());
  return renderToStaticMarkup(
    <MemoryRouter>
      <BleskPrubeh stav={stav} />
    </MemoryRouter>,
  );
}

function pocet(html: string, hledane: string): number {
  return html.split(hledane).length - 1;
}

/** Texty tlačítek možností v pořadí na obrazovce. */
function textyMoznosti(html: string): string[] {
  return [...html.matchAll(/<span class="blesk-moznost__text">([^<]*)<\/span>/g)].map((m) => m[1]);
}

function nactiZdroj(cesta: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${cesta}`, import.meta.url)), 'utf8');
}

function nactiCss(cesta: string): string {
  return nactiZdroj(cesta).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Rozsahy bloků `@media <dotaz> { … }` (párování závorek). */
function rozsahyMedia(css: string, dotaz: RegExp): { od: number; obsahOd: number; do: number }[] {
  const rozsahy: { od: number; obsahOd: number; do: number }[] = [];
  const zacatek = new RegExp(`@media\\s*${dotaz.source}\\s*\\{`, 'g');
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

function blokyMedia(css: string, dotaz: RegExp): string {
  return rozsahyMedia(css, dotaz)
    .map((r) => css.slice(r.obsahOd, r.do - 1))
    .join('\n');
}

function bezMedia(css: string, dotaz: RegExp): string {
  let vysledek = '';
  let pozice = 0;
  for (const r of rozsahyMedia(css, dotaz)) {
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
    const selektory = shoda[1].split(',').map((x) => x.trim());
    if (!selektory.includes(selektor)) continue;
    for (const radek of shoda[2].split(';')) {
      const dvojtecka = radek.indexOf(':');
      if (dvojtecka < 0) continue;
      vysledek[radek.slice(0, dvojtecka).trim()] = radek.slice(dvojtecka + 1).trim();
    }
  }
  return vysledek;
}

const MOBIL = /\(max-width:\s*760px\)/;
const HOVER = /\(hover:\s*hover\)/;

beforeEach(() => {
  pouzijStav.getState().resetujProgres();
  pouzijStav.setState({ aktualniTest: null, posledniVysledek: null, banky: {} });
});

afterEach(() => {
  vi.useRealTimers();
  Object.assign(pouzijStav.getInitialState(), POCATECNI_STAV);
  pouzijStav.setState({ aktualniTest: null, banky: {} });
});

// ---------------------------------------------------------------------------
// Vykreslení fází otázky

describe('BleskPrubeh — otázka čeká na odpověď', () => {
  it('ukáže počitadlo, velké zadání s prázdným políčkem a tlačítka možností', () => {
    const html = vykresli(zalozKolo());
    expect(html).toContain('aria-label="Bleskovky — otázka 1 z 3"');
    expect(html).toContain('<span class="test-pocitadlo">1/3</span>');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('Combo ×1.0');
    expect(html).toContain('⚡ Bleskovky');
    // Zadání je rozdělené kolem políčka; slovo s mezerou drží pohromadě.
    expect(html).toContain('Na louce rostly ');
    expect(html).toMatch(/<span class="blesk-slovo">b<span class="blesk-policko blesk-policko--prazdne blesk-policko--pole"/);
    expect(html).toContain('liny.</span>');
    expect(html).toContain('(doplň)'); // text pro čtečky
    expect(html).not.toContain('b_liny');
  });

  it('krátké možnosti jsou v pořadí z dat, s popisky a nápovědou kláves', () => {
    const html = vykresli(zalozKolo());
    expect(textyMoznosti(html)).toEqual(['i', 'y']);
    expect(html).toContain('aria-label="Odpověď 1: i"');
    expect(html).toContain('aria-label="Odpověď 2: y"');
    expect(html).toContain('role="group" aria-label="Možnosti odpovědi"');
    expect(html).toContain('blesk-moznosti--2 blesk-moznosti--pismena');
    expect(html).toMatch(/<span class="blesk-moznost__klavesa" aria-hidden="true">1<\/span>/);
    expect(html).not.toContain('disabled');
  });

  it('téma otázky PŘED odpovědí neukazuje (student má jev poznat sám)', () => {
    const html = vykresli(zalozKolo());
    // Banka s názvem tématu ve store je — jen se nesmí vypsat.
    expect(pouzijStav.getState().banky['pravopis']?.temata[0].nazev).toBe('Vyjmenovaná slova B a L');
    expect(html).not.toContain('Vyjmenovaná slova');
    expect(html).not.toContain('Téma:');
    expect(html).not.toContain('Vysvětlení k otázce');
    expect(html).not.toContain('blesk-feedback');
  });

  it('živá oblast pro čtečky je v kole trvale a čte zadání s možnostmi (bez tématu)', () => {
    const html = vykresli(zalozKolo());
    expect(html).toContain(
      '<p class="blesk-cteni" aria-live="polite">Otázka 1 z 3: Na louce rostly b (doplň) liny. Možnosti: i, y.</p>',
    );
  });

  it('delší možnosti (slova) se míchají stejně jako v testu a dostanou vlastní rozložení', () => {
    const slova = iy('slova-1', 'Večer _ unavený.', 0, { moznosti: ['jsem byl', 'jsem bil', 'jsme byly'] });
    const html = vykresli(zalozKolo([slova]));
    const poradi = zamichaneIndexy('vyber:slova-1', 3);
    expect(textyMoznosti(html)).toEqual(poradi.map((i) => slova.moznosti[i]));
    expect(html).toContain('blesk-moznosti--3 blesk-moznosti--slova');
    // Políčko si drží šířku nejdelší možnosti (9 znaků).
    expect(html).toMatch(/min-width:calc\(9 \* 0\.62em \+ 0\.3em\)/);
  });

  it('otázka bez podtržítka se ukáže celá, bez políčka', () => {
    const bezMezery = iy('clen-1', 'Jaký člen má slovo Mutter?', 1, { moznosti: ['der', 'die', 'das'] });
    const html = vykresli(zalozKolo([bezMezery]));
    expect(html).toContain('Jaký člen má slovo Mutter?');
    expect(html).not.toContain('blesk-policko');
    expect(textyMoznosti(html)).toEqual(['der', 'die', 'das']);
  });

  it('dlouhé zadání dostane menší písmo', () => {
    const dlouha = iy('dlouha-1', 'Když jsme se vraceli z výletu, babička vyprávěla o dob_tku, který se pásl za vsí.', 1);
    expect(vykresli(zalozKolo([dlouha]))).toContain('blesk-zadani blesk-zadani--dlouhe');
    expect(vykresli(zalozKolo([iy('kratka-1', 'b_lina', 1)]))).toContain('class="blesk-zadani"');
  });

  it('opravné kolo má vlastní štítek', () => {
    const stav = inicializujBleskZOtazek('pravopis', OTAZKY, ZACATEK);
    pouzijStav.setState({ banky: { pravopis: BANKA }, aktualniTest: stav });
    const html = vykresli(stav);
    expect(html).toContain('🔁 Oprava chyb');
    expect(html).not.toContain('⚡ Bleskovky');
  });
});

describe('BleskPrubeh — správná odpověď', () => {
  it('doplní políčko zeleně, ukáže plovoucí +XP a nic dalšího nechce', () => {
    zalozKolo();
    const html = vykresli(odpovez(true));
    expect(html).toMatch(/blesk-policko blesk-policko--spravne blesk-policko--pole"[^>]*>y<\/span>/);
    expect(html).toContain('<span class="xp-let">+2 XP</span>'); // 10 XP × 0,2
    expect(html).toContain('blesk-otazka--spravne');
    expect(html).toContain('🔥 Combo ×1.1');
    // Žádný panel s vysvětlením ani tlačítko — další otázka naskočí sama.
    expect(html).not.toContain('blesk-feedback');
    expect(html).not.toContain('Rozumím');
    expect(html).toContain('<p class="blesk-cteni" aria-live="polite">Správně.</p>'); // jen pro čtečky
  });

  it('zamkne tlačítka a zvýrazní správnou možnost', () => {
    zalozKolo();
    const html = vykresli(odpovez(true));
    expect(pocet(html, 'disabled=""')).toBe(2);
    expect(html).toMatch(/class="blesk-moznost blesk-moznost--spravne"[^>]*aria-label="Odpověď 2: y"/);
    expect(html).toMatch(/class="blesk-moznost blesk-moznost--ostatni"[^>]*aria-label="Odpověď 1: i"/);
  });
});

describe('BleskPrubeh — špatná odpověď', () => {
  it('ukáže správně doplněné znění, vysvětlení, název tématu a ruční pokračování', () => {
    zalozKolo();
    const html = vykresli(odpovez(false));
    expect(html).toContain('panel feedback feedback--spatne blesk-feedback');
    expect(html).toContain('Tahle ti ještě uteče. Mrkni proč:');
    // Správně doplněné znění: v textu zeleně (řádkové políčko) i ve velkém zadání.
    expect(html).toMatch(/Správně: <\/span><strong class="blesk-zneni">Na louce rostly <span class="blesk-slovo">b<span class="blesk-policko blesk-policko--text">y<\/span>liny\.<\/span><\/strong>/);
    expect(html).toMatch(/blesk-policko blesk-policko--oprava blesk-policko--pole"[^>]*>y<\/span>/);
    expect(html).toContain('Vysvětlení k otázce o1.');
    expect(html).toContain('Téma: Vyjmenovaná slova B a L');
    expect(html).toContain('Rozumím, dál');
    expect(html).toContain('<span class="napoveda-klavesy"> (Enter)</span>');
    // Čtečce to řekne trvalá živá oblast (panel sám živý není — nečetl by se dvakrát).
    expect(html).toContain(
      '<p class="blesk-cteni" aria-live="polite">Špatně. Správně: Na louce rostly byliny. Vysvětlení k otázce o1. Téma: Vyjmenovaná slova B a L.</p>',
    );
    expect(pocet(html, 'aria-live')).toBe(1);
  });

  it('nedá XP, shodí combo, zamkne tlačítka a počitadlo nechá na téže otázce', () => {
    zalozKolo();
    odpovez(true); // combo 1
    pouzijStav.getState().dalsiOtazka();
    const html = vykresli(odpovez(false));
    expect(html).toContain('<span class="test-pocitadlo">2/3</span>');
    expect(html).toContain('Combo ×1.0');
    expect(html).not.toContain('xp-let');
    expect(html).toContain('blesk-otazka--spatne');
    expect(pocet(html, 'disabled=""')).toBe(2);
    // Petr rozb_l okno → správně „i“.
    expect(html).toMatch(/class="blesk-moznost blesk-moznost--spravne"[^>]*aria-label="Odpověď 1: i"/);
  });

  it('u poslední otázky vede tlačítko k vyhodnocení', () => {
    zalozKolo([OTAZKY[0]]);
    const html = vykresli(odpovez(false));
    expect(html).toContain('Rozumím, vyhodnotit');
    expect(html).toContain('tlacitko tlacitko--zlate blesk-feedback__dal');
  });

  it('otázka bez podtržítka ukáže ve zpětné vazbě správnou možnost', () => {
    zalozKolo([iy('clen-1', 'Jaký člen má slovo Mutter?', 1, { moznosti: ['der', 'die', 'das'] })]);
    const html = vykresli(odpovez(false));
    expect(html).toMatch(/Správně: <\/span><strong class="blesk-zneni blesk-policko--text">die<\/strong>/);
  });

  it('dokud se banka nenačetla (studený start), štítek tématu počká', () => {
    zalozKolo();
    const stav = odpovez(false);
    pouzijStav.setState({ banky: {} });
    const html = vykresli(stav);
    expect(html).toContain('Vysvětlení k otázce o1.');
    expect(html).not.toContain('Téma:');
  });
});

describe('BleskPrubeh — okraje', () => {
  it('dokončené kolo už nic nevykresluje (stránka přechází na výsledek)', () => {
    zalozKolo([OTAZKY[0]]);
    odpovez(true);
    pouzijStav.getState().dalsiOtazka();
    expect(kolo().dokonceno).toBe(true);
    expect(vykresli(kolo())).toBe('');
  });
});

describe('BleskZneni', () => {
  it('rozdělí zadání kolem políčka a drží slovo s mezerou pohromadě', () => {
    const html = renderToStaticMarkup(<BleskZneni zadani="Viděl jsem zb_tek dortu." doplneno="y" stav="text" />);
    expect(html).toBe(
      'Viděl jsem <span class="blesk-slovo">zb<span class="blesk-policko blesk-policko--text">y</span>tek</span> dortu.',
    );
  });

  it('prázdné políčko nese text pro čtečky a šířku jen ve variantě políčka', () => {
    const pole = renderToStaticMarkup(<BleskZneni zadani="b_l" doplneno={null} stav="prazdne" sirkaZnaku={3} />);
    expect(pole).toContain('min-width:calc(3 * 0.62em + 0.3em)');
    expect(pole).toContain('<span class="blesk-cteni">(doplň)</span>');
    const text = renderToStaticMarkup(<BleskZneni zadani="b_l" doplneno="y" stav="text" sirkaZnaku={3} />);
    expect(text).not.toContain('min-width');
  });

  it('zadání bez podtržítka vypíše beze změny', () => {
    expect(renderToStaticMarkup(<BleskZneni zadani="Bez mezery?" doplneno="y" stav="text" />)).toBe('Bez mezery?');
  });
});

// ---------------------------------------------------------------------------
// Auto-posun po správné odpovědi (falešné časovače)

describe('správná odpověď → auto-posun, špatná → ruční pokračování', () => {
  const dalsi = () => pouzijStav.getState().dalsiOtazka();

  it('po správné odpovědi naskočí další otázka sama po PRODLEVA_PO_SPRAVNE_MS', () => {
    vi.useFakeTimers();
    zalozKolo();
    const po = odpovez(true);
    expect(fazeTestu(po)).toBe('feedback');

    // Tohle volá komponenta ze svého efektu (viz kontrola zdrojáku níže).
    const uklid = naplanujAutoPosun(true, dalsi);
    expect(typeof uklid).toBe('function');

    vi.advanceTimersByTime(PRODLEVA_PO_SPRAVNE_MS - 1);
    expect(kolo().index).toBe(0);
    expect(fazeTestu(kolo())).toBe('feedback');

    vi.advanceTimersByTime(1);
    expect(kolo().index).toBe(1);
    expect(fazeTestu(kolo())).toBe('otazka');
    // Nová otázka se vykreslí čistá — bez zamčených tlačítek a bez +XP.
    const html = vykresli(kolo());
    expect(html).toContain('<span class="test-pocitadlo">2/3</span>');
    expect(html).toContain('Petr <span class="blesk-slovo">rozb');
    expect(html).not.toContain('disabled');
    expect(html).not.toContain('xp-let');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prodleva je krátká (flow drilu), ale delší než nic', () => {
    expect(PRODLEVA_PO_SPRAVNE_MS).toBeGreaterThanOrEqual(400);
    expect(PRODLEVA_PO_SPRAVNE_MS).toBeLessThanOrEqual(800);
  });

  it('úklid (odmontování komponenty) časovač zruší — nic se neposune', () => {
    vi.useFakeTimers();
    zalozKolo();
    odpovez(true);
    const uklid = naplanujAutoPosun(true, dalsi);
    vi.advanceTimersByTime(PRODLEVA_PO_SPRAVNE_MS / 2);
    uklid?.();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(10_000);
    expect(kolo().index).toBe(0);
    expect(fazeTestu(kolo())).toBe('feedback');
  });

  it('po chybě se nic neplánuje — pokračuje se až ručně', () => {
    vi.useFakeTimers();
    zalozKolo();
    const po = odpovez(false);
    expect(naplanujAutoPosun(false, dalsi)).toBeUndefined();
    expect(naplanujAutoPosun(null, dalsi)).toBeUndefined(); // otázka ještě čeká
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(60_000);
    expect(kolo()).toBe(po); // stav se ani nehnul
    expect(vykresli(kolo())).toContain('Rozumím, dál');

    // „Rozumím, dál“ / Enter volá dalsiOtazka.
    dalsi();
    expect(kolo().index).toBe(1);
    expect(fazeTestu(kolo())).toBe('otazka');
  });

  it('po poslední správné odpovědi auto-posun kolo dokončí', () => {
    vi.useFakeTimers();
    zalozKolo([OTAZKY[0]]);
    odpovez(true);
    naplanujAutoPosun(true, dalsi);
    vi.advanceTimersByTime(PRODLEVA_PO_SPRAVNE_MS);
    expect(kolo().dokonceno).toBe(true);
  });

  it('druhá odpověď na už zodpovězenou otázku se ignoruje (stav kola se ani nehne)', () => {
    zalozKolo();
    const po = odpovez(true);
    pouzijStav.getState().odpovez({ typ: 'vyber', vybrana: 0 }, 50);
    expect(kolo()).toBe(po);
    expect(kolo().odpovedi).toHaveLength(1);
  });

  it('dvojí stisk: druhý stisk během prodlevy neodpoví na otázku, která teprve naskočí', () => {
    vi.useFakeTimers();
    zalozKolo();
    odpovez(true);
    naplanujAutoPosun(true, dalsi);
    // Druhý stisk téže klávesy 150 ms po prvním: fáze je „spravne“ → žádná akce.
    vi.advanceTimersByTime(150);
    expect(akceKlavesy({ key: 'y' }, { faze: 'spravne', moznosti: ['i', 'y'], poradi: [0, 1] })).toBeNull();
    vi.advanceTimersByTime(PRODLEVA_PO_SPRAVNE_MS);
    // Další otázka naskočila a je nezodpovězená.
    expect(kolo().index).toBe(1);
    expect(kolo().odpovedi).toHaveLength(1);
    expect(fazeTestu(kolo())).toBe('otazka');
  });

  it('fazeBlesku převádí výsledek odpovědi na fázi otázky', () => {
    expect(fazeBlesku(null)).toBe('otazka');
    expect(fazeBlesku(true)).toBe('spravne');
    expect(fazeBlesku(false)).toBe('spatne');
  });
});

// ---------------------------------------------------------------------------
// Klávesy

describe('akceKlavesy', () => {
  const IY = { moznosti: ['i', 'y'], poradi: [0, 1] };
  const otazka = { faze: 'otazka' as const, ...IY };

  it('klávesy i / y odpovídají písmenem možnosti', () => {
    expect(akceKlavesy({ key: 'i' }, otazka)).toEqual({ typ: 'odpoved', index: 0 });
    expect(akceKlavesy({ key: 'y' }, otazka)).toEqual({ typ: 'odpoved', index: 1 });
    expect(akceKlavesy({ key: 'Y' }, otazka)).toEqual({ typ: 'odpoved', index: 1 });
  });

  it('í / ý: stačí klávesy i, y — a fungují i přímo klávesy í, ý', () => {
    const dlouhe = { faze: 'otazka' as const, moznosti: ['í', 'ý'], poradi: [0, 1] };
    expect(akceKlavesy({ key: 'i' }, dlouhe)).toEqual({ typ: 'odpoved', index: 0 });
    expect(akceKlavesy({ key: 'y' }, dlouhe)).toEqual({ typ: 'odpoved', index: 1 });
    expect(akceKlavesy({ key: 'ý', code: 'Digit7' }, dlouhe)).toEqual({ typ: 'odpoved', index: 1 });
  });

  it('1 / 2 / 3 odpovídají podle pozice (i na české klávesnici bez Shiftu)', () => {
    expect(akceKlavesy({ key: '1' }, otazka)).toEqual({ typ: 'odpoved', index: 0 });
    expect(akceKlavesy({ key: '2' }, otazka)).toEqual({ typ: 'odpoved', index: 1 });
    expect(akceKlavesy({ key: '3' }, otazka)).toBeNull();
    expect(akceKlavesy({ key: '+', code: 'Digit1' }, otazka)).toEqual({ typ: 'odpoved', index: 0 });
    expect(akceKlavesy({ key: 'ě', code: 'Digit2' }, otazka)).toEqual({ typ: 'odpoved', index: 1 });
    // Zamíchané pořadí: pozice 1 = datový index 2.
    const michane = { faze: 'otazka' as const, moznosti: ['jsem byl', 'jsem bil', 'jsme byly'], poradi: [2, 0, 1] };
    expect(akceKlavesy({ key: '1' }, michane)).toEqual({ typ: 'odpoved', index: 2 });
  });

  it('Enter pokračuje jen po chybě', () => {
    expect(akceKlavesy({ key: 'Enter' }, { faze: 'spatne', ...IY })).toEqual({ typ: 'dalsi' });
    expect(akceKlavesy({ key: 'Enter' }, otazka)).toBeNull();
    expect(akceKlavesy({ key: 'Enter' }, { faze: 'spravne', ...IY })).toBeNull();
  });

  it('během zpětné vazby klávesy možností nic nedělají (neodpoví naslepo na další otázku)', () => {
    expect(akceKlavesy({ key: 'y' }, { faze: 'spravne', ...IY })).toBeNull();
    expect(akceKlavesy({ key: '1' }, { faze: 'spravne', ...IY })).toBeNull();
    expect(akceKlavesy({ key: 'i' }, { faze: 'spatne', ...IY })).toBeNull();
  });

  it('držená klávesa (auto-repeat) se ignoruje vždy', () => {
    expect(akceKlavesy({ key: 'y', repeat: true }, otazka)).toBeNull();
    expect(akceKlavesy({ key: '1', repeat: true }, otazka)).toBeNull();
    expect(akceKlavesy({ key: 'Enter', repeat: true }, { faze: 'spatne', ...IY })).toBeNull();
  });

  it('zkratky s Ctrl / Cmd / Alt nechává prohlížeči', () => {
    expect(akceKlavesy({ key: 'y', ctrlKey: true }, otazka)).toBeNull();
    expect(akceKlavesy({ key: 'i', metaKey: true }, otazka)).toBeNull();
    expect(akceKlavesy({ key: '1', altKey: true }, otazka)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Vzhled možností a text pro čtečky

describe('tridyMoznostiBlesku', () => {
  it('před odpovědí mají všechny možnosti jen základní třídu', () => {
    expect(tridyMoznostiBlesku(0, { faze: 'otazka', spravna: 1, vybrana: null })).toBe('blesk-moznost');
    expect(tridyMoznostiBlesku(1, { faze: 'otazka', spravna: 1, vybrana: null })).toBe('blesk-moznost');
  });

  it('trefa: zvolená správná možnost je zelená a „poskočí“, ostatní zeslábnou', () => {
    const stav = { faze: 'spravne' as const, spravna: 1, vybrana: 1 };
    expect(tridyMoznostiBlesku(1, stav)).toBe('blesk-moznost blesk-moznost--spravne blesk-moznost--trefa');
    expect(tridyMoznostiBlesku(0, stav)).toBe('blesk-moznost blesk-moznost--ostatni');
  });

  it('chyba: zvolená možnost červeně (zatřesení), správná zeleně bez „poskočení“', () => {
    const stav = { faze: 'spatne' as const, spravna: 1, vybrana: 0 };
    expect(tridyMoznostiBlesku(0, stav)).toBe('blesk-moznost blesk-moznost--spatne');
    expect(tridyMoznostiBlesku(1, stav)).toBe('blesk-moznost blesk-moznost--spravne');
    expect(tridyMoznostiBlesku(2, stav)).toBe('blesk-moznost blesk-moznost--ostatni');
  });

  it('po obnovení stránky (volba neznámá) ukáže jen správnou možnost', () => {
    const stav = { faze: 'spatne' as const, spravna: 0, vybrana: null };
    expect(tridyMoznostiBlesku(0, stav)).toBe('blesk-moznost blesk-moznost--spravne');
    expect(tridyMoznostiBlesku(1, stav)).toBe('blesk-moznost blesk-moznost--ostatni');
  });
});

describe('oznameniBlesku — text pro čtečky', () => {
  const zaklad = {
    cislo: 3,
    celkem: 10,
    zadani: 'Na louce rostly b_liny.',
    moznosti: ['i', 'y'],
    spravnyText: 'y',
    vysvetleni: 'Bylina je vyjmenované slovo.',
    nazevTematu: 'Vyjmenovaná slova',
  };

  it('nová otázka: pořadí, zadání s místem k doplnění a možnosti — téma NE', () => {
    const text = oznameniBlesku({ ...zaklad, faze: 'otazka' });
    expect(text).toBe('Otázka 3 z 10: Na louce rostly b (doplň) liny. Možnosti: i, y.');
    expect(text).not.toContain('Vyjmenovaná');
  });

  it('místo k doplnění na konci slova, na začátku věty a samostatně se čte čistě', () => {
    const cti = (zadani: string, moznosti = ['i', 'y']) =>
      oznameniBlesku({ ...zaklad, faze: 'otazka', zadani, moznosti });
    // Před interpunkcí bez mezery navíc.
    expect(cti('Brigádníci tahali vozík s pytl_.')).toBe(
      'Otázka 3 z 10: Brigádníci tahali vozík s pytl (doplň). Možnosti: i, y.',
    );
    expect(cti('Psi štěkal_, kočky ne.')).toContain('štěkal (doplň), kočky ne.');
    // Celé slovo k doplnění a mezera na začátku.
    expect(cti('Dej _ to, prosím.', ['mě', 'mně'])).toBe(
      'Otázka 3 z 10: Dej (doplň) to, prosím. Možnosti: mě, mně.',
    );
    expect(cti('_ sestra je doma.', ['Má', 'Mojí'])).toContain(': (doplň) sestra je doma.');
    // Řada podtržítek je jedno místo; zadání bez místa se čte celé.
    expect(cti('My sister ___ sixteen.', ['is', 'are'])).toContain('My sister (doplň) sixteen.');
    expect(cti('Jaký člen má slovo Mutter?', ['der', 'die', 'das'])).toBe(
      'Otázka 3 z 10: Jaký člen má slovo Mutter? Možnosti: der, die, das.',
    );
  });

  it('správně: krátké potvrzení', () => {
    expect(oznameniBlesku({ ...zaklad, faze: 'spravne' })).toBe('Správně.');
  });

  it('špatně: správné znění, vysvětlení a téma', () => {
    expect(oznameniBlesku({ ...zaklad, faze: 'spatne' })).toBe(
      'Špatně. Správně: Na louce rostly byliny. Bylina je vyjmenované slovo. Téma: Vyjmenovaná slova.',
    );
    // Bez načtené banky téma chybí; zadání bez mezery přečte správnou možnost.
    expect(
      oznameniBlesku({
        ...zaklad,
        faze: 'spatne',
        zadani: 'Jaký člen má slovo Mutter?',
        spravnyText: 'die',
        vysvetleni: 'Ženský rod.',
        nazevTematu: undefined,
      }),
    ).toBe('Špatně. Správně: die. Ženský rod.');
  });
});

// ---------------------------------------------------------------------------
// Zapojení do komponenty (hlídá zdroják — efekty bez DOM spustit nejde)

describe('BleskPrubeh — zapojení pomůcek', () => {
  const zdroj = nactiZdroj('testy/BleskPrubeh.tsx');

  it('auto-posun běží v efektu a jeho úklid ruší časovač při odmontování', () => {
    expect(zdroj).toMatch(/useEffect\(\(\) => naplanujAutoPosun\(spravne, dalsiOtazkaAkce\), \[spravne, dalsiOtazkaAkce\]\)/);
  });

  it('otázka se s každým indexem montuje znovu (do nové neproteče výběr ani časovač)', () => {
    expect(zdroj).toMatch(/<BleskOtazka\s+key=\{stav\.index\}/);
  });

  it('ťuknutí těsně po zobrazení otázky i zpětné vazby zahazuje existující ochrana kliku', () => {
    expect(zdroj).toContain("from './pouzijOchranuKliku'");
    expect(zdroj).toMatch(/const ochranaOtazky = pouzijOchranuKliku\(stav\.index\)/);
    // Ochrana zpětné vazby MUSÍ být klíčovaná fází — s konstantním klíčem by
    // se odpočet po zobrazení zpětné vazby nespustil.
    expect(zdroj).toMatch(/const ochranaVazby = pouzijOchranuKliku\(faze\)/);
    expect(zdroj).toMatch(/className=\{`panel blesk-otazka[^`]*`\}\s*onClickCapture=\{ochranaOtazky\}/);
    expect(zdroj).toMatch(/className="panel feedback feedback--spatne blesk-feedback"\s*onClickCapture=\{ochranaVazby\}/);
  });

  it('odpověď čte fázi kola ze store v okamžiku stisku (dvě klávesy naráz nepřepíšou volbu)', () => {
    expect(zdroj).toMatch(
      /const aktualni = pouzijStav\.getState\(\)\.aktualniTest;\s*if \(!aktualni \|\| fazeTestu\(aktualni\) !== 'otazka'\) return;\s*setVybrana\(index\);/,
    );
  });

  it('živá oblast pro čtečky je mimo přemontovávanou otázku (přežije auto-posun)', () => {
    const oblast = zdroj.indexOf('aria-live="polite"');
    const otazkaKomponenta = zdroj.indexOf('<BleskOtazka');
    expect(oblast).toBeGreaterThan(-1);
    expect(oblast).toBeLessThan(otazkaKomponenta);
    expect(zdroj.slice(zdroj.indexOf('function BleskOtazka('))).not.toContain('aria-live');
  });

  it('klávesy jdou přes akceKlavesy a v textovém poli se nepřebírají', () => {
    expect(zdroj).toMatch(/if \(jeVstupniPole\(e\.target\)\) return;\s*const akce = akceKlavesy\(e, \{ faze, moznosti: otazka\.moznosti, poradi \}\)/);
    expect(zdroj).toMatch(/window\.addEventListener\('keydown', zpracuj\);\s*return \(\) => window\.removeEventListener\('keydown', zpracuj\);/);
  });

  it('zpětná vazba po chybě se doroluje do zorného pole a nová otázka začíná nahoře', () => {
    expect(zdroj).toMatch(/if \(faze === 'spatne'\) posunDoZorneho\(vazbaRef\.current\)/);
    expect(zdroj).toMatch(/pouzijNavratNaZacatek\(hlavickaRef, stav\.index\)/);
  });

  it('stránka Test vykreslí BleskPrubeh jen pro kolo bleskovek', () => {
    const test = nactiZdroj('stranky/Test.tsx');
    expect(test).toMatch(/if \(aktualniTest\.blesk && aktualniTest\.otazky\.every\(\(o\) => o\.typ === 'vyber'\)\) \{\s*return <BleskPrubeh key=\{aktualniTest\.zacatek\} stav=\{aktualniTest\} \/>;/);
  });
});

// ---------------------------------------------------------------------------
// CSS — mobilní pravidla a desktop beze změny

describe('blesk.css — kontrakt rozložení', () => {
  const css = nactiCss('testy/blesk.css');
  const mobil = blokyMedia(css, MOBIL);
  const desktop = bezMedia(css, MOBIL);

  it('tlačítka možností jsou na mobilu aspoň 64 px vysoká a přes celou šířku', () => {
    expect(parseInt(deklarace(mobil, '.blesk-moznost')['min-height'], 10)).toBeGreaterThanOrEqual(64);
    expect(parseInt(deklarace(mobil, '.blesk-moznosti--slova .blesk-moznost')['min-height'], 10)).toBeGreaterThanOrEqual(64);
    // Písmena vedle sebe přes celou šířku, slova pod sebou.
    expect(deklarace(mobil, '.blesk-moznosti')['grid-template-columns']).toBe('repeat(2, minmax(0, 1fr))');
    expect(deklarace(mobil, '.blesk-moznosti')['justify-content']).toBe('stretch');
    expect(deklarace(mobil, '.blesk-moznosti--slova')['grid-template-columns']).toBe('minmax(0, 1fr)');
  });

  it('„Rozumím, dál“ je na mobilu přes celou šířku a dost vysoké pro palec', () => {
    expect(deklarace(mobil, '.blesk-feedback__pata')['flex-direction']).toBe('column');
    expect(deklarace(mobil, '.blesk-feedback__pata')['align-items']).toBe('stretch');
    const dal = deklarace(mobil, '.tlacitko.blesk-feedback__dal');
    expect(parseInt(dal['min-height'], 10)).toBeGreaterThanOrEqual(44);
    expect(dal['margin-left']).toBe('0'); // auto okraj by tlačítko ve sloupci zúžil
  });

  it('výška zadání nezávisí na velikosti písma (tlačítka mezi otázkami neposkakují)', () => {
    expect(deklarace(desktop, '.blesk-zadani')['min-height']).toMatch(/^\d+(\.\d+)?rem$/);
    expect(deklarace(mobil, '.blesk-zadani')['min-height']).toContain('svh');
  });

  it('vlastnosti z .panel / .tlacitko / .stitek přebíjí dvěma třídami (global.css je v bundlu poslední)', () => {
    expect(deklarace(desktop, '.panel.blesk-otazka').padding).toBeDefined();
    expect(deklarace(mobil, '.panel.blesk-otazka').padding).toBeDefined();
    expect(deklarace(css, '.blesk-otazka').padding).toBeUndefined();
    expect(deklarace(desktop, '.panel.blesk-feedback')['border-left']).toContain('var(--chyba)');
    expect(deklarace(desktop, '.stitek.blesk-stitek').color).toBe('var(--zlata)');
  });

  it('každý :hover je jen za (hover: hover) — na dotyku nic „nelepí“', () => {
    expect(bezMedia(css, HOVER)).not.toContain(':hover');
    expect(blokyMedia(css, HOVER)).toContain('.blesk-moznost:hover:not(:disabled)');
  });

  it('nápověda kláves se na dotyku skrývá a animace jedou jen přes transform / opacity', () => {
    expect(deklarace(blokyMedia(css, /\(pointer:\s*coarse\)/), '.blesk-moznost__klavesa').display).toBe('none');
    const trefa = /@keyframes blesk-trefa\s*\{([\s\S]*?)\}\s*\}/.exec(css)?.[1] ?? '';
    expect(trefa).toContain('transform');
    expect(trefa).not.toMatch(/box-shadow|width|height|margin|top|left/);
    // Žádný nekonečný pulz (mobil: nové nekonečné animace box-shadow nepřidávat).
    expect(css).not.toContain('infinite');
  });

  it('desktopová pravidla nejsou schovaná za mobilní media query', () => {
    expect(parseInt(deklarace(desktop, '.blesk-moznost')['min-height'], 10)).toBeGreaterThanOrEqual(64);
    expect(deklarace(desktop, '.blesk')['max-width']).toBeDefined();
  });
});

describe('global.css — ⚡ na zlatém tlačítku', () => {
  it('znak blesku se uvnitř zlatého tlačítka kreslí tmavě (žlutá na zlaté není vidět)', () => {
    const d = deklarace(nactiCss('styl/global.css'), '.tlacitko--zlate .znak-blesku');
    expect(d.filter).toContain('grayscale(1)');
    expect(d.filter).toContain('brightness(');
  });
});
