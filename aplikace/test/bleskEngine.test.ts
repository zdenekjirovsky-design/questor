// Bleskovky v testovém enginu a ve store:
//  - engine: výběr jen bleskových otázek, XP × koeficient, id výsledku
//    `blesk-…`, truhla jen s povolením volajícího, opravné kolo,
//  - testySlice + hraSlice: truhla jen 1× denně a nikdy z opravy, XP
//    v progresu = XP výsledku, rekordy beze změny, streak / questy / historie
//    jako u testu, sync přes zaznamenejDokoncenyTest,
//  - ekonomika rychlých otázek v BĚŽNÉM testu: koeficient XP na každou
//    bleskovou otázku v jakémkoli režimu a test s převahou bleskových otázek
//    se pro truhlu a rekordy počítá jako bleskovky (id `blesk-test-…`).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BankaOtazek,
  Obtiznost,
  Otazka,
  OtazkaVyber,
  QuestDenni,
  TestVysledek,
} from '@questor/sdilene';
import { denZData, xpZaOdpoved } from '@questor/sdilene';
import {
  aktualniOtazka,
  dalsiOtazkaVEnginu,
  fazeTestu,
  inicializujBlesk,
  inicializujBleskZOtazek,
  inicializujTest,
  odpovezVEnginu,
  planovanyPocetOtazek,
  pocitaSeJakoBleskovky,
  vyhodnotTest,
  type TestStav,
} from '../src/testy/engine';
import {
  jeBleskovyTest,
  jeBleskVysledek,
  jeKoloBleskovek,
  jeOpravaBlesku,
  KOEFICIENT_XP_BLESK,
} from '../src/testy/blesk';

// Sync se podvrhne — dokonciTest nesmí sahat na síť a test ověřuje, že
// bleskový výsledek odchází stejnou cestou jako výsledek testu.
const { zaznamenejDokoncenyTest } = vi.hoisted(() => ({ zaznamenejDokoncenyTest: vi.fn() }));
vi.mock('../src/sync/sync', async (puvodni) => ({
  ...(await puvodni<typeof import('../src/sync/sync')>()),
  zaznamenejDokoncenyTest,
}));

const { pouzijStav } = await import('../src/stav/store');
// Podvržený modul se načte předem: dokonciTest ho importuje dynamicky a jeho
// první (pomalé) načtení by jinak doběhlo až uprostřed pozdějších testů.
await import('../src/sync/sync');

// ---------------------------------------------------------------------------
// Fixtury

/** Blesková otázka i/y; správně je vždy `y` (index 1). */
function iy(id: string, obtiznost: Obtiznost = 1, temaId = 't1'): OtazkaVyber {
  return {
    id,
    temaId,
    obtiznost,
    typ: 'vyber',
    zadani: `b_lina ${id}`,
    moznosti: ['i', 'y'],
    spravna: 1,
    vysvetleni: 'Bylina je vyjmenované slovo.',
  };
}

const NEBLESKOVA: Otazka = {
  id: 'dlouha',
  temaId: 't1',
  obtiznost: 2,
  typ: 'vyber',
  zadani: 'Co je bylina?',
  moznosti: ['rostlina s nedřevnatým stonkem', 'strom', 'keř', 'houba'],
  spravna: 0,
  vysvetleni: 'Bylina nedřevnatí.',
};

/** Běžná (neblesková) výběrová otázka — čtyři možnosti; správně je index 1 jako u `iy`. */
function bezna(id: string, obtiznost: Obtiznost = 2, temaId = 't1'): Otazka {
  return {
    id,
    temaId,
    obtiznost,
    typ: 'vyber',
    zadani: `Běžná otázka ${id}?`,
    moznosti: ['špatně A', 'správně', 'špatně B', 'špatně C'],
    spravna: 1,
    vysvetleni: 'Protože ano.',
  };
}

function banka(otazky: Otazka[], predmetId = 'pravopis'): BankaOtazek {
  return {
    predmetId,
    nazev: 'Pravopis',
    verze: 1,
    vytvoreno: '2026-11-22',
    temata: [
      { id: 't1', nazev: 'Vyjmenovaná slova', poradi: 0 },
      { id: 't2', nazev: 'Koncovky', poradi: 1 },
    ],
    otazky,
  };
}

/** Deterministická „náhoda“: vážený výběr s ní bere položky v původním pořadí. */
const nahodaNula = () => 0;
const ZACATEK = '2026-11-22T10:00:00.000Z';
const KONEC = '2026-11-22T10:02:00.000Z';

function odpovezAPosun(stav: TestStav, spravne: boolean): TestStav {
  const vysledek = odpovezVEnginu(stav, { typ: 'vyber', vybrana: spravne ? 1 : 0 }, 1500);
  expect(vysledek).not.toBeNull();
  return dalsiOtazkaVEnginu(vysledek!.stav);
}

// ---------------------------------------------------------------------------
// Engine

