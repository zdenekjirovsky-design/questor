// Testy čisté logiky bleskovek (src/testy/blesk.ts): co je blesková otázka,
// pořadí možností, zadání s mezerou, výběr otázek do kola, XP s koeficientem
// (i pro bleskové otázky v běžném testu), výsledky (id, tempo, denní truhla,
// chyby, další kolo), zvládnutí témat a klávesnice. Na konci hlídka konvencí
// obsahu nad bundlovanými bankami.
import { describe, expect, it } from 'vitest';
import type {
  BankaOtazek,
  Obtiznost,
  Otazka,
  OtazkaVyber,
  StatistikaOtazky,
  TestVysledek,
} from '@questor/sdilene';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { denZData, validujBanku, vytvorNahodu } from '@questor/sdilene';
import {
  bleskoveOtazky,
  bylaDnesTruhlaZBlesku,
  chybyBlesku,
  doplnZadani,
  duvodBezTruhly,
  jeBleskova,
  jeBleskovyTest,
  jeBleskVysledek,
  jeKoloBleskovek,
  jeOpravaBlesku,
  KOEFICIENT_XP_BLESK,
  koeficientXpOtazky,
  konfiguraceDalsihoKola,
  LIMIT_HISTORIE_TESTU,
  maBleskovky,
  maKratkeMoznosti,
  MIN_BLESKOVYCH,
  MIN_BLESKOVYCH_TEMATU,
  moznostZKlavesy,
  orizniHistoriiTestu,
  pocetBleskovych,
  pocetOtazekProOpravu,
  PODIL_BLESKOVYCH_TESTU,
  poradiBleskovychMoznosti,
  poruseniKonvenciBlesku,
  PREFIX_BLESK,
  PREFIX_BLESK_OPRAVA,
  PREFIX_BLESK_TEST,
  prevazujiBleskove,
  rozdelZadani,
  temataBlesku,
  tempoZaMinutu,
  vyberBleskoveOtazky,
  xpSKoeficientem,
  zvladnutiOtazek,
} from '../src/testy/blesk';
import { zamichaneIndexy } from '../src/testy/komponenty/michani';
import { nactiBundlovaneBanky } from '../src/data/predmety';

// ---------------------------------------------------------------------------
// Fixtury

function vyber(
  id: string,
  moznosti: string[],
  prepis: Partial<OtazkaVyber> = {},
): OtazkaVyber {
  return {
    id,
    temaId: 't1',
    obtiznost: 1,
    typ: 'vyber',
    zadani: `b_lina ${id}`,
    moznosti,
    spravna: 0,
    vysvetleni: 'Protože ano.',
    ...prepis,
  };
}

const iy = (id: string, prepis: Partial<OtazkaVyber> = {}) => vyber(id, ['i', 'y'], prepis);

function banka(otazky: Otazka[]): BankaOtazek {
  return {
    predmetId: 'pravopis',
    nazev: 'Pravopis',
    verze: 1,
    vytvoreno: '2026-11-22',
    temata: [
      { id: 't1', nazev: 'Téma 1', poradi: 0 },
      { id: 't2', nazev: 'Téma 2', poradi: 1 },
      { id: 't3', nazev: 'Téma 3', poradi: 2 },
    ],
    otazky,
  };
}

function stat(otazkaId: string, box: StatistikaOtazky['box']): StatistikaOtazky {
  return { otazkaId, box, spravneCelkem: 1, spatneCelkem: 0, posledniOdpoved: '2026-11-22T10:00:00.000Z' };
}

function vysledek(prepis: Partial<TestVysledek> = {}): TestVysledek {
  return {
    id: 'blesk-1-abc',
    konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 10 },
    zacatek: '2026-11-22T10:00:00.000Z',
    konec: '2026-11-22T10:02:00.000Z',
    odpovedi: [],
    uspesnost: 1,
    ziskaneXp: 30,
    nejdelsiCombo: 10,
    ...prepis,
  };
}

const nahodaNula = () => 0;

// ---------------------------------------------------------------------------

describe('konstanty bleskovek', () => {
  it('drží hodnoty z kontraktu', () => {
    expect(MIN_BLESKOVYCH).toBe(10);
    expect(MIN_BLESKOVYCH_TEMATU).toBe(5);
    expect(KOEFICIENT_XP_BLESK).toBe(0.2);
    expect(PODIL_BLESKOVYCH_TESTU).toBe(0.5);
  });

  it('všechny prefixy id, které se počítají jako bleskovky, začínají „blesk-“', () => {
    expect(PREFIX_BLESK).toBe('blesk-');
    expect(PREFIX_BLESK_OPRAVA.startsWith(PREFIX_BLESK)).toBe(true);
    expect(PREFIX_BLESK_TEST.startsWith(PREFIX_BLESK)).toBe(true);
    // Čas v id kola je číslo — prefixy opravy a testu se s ním nespletou.
    expect(PREFIX_BLESK_OPRAVA).toBe('blesk-oprava-');
    expect(PREFIX_BLESK_TEST).toBe('blesk-test-');
  });
});

