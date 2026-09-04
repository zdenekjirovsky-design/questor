// Testy čistého testového enginu — vyhodnocení všech 5 typů otázek,
// combo + XP, adaptivní posun obtížnosti, režim zkouška a truhla.
import { describe, expect, it } from 'vitest';
import type { BankaOtazek, Obtiznost, Otazka, TestKonfigurace } from '@questor/sdilene';
import {
  aktualniOtazka,
  dalsiOtazkaVEnginu,
  fazeTestu,
  inicializujTest,
  LIMIT_ZKOUSKY_MS_NA_OTAZKU,
  odpovezVEnginu,
  vyhodnotOdpoved,
  vyhodnotTest,
  type OdpovedHodnota,
  type TestStav,
} from '../src/testy/engine';

// ---------------------------------------------------------------------------
// Fixtury

function vyberova(id: string, obtiznost: Obtiznost, temaId = 't1'): Otazka {
  return {
    id,
    temaId,
    obtiznost,
    typ: 'vyber',
    zadani: `Otázka ${id}?`,
    moznosti: ['správně', 'špatně A', 'špatně B'],
    spravna: 0,
    vysvetleni: 'Protože ano.',
  };
}

function banka(otazky: Otazka[]): BankaOtazek {
  return {
    predmetId: 'testovaci',
    nazev: 'Testovací banka',
    verze: 1,
    vytvoreno: '2026-09-04',
    temata: [
      { id: 't1', nazev: 'Téma 1', poradi: 0 },
      { id: 't2', nazev: 'Téma 2', poradi: 1 },
    ],
    otazky,
  };
}

const KONFIG_STANDARD: TestKonfigurace = {
  predmetId: 'testovaci',
  rezim: 'standard',
  pocetOtazek: 5,
};

/** Deterministická „náhoda“: vazenyVyber s ní bere položky v původním pořadí. */
const nahodaNula = () => 0;

function spust(konfigurace: TestKonfigurace, otazky: Otazka[]): TestStav {
  return inicializujTest(banka(otazky), konfigurace, {}, nahodaNula, '2026-09-04T10:00:00.000Z');
}

/** Odpoví na aktuální otázku (index 0 správné možnosti = správně) a posune dál. */
function odpovezAPosun(stav: TestStav, spravne: boolean): TestStav {
  const vysledek = odpovezVEnginu(
    stav,
    { typ: 'vyber', vybrana: spravne ? 0 : 1 },
    1000,
  );
  expect(vysledek).not.toBeNull();
  return dalsiOtazkaVEnginu(vysledek!.stav);
}

// ---------------------------------------------------------------------------
// Vyhodnocení všech 5 typů