describe('inicializujBlesk', () => {
  const smisena = banka([
    NEBLESKOVA,
    ...Array.from({ length: 12 }, (_, i) => iy(`a${i}`, ((i % 5) + 1) as Obtiznost)),
    iy('b0', 3, 't2'),
    iy('b1', 5, 't2'),
  ]);

  it('vybere jen bleskové otázky, přes všechny obtížnosti, v požadovaném počtu', () => {
    const stav = inicializujBlesk(smisena, { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);
    expect(stav.otazky).toHaveLength(10);
    expect(stav.otazky.every((o) => o.typ === 'vyber' && o.moznosti.length === 2)).toBe(true);
    expect(stav.otazky.some((o) => o.id === 'dlouha')).toBe(false);
    // Rozcvička běžného testu by pustila jen obtížnost 1–2; tady jsou i těžší.
    expect(Math.max(...stav.otazky.map((o) => o.obtiznost))).toBeGreaterThan(2);
  });

  it('nese příznak bleskovek a konfiguraci s režimem rozcvicka (kvůli serveru)', () => {
    const stav = inicializujBlesk(smisena, { predmetId: 'pravopis', pocetOtazek: 20 }, {}, nahodaNula, ZACATEK);
    expect(stav.blesk).toEqual({ oprava: false });
    expect(stav.konfigurace).toEqual({ predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 20 });
    expect(stav.zacatek).toBe(ZACATEK);
    expect(stav.casovyLimitMs).toBeUndefined();
    // Banka má jen 14 bleskových — kolo je kratší a plán to ví.
    expect(stav.otazky).toHaveLength(14);
    expect(planovanyPocetOtazek(stav)).toBe(14);
    expect(fazeTestu(stav)).toBe('otazka');
  });

  it('respektuje výběr témat (prázdný výběr = všechna)', () => {
    const zTematu = inicializujBlesk(
      smisena,
      { predmetId: 'pravopis', pocetOtazek: 10, temataId: ['t2'] },
      {},
      nahodaNula,
      ZACATEK,
    );
    expect(zTematu.otazky.map((o) => o.id)).toEqual(['b0', 'b1']);
    expect(zTematu.konfigurace.temataId).toEqual(['t2']);

    const vse = inicializujBlesk(
      smisena,
      { predmetId: 'pravopis', pocetOtazek: 10, temataId: [] },
      {},
      nahodaNula,
      ZACATEK,
    );
    expect(vse.otazky).toHaveLength(10);
    expect(vse.konfigurace.temataId).toBeUndefined();
  });

  it('banka bez bleskových otázek dá prázdné kolo', () => {
    const stav = inicializujBlesk(banka([NEBLESKOVA]), { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);
    expect(stav.otazky).toEqual([]);
  });
});

describe('XP v bleskovkách', () => {
  const otazky = [iy('o1', 1), iy('o2', 2), iy('o3', 3), iy('o4', 5), iy('o5', 1)];

  it('koeficient bleskovek je 0,2', () => {
    expect(KOEFICIENT_XP_BLESK).toBe(0.2);
  });

  it('XP za odpověď = zaokrouhlené xpZaOdpoved × 0,2 (combo se počítá dál)', () => {
    let stav = inicializujBlesk(banka(otazky), { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);
    const ocekavane: number[] = [];
    for (let i = 0; i < otazky.length; i++) {
      const otazka = aktualniOtazka(stav)!;
      const po = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 1 }, 1000)!;
      const xp = Math.round(xpZaOdpoved(otazka.obtiznost, i) * 0.2);
      ocekavane.push(xp);
      expect(po.ziskaneXp).toBe(xp);
      expect(po.koeficientXp).toBe(KOEFICIENT_XP_BLESK);
      expect(po.stav.posledniXp).toBe(xp);
      stav = dalsiOtazkaVEnginu(po.stav);
    }
    // obtížnosti 1, 2, 3, 5, 1 s combem ×1.0 … ×1.4 → 2, 4, 7, 13, 3
    expect(ocekavane).toEqual([2, 4, 7, 13, 3]);
    expect(stav.ziskaneXp).toBe(29);
    expect(stav.nejdelsiCombo).toBe(5);
    expect(fazeTestu(stav)).toBe('hotovo');
  });

  it('špatná odpověď nedá nic a shodí combo', () => {
    let stav = inicializujBlesk(banka(otazky), { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);
    stav = odpovezAPosun(stav, true); // 2
    const po = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 0 }, 1000)!;
    expect(po.spravne).toBe(false);
    expect(po.ziskaneXp).toBe(0);
    expect(po.stav.combo).toBe(0);
    expect(po.stav.ziskaneXp).toBe(2);
  });
});

describe('XP za bleskovou otázku v BĚŽNÉM testu', () => {
  const REZIMY = ['rozcvicka', 'standard', 'hardcore', 'adaptivni', 'zkouska'] as const;

  it('koeficient platí v každém režimu — bleskovky nejdou obejít běžným testem', () => {
    for (const rezim of REZIMY) {
      const test = inicializujTest(banka([iy('o1', 3)]), { predmetId: 'pravopis', rezim, pocetOtazek: 5 }, {}, nahodaNula, ZACATEK);
      expect(test.blesk).toBeUndefined();
      const po = odpovezVEnginu(test, { typ: 'vyber', vybrana: 1 }, 1000)!;
      expect(po.koeficientXp, rezim).toBe(KOEFICIENT_XP_BLESK);
      expect(po.ziskaneXp, rezim).toBe(Math.round(xpZaOdpoved(3, 0) * 0.2)); // 30 → 6
    }
  });

  it('běžná otázka v tomtéž testu dává plné XP — koeficient je na otázku, ne na test', () => {
    // nahodaNula bere otázky v pořadí banky: blesková, běžná, blesková.
    let stav = inicializujTest(
      banka([iy('b1', 2), bezna('n1', 2), iy('b2', 2)]),
      { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 },
      {},
      nahodaNula,
      ZACATEK,
    );
    expect(stav.otazky.map((o) => o.id)).toEqual(['b1', 'n1', 'b2']);

    const prvni = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 1 }, 1000)!;
    expect([prvni.koeficientXp, prvni.ziskaneXp]).toEqual([KOEFICIENT_XP_BLESK, Math.round(xpZaOdpoved(2, 0) * 0.2)]);
    stav = dalsiOtazkaVEnginu(prvni.stav);

    const druha = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 1 }, 1000)!;
    expect([druha.koeficientXp, druha.ziskaneXp]).toEqual([1, xpZaOdpoved(2, 1)]); // plných 22
    stav = dalsiOtazkaVEnginu(druha.stav);

    const treti = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 1 }, 1000)!;
    expect([treti.koeficientXp, treti.ziskaneXp]).toEqual([KOEFICIENT_XP_BLESK, Math.round(xpZaOdpoved(2, 2) * 0.2)]);
    // Combo běží přes oba druhy otázek stejně.
    expect(treti.stav.combo).toBe(3);
    expect(treti.stav.ziskaneXp).toBe(4 + 22 + 5);
  });
});