describe('jeBleskova', () => {
  it('výběr ze 2–3 krátkých možností je bleskový', () => {
    expect(jeBleskova(iy('a'))).toBe(true);
    expect(jeBleskova(vyber('b', ['i', 'y', 'a']))).toBe(true);
    expect(jeBleskova(vyber('c', ['mě', 'mně']))).toBe(true);
  });

  it('čtyři možnosti nebo jediná možnost už ne', () => {
    expect(jeBleskova(vyber('a', ['a', 'b', 'c', 'd']))).toBe(false);
    expect(jeBleskova(vyber('b', ['a']))).toBe(false);
  });

  it('hranice délky je 15 znaků po oříznutí mezer', () => {
    expect(jeBleskova(vyber('a', ['řečnická otázka', 'ne']))).toBe(true); // přesně 15
    expect(jeBleskova(vyber('b', ['staroslověnština', 'ne']))).toBe(false); // 16
    expect(jeBleskova(vyber('c', ['  řečnická otázka  ', 'ne']))).toBe(true); // okraje se nepočítají
  });

  it('složené znaky (písmeno + kombinující háček) se počítají jako jeden', () => {
    const rozlozene = 'řečnická otázka'.normalize('NFD');
    expect(rozlozene.length).toBeGreaterThan(15);
    expect(jeBleskova(vyber('a', [rozlozene, 'ne']))).toBe(true);
  });

  it('prázdná možnost (jen mezery) otázku vyřadí', () => {
    expect(jeBleskova(vyber('a', ['   ', 'y']))).toBe(false);
  });

  it('jiné typy otázek bleskové nejsou', () => {
    const zaklad = { id: 'o', temaId: 't1', obtiznost: 1 as Obtiznost, zadani: 'Z?', vysvetleni: 'V.' };
    const ostatni: Otazka[] = [
      { ...zaklad, typ: 'anone', spravna: true },
      { ...zaklad, typ: 'doplneni', spravneOdpovedi: ['y'] },
      { ...zaklad, typ: 'multi', moznosti: ['i', 'y', 'a'], spravne: [0] },
      { ...zaklad, typ: 'prirazovani', pary: [{ levy: 'a', pravy: 'b' }, { levy: 'c', pravy: 'd' }] },
    ];
    for (const o of ostatni) expect(jeBleskova(o), o.typ).toBe(false);
  });
});

describe('bleskoveOtazky, pocetBleskovych, maBleskovky', () => {
  const smisena = banka([
    iy('b1'),
    iy('b2', { temaId: 't2' }),
    vyber('dlouha', ['první dlouhá možnost', 'druhá']),
    vyber('ctyri', ['a', 'b', 'c', 'd']),
    { id: 'd1', temaId: 't1', obtiznost: 1, typ: 'doplneni', zadani: 'b_l', spravneOdpovedi: ['byl'], vysvetleni: 'V.' },
  ]);

  it('vrátí jen bleskové otázky', () => {
    expect(bleskoveOtazky(smisena).map((o) => o.id)).toEqual(['b1', 'b2']);
    expect(pocetBleskovych(smisena)).toBe(2);
  });

  it('filtruje podle témat; prázdný výběr = všechna témata', () => {
    expect(bleskoveOtazky(smisena, ['t2']).map((o) => o.id)).toEqual(['b2']);
    expect(bleskoveOtazky(smisena, []).map((o) => o.id)).toEqual(['b1', 'b2']);
    expect(pocetBleskovych(smisena, ['t3'])).toBe(0);
  });

  it('chybějící banka = nic (stránky se ptají dřív, než se obsah načte)', () => {
    expect(bleskoveOtazky(undefined)).toEqual([]);
    expect(pocetBleskovych(null)).toBe(0);
    expect(maBleskovky(undefined)).toBe(false);
  });

  it('banka nabízí Bleskovky od MIN_BLESKOVYCH bleskových otázek', () => {
    const otazky = (pocet: number) => Array.from({ length: pocet }, (_, i) => iy(`o${i}`));
    expect(maBleskovky(banka(otazky(MIN_BLESKOVYCH - 1)))).toBe(false);
    expect(maBleskovky(banka(otazky(MIN_BLESKOVYCH)))).toBe(true);
  });
});

describe('prevazujiBleskove — běžný test, který se počítá jako bleskovky', () => {
  const ctyri = (id: string) => vyber(id, ['a', 'b', 'c', 'd']);
  const doplneni = (id: string): Otazka => ({
    id,
    temaId: 't1',
    obtiznost: 1,
    typ: 'doplneni',
    zadani: 'b_lina',
    spravneOdpovedi: ['bylina'],
    vysvetleni: 'V.',
  });

  it('aspoň polovina bleskových otázek = ano', () => {
    expect(prevazujiBleskove([iy('a'), iy('b'), iy('c')])).toBe(true);
    expect(prevazujiBleskove([iy('a'), ctyri('x')])).toBe(true); // přesně polovina
    expect(prevazujiBleskove([iy('a'), iy('b'), iy('c'), ctyri('x'), doplneni('y')])).toBe(true); // 3 z 5
    expect(prevazujiBleskove([iy('a'), iy('b'), iy('c'), iy('d'), iy('e'), ...Array.from({ length: 5 }, (_, i) => ctyri(`x${i}`))])).toBe(true); // 5 z 10
  });

  it('míň než polovina = ne', () => {
    expect(prevazujiBleskove([iy('a'), ctyri('x'), doplneni('y')])).toBe(false); // 1 ze 3
    expect(prevazujiBleskove([iy('a'), iy('b'), ctyri('x'), ctyri('y'), doplneni('z')])).toBe(false); // 2 z 5
    expect(prevazujiBleskove([ctyri('x'), doplneni('y')])).toBe(false);
  });

  it('prázdný test se jako bleskovky nepočítá', () => {
    expect(prevazujiBleskove([])).toBe(false);
  });
});