describe('vyhodnotOdpoved', () => {
  const zaklad = { id: 'o1', temaId: 't1', obtiznost: 2 as Obtiznost, zadani: 'Z?', vysvetleni: 'V.' };

  it('vyber: správný index projde, jiný ne', () => {
    const o: Otazka = { ...zaklad, typ: 'vyber', moznosti: ['a', 'b', 'c'], spravna: 1 };
    expect(vyhodnotOdpoved(o, { typ: 'vyber', vybrana: 1 })).toBe(true);
    expect(vyhodnotOdpoved(o, { typ: 'vyber', vybrana: 0 })).toBe(false);
  });

  it('multi: vyžaduje PŘESNOU shodu množin', () => {
    const o: Otazka = { ...zaklad, typ: 'multi', moznosti: ['a', 'b', 'c', 'd'], spravne: [0, 2] };
    expect(vyhodnotOdpoved(o, { typ: 'multi', vybrane: [2, 0] })).toBe(true);
    expect(vyhodnotOdpoved(o, { typ: 'multi', vybrane: [0] })).toBe(false); // chybí
    expect(vyhodnotOdpoved(o, { typ: 'multi', vybrane: [0, 1, 2] })).toBe(false); // navíc
    expect(vyhodnotOdpoved(o, { typ: 'multi', vybrane: [1, 3] })).toBe(false);
  });

  it('anone: porovnává boolean', () => {
    const o: Otazka = { ...zaklad, typ: 'anone', spravna: false };
    expect(vyhodnotOdpoved(o, { typ: 'anone', hodnota: false })).toBe(true);
    expect(vyhodnotOdpoved(o, { typ: 'anone', hodnota: true })).toBe(false);
  });

  it('doplneni: porovnává normalizovaně (diakritika, velikost, mezery)', () => {
    const o: Otazka = { ...zaklad, typ: 'doplneni', spravneOdpovedi: ['nabídka', 'supply'] };
    expect(vyhodnotOdpoved(o, { typ: 'doplneni', text: '  NABIDKA ' })).toBe(true);
    expect(vyhodnotOdpoved(o, { typ: 'doplneni', text: 'Supply' })).toBe(true);
    expect(vyhodnotOdpoved(o, { typ: 'doplneni', text: 'poptávka' })).toBe(false);
  });

  it('prirazovani: správně jen když sedí VŠECHNY páry', () => {
    const o: Otazka = {
      ...zaklad,
      typ: 'prirazovani',
      pary: [
        { levy: 'HDP', pravy: 'produkt' },
        { levy: 'CPI', pravy: 'inflace' },
        { levy: 'HPP', pravy: 'úvazek' },
      ],
    };
    const vsechnySedi: OdpovedHodnota = {
      typ: 'prirazovani',
      pary: [
        { levy: 0, pravy: 0 },
        { levy: 2, pravy: 2 },
        { levy: 1, pravy: 1 },
      ],
    };
    expect(vyhodnotOdpoved(o, vsechnySedi)).toBe(true);
    expect(
      vyhodnotOdpoved(o, {
        typ: 'prirazovani',
        pary: [
          { levy: 0, pravy: 1 },
          { levy: 1, pravy: 0 },
          { levy: 2, pravy: 2 },
        ],
      }),
    ).toBe(false); // dva prohozené
    expect(
      vyhodnotOdpoved(o, {
        typ: 'prirazovani',
        pary: [
          { levy: 0, pravy: 0 },
          { levy: 1, pravy: 1 },
        ],
      }),
    ).toBe(false); // chybí pár
  });

  it('nesedící typ odpovědi je vždy špatně', () => {
    const o: Otazka = { ...zaklad, typ: 'anone', spravna: true };
    expect(vyhodnotOdpoved(o, { typ: 'vyber', vybrana: 0 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Combo a XP

describe('combo a XP', () => {
  const otazky = [1, 2, 3, 4, 5].map((i) => vyberova(`o${i}`, 2));

  it('série správných zvedá combo i násobič XP; chyba combo shodí', () => {
    let stav = spust(KONFIG_STANDARD, otazky);
    expect(stav.otazky).toHaveLength(5);

    stav = odpovezAPosun(stav, true); // 10*2*1.0 = 20
    stav = odpovezAPosun(stav, true); // 10*2*1.1 = 22
    stav = odpovezAPosun(stav, true); // 10*2*1.2 = 24
    expect(stav.combo).toBe(3);
    expect(stav.ziskaneXp).toBe(20 + 22 + 24);

    stav = odpovezAPosun(stav, false); // chyba: 0 XP, combo spadne
    expect(stav.combo).toBe(0);
    expect(stav.ziskaneXp).toBe(66);
    expect(stav.nejdelsiCombo).toBe(3);

    stav = odpovezAPosun(stav, true); // po chybě zase od ×1.0
    expect(stav.ziskaneXp).toBe(66 + 20);
    expect(stav.nejdelsiCombo).toBe(3);
    expect(fazeTestu(stav)).toBe('hotovo');
  });

  it('posledniXp drží XP poslední odpovědi (pro plovoucí +XP)', () => {
    let stav = spust(KONFIG_STANDARD, otazky);
    const po = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 0 }, 500)!;
    expect(po.ziskaneXp).toBe(20);
    expect(po.stav.posledniXp).toBe(20);
    stav = dalsiOtazkaVEnginu(po.stav);
    expect(stav.posledniXp).toBe(0);
  });

  it('dvojitá odpověď na tutéž otázku se ignoruje', () => {
    const stav = spust(KONFIG_STANDARD, otazky);
    const prvni = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 0 }, 500)!;
    expect(odpovezVEnginu(prvni.stav, { typ: 'vyber', vybrana: 0 }, 500)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adaptivní režim

describe('adaptivní režim', () => {
  const otazky = ([1, 2, 3, 4, 5] as Obtiznost[]).map((obt) => vyberova(`o${obt}`, obt));
  const konfig: TestKonfigurace = { predmetId: 'testovaci', rezim: 'adaptivni', pocetOtazek: 5 };

  it('začíná u obtížnosti 2 a po správné odpovědi šplhá výš', () => {
    let stav = spust(konfig, otazky);
    expect(stav.otazky.map((o) => o.obtiznost)).toEqual([2]);
    expect(stav.pool).toHaveLength(4);

    stav = odpovezAPosun(stav, true); // cíl 3 → přibere trojku
    expect(stav.otazky.map((o) => o.obtiznost)).toEqual([2, 3]);
    expect(aktualniOtazka(stav)?.obtiznost).toBe(3);

    stav = odpovezAPosun(stav, true); // cíl 4
    expect(stav.otazky.map((o) => o.obtiznost)).toEqual([2, 3, 4]);
  });

  it('po chybě klesá k lehčím otázkám z nevyčerpaného poolu', () => {
    let stav = spust(konfig, otazky);
    stav = odpovezAPosun(stav, true); // otázky [2, 3], cíl 3
    stav = odpovezAPosun(stav, false); // cíl 2; v poolu zbývá {1, 4, 5} → nejblíž je 1
    expect(stav.otazky.map((o) => o.obtiznost)).toEqual([2, 3, 1]);
  });

  it('nikdy nepřekročí plánovaný počet otázek', () => {
    let stav = spust({ ...konfig, pocetOtazek: 5 }, otazky);
    for (let i = 0; i < 5; i++) stav = odpovezAPosun(stav, true);
    expect(stav.otazky).toHaveLength(5);
    expect(fazeTestu(stav)).toBe('hotovo');
  });
});

// ---------------------------------------------------------------------------
// Režim zkouška

describe('režim zkouška', () => {
  const otazky = [2, 2, 3].map((obt, i) => vyberova(`o${i}`, obt as Obtiznost));
  const konfig: TestKonfigurace = { predmetId: 'testovaci', rezim: 'zkouska', pocetOtazek: 5 };

  it('má časový limit 90 s na otázku', () => {
    const stav = spust(konfig, otazky);
    expect(stav.otazky).toHaveLength(3); // banka víc nedá
    expect(stav.casovyLimitMs).toBe(3 * LIMIT_ZKOUSKY_MS_NA_OTAZKU);
  });

  it('nezodpovězené otázky po vypršení limitu počítá jako chybu', () => {
    let stav = spust(konfig, otazky);
    stav = odpovezAPosun(stav, true);
    stav = odpovezAPosun(stav, false);
    // třetí zůstala nezodpovězená (došel čas)
    const vysledek = vyhodnotTest(stav, '2026-09-04T10:05:00.000Z', nahodaNula);
    expect(vysledek.uspesnost).toBeCloseTo(1 / 3);
    expect(vysledek.odpovedi).toHaveLength(2);
    expect(vysledek.truhla).toBeUndefined();
  });

  it('mimo zkoušku se úspěšnost počítá jen ze zodpovězených', () => {
    let stav = spust(KONFIG_STANDARD, otazky);
    stav = odpovezAPosun(stav, true);
    stav = odpovezAPosun(stav, false);
    const vysledek = vyhodnotTest(stav, '2026-09-04T10:05:00.000Z', nahodaNula);
    expect(vysledek.uspesnost).toBeCloseTo(1 / 2);
  });
});

// ---------------------------------------------------------------------------
// Truhla a sestavení výsledku

describe('vyhodnotTest a truhla', () => {
  const otazky = [1, 2, 3, 4].map((i) => vyberova(`o${i}`, 2));
  const konfig: TestKonfigurace = { predmetId: 'testovaci', rezim: 'standard', pocetOtazek: 5 };

  function dohraj(spravnych: number): ReturnType<typeof vyhodnotTest> {
    let stav = spust(konfig, otazky);
    for (let i = 0; i < 4; i++) stav = odpovezAPosun(stav, i < spravnych);
    return vyhodnotTest(stav, '2026-09-04T10:10:00.000Z', nahodaNula);
  }

  it('uděluje truhlu podle úspěšnosti (90/70/50 %)', () => {
    expect(dohraj(4).truhla).toBe('zlata'); // 100 %
    expect(dohraj(3).truhla).toBe('stribrna'); // 75 %
    expect(dohraj(2).truhla).toBe('bronzova'); // 50 %
    expect(dohraj(1).truhla).toBeUndefined(); // 25 %
  });

  it('sestaví kompletní TestVysledek', () => {
    const vysledek = dohraj(3);
    expect(vysledek.id).toMatch(/^vysledek-/);
    expect(vysledek.konfigurace).toEqual(konfig);
    expect(vysledek.zacatek).toBe('2026-09-04T10:00:00.000Z');
    expect(vysledek.konec).toBe('2026-09-04T10:10:00.000Z');
    expect(vysledek.odpovedi).toHaveLength(4);
    expect(vysledek.nejdelsiCombo).toBe(3);
    expect(vysledek.ziskaneXp).toBe(20 + 22 + 24);
    expect(vysledek.vyzvaId).toBeUndefined();
  });

  it('propíše id výzvy, když test vznikl z výzvy', () => {
    const stav = inicializujTest(
      banka(otazky),
      konfig,
      {},
      nahodaNula,
      '2026-09-04T10:00:00.000Z',
      'vyzva-42',
    );
    const po = odpovezVEnginu(stav, { typ: 'vyber', vybrana: 0 }, 100)!;
    const vysledek = vyhodnotTest(po.stav, '2026-09-04T10:01:00.000Z', nahodaNula);
    expect(vysledek.vyzvaId).toBe('vyzva-42');
  });
});