describe('pocitaSeJakoBleskovky — kdy se test řídí denní dávkou truhly', () => {
  const standard = (otazky: Otazka[]) =>
    inicializujTest(banka(otazky), { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 20 }, {}, nahodaNula, ZACATEK);

  it('kolo bleskovek vždy (i opravné)', () => {
    expect(pocitaSeJakoBleskovky(inicializujBlesk(banka([iy('a')]), { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK))).toBe(true);
    expect(pocitaSeJakoBleskovky(inicializujBleskZOtazek('pravopis', [iy('a')], ZACATEK))).toBe(true);
  });

  it('běžný test, když je aspoň polovina otázek blesková', () => {
    expect(pocitaSeJakoBleskovky(standard([iy('a'), iy('b'), iy('c')]))).toBe(true);
    expect(pocitaSeJakoBleskovky(standard([iy('a'), bezna('n1')]))).toBe(true); // přesně polovina
    expect(pocitaSeJakoBleskovky(standard([iy('a'), iy('b'), iy('c'), bezna('n1'), bezna('n2')]))).toBe(true);
  });

  it('běžný test s menšinou bleskových otázek ne', () => {
    expect(pocitaSeJakoBleskovky(standard([iy('a'), bezna('n1'), bezna('n2')]))).toBe(false);
    expect(pocitaSeJakoBleskovky(standard([bezna('n1'), bezna('n2')]))).toBe(false);
    expect(pocitaSeJakoBleskovky(standard([]))).toBe(false);
  });

  it('adaptivní test: rozhodují otázky, které skutečně padly', () => {
    // Banka: 1 běžná + 4 bleskové, všechny obtížnost 2 (adaptivní začíná na 2).
    let stav = inicializujTest(
      banka([bezna('n1', 2), iy('a', 2), iy('b', 2), iy('c', 2), iy('d', 2)]),
      { predmetId: 'pravopis', rezim: 'adaptivni', pocetOtazek: 5 },
      {},
      nahodaNula,
      ZACATEK,
    );
    // Na začátku je v `otazky` jen první otázka (běžná) → zatím ne.
    expect(stav.otazky.map((o) => o.id)).toEqual(['n1']);
    expect(pocitaSeJakoBleskovky(stav)).toBe(false);
    for (let i = 0; i < 5; i++) stav = odpovezAPosun(stav, true);
    expect(stav.otazky).toHaveLength(5);
    expect(pocitaSeJakoBleskovky(stav)).toBe(true); // 4 z 5
  });
});

describe('vyhodnotTest u bleskovek', () => {
  const otazky = Array.from({ length: 10 }, (_, i) => iy(`o${i}`));

  function dohraj(spravnych: number, stav: TestStav): TestStav {
    let s = stav;
    const pocet = s.otazky.length;
    for (let i = 0; i < pocet; i++) s = odpovezAPosun(s, i < spravnych);
    return s;
  }

  const kolo = () => inicializujBlesk(banka(otazky), { predmetId: 'pravopis', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);

  it('výsledek má id blesk-… a pozná se jako bleskový', () => {
    const v = vyhodnotTest(dohraj(10, kolo()), KONEC, nahodaNula);
    expect(v.id).toMatch(/^blesk-\d+-/);
    expect(jeBleskVysledek(v)).toBe(true);
    expect(jeOpravaBlesku(v)).toBe(false);
    expect(v.konfigurace.rezim).toBe('rozcvicka');
    expect(v.uspesnost).toBe(1);
    expect(v.odpovedi).toHaveLength(10);
  });

  it('bez povolení volajícího truhlu nedá, ani za 100 %', () => {
    expect(vyhodnotTest(dohraj(10, kolo()), KONEC, nahodaNula).truhla).toBeUndefined();
    expect(vyhodnotTest(dohraj(10, kolo()), KONEC, nahodaNula, {}).truhla).toBeUndefined();
    expect(vyhodnotTest(dohraj(10, kolo()), KONEC, nahodaNula, { truhlaZBlesku: false }).truhla).toBeUndefined();
  });

  it('s povolením dává truhlu podle úspěšnosti jako test (90 / 70 / 50 %)', () => {
    const povoleno = { truhlaZBlesku: true };
    expect(vyhodnotTest(dohraj(9, kolo()), KONEC, nahodaNula, povoleno).truhla).toBe('zlata');
    expect(vyhodnotTest(dohraj(7, kolo()), KONEC, nahodaNula, povoleno).truhla).toBe('stribrna');
    expect(vyhodnotTest(dohraj(5, kolo()), KONEC, nahodaNula, povoleno).truhla).toBe('bronzova');
    expect(vyhodnotTest(dohraj(4, kolo()), KONEC, nahodaNula, povoleno).truhla).toBeUndefined();
  });

  it('běžný test z běžných otázek se povolením neřídí — truhlu dává vždy podle úspěšnosti', () => {
    const bezne = Array.from({ length: 10 }, (_, i) => bezna(`n${i}`));
    const test = inicializujTest(banka(bezne), { predmetId: 'pravopis', rezim: 'zkouska', pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);
    const v = vyhodnotTest(dohraj(10, test), KONEC, nahodaNula, { truhlaZBlesku: false });
    expect(v.id).toMatch(/^vysledek-/);
    expect(jeBleskVysledek(v)).toBe(false);
    expect(v.truhla).toBe('zlata');
  });
});

describe('vyhodnotTest u běžného testu s převahou bleskových otázek', () => {
  const bleskove = Array.from({ length: 10 }, (_, i) => iy(`o${i}`));

  function dohraj(spravnych: number, stav: TestStav): TestStav {
    let s = stav;
    const pocet = s.otazky.length;
    for (let i = 0; i < pocet; i++) s = odpovezAPosun(s, i < spravnych);
    return s;
  }

  const test = (rezim: 'rozcvicka' | 'standard' | 'zkouska' = 'standard', otazky: Otazka[] = bleskove) =>
    inicializujTest(banka(otazky), { predmetId: 'pravopis', rezim, pocetOtazek: 10 }, {}, nahodaNula, ZACATEK);

  it('výsledek má id blesk-test-…: počítá se jako bleskovky, ale kolem bleskovek není', () => {
    const v = vyhodnotTest(dohraj(10, test()), KONEC, nahodaNula, { truhlaZBlesku: true });
    expect(v.id).toMatch(/^blesk-test-\d+-/);
    expect(jeBleskVysledek(v)).toBe(true);
    expect(jeBleskovyTest(v)).toBe(true);
    expect(jeKoloBleskovek(v)).toBe(false);
    expect(jeOpravaBlesku(v)).toBe(false);
    // Režim i ostatní pole zůstávají, jak je test měl.
    expect(v.konfigurace).toEqual({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 10 });
    expect(v.odpovedi).toHaveLength(10);
  });

  it('truhlu dává jen s povolením volajícího (denní dávka), pak podle úspěšnosti', () => {
    expect(vyhodnotTest(dohraj(10, test()), KONEC, nahodaNula).truhla).toBeUndefined();
    expect(vyhodnotTest(dohraj(10, test()), KONEC, nahodaNula, { truhlaZBlesku: false }).truhla).toBeUndefined();
    const povoleno = { truhlaZBlesku: true };
    expect(vyhodnotTest(dohraj(9, test()), KONEC, nahodaNula, povoleno).truhla).toBe('zlata');
    expect(vyhodnotTest(dohraj(7, test('rozcvicka')), KONEC, nahodaNula, povoleno).truhla).toBe('stribrna');
    expect(vyhodnotTest(dohraj(4, test()), KONEC, nahodaNula, povoleno).truhla).toBeUndefined();
  });

  it('platí i pro zkoušku — úspěšnost se dál počítá z plánovaných otázek', () => {
    // Zkouška, ve které student stihl jen 6 z 10 otázek (všechny správně).
    let stav = test('zkouska');
    for (let i = 0; i < 6; i++) stav = odpovezAPosun(stav, true);
    const v = vyhodnotTest(stav, KONEC, nahodaNula, { truhlaZBlesku: true });
    expect(v.id).toMatch(/^blesk-test-/);
    expect(v.konfigurace.rezim).toBe('zkouska');
    expect(v.uspesnost).toBeCloseTo(0.6);
    expect(v.truhla).toBe('bronzova');
    expect(vyhodnotTest(stav, KONEC, nahodaNula).truhla).toBeUndefined();
  });

  it('hranice: přesně polovina bleskových otázek se počítá, o jednu míň už ne', () => {
    const pulka = [...bleskove.slice(0, 5), ...Array.from({ length: 5 }, (_, i) => bezna(`n${i}`))];
    const vPulka = vyhodnotTest(dohraj(10, test('standard', pulka)), KONEC, nahodaNula);
    expect(vPulka.id).toMatch(/^blesk-test-/);
    expect(vPulka.truhla).toBeUndefined();

    const mensina = [...bleskove.slice(0, 4), ...Array.from({ length: 6 }, (_, i) => bezna(`n${i}`))];
    const vMensina = vyhodnotTest(dohraj(10, test('standard', mensina)), KONEC, nahodaNula);
    expect(vMensina.id).toMatch(/^vysledek-/);
    expect(vMensina.truhla).toBe('zlata');
  });
});

describe('inicializujBleskZOtazek — opravné kolo', () => {
  it('hraje přesně dané otázky v daném pořadí', () => {
    const stav = inicializujBleskZOtazek('pravopis', [iy('c'), iy('a'), iy('b')], ZACATEK);
    expect(stav.otazky.map((o) => o.id)).toEqual(['c', 'a', 'b']);
    expect(stav.blesk).toEqual({ oprava: true });
    expect(planovanyPocetOtazek(stav)).toBe(3);
  });

  it('konfigurace nese nejbližší povolený počet ≥ počtu otázek a režim rozcvicka', () => {
    const pocty = [1, 5, 6, 10, 11, 20].map(
      (pocet) =>
        inicializujBleskZOtazek(
          'pravopis',
          Array.from({ length: pocet }, (_, i) => iy(`o${i}`)),
          ZACATEK,
        ).konfigurace.pocetOtazek,
    );
    expect(pocty).toEqual([5, 5, 10, 10, 20, 20]);
    const stav = inicializujBleskZOtazek('pravopis', [iy('a')], ZACATEK);
    expect(stav.konfigurace).toEqual({ predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 });
  });

  it('vynechá opakované a nebleskové otázky', () => {
    const stav = inicializujBleskZOtazek('pravopis', [iy('a'), NEBLESKOVA, iy('a'), iy('b')], ZACATEK);
    expect(stav.otazky.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('volitelně přenáší výběr témat původního kola', () => {
    expect(inicializujBleskZOtazek('pravopis', [iy('a')], ZACATEK, ['t2']).konfigurace.temataId).toEqual(['t2']);
    expect(inicializujBleskZOtazek('pravopis', [iy('a')], ZACATEK, []).konfigurace.temataId).toBeUndefined();
  });

  it('opravné kolo má id blesk-oprava-…, XP s koeficientem a truhlu NIKDY', () => {
    let stav = inicializujBleskZOtazek('pravopis', [iy('a', 2), iy('b', 2)], ZACATEK);
    stav = odpovezAPosun(stav, true);
    stav = odpovezAPosun(stav, true);
    const v = vyhodnotTest(stav, KONEC, nahodaNula, { truhlaZBlesku: true });
    expect(v.id).toMatch(/^blesk-oprava-\d+-/);
    expect(jeBleskVysledek(v)).toBe(true);
    expect(jeOpravaBlesku(v)).toBe(true);
    expect(v.uspesnost).toBe(1);
    expect(v.truhla).toBeUndefined();
    expect(v.ziskaneXp).toBe(Math.round(20 * 0.2) + Math.round(22 * 0.2)); // 4 + 4
  });
});

// ---------------------------------------------------------------------------
// Store: testySlice + hraSlice

const dnes = denZData(new Date());

/** Banka s 12 bleskovými otázkami (správně vždy `y`) ve dvou tématech. */
const BANKA_BLESK = banka([
  NEBLESKOVA,
  ...Array.from({ length: 8 }, (_, i) => iy(`a${i}`, 2)),
  ...Array.from({ length: 4 }, (_, i) => iy(`b${i}`, 2, 't2')),
]);

/** Banka jen z běžných otázek (5) — běžný test nad ní se bleskovkami neřídí. */
const BANKA_BEZNA = banka(Array.from({ length: 5 }, (_, i) => bezna(`n${i}`, 2)));

/** 3 bleskové + 2 běžné otázky: test z celé banky se počítá jako bleskovky. */
const BANKA_PREVAHA = banka([iy('a0', 2), iy('a1', 2), iy('a2', 2), bezna('n0', 2), bezna('n1', 2)]);

/** 2 bleskové + 3 běžné otázky: menšina — test se jako bleskovky nepočítá. */
const BANKA_MENSINA = banka([iy('a0', 2), iy('a1', 2), bezna('n0', 2), bezna('n1', 2), bezna('n2', 2)]);

function quest(sablona: string, cil: number, odmenaXp: number): QuestDenni {
  return {
    id: `${dnes}:${sablona}`,
    sablona,
    popis: `quest ${sablona}`,
    cil,
    postup: 0,
    splneno: false,
    odmenaXp,
    datum: dnes,
  };
}

/** Profil, jehož aktivní banka je `aktivniPredmetId` (questy plní jen její testy). */
function nastavProfil(aktivniPredmetId: string): void {
  pouzijStav.setState({
    profily: [
      {
        id: 'p-blesk',
        jmeno: 'Kuba',
        barva: '#8b5cf6',
        predmety: ['pravopis', 'matematika'],
        aktivniPredmetId,
        aktualizovano: '2026-01-01T00:00:00.000Z',
      },
    ],
    aktivniProfilId: 'p-blesk',
  });
}

/** Dohraje běžící kolo: prvních `spatne` otázek špatně, zbytek správně. */
function dohrajKolo(spatne = 0): TestVysledek {
  const stav = pouzijStav.getState();
  const pocet = stav.aktualniTest!.otazky.length;
  for (let i = 0; i < pocet; i++) {
    const otazka = aktualniOtazka(pouzijStav.getState().aktualniTest!)!;
    if (otazka.typ !== 'vyber') throw new Error('fixtury těchhle testů mají jen výběrové otázky');
    const spravna = otazka.spravna;
    pouzijStav.getState().odpovez({ typ: 'vyber', vybrana: i < spatne ? 1 - spravna : spravna }, 1200);
    pouzijStav.getState().dalsiOtazka();
  }
  expect(pouzijStav.getState().aktualniTest?.dokonceno).toBe(true);
  pouzijStav.getState().dokonciTest();
  const vysledek = pouzijStav.getState().posledniVysledek;
  if (!vysledek) throw new Error('chybí výsledek');
  return vysledek;
}

describe('store — kolo bleskovek', () => {
  beforeEach(() => {
    pouzijStav.getState().resetujProgres();
    pouzijStav.setState({
      banky: { pravopis: BANKA_BLESK },
      aktualniTest: null,
      posledniVysledek: null,
      dataProfilu: {},
    });
    // Výchozí profil má aktivní JINOU banku než banku kola: denní questy
    // (generují se podle data) se tak do testů truhel a XP nepletou.
    nastavProfil('matematika');
    zaznamenejDokoncenyTest.mockClear();
  });

  afterEach(() => {
    pouzijStav.setState({ profily: [], aktivniProfilId: null, dataProfilu: {}, aktualniTest: null, banky: {} });
  });

  it('zacniBlesk založí kolo jen z bleskových otázek; bez banky nebo otázek vrací false', () => {
    expect(pouzijStav.getState().zacniBlesk({ predmetId: 'neexistuje', pocetOtazek: 10 })).toBe(false);
    pouzijStav.setState({ banky: { pravopis: BANKA_BLESK, prazdna: banka([NEBLESKOVA], 'prazdna') } });
    expect(pouzijStav.getState().zacniBlesk({ predmetId: 'prazdna', pocetOtazek: 10 })).toBe(false);
    expect(pouzijStav.getState().aktualniTest).toBeNull();

    expect(pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 })).toBe(true);
    const test = pouzijStav.getState().aktualniTest!;
    expect(test.blesk).toEqual({ oprava: false });
    expect(test.otazky).toHaveLength(10);
    expect(test.otazky.some((o) => o.id === 'dlouha')).toBe(false);
  });

  it('XP připsané do progresu = ziskaneXp výsledku (koeficient sedí na obou místech)', () => {
    // Aktivní banka (matematika) je jiná než banka kola → questy se neplní
    // a do progresu jde čistě XP za odpovědi.
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const vysledek = dohrajKolo(2);

    expect(vysledek.ziskaneXp).toBeGreaterThan(0);
    expect(pouzijStav.getState().progres.xp).toBe(vysledek.ziskaneXp);
    // 8 správných v řadě obtížnosti 2 s koeficientem 0,2 (po dvou chybách od ×1.0).
    const ocekavane = Array.from({ length: 8 }, (_, i) => Math.round(xpZaOdpoved(2, i) * 0.2)).reduce((s, x) => s + x, 0);
    expect(vysledek.ziskaneXp).toBe(ocekavane);
  });

  it('první kolo dne, které dosáhne na truhlu, ji dostane; další kola téhož dne už ne', () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const prvni = dohrajKolo(1); // 90 %
    expect(prvni.id).toMatch(/^blesk-/);
    expect(prvni.truhla).toBe('zlata');
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);

    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const druhe = dohrajKolo(0); // 100 %, ale truhla už dnes byla
    expect(druhe.uspesnost).toBe(1);
    expect(druhe.truhla).toBeUndefined();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);
    expect(pouzijStav.getState().historieTestu).toHaveLength(2);
  });

  it('denní dávka platí i po zaplavení historie: ani po deseti dalších kolech truhla znovu nepadne', () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const ranni = dohrajKolo(0);
    expect(ranni.truhla).toBe('zlata');

    // Střídání kol a opravných kol (ta bývají jednootázková) historii rychle vymění.
    for (let i = 0; i < 6; i++) {
      pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
      const kolo = dohrajKolo(1);
      expect(kolo.truhla).toBeUndefined();
      const chybne = kolo.odpovedi.filter((o) => !o.spravne).map((o) => o.otazkaId);
      pouzijStav.getState().zacniBleskOpravu('pravopis', chybne);
      expect(dohrajKolo(0).truhla).toBeUndefined();
    }

    // 13 výsledků dnes: historie drží 10 nejnovějších + ranní kolo s truhlou.
    const historie = pouzijStav.getState().historieTestu;
    expect(historie).toHaveLength(11);
    expect(historie[historie.length - 1]).toBe(ranni);
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);
    expect(pouzijStav.getState().progres.dokonceneTesty).toBe(13);
  });

  it('kolo pod 50 % truhlu nedá a denní dávku NEvybere — další kolo ji ještě získá', () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const slabe = dohrajKolo(6); // 40 %
    expect(slabe.truhla).toBeUndefined();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual([]);

    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    expect(dohrajKolo(3).truhla).toBe('stribrna'); // 70 %
  });

  it('včerejší truhla z bleskovek dnešní dávku neblokuje', () => {
    const vcera = new Date(Date.now() - 26 * 3_600_000).toISOString();
    pouzijStav.setState({
      historieTestu: [
        {
          id: 'blesk-1-vcera',
          konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 10 },
          zacatek: vcera,
          konec: vcera,
          odpovedi: [],
          uspesnost: 1,
          ziskaneXp: 30,
          nejdelsiCombo: 10,
          truhla: 'zlata',
        },
      ],
    });
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    expect(dohrajKolo(0).truhla).toBe('zlata');
  });

  it('opravné kolo truhlu nedává nikdy — ani jako první kolo dne — a dávku nevybere', () => {
    expect(pouzijStav.getState().zacniBleskOpravu('pravopis', ['a0', 'a1', 'b0'])).toBe(true);
    const test = pouzijStav.getState().aktualniTest!;
    expect(test.blesk).toEqual({ oprava: true });
    expect(test.otazky.map((o) => o.id)).toEqual(['a0', 'a1', 'b0']);

    const oprava = dohrajKolo(0);
    expect(oprava.id).toMatch(/^blesk-oprava-/);
    expect(oprava.uspesnost).toBe(1);
    expect(oprava.truhla).toBeUndefined();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual([]);

    // Běžné kolo po opravě je pořád „první kolo dne s truhlou“.
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    expect(dohrajKolo(0).truhla).toBe('zlata');
  });

  it('zacniBleskOpravu: neznámé otázky vynechá, bez použitelných vrací false, přenáší témata kola', () => {
    expect(pouzijStav.getState().zacniBleskOpravu('pravopis', ['zmizela', 'dlouha'])).toBe(false);
    expect(pouzijStav.getState().zacniBleskOpravu('neexistuje', ['a0'])).toBe(false);
    expect(pouzijStav.getState().aktualniTest).toBeNull();

    // Kolo z tématu t2 se dvěma chybami → oprava si nese temataId: ['t2'].
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10, temataId: ['t2'] });
    const kolo = dohrajKolo(2);
    expect(kolo.konfigurace.temataId).toEqual(['t2']);
    const chybne = kolo.odpovedi.filter((o) => !o.spravne).map((o) => o.otazkaId);
    expect(chybne).toHaveLength(2);

    expect(pouzijStav.getState().zacniBleskOpravu('pravopis', [...chybne, 'zmizela'])).toBe(true);
    const oprava = pouzijStav.getState().aktualniTest!;
    expect(oprava.otazky.map((o) => o.id)).toEqual(chybne);
    expect(oprava.konfigurace).toEqual({
      predmetId: 'pravopis',
      rezim: 'rozcvicka',
      pocetOtazek: 5,
      temataId: ['t2'],
    });
  });

  it('rekordy bleskovky nemění; streak, počet testů, historie a týdenní XP ano', () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const vysledek = dohrajKolo(0); // 100 %, combo 10, pár sekund

    const stav = pouzijStav.getState();
    expect(stav.progres.rekordy.nejlepsiUspesnost).toBe(0);
    expect(stav.progres.rekordy.nejdelsiCombo).toBe(0);
    expect(stav.progres.rekordy.nejrychlejsiBezchybnyMs).toBeNull();

    expect(stav.progres.streak.aktualni).toBe(1);
    expect(stav.progres.streak.posledniDen).toBe(dnes);
    expect(stav.progres.dokonceneTesty).toBe(1);
    expect(stav.historieTestu[0]).toBe(vysledek);
    const tydny = stav.tydenniXpTestuPodleBank['pravopis'] ?? {};
    expect(Object.values(tydny).reduce((s, x) => s + x, 0)).toBe(vysledek.ziskaneXp);
    // Leitner běží: správně zodpovězená otázka postoupila do boxu 3.
    expect(stav.progres.statistikyOtazek[vysledek.odpovedi[0].otazkaId].box).toBe(3);
  });

  it('běžný test z běžných otázek rekordy dál zapisuje (pravidlo se týká jen rychlých otázek)', () => {
    pouzijStav.setState({ banky: { pravopis: BANKA_BEZNA } });
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 });
    const vysledek = dohrajKolo(0);
    expect(vysledek.id).toMatch(/^vysledek-/);
    expect(pouzijStav.getState().progres.rekordy.nejlepsiUspesnost).toBe(1);
    expect(pouzijStav.getState().progres.rekordy.nejdelsiCombo).toBe(5);
    // Plné XP: 22 + 24 + 26 + 29 + 31 (obtížnost 2, combo ×1.0 … ×1.4).
    expect(vysledek.ziskaneXp).toBe(Array.from({ length: 5 }, (_, i) => xpZaOdpoved(2, i)).reduce((s, x) => s + x, 0));
    expect(pouzijStav.getState().progres.xp).toBe(vysledek.ziskaneXp);
  });

  // -------------------------------------------------------------------------
  // Běžný test nad bleskovými otázkami (díra v ekonomice, kterou to zavírá:
  // pětiotázková rozcvička z doplňovaček by jinak dávala plné XP a truhlu
  // každých pár vteřin).

  it('běžný test z bleskových otázek: XP s koeficientem v progresu i ve výsledku', () => {
    // Banka jen z bleskových otázek (5) — složení testu nezávisí na náhodě.
    pouzijStav.setState({ banky: { pravopis: banka(Array.from({ length: 5 }, (_, i) => iy(`a${i}`, 2))) } });
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 });
    expect(pouzijStav.getState().aktualniTest!.blesk).toBeUndefined();
    const vysledek = dohrajKolo(0);

    expect(vysledek.id).toMatch(/^blesk-test-/);
    expect(vysledek.konfigurace.rezim).toBe('rozcvicka');
    // Otázky obtížnosti 2 s combem ×1.0 … ×1.4: místo plných XP jen pětina.
    const plne = Array.from({ length: 5 }, (_, i) => xpZaOdpoved(2, i));
    const sKoeficientem = plne.map((xp) => Math.round(xp * 0.2)).reduce((s, x) => s + x, 0);
    expect(vysledek.ziskaneXp).toBe(sKoeficientem);
    expect(sKoeficientem).toBeLessThan(plne.reduce((s, x) => s + x, 0) / 4);
    expect(pouzijStav.getState().progres.xp).toBe(vysledek.ziskaneXp);
  });

  it('smíšený test: bleskové otázky s koeficientem, běžné naplno — a XP v progresu sedí s výsledkem', () => {
    pouzijStav.setState({ banky: { pravopis: BANKA_PREVAHA } });
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 });
    const poradi = pouzijStav.getState().aktualniTest!.otazky.map((o) => o.id);
    const vysledek = dohrajKolo(0);

    // Očekávání podle skutečného (náhodného) pořadí otázek v testu.
    const ocekavane = poradi
      .map((id, i) => (id.startsWith('a') ? Math.round(xpZaOdpoved(2, i) * 0.2) : xpZaOdpoved(2, i)))
      .reduce((s, x) => s + x, 0);
    expect(vysledek.ziskaneXp).toBe(ocekavane);
    expect(pouzijStav.getState().progres.xp).toBe(vysledek.ziskaneXp);
  });

  it('test s převahou bleskových otázek bere truhlu z denní dávky: první dnes ano, druhý ne', () => {
    pouzijStav.setState({ banky: { pravopis: BANKA_PREVAHA } });
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 });
    const prvni = dohrajKolo(0);
    expect(prvni.id).toMatch(/^blesk-test-/);
    expect(prvni.truhla).toBe('zlata');
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);

    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 });
    const druhy = dohrajKolo(0);
    expect(druhy.uspesnost).toBe(1);
    expect(druhy.truhla).toBeUndefined();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);
  });

  it('dávku sdílí s bleskovkami: po truhle z testu ji kolo bleskovek nedostane', () => {
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 });
    expect(dohrajKolo(0).truhla).toBe('zlata');

    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const kolo = dohrajKolo(0);
    expect(kolo.id).toMatch(/^blesk-\d/);
    expect(kolo.truhla).toBeUndefined();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);
  });

  it('…a obráceně: po truhle z bleskovek ji test z bleskových otázek nedostane', () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    expect(dohrajKolo(0).truhla).toBe('zlata');

    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'zkouska', pocetOtazek: 5 });
    const zkouska = dohrajKolo(0);
    expect(zkouska.id).toMatch(/^blesk-test-/);
    expect(zkouska.konfigurace.rezim).toBe('zkouska');
    expect(zkouska.uspesnost).toBe(1);
    expect(zkouska.truhla).toBeUndefined();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['zlata']);
  });

  it('test pod 50 % dávku nevybere — další kolo bleskovek truhlu ještě dostane', () => {
    pouzijStav.setState({ banky: { pravopis: BANKA_PREVAHA } });
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 });
    expect(dohrajKolo(3).truhla).toBeUndefined(); // 40 %

    pouzijStav.setState({ banky: { pravopis: BANKA_BLESK } });
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    expect(dohrajKolo(0).truhla).toBe('zlata');
  });

  it('test s převahou bleskových otázek rekordy nemění; streak, historie a týdenní XP ano', () => {
    pouzijStav.setState({ banky: { pravopis: BANKA_PREVAHA } });
    pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 });
    const vysledek = dohrajKolo(0);

    const stav = pouzijStav.getState();
    expect(stav.progres.rekordy.nejlepsiUspesnost).toBe(0);
    expect(stav.progres.rekordy.nejdelsiCombo).toBe(0);
    expect(stav.progres.rekordy.nejrychlejsiBezchybnyMs).toBeNull();
    expect(stav.progres.streak.aktualni).toBe(1);
    expect(stav.progres.dokonceneTesty).toBe(1);
    expect(stav.historieTestu[0]).toBe(vysledek);
    const tydny = stav.tydenniXpTestuPodleBank['pravopis'] ?? {};
    expect(Object.values(tydny).reduce((s, x) => s + x, 0)).toBe(vysledek.ziskaneXp);
  });

  it('test s MENŠINOU bleskových otázek je běžný test: truhla pokaždé, rekordy ano — jen XP bleskových je menší', () => {
    pouzijStav.setState({ banky: { pravopis: BANKA_MENSINA } });
    for (let kolo = 0; kolo < 2; kolo++) {
      pouzijStav.getState().zacniTest({ predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 });
      const vysledek = dohrajKolo(0);
      expect(vysledek.id).toMatch(/^vysledek-/);
      expect(vysledek.truhla).toBe('zlata');
    }
    const stav = pouzijStav.getState();
    expect(stav.cekajiciTruhly).toEqual(['zlata', 'zlata']);
    expect(stav.progres.rekordy.nejlepsiUspesnost).toBe(1);
    expect(stav.progres.rekordy.nejdelsiCombo).toBe(5);
    // Truhla z běžného testu denní dávku bleskovek nevybírá.
    pouzijStav.setState({ banky: { pravopis: BANKA_BLESK } });
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    expect(dohrajKolo(0).truhla).toBe('zlata');
  });

  it('questy aktivní banky se bleskovkami plní (odpovědi i úspěšnost) a XP za ně se připíše', () => {
    nastavProfil('pravopis');
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('odpovez', 10, 60), quest('uspesnost', 1, 80), quest('bezchyby', 5, 75)] },
    }));
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const vysledek = dohrajKolo(0);

    const stav = pouzijStav.getState();
    expect(stav.progres.questy.map((q) => q.splneno)).toEqual([true, true, true]);
    expect(stav.progres.xp).toBe(vysledek.ziskaneXp + 60 + 80 + 75);
    // Všechny 3 questy → bonusová bronzová truhla + denní truhla z bleskovek.
    expect([...stav.cekajiciTruhly].sort()).toEqual(['bronzova', 'zlata']);
  });

  it('questy JINÉ aktivní banky bleskovky neplní', () => {
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('odpovez', 10, 60), quest('uspesnost', 1, 80)] },
    }));
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    dohrajKolo(0);
    expect(pouzijStav.getState().progres.questy.map((q) => q.postup)).toEqual([0, 0]);
  });

  it('výsledek odchází na server stejnou cestou jako test (zaznamenejDokoncenyTest)', async () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    const vysledek = dohrajKolo(0);
    await vi.waitFor(() => expect(zaznamenejDokoncenyTest).toHaveBeenCalledWith(vysledek));
    // Právě jednou (pozdní volání z jiných testů mají jiný výsledek).
    expect(zaznamenejDokoncenyTest.mock.calls.filter((volani) => volani[0] === vysledek)).toHaveLength(1);
    // Tvar výsledku projde serverovou validací: režim z původního výčtu,
    // počet otázek 5/10/20, celočíselné XP.
    expect(['rozcvicka', 'standard', 'hardcore', 'adaptivni', 'zkouska']).toContain(vysledek.konfigurace.rezim);
    expect([5, 10, 20]).toContain(vysledek.konfigurace.pocetOtazek);
    expect(Number.isInteger(vysledek.ziskaneXp)).toBe(true);
  });

  it('nedohrané kolo bez odpovědi se nevyhodnotí', () => {
    pouzijStav.getState().zacniBlesk({ predmetId: 'pravopis', pocetOtazek: 10 });
    pouzijStav.getState().dokonciTest();
    expect(pouzijStav.getState().aktualniTest).toBeNull();
    expect(pouzijStav.getState().posledniVysledek).toBeNull();
    expect(pouzijStav.getState().historieTestu).toEqual([]);
  });
});