describe('poradiBleskovychMoznosti', () => {
  it('krátké možnosti (písmena / skupiny) drží pořadí z dat', () => {
    expect(poradiBleskovychMoznosti(iy('a'))).toEqual([0, 1]);
    expect(poradiBleskovychMoznosti(vyber('b', ['í', 'ý']))).toEqual([0, 1]);
    expect(poradiBleskovychMoznosti(vyber('c', ['mě', 'mně']))).toEqual([0, 1]); // 3 znaky jsou ještě „písmena“
    expect(poradiBleskovychMoznosti(vyber('d', ['i', 'y', 'a']))).toEqual([0, 1, 2]);
    expect(maKratkeMoznosti(vyber('e', ['mě', 'mně']))).toBe(true);
  });

  it('jakmile je některá možnost delší než 3 znaky, míchá se stejně jako VyberOtazka', () => {
    const slova = vyber('slova-1', ['výjimka', 'vyjímka', 'vyjmka']);
    expect(maKratkeMoznosti(slova)).toBe(false);
    expect(poradiBleskovychMoznosti(slova)).toEqual(zamichaneIndexy('vyber:slova-1', 3));
    // Stačí jedna delší možnost mezi krátkými.
    const smisene = vyber('smisene-1', ['y', 'bych']);
    expect(poradiBleskovychMoznosti(smisene)).toEqual(zamichaneIndexy('vyber:smisene-1', 2));
  });

  it('míchání je deterministické a je to permutace všech indexů', () => {
    const otazka = vyber('stale-stejne', ['jsem byl', 'jsem bil', 'jsme byli']);
    const prvni = poradiBleskovychMoznosti(otazka);
    expect(poradiBleskovychMoznosti(otazka)).toEqual(prvni);
    expect([...prvni].sort()).toEqual([0, 1, 2]);
  });

  it('pořadí v datech neprozradí klíč: napříč otázkami se první pozice střídá', () => {
    // Správná je v datech vždy první (typické pro generované banky).
    const prvniPozice = new Set(
      Array.from({ length: 40 }, (_, i) =>
        poradiBleskovychMoznosti(vyber(`gen-${i}`, ['správná', 'špatná'])).indexOf(0),
      ),
    );
    expect(prvniPozice).toEqual(new Set([0, 1]));
  });
});

describe('rozdelZadani a doplnZadani', () => {
  it('rozdělí zadání podle podtržítka', () => {
    expect(rozdelZadani('b_lina')).toEqual({ pred: 'b', po: 'lina' });
    expect(rozdelZadani('Na louce rostly b_liny.')).toEqual({ pred: 'Na louce rostly b', po: 'liny.' });
  });

  it('bere PRVNÍ podtržítko — další zůstávají v textu', () => {
    expect(rozdelZadani('b_l_ jsme')).toEqual({ pred: 'b', po: 'l_ jsme' });
  });

  it('souvislá řada podtržítek je jedna mezera', () => {
    expect(rozdelZadani('My sister ___ sixteen.')).toEqual({ pred: 'My sister ', po: ' sixteen.' });
  });

  it('podtržítko na kraji i samotné', () => {
    expect(rozdelZadani('_ba')).toEqual({ pred: '', po: 'ba' });
    expect(rozdelZadani('ryb_')).toEqual({ pred: 'ryb', po: '' });
    expect(rozdelZadani('_')).toEqual({ pred: '', po: '' });
  });

  it('bez podtržítka vrací null', () => {
    expect(rozdelZadani('Jaký člen má slovo Mutter?')).toBeNull();
    expect(rozdelZadani('')).toBeNull();
  });

  it('doplnZadani vloží text do mezery; bez mezery zadání nemění', () => {
    expect(doplnZadani('b_lina', 'y')).toBe('bylina');
    expect(doplnZadani('Dej _ to.', 'mně')).toBe('Dej mně to.');
    expect(doplnZadani('My sister ___ sixteen.', 'is')).toBe('My sister is sixteen.');
    expect(doplnZadani('Bez mezery?', 'y')).toBe('Bez mezery?');
  });
});

describe('vyberBleskoveOtazky', () => {
  const otazky: Otazka[] = [
    ...([1, 2, 3, 4, 5] as Obtiznost[]).map((obt) => iy(`t1-${obt}`, { obtiznost: obt })),
    ...([1, 5] as Obtiznost[]).map((obt) => iy(`t2-${obt}`, { obtiznost: obt, temaId: 't2' })),
    vyber('nebleskova', ['a', 'b', 'c', 'd']),
  ];

  it('bere jen bleskové otázky přes VŠECHNY obtížnosti', () => {
    const vybrane = vyberBleskoveOtazky(banka(otazky), 20, undefined, {}, nahodaNula);
    expect(vybrane.map((o) => o.id)).toEqual(['t1-1', 't1-2', 't1-3', 't1-4', 't1-5', 't2-1', 't2-5']);
    expect(new Set(vybrane.map((o) => o.obtiznost))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('respektuje počet a výběr témat', () => {
    expect(vyberBleskoveOtazky(banka(otazky), 3, undefined, {}, nahodaNula)).toHaveLength(3);
    const zTematu = vyberBleskoveOtazky(banka(otazky), 10, ['t2'], {}, nahodaNula);
    expect(zTematu.map((o) => o.id)).toEqual(['t2-1', 't2-5']);
    expect(vyberBleskoveOtazky(banka(otazky), 10, ['t3'], {}, nahodaNula)).toEqual([]);
  });

  it('žádná otázka se v kole neopakuje', () => {
    const vybrane = vyberBleskoveOtazky(banka(otazky), 7, undefined, {}, vytvorNahodu(7));
    expect(new Set(vybrane.map((o) => o.id)).size).toBe(7);
  });

  it('váží podle Leitnerových boxů — slabá otázka chodí častěji než zvládnutá', () => {
    const dve = banka([iy('slaba'), iy('zvladnuta')]);
    const statistiky = { slaba: stat('slaba', 0), zvladnuta: stat('zvladnuta', 4) };
    const nahoda = vytvorNahodu(42);
    let slabaPrvni = 0;
    const POKUSU = 3000;
    for (let i = 0; i < POKUSU; i++) {
      if (vyberBleskoveOtazky(dve, 1, undefined, statistiky, nahoda)[0]?.id === 'slaba') slabaPrvni += 1;
    }
    // Váhy 5 : 1 → slabá padne zhruba v 83 % případů.
    expect(slabaPrvni / POKUSU).toBeGreaterThan(0.78);
    expect(slabaPrvni / POKUSU).toBeLessThan(0.88);
  });
});

describe('pocetOtazekProOpravu', () => {
  it('vrací nejbližší povolenou délku (5/10/20), která otázky pojme', () => {
    expect(pocetOtazekProOpravu(1)).toBe(5);
    expect(pocetOtazekProOpravu(5)).toBe(5);
    expect(pocetOtazekProOpravu(6)).toBe(10);
    expect(pocetOtazekProOpravu(10)).toBe(10);
    expect(pocetOtazekProOpravu(11)).toBe(20);
    expect(pocetOtazekProOpravu(20)).toBe(20);
  });
});

describe('koeficientXpOtazky — platí pro otázku, ne pro režim', () => {
  it('blesková otázka dává koeficient bleskovek, jakákoli jiná 1', () => {
    expect(koeficientXpOtazky(iy('a'))).toBe(KOEFICIENT_XP_BLESK);
    expect(koeficientXpOtazky(vyber('b', ['der', 'die', 'das']))).toBe(KOEFICIENT_XP_BLESK);
    expect(koeficientXpOtazky(vyber('c', ['a', 'b', 'c', 'd']))).toBe(1);
    expect(koeficientXpOtazky(vyber('d', ['první dlouhá možnost', 'druhá']))).toBe(1);
    expect(
      koeficientXpOtazky({ id: 'e', temaId: 't1', obtiznost: 1, typ: 'anone', zadani: 'Z?', spravna: true, vysvetleni: 'V.' }),
    ).toBe(1);
  });

  it('chybějící otázka = 1 (nic se nenásobí)', () => {
    expect(koeficientXpOtazky(null)).toBe(1);
    expect(koeficientXpOtazky(undefined)).toBe(1);
  });
});

describe('xpSKoeficientem', () => {
  it('násobí a zaokrouhluje', () => {
    expect(xpSKoeficientem(10, 0.2)).toBe(2);
    expect(xpSKoeficientem(20, 0.2)).toBe(4);
    expect(xpSKoeficientem(33, 0.2)).toBe(7); // 6,6 → 7
    expect(xpSKoeficientem(100, 0.2)).toBe(20);
  });

  it('za správnou odpověď dá nejméně 1 XP', () => {
    expect(xpSKoeficientem(1, 0.2)).toBe(1); // 0,2 by se zaokrouhlilo na 0
    expect(xpSKoeficientem(2, 0.1)).toBe(1);
  });

  it('nulové XP (špatná odpověď) zůstává nula', () => {
    expect(xpSKoeficientem(0, 0.2)).toBe(0);
    expect(xpSKoeficientem(-5, 0.2)).toBe(0);
    expect(xpSKoeficientem(Number.NaN, 0.2)).toBe(0);
  });

  it('koeficient 1 vrací XP beze změny (běžný test)', () => {
    expect(xpSKoeficientem(37, 1)).toBe(37);
  });
});

describe('jeBleskVysledek a jeOpravaBlesku', () => {
  it('poznají výsledek podle id', () => {
    expect(jeBleskVysledek({ id: 'blesk-1700000000000-abc' })).toBe(true);
    expect(jeBleskVysledek({ id: 'blesk-oprava-1700000000000-abc' })).toBe(true);
    expect(jeBleskVysledek({ id: 'vysledek-1700000000000-abc' })).toBe(false);
    expect(jeBleskVysledek({ id: 'bleskovy' })).toBe(false);
    expect(jeOpravaBlesku({ id: 'blesk-oprava-1700000000000-abc' })).toBe(true);
    expect(jeOpravaBlesku({ id: 'blesk-1700000000000-abc' })).toBe(false);
  });
});

describe('jeBleskovyTest a jeKoloBleskovek — ekonomika × UI', () => {
  const KOLO = { id: 'blesk-1700000000000-abc' };
  const OPRAVA = { id: 'blesk-oprava-1700000000000-abc' };
  const TEST = { id: 'blesk-test-1700000000000-abc' };
  const BEZNY = { id: 'vysledek-1700000000000-abc' };

  it('běžný test s převahou bleskových otázek se POČÍTÁ jako bleskovky…', () => {
    expect(jeBleskVysledek(TEST)).toBe(true);
    expect(jeBleskovyTest(TEST)).toBe(true);
  });

  it('…ale kolem bleskovek není (výsledek, statistiky a „Další kolo“ ho berou jako test)', () => {
    expect(jeKoloBleskovek(TEST)).toBe(false);
    expect(jeOpravaBlesku(TEST)).toBe(false);
  });

  it('kolo i opravné kolo jsou kola bleskovek, ne „bleskový test“', () => {
    expect(jeKoloBleskovek(KOLO)).toBe(true);
    expect(jeKoloBleskovek(OPRAVA)).toBe(true);
    expect(jeBleskovyTest(KOLO)).toBe(false);
    expect(jeBleskovyTest(OPRAVA)).toBe(false);
  });

  it('běžný test není nic z toho', () => {
    expect(jeBleskVysledek(BEZNY)).toBe(false);
    expect(jeBleskovyTest(BEZNY)).toBe(false);
    expect(jeKoloBleskovek(BEZNY)).toBe(false);
  });
});

describe('tempoZaMinutu', () => {
  it('počet odpovědí za minutu čistého času nad otázkami', () => {
    expect(tempoZaMinutu(Array.from({ length: 10 }, () => ({ casMs: 3000 })))).toBe(20);
    expect(tempoZaMinutu([{ casMs: 1500 }, { casMs: 2500 }])).toBe(30);
  });

  it('zaokrouhluje na celé číslo', () => {
    expect(tempoZaMinutu([{ casMs: 7000 }])).toBe(9); // 8,57
  });

  it('bez odpovědí nebo s nulovým časem vrací null', () => {
    expect(tempoZaMinutu([])).toBeNull();
    expect(tempoZaMinutu([{ casMs: 0 }, { casMs: 0 }])).toBeNull();
    expect(tempoZaMinutu([{ casMs: -100 }])).toBeNull();
  });
});

describe('bylaDnesTruhlaZBlesku', () => {
  const ted = new Date();
  const dnes = denZData(ted);
  const vcera = new Date(ted.getTime() - 26 * 3_600_000);

  it('dnešní bleskový výsledek s truhlou = dávka je vybraná', () => {
    const historie = [vysledek({ konec: ted.toISOString(), truhla: 'stribrna' })];
    expect(bylaDnesTruhlaZBlesku(historie, dnes)).toBe(true);
  });

  it('dnešní kolo BEZ truhly (pod 50 %) dávku nevybírá', () => {
    expect(bylaDnesTruhlaZBlesku([vysledek({ konec: ted.toISOString() })], dnes)).toBe(false);
  });

  it('včerejší truhla ani truhla z běžného testu se nepočítají', () => {
    const historie = [
      vysledek({ konec: vcera.toISOString(), truhla: 'zlata' }),
      vysledek({ id: 'vysledek-1-abc', konec: ted.toISOString(), truhla: 'zlata' }),
    ];
    expect(bylaDnesTruhlaZBlesku(historie, dnes)).toBe(false);
    expect(bylaDnesTruhlaZBlesku([], dnes)).toBe(false);
  });

  it('dávku sdílí i běžný test s převahou bleskových otázek (id blesk-test-…)', () => {
    const historie = [vysledek({ id: 'blesk-test-1-abc', konec: ted.toISOString(), truhla: 'bronzova' })];
    expect(bylaDnesTruhlaZBlesku(historie, dnes)).toBe(true);
    // Bez truhly ji nevybírá ani on.
    expect(
      bylaDnesTruhlaZBlesku([vysledek({ id: 'blesk-test-1-abc', konec: ted.toISOString() })], dnes),
    ).toBe(false);
  });

  it('vadné datum konce nic nerozbije', () => {
    expect(bylaDnesTruhlaZBlesku([vysledek({ konec: 'nesmysl', truhla: 'zlata' })], dnes)).toBe(false);
  });
});

describe('duvodBezTruhly — proč výsledek z rychlých otázek nedostal truhlu', () => {
  const ted = new Date();
  const dnes = denZData(ted);
  const vcera = new Date(ted.getTime() - 26 * 3_600_000).toISOString();
  const dnesni = (prepis: Partial<TestVysledek> = {}) => vysledek({ konec: ted.toISOString(), ...prepis });

  it('s truhlou nebo u běžného testu není co vysvětlovat', () => {
    expect(duvodBezTruhly(dnesni({ truhla: 'zlata' }), [], dnes)).toBeNull();
    expect(duvodBezTruhly(dnesni({ id: 'vysledek-1-abc' }), [], dnes)).toBeNull();
  });

  it('opravné kolo truhlu nedává nikdy', () => {
    expect(duvodBezTruhly(dnesni({ id: 'blesk-oprava-1-abc' }), [], dnes)).toBe('oprava');
  });

  it('dnešní truhlu už dalo jiné kolo nebo test z rychlých otázek', () => {
    const kolo = dnesni({ id: 'blesk-2-abc' });
    expect(duvodBezTruhly(kolo, [kolo, dnesni({ id: 'blesk-1-abc', truhla: 'stribrna' })], dnes)).toBe('uz-byla');
    // Platí i pro běžný test, který se jako bleskovky počítá — oběma směry.
    const test = dnesni({ id: 'blesk-test-3-abc' });
    expect(duvodBezTruhly(test, [test, dnesni({ id: 'blesk-1-abc', truhla: 'stribrna' })], dnes)).toBe('uz-byla');
    expect(duvodBezTruhly(kolo, [kolo, dnesni({ id: 'blesk-test-0-abc', truhla: 'bronzova' })], dnes)).toBe('uz-byla');
  });

  it('jinak úspěšnost nestačila a dávka pořád čeká (vlastní výsledek v historii se nepočítá)', () => {
    const kolo = dnesni({ id: 'blesk-2-abc', uspesnost: 0.4 });
    expect(duvodBezTruhly(kolo, [kolo], dnes)).toBe('malo');
    expect(duvodBezTruhly(kolo, [kolo, dnesni({ id: 'blesk-1-abc', truhla: 'zlata', konec: vcera })], dnes)).toBe('malo');
    // Truhla z běžného testu bez převahy bleskových otázek dávku nevybírá.
    expect(duvodBezTruhly(kolo, [kolo, dnesni({ id: 'vysledek-1-abc', truhla: 'zlata' })], dnes)).toBe('malo');
  });

  it('starý výsledek (není dnešní) se s dnešní historií nesrovnává', () => {
    expect(duvodBezTruhly(vysledek({ konec: vcera }), [], dnes)).toBeNull();
  });
});

describe('chybyBlesku', () => {
  const b = banka([iy('o1'), iy('o2'), iy('o3'), vyber('ctyri', ['a', 'b', 'c', 'd'])]);
  const odpoved = (otazkaId: string, spravne: boolean) => ({
    otazkaId,
    temaId: 't1',
    obtiznost: 1 as Obtiznost,
    spravne,
    casMs: 1000,
  });

  it('vrátí chybné odpovědi v pořadí, každou otázku jednou, s textem z banky', () => {
    const chyby = chybyBlesku(
      { odpovedi: [odpoved('o2', false), odpoved('o1', true), odpoved('o3', false), odpoved('o2', false)] },
      b,
    );
    expect(chyby.map((ch) => ch.otazkaId)).toEqual(['o2', 'o3']);
    expect(chyby[0].otazka?.zadani).toBe('b_lina o2');
  });

  it('otázka, kterou banka už nezná (nebo už není blesková), má otazka: null', () => {
    const chyby = chybyBlesku({ odpovedi: [odpoved('zmizela', false), odpoved('ctyri', false)] }, b);
    expect(chyby.map((ch) => ch.otazka)).toEqual([null, null]);
    expect(chybyBlesku({ odpovedi: [odpoved('o1', false)] }, undefined)[0].otazka).toBeNull();
  });

  it('bez chyb vrací prázdný seznam', () => {
    expect(chybyBlesku({ odpovedi: [odpoved('o1', true)] }, b)).toEqual([]);
  });
});

describe('konfiguraceDalsihoKola', () => {
  it('drží banku, témata i délku 20', () => {
    const v = vysledek({
      konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 20, temataId: ['t1', 't2'] },
    });
    expect(konfiguraceDalsihoKola(v)).toEqual({ predmetId: 'pravopis', pocetOtazek: 20, temataId: ['t1', 't2'] });
  });

  it('bez témat = míchané kolo; délka mimo 20 se bere jako 10', () => {
    const v = vysledek({ konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 } });
    expect(konfiguraceDalsihoKola(v)).toEqual({ predmetId: 'pravopis', pocetOtazek: 10 });
  });

  it('po OPRAVNÉM kole vrací konfiguraci kola, ze kterého oprava vznikla (délku i témata)', () => {
    const oprava = vysledek({
      id: 'blesk-oprava-3-abc',
      konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5, temataId: ['t1'] },
    });
    const historie = [
      oprava,
      // Novější kolo JINÉ banky se přeskočí, stejně jako starší opravy a běžné testy
      // (i ty, které se jako bleskovky jen počítají — nejsou to kola).
      vysledek({ id: 'blesk-2-jina', konfigurace: { predmetId: 'nemecky-jazyk', rezim: 'rozcvicka', pocetOtazek: 10 } }),
      vysledek({ id: 'vysledek-2-test', konfigurace: { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 5 } }),
      vysledek({ id: 'blesk-test-2-test', konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 } }),
      vysledek({
        id: 'blesk-1-puvodni',
        konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 20, temataId: ['t1', 't2'] },
      }),
    ];
    expect(konfiguraceDalsihoKola(oprava, historie)).toEqual({
      predmetId: 'pravopis',
      pocetOtazek: 20,
      temataId: ['t1', 't2'],
    });
  });

  it('po opravě bez původního kola v historii zůstávají témata opravy a délka 10', () => {
    const oprava = vysledek({
      id: 'blesk-oprava-3-abc',
      konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5, temataId: ['t2'] },
    });
    expect(konfiguraceDalsihoKola(oprava, [oprava])).toEqual({
      predmetId: 'pravopis',
      pocetOtazek: 10,
      temataId: ['t2'],
    });
  });

  it('běžné kolo se historií neřídí', () => {
    const v = vysledek({ konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 10 } });
    const starsi = vysledek({ id: 'blesk-0-x', konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 20 } });
    expect(konfiguraceDalsihoKola(v, [v, starsi]).pocetOtazek).toBe(10);
  });
});

describe('orizniHistoriiTestu — značka denní truhly v historii zůstává', () => {
  const ted = new Date();
  const dnes = denZData(ted);
  const vcera = new Date(ted.getTime() - 26 * 3_600_000).toISOString();
  const kolo = (i: number, prepis: Partial<TestVysledek> = {}) =>
    vysledek({ id: `blesk-${i}-x`, konec: ted.toISOString(), ...prepis });

  it('do limitu historii nemění', () => {
    const historie = Array.from({ length: LIMIT_HISTORIE_TESTU }, (_, i) => kolo(i));
    expect(orizniHistoriiTestu(historie, dnes)).toEqual(historie);
    expect(orizniHistoriiTestu([], dnes)).toEqual([]);
  });

  it('nad limit ořízne nejstarší (historie je nejnovější první)', () => {
    const historie = Array.from({ length: 13 }, (_, i) => kolo(i));
    expect(orizniHistoriiTestu(historie, dnes).map((v) => v.id)).toEqual(historie.slice(0, 10).map((v) => v.id));
  });

  it('dnešní bleskový výsledek s truhlou podrží, i když už z limitu vypadl', () => {
    const historie = [
      ...Array.from({ length: 11 }, (_, i) => kolo(i)),
      kolo(99, { truhla: 'zlata' }), // dvanáctý — ranní kolo s truhlou
      kolo(100),
    ];
    const orezana = orizniHistoriiTestu(historie, dnes);
    expect(orezana).toHaveLength(LIMIT_HISTORIE_TESTU + 1);
    expect(orezana[orezana.length - 1].id).toBe('blesk-99-x');
    expect(bylaDnesTruhlaZBlesku(orezana, dnes)).toBe(true);
    // Opakované ořezání značku neztratí ani nezdvojí.
    expect(orizniHistoriiTestu([kolo(200), ...orezana], dnes).filter((v) => v.truhla)).toHaveLength(1);
    expect(orizniHistoriiTestu([kolo(200), ...orezana], dnes)).toHaveLength(LIMIT_HISTORIE_TESTU + 1);
  });

  it('značka uvnitř limitu nic nepřidává; včerejší truhla ani truhla z testu se nedrží', () => {
    const sUvnitr = [kolo(0, { truhla: 'bronzova' }), ...Array.from({ length: 12 }, (_, i) => kolo(i + 1))];
    expect(orizniHistoriiTestu(sUvnitr, dnes)).toHaveLength(LIMIT_HISTORIE_TESTU);

    const stare = [
      ...Array.from({ length: 10 }, (_, i) => kolo(i)),
      kolo(98, { truhla: 'zlata', konec: vcera }),
      vysledek({ id: 'vysledek-97-x', konec: ted.toISOString(), truhla: 'zlata' }),
    ];
    expect(orizniHistoriiTestu(stare, dnes)).toHaveLength(LIMIT_HISTORIE_TESTU);
  });

  it('značkou je i truhla z běžného testu s převahou bleskových otázek', () => {
    const historie = [
      ...Array.from({ length: 10 }, (_, i) => kolo(i)),
      vysledek({ id: 'blesk-test-96-x', konec: ted.toISOString(), truhla: 'stribrna' }),
    ];
    const orezana = orizniHistoriiTestu(historie, dnes);
    expect(orezana).toHaveLength(LIMIT_HISTORIE_TESTU + 1);
    expect(orezana[orezana.length - 1].id).toBe('blesk-test-96-x');
  });
});

describe('zvladnutiOtazek a temataBlesku', () => {
  const b = banka([
    iy('a1'),
    iy('a2'),
    iy('a3'),
    iy('a4'),
    iy('c1', { temaId: 't3' }),
    vyber('t2-jen-dlouha', ['první dlouhá možnost', 'druhá'], { temaId: 't2' }),
  ]);
  const statistiky = { a1: stat('a1', 3), a2: stat('a2', 4), a3: stat('a3', 2), c1: stat('c1', 0) };

  it('zvládnutí = podíl otázek v boxu 3 a výš (neviděné se nepočítají)', () => {
    expect(zvladnutiOtazek(bleskoveOtazky(b, ['t1']), statistiky)).toBe(0.5);
    expect(zvladnutiOtazek([], statistiky)).toBe(0);
  });

  it('témata jen s bleskovými otázkami, v pořadí banky, s počtem a zvládnutím', () => {
    expect(temataBlesku(b, statistiky)).toEqual([
      { id: 't1', nazev: 'Téma 1', pocet: 4, zvladnuti: 0.5 },
      { id: 't3', nazev: 'Téma 3', pocet: 1, zvladnuti: 0 },
    ]);
    expect(temataBlesku(undefined, statistiky)).toEqual([]);
  });

  it('řadí podle `poradi` tématu, ne podle pořadí v poli', () => {
    const prehazena: BankaOtazek = {
      ...b,
      temata: [
        { id: 't3', nazev: 'Téma 3', poradi: 2 },
        { id: 't1', nazev: 'Téma 1', poradi: 0 },
      ],
    };
    expect(temataBlesku(prehazena, {}).map((t) => t.id)).toEqual(['t1', 't3']);
  });
});

describe('moznostZKlavesy', () => {
  const IY = ['i', 'y'];
  const DLOUHE = ['í', 'ý'];

  it('číslice vybírají podle POZICE na obrazovce (vrací datový index)', () => {
    expect(moznostZKlavesy('1', IY, [0, 1])).toBe(0);
    expect(moznostZKlavesy('2', IY, [0, 1])).toBe(1);
    // Zamíchané pořadí: na první pozici je datový index 2.
    expect(moznostZKlavesy('1', ['a', 'b', 'c'], [2, 0, 1])).toBe(2);
    expect(moznostZKlavesy('3', ['a', 'b', 'c'], [2, 0, 1])).toBe(1);
  });

  it('číslice mimo počet možností nedělá nic', () => {
    expect(moznostZKlavesy('3', IY, [0, 1])).toBeNull();
    expect(moznostZKlavesy('9', ['i', 'y', 'a'], [0, 1, 2])).toBeNull();
  });

  it('písmeno možnosti: i / y', () => {
    expect(moznostZKlavesy('i', IY, [0, 1])).toBe(0);
    expect(moznostZKlavesy('y', IY, [0, 1])).toBe(1);
    expect(moznostZKlavesy('a', ['i', 'y', 'a'], [0, 1, 2])).toBe(2);
  });

  it('klávesy i, y platí i pro í, ý — bez ohledu na velikost písmen', () => {
    expect(moznostZKlavesy('i', DLOUHE, [0, 1])).toBe(0);
    expect(moznostZKlavesy('y', DLOUHE, [0, 1])).toBe(1);
    expect(moznostZKlavesy('Y', DLOUHE, [0, 1])).toBe(1);
    expect(moznostZKlavesy('I', IY, [0, 1])).toBe(0);
  });

  it('klávesa s diakritikou sedí jen na možnost, která tak přesně začíná', () => {
    expect(moznostZKlavesy('ý', DLOUHE, [0, 1])).toBe(1);
    expect(moznostZKlavesy('Í', DLOUHE, [0, 1])).toBe(0);
    // U i/y by zbloudilé ý / í (česká „7“ a „9“) odpovědělo — ignoruje se.
    expect(moznostZKlavesy('ý', IY, [0, 1])).toBeNull();
    expect(moznostZKlavesy('í', IY, [0, 1])).toBeNull();
    expect(moznostZKlavesy('š', ['s', 'z'], [0, 1])).toBeNull();
  });

  it('písmeno funguje jen když je první znak možností jednoznačný', () => {
    expect(moznostZKlavesy('m', ['mě', 'mně'], [0, 1])).toBeNull();
    expect(moznostZKlavesy('i', ['i', 'í'], [0, 1])).toBeNull(); // po odstranění diakritiky stejné
    expect(moznostZKlavesy('s', ['s', 'z'], [0, 1])).toBe(0);
    expect(moznostZKlavesy('b', ['jsem byl', 'jsem bil'], [0, 1])).toBeNull();
  });

  it('písmeno, kterým žádná možnost nezačíná, nedělá nic', () => {
    expect(moznostZKlavesy('x', IY, [0, 1])).toBeNull();
    expect(moznostZKlavesy('a', IY, [0, 1])).toBeNull(); // A–D tu nejsou pozice jako v testu
  });

  it('pojmenované klávesy a jiné znaky se ignorují', () => {
    for (const klavesa of ['Enter', 'Shift', 'Dead', 'Tab', ' ', '+', '?', '']) {
      expect(moznostZKlavesy(klavesa, IY, [0, 1]), klavesa).toBeNull();
    }
  });

  it('česká klávesnice: horní řada bez Shiftu píše „+ěš…“ — pozici určí fyzická klávesa', () => {
    expect(moznostZKlavesy('+', IY, [0, 1], 'Digit1')).toBe(0);
    expect(moznostZKlavesy('ě', IY, [0, 1], 'Digit2')).toBe(1);
    expect(moznostZKlavesy('š', ['i', 'y', 'a'], [0, 1, 2], 'Digit3')).toBe(2);
    expect(moznostZKlavesy('č', ['i', 'y', 'a'], [0, 1, 2], 'Digit4')).toBeNull(); // čtvrtá možnost není
    // U mě/mně písmeno nerozhodne, fyzická klávesa ano.
    expect(moznostZKlavesy('ě', ['mě', 'mně'], [0, 1], 'Digit2')).toBe(1);
  });

  it('fyzická klávesa v rozsahu možností má přednost před písmenem, které píše', () => {
    // Česká „2“ píše ě: u možností ě / je musí zvolit DRUHOU (nápověda na tlačítku říká 2).
    expect(moznostZKlavesy('ě', ['ě', 'je'], [0, 1], 'Digit2')).toBe(1);
    // Česká „3“ píše š: třetí možnost, ne „s“.
    expect(moznostZKlavesy('š', ['s', 'z', 'vz'], [0, 1, 2], 'Digit3')).toBe(2);
    // Stejný znak napsaný jinou klávesou (jiné rozložení) vybírá písmenem.
    expect(moznostZKlavesy('ě', ['ě', 'je'], [0, 1], 'KeyE')).toBe(0);
  });

  it('klávesy horní řady ZA počtem možností fungují jako písmena (í, ý, á)', () => {
    // Klávesa „7“ české klávesnice píše ý, „9“ píše í, „8“ píše á.
    expect(moznostZKlavesy('ý', DLOUHE, [0, 1], 'Digit7')).toBe(1);
    expect(moznostZKlavesy('í', DLOUHE, [0, 1], 'Digit9')).toBe(0);
    expect(moznostZKlavesy('á', ['í', 'ý', 'á'], [0, 1, 2], 'Digit8')).toBe(2);
    // Zbloudilá „7“ / „9“ u otázky i/y neodpoví (pozice neexistuje, písmeno nesedí přesně).
    expect(moznostZKlavesy('ý', IY, [0, 1], 'Digit7')).toBeNull();
    expect(moznostZKlavesy('ž', ['s', 'z'], [0, 1], 'Digit6')).toBeNull();
  });

  it('numerická klávesnice bez NumLocku (End, šipky) neodpovídá', () => {
    expect(moznostZKlavesy('End', IY, [0, 1], 'Numpad1')).toBeNull();
    expect(moznostZKlavesy('1', IY, [0, 1], 'Numpad1')).toBe(0); // s NumLockem píše číslici
  });
});

// ---------------------------------------------------------------------------
// Hlídka konvencí obsahu

describe('poruseniKonvenciBlesku', () => {
  it('banka podle konvencí nemá žádné porušení', () => {
    const vPoradku = banka([
      iy('a'),
      iy('b', { zadani: 'ml_n' }),
      vyber('c', ['i', 'y', 'a'], { zadani: 'ženy šl_' }), // „a“ až za i, y
      vyber('d', ['mě', 'mně'], { zadani: 'Dej _ to.' }),
      vyber('e', ['výjimka', 'vyjímka'], { zadani: 'Které slovo je správně?' }),
      vyber('f', ['vyjímka', 'výjimka'], { zadani: 'A tady?' }), // delší možnosti se míchají — pořadí nevadí
    ]);
    expect(poruseniKonvenciBlesku(vPoradku)).toEqual([]);
  });

  it('ohlásí krátké možnosti v opačném pořadí než jinde v bance', () => {
    const prohozene = banka([iy('a'), vyber('b', ['y', 'i']), vyber('c', ['y', 'i', 'a'])]);
    const poruseni = poruseniKonvenciBlesku(prohozene);
    expect(poruseni).toHaveLength(2);
    expect(poruseni[0]).toContain('b:');
    expect(poruseni[0]).toContain('„y“ je před „i“');
    expect(poruseni[0]).toContain('v otázce a naopak');
    expect(poruseni[1]).toContain('c:');
  });

  it('ohlásí zadání s více místy k doplnění (řada podtržítek je jedno místo)', () => {
    const dveMezery = banka([
      iy('a', { zadani: 'b_l_ jsme' }),
      iy('b', { zadani: 'My sister ___ sixteen.' }),
    ]);
    const poruseni = poruseniKonvenciBlesku(dveMezery);
    expect(poruseni).toHaveLength(1);
    expect(poruseni[0]).toContain('a:');
    expect(poruseni[0]).toContain('2 místa k doplnění');
  });

  it('nebleskové otázky se nekontrolují', () => {
    const jine = banka([
      vyber('ctyri', ['y', 'i', 'a', 'o'], { zadani: 'b_l_' }),
      { id: 'd', temaId: 't1', obtiznost: 1, typ: 'doplneni', zadani: 'b_l_', spravneOdpovedi: ['byli'], vysvetleni: 'V.' },
    ]);
    expect(poruseniKonvenciBlesku(jine)).toEqual([]);
  });
});

describe('banky v repu — konvence bleskových otázek', () => {
  /** Zdrojové banky z kořenového data/banky/ (bundl je jejich kopie; nová banka bývá nejdřív tam). */
  function zdrojoveBanky(): BankaOtazek[] {
    const slozka = fileURLToPath(new URL('../../data/banky/', import.meta.url));
    let soubory: string[];
    try {
      soubory = readdirSync(slozka).filter((n) => n.endsWith('.json'));
    } catch {
      return []; // aplikace testovaná bez kořene monorepa
    }
    return soubory.flatMap((soubor) => {
      try {
        return [validujBanku(JSON.parse(readFileSync(`${slozka}${soubor}`, 'utf8')))];
      } catch {
        // Rozepsaný nebo nevalidní soubor není věc téhle hlídky (validuj-banku.ts).
        return [];
      }
    });
  }

  it('bundlované i zdrojové banky drží pořadí krátkých možností a jedno místo k doplnění', async () => {
    const banky = [...(await nactiBundlovaneBanky()), ...zdrojoveBanky()];
    expect(banky.length).toBeGreaterThan(0);
    for (const b of banky) {
      expect(poruseniKonvenciBlesku(b), `banka ${b.predmetId}`).toEqual([]);
    }
  });
});
