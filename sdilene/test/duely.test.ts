// Testy duelového jádra — čisté funkce, deterministické (náhoda se injektuje).
import { describe, expect, it } from 'vitest';
import {
  aktualizujTrofeje,
  bodyZaOdpoved,
  BODY_STITU,
  casLimitOtazky,
  casLimitProHrace,
  doplnDuelovyProgres,
  DUEL_TRVANI_MS,
  DUELY_PRO_TITUL_DUELANT,
  expirujDuel,
  handicapNasobic,
  handicapNasobice,
  nahodaProDuel,
  POWERUP_INFO,
  POWERUP_TYPY,
  prepoctiVysledekDuelu,
  prinasiTrofejeNavic,
  SERIE_PRO_TITUL,
  sloucTrofeje,
  TITUL_DUELANT,
  TITUL_VITEZNA_VLNA,
  titulPostrach,
  validujDuel,
  vitezPoVyprseni,
  vychoziPowerupy,
  vychoziProgres,
  vychoziTrofeje,
  vyberOtazekDuelu,
  vyhodnotDuel,
  vyprsiDuelu,
  vysledekProHrace,
  zvladnutiOboru,
} from '../src/index';
import type {
  BankaOtazek,
  Duel,
  StatistikaOtazky,
  TrofejeProfilu,
  VysledekDuelu,
} from '../src/index';

// ---------------------------------------------------------------------------
// Pomůcky

function banka(pocetNaTema = 10): BankaOtazek {
  return {
    predmetId: 'ekonomika',
    nazev: 'Ekonomika',
    verze: 1,
    vytvoreno: '2026-09-04',
    temata: [
      { id: 'tema-a', nazev: 'Téma A', poradi: 1 },
      { id: 'tema-b', nazev: 'Téma B', poradi: 2 },
    ],
    otazky: (['tema-a', 'tema-b'] as const).flatMap((temaId) =>
      Array.from({ length: pocetNaTema }, (_, i) => ({
        id: `o-${temaId}-${i}`,
        temaId,
        obtiznost: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
        typ: 'anone' as const,
        zadani: `Otázka ${temaId} č. ${i}?`,
        spravna: true,
        vysvetleni: 'Protože ano.',
      })),
    ),
  };
}

function stat(otazkaId: string, box: StatistikaOtazky['box']): StatistikaOtazky {
  return { otazkaId, box, spravneCelkem: 0, spatneCelkem: 0, posledniOdpoved: '2026-09-04T10:00:00Z' };
}

function vysledek(prepis: Partial<VysledekDuelu> = {}): VysledekDuelu {
  return {
    odpovedi: [],
    body: 0,
    celkovyCasMs: 0,
    dokonceno: '2026-09-04T12:00:00Z',
    ...prepis,
  };
}

function duel(prepis: Partial<Duel> = {}): Duel {
  return {
    id: 'd-1',
    predmetId: 'ekonomika',
    pocetOtazek: 5,
    otazkyIds: ['o-tema-a-0', 'o-tema-a-1', 'o-tema-a-2', 'o-tema-a-3', 'o-tema-a-4'],
    vyzyvatel: { profilId: 'tata', jmeno: 'Táta' },
    souper: { profilId: 'syn', jmeno: 'Syn' },
    otevrenyProRodinu: false,
    handicap: { tata: 1, syn: 1.2 },
    stav: 'hotovy',
    vysledky: {},
    vytvoreno: '2026-09-04T10:00:00Z',
    vyprsi: '2026-09-05T10:00:00.000Z',
    ...prepis,
  };
}

// ---------------------------------------------------------------------------
// Časové limity

describe('casLimitOtazky', () => {
  it('limit = (10 + 4×obtížnost) sekund v ms', () => {
    expect(casLimitOtazky(1)).toBe(14_000);
    expect(casLimitOtazky(2)).toBe(18_000);
    expect(casLimitOtazky(3)).toBe(22_000);
    expect(casLimitOtazky(4)).toBe(26_000);
    expect(casLimitOtazky(5)).toBe(30_000);
  });

  it('casLimitProHrace násobí limit handicapem a zaokrouhluje na ms', () => {
    expect(casLimitProHrace(1, 1)).toBe(14_000);
    expect(casLimitProHrace(1, 1.5)).toBe(21_000);
    expect(casLimitProHrace(3, 1.25)).toBe(27_500);
    expect(casLimitProHrace(1, 1.333)).toBe(Math.round(14_000 * 1.333));
  });
});

// ---------------------------------------------------------------------------
// Bodování

describe('bodyZaOdpoved', () => {
  it('správná odpověď: 100 + round(50 × zbývající/limit)', () => {
    expect(bodyZaOdpoved(true, 0, 20_000)).toBe(150); // okamžitě = plný bonus
    expect(bodyZaOdpoved(true, 10_000, 20_000)).toBe(125); // půlka času
    expect(bodyZaOdpoved(true, 20_000, 20_000)).toBe(100); // poslední chvíle
    // zaokrouhlení: zbývá 9333/14000 → 50×0.6666… = 33.33 → 33
    expect(bodyZaOdpoved(true, 4667, 14_000)).toBe(133);
  });

  it('hraniční časy se ořezávají (nikdy víc než 150, nikdy méně než 100 za správně)', () => {
    expect(bodyZaOdpoved(true, 25_000, 20_000)).toBe(100); // čas přes limit
    expect(bodyZaOdpoved(true, -500, 20_000)).toBe(150); // vadný záporný čas
    expect(bodyZaOdpoved(true, 0, 0)).toBe(100); // nulový limit bez dělení nulou
  });

  it('špatně nebo timeout = 0', () => {
    expect(bodyZaOdpoved(false, 1_000, 20_000)).toBe(0);
    expect(bodyZaOdpoved(false, 20_000, 20_000)).toBe(0);
  });

  it('štít promění špatnou odpověď v 50 bodů, správné se nedotkne', () => {
    expect(bodyZaOdpoved(false, 1_000, 20_000, true)).toBe(BODY_STITU);
    expect(bodyZaOdpoved(true, 0, 20_000, true)).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Zvládnutí oboru a handicap

describe('zvladnutiOboru', () => {
  it('počítá podíl otázek banky v boxu ≥ 3', () => {
    const b = banka(5); // 10 otázek celkem
    const statistiky = {
      'o-tema-a-0': stat('o-tema-a-0', 4),
      'o-tema-a-1': stat('o-tema-a-1', 3), // box přesně 3 se počítá
      'o-tema-a-2': stat('o-tema-a-2', 2), // pod hranicí
      'cizi-otazka': stat('cizi-otazka', 4), // mimo banku — nepočítá se
    };
    expect(zvladnutiOboru(b, statistiky)).toBeCloseTo(2 / 10);
  });

  it('bez statistik je zvládnutí 0, prázdná banka taky', () => {
    expect(zvladnutiOboru(banka(5), {})).toBe(0);
    expect(zvladnutiOboru({ ...banka(5), otazky: [] }, {})).toBe(0);
  });
});

describe('handicap', () => {
  it('vyrovnaní hráči mají oba 1.0', () => {
    expect(handicapNasobice(0.5, 0.5)).toEqual({ a: 1, b: 1 });
  });

  it('slabší hráč dostává 1 + 0.5×rozdíl, silnější přesně 1.0', () => {
    const { a, b } = handicapNasobice(0.2, 0.8);
    expect(a).toBeCloseTo(1.3);
    expect(b).toBe(1); // záporný rozdíl se ořízne na 1.0
  });

  it('ořez na 1.5 při maximálním rozdílu', () => {
    expect(handicapNasobic(0, 1)).toBe(1.5);
    expect(handicapNasobic(1, 0)).toBe(1);
    expect(handicapNasobice(0, 1)).toEqual({ a: 1.5, b: 1 });
  });

  it('výsledek je zaokrouhlený na 3 desetinná místa (stabilní přes JSON)', () => {
    const n = handicapNasobic(1 / 3, 2 / 3);
    expect(n).toBe(1.167);
  });
});

// ---------------------------------------------------------------------------
// Deterministický výběr otázek

describe('vyberOtazekDuelu', () => {
  it('stejný seed (id duelu) dává stejnou sadu ve stejném pořadí', () => {
    const b = banka(10);
    const prvni = vyberOtazekDuelu(b, undefined, 10, nahodaProDuel('duel-42'));
    const druhy = vyberOtazekDuelu(b, undefined, 10, nahodaProDuel('duel-42'));
    expect(prvni.map((o) => o.id)).toEqual(druhy.map((o) => o.id));
    expect(prvni).toHaveLength(10);
    expect(new Set(prvni.map((o) => o.id)).size).toBe(10);
  });

  it('jiné id duelu vede na jinou sadu', () => {
    const b = banka(20); // 40 otázek, výběr 10 — kolize sad je prakticky vyloučená
    const prvni = vyberOtazekDuelu(b, undefined, 10, nahodaProDuel('duel-42'));
    const druhy = vyberOtazekDuelu(b, undefined, 10, nahodaProDuel('duel-43'));
    expect(prvni.map((o) => o.id)).not.toEqual(druhy.map((o) => o.id));
  });

  it('respektuje filtr témat a dostupný počet', () => {
    const b = banka(4); // 4 otázky na téma
    const otazky = vyberOtazekDuelu(b, ['tema-b'], 10, nahodaProDuel('d'));
    expect(otazky).toHaveLength(4); // víc jich v tématu není
    expect(otazky.every((o) => o.temaId === 'tema-b')).toBe(true);
  });

  it('vybírá bez Leitnerových vah — statistiky do výběru vůbec nevstupují', () => {
    // Funkce statistiky nepřijímá; kontrolujeme aspoň rovnoměrnost: při
    // dostatku losů padne někdy i „první“ a někdy „poslední“ otázka banky.
    const b = banka(10);
    const videne = new Set<string>();
    for (let i = 0; i < 40; i++) {
      for (const o of vyberOtazekDuelu(b, undefined, 5, nahodaProDuel(`d-${i}`))) videne.add(o.id);
    }
    expect(videne.size).toBe(b.otazky.length); // každá otázka má šanci
  });

  it('vyprsiDuelu = vytvořeno + 24 h', () => {
    expect(DUEL_TRVANI_MS).toBe(86_400_000);
    expect(vyprsiDuelu('2026-09-04T10:00:00.000Z')).toBe('2026-09-05T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Vyhodnocení duelu

describe('vyhodnotDuel', () => {
  it('vyšší body vyhrávají', () => {
    const d = duel({
      vysledky: {
        tata: vysledek({ body: 500, celkovyCasMs: 60_000 }),
        syn: vysledek({ body: 480, celkovyCasMs: 20_000 }),
      },
    });
    expect(vyhodnotDuel(d)).toBe('tata');
  });

  it('při shodě bodů rozhoduje nižší součet časů', () => {
    const d = duel({
      vysledky: {
        tata: vysledek({ body: 500, celkovyCasMs: 60_000 }),
        syn: vysledek({ body: 500, celkovyCasMs: 45_000 }),
      },
    });
    expect(vyhodnotDuel(d)).toBe('syn');
  });

  it('shoda bodů i časů = remíza (null)', () => {
    const d = duel({
      vysledky: {
        tata: vysledek({ body: 500, celkovyCasMs: 60_000 }),
        syn: vysledek({ body: 500, celkovyCasMs: 60_000 }),
      },
    });
    expect(vyhodnotDuel(d)).toBeNull();
  });

  it('kdo dohrál, poráží toho, kdo nedohrál — i s nula body', () => {
    const d = duel({
      stav: 'vyprsely',
      vysledky: { syn: vysledek({ body: 0, celkovyCasMs: 90_000 }) },
    });
    expect(vyhodnotDuel(d)).toBe('syn');
  });

  it('bez soupeře nebo bez výsledků není vítěz', () => {
    expect(vyhodnotDuel(duel({ souper: undefined, stav: 'vyprsely', vysledky: {} }))).toBeNull();
    expect(vyhodnotDuel(duel({ stav: 'vyprsely', vysledky: {} }))).toBeNull();
  });

  it('vysledekProHrace překládá vítěze na výhru/prohru/remízu', () => {
    expect(vysledekProHrace('tata', 'tata')).toBe('vyhra');
    expect(vysledekProHrace('tata', 'syn')).toBe('prohra');
    expect(vysledekProHrace(null, 'syn')).toBe('remiza');
    expect(vysledekProHrace(undefined, 'syn')).toBe('remiza');
  });
});

// ---------------------------------------------------------------------------
// Trofeje a tituly

describe('aktualizujTrofeje', () => {
  const obor = { predmetId: 'ekonomika', nazev: 'Ekonomika' };
  const jinyObor = { predmetId: 'ucetnictvi', nazev: 'Účetnictví' };

  it('vede bilanci dvojice a sérii výher proti soupeři', () => {
    let t = vychoziTrofeje();
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    t = aktualizujTrofeje(t, 'syn', 'prohra', obor);
    t = aktualizujTrofeje(t, 'syn', 'remiza', jinyObor);
    expect(t.dvojice.syn).toEqual({ vyhry: 2, prohry: 1, remizy: 1, serieVyher: 0 });
    expect(t.duelyCelkem).toBe(4);
    // jiný soupeř má vlastní bilanci
    t = aktualizujTrofeje(t, 'mama', 'vyhra', obor);
    expect(t.dvojice.mama).toEqual({ vyhry: 1, prohry: 0, remizy: 0, serieVyher: 1 });
    expect(t.dvojice.syn.serieVyher).toBe(0);
  });

  it('remíza i prohra nulují celkovou sérii výher', () => {
    let t = vychoziTrofeje();
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    expect(t.serieVyherCelkem).toBe(2);
    t = aktualizujTrofeje(t, 'syn', 'remiza', obor);
    expect(t.serieVyherCelkem).toBe(0);
  });

  it('3 výhry v řadě celkem dávají titul „Vítězná vlna“ (i přes různé soupeře)', () => {
    let t = vychoziTrofeje();
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    t = aktualizujTrofeje(t, 'mama', 'vyhra', jinyObor);
    expect(t.tituly).not.toContain(TITUL_VITEZNA_VLNA);
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    expect(SERIE_PRO_TITUL).toBe(3);
    expect(t.tituly).toContain(TITUL_VITEZNA_VLNA);
  });

  it('3 výhry v řadě v jednom oboru dávají „Postrach: <obor>“; jiný obor sérii oboru neruší', () => {
    let t = vychoziTrofeje();
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    // prohra v JINÉM oboru zlomí celkovou sérii, ale ne sérii oboru
    t = aktualizujTrofeje(t, 'syn', 'prohra', jinyObor);
    expect(t.serieVyherCelkem).toBe(0);
    expect(t.seriePodleOboru.ekonomika).toBe(2);
    t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    expect(t.tituly).toContain(titulPostrach('Ekonomika'));
    expect(t.tituly).not.toContain(TITUL_VITEZNA_VLNA); // celková série je teprve 1
    // prohra v oboru sérii oboru nuluje
    t = aktualizujTrofeje(t, 'syn', 'prohra', obor);
    expect(t.seriePodleOboru.ekonomika).toBe(0);
  });

  it('10 dokončených duelů dává titul „Duelant“ bez ohledu na výsledky', () => {
    let t = vychoziTrofeje();
    for (let i = 0; i < DUELY_PRO_TITUL_DUELANT - 1; i++) {
      t = aktualizujTrofeje(t, 'syn', 'prohra', obor);
    }
    expect(t.tituly).not.toContain(TITUL_DUELANT);
    t = aktualizujTrofeje(t, 'syn', 'prohra', obor);
    expect(t.tituly).toContain(TITUL_DUELANT);
  });

  it('tituly se neudělují dvakrát a vstup se nemění (imutabilita)', () => {
    let t = vychoziTrofeje();
    for (let i = 0; i < 7; i++) t = aktualizujTrofeje(t, 'syn', 'vyhra', obor);
    expect(t.tituly.filter((x) => x === TITUL_VITEZNA_VLNA)).toHaveLength(1);
    expect(t.tituly.filter((x) => x === titulPostrach('Ekonomika'))).toHaveLength(1);
    const pred: TrofejeProfilu = JSON.parse(JSON.stringify(t));
    aktualizujTrofeje(t, 'syn', 'prohra', obor);
    expect(t).toEqual(pred); // původní objekt beze změny
  });
});

// ---------------------------------------------------------------------------
// Power-upy a zpětná kompatibilita progresu

describe('power-upy a progres', () => {
  it('POWERUP_TYPY a POWERUP_INFO drží tři typy pohromadě', () => {
    expect(POWERUP_TYPY).toEqual(['pade-na-pade', 'zmrazeni-casu', 'stit']);
    for (const typ of POWERUP_TYPY) {
      expect(POWERUP_INFO[typ].nazev.length).toBeGreaterThan(0);
      expect(POWERUP_INFO[typ].popis.length).toBeGreaterThan(0);
    }
  });

  it('vychoziProgres obsahuje prázdné power-upy a trofeje', () => {
    const p = vychoziProgres('2026-09-04T10:00:00Z');
    expect(p.powerupy).toEqual({ 'pade-na-pade': 0, 'zmrazeni-casu': 0, stit: 0 });
    expect(p.trofeje).toEqual({
      dvojice: {}, tituly: [], serieVyherCelkem: 0, seriePodleOboru: {}, duelyCelkem: 0,
    });
  });

  it('doplnDuelovyProgres doplní chybějící pole starého snapshotu a existující nechá', () => {
    const stary = { ...vychoziProgres('2026-09-04T10:00:00Z') };
    delete stary.powerupy;
    delete stary.trofeje;
    const doplneny = doplnDuelovyProgres(stary);
    expect(doplneny.powerupy).toEqual(vychoziPowerupy());
    expect(doplneny.trofeje).toEqual(vychoziTrofeje());
    expect(doplneny.xp).toBe(stary.xp);

    // částečná data (např. server ořezal nová pole trofejí) se doplní, hodnoty zůstanou
    const castecny = {
      ...stary,
      powerupy: { 'pade-na-pade': 2 } as never,
      trofeje: { dvojice: { syn: { vyhry: 1, prohry: 0, remizy: 0, serieVyher: 1 } }, tituly: ['Duelant'] } as never,
    };
    const d2 = doplnDuelovyProgres(castecny);
    expect(d2.powerupy).toEqual({ 'pade-na-pade': 2, 'zmrazeni-casu': 0, stit: 0 });
    expect(d2.trofeje?.dvojice.syn.vyhry).toBe(1);
    expect(d2.trofeje?.tituly).toEqual(['Duelant']);
    expect(d2.trofeje?.serieVyherCelkem).toBe(0);
    expect(d2.trofeje?.duelyCelkem).toBe(0);
  });

  it('doplnDuelovyProgres vrací tentýž objekt, když nic nechybí', () => {
    const p = vychoziProgres('2026-09-04T10:00:00Z');
    expect(doplnDuelovyProgres(p)).toBe(p);
  });
});

// ---------------------------------------------------------------------------
// Zod schéma duelu

describe('validujDuel', () => {
  it('platný duel projde (i s výsledky a power-upy)', () => {
    const d = duel({
      vysledky: {
        tata: vysledek({
          odpovedi: [
            { otazkaId: 'o-tema-a-0', spravne: true, casMs: 3000 },
            { otazkaId: 'o-tema-a-1', spravne: false, casMs: 8000, pouzityPowerup: 'stit' },
            { otazkaId: 'o-tema-a-2', spravne: true, casMs: 5000, pouzityPowerup: 'pade-na-pade' },
          ],
          body: 283,
          celkovyCasMs: 16_000,
        }),
      },
      vitezProfilId: null,
    });
    expect(validujDuel(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('čekající otevřený duel bez soupeře projde', () => {
    const d = duel({
      souper: undefined,
      otevrenyProRodinu: true,
      stav: 'cekajici',
      handicap: { tata: 1 },
      vysledky: {},
    });
    expect(() => validujDuel(JSON.parse(JSON.stringify(d)))).not.toThrow();
  });

  it('odmítne duel proti sobě samému a přijatý duel bez soupeře', () => {
    expect(() =>
      validujDuel(duel({ souper: { profilId: 'tata', jmeno: 'Táta 2' }, handicap: { tata: 1 } })),
    ).toThrow(/sám se sebou/);
    expect(() => validujDuel(duel({ souper: undefined, stav: 'prijaty', handicap: { tata: 1 } })))
      .toThrow(/musí mít soupeře/);
  });

  it('odmítne handicap mimo <1; 1.5>, cizí handicap a cizí výsledek', () => {
    expect(() => validujDuel(duel({ handicap: { tata: 0.9, syn: 1 } }))).toThrow();
    expect(() => validujDuel(duel({ handicap: { tata: 1.6, syn: 1 } }))).toThrow();
    expect(() => validujDuel(duel({ handicap: { tata: 1, syn: 1, babicka: 1.2 } })))
      .toThrow(/nehraje/);
    expect(() => validujDuel(duel({ vysledky: { babicka: vysledek() } }))).toThrow(/nehraje/);
  });

  it('odmítne duplicitní otázky, odpověď mimo sadu a dvojí použití power-upu', () => {
    expect(() => validujDuel(duel({ otazkyIds: ['o-1', 'o-1', 'o-2'] }))).toThrow(/Duplicitní/);
    expect(() =>
      validujDuel(duel({
        vysledky: { tata: vysledek({ odpovedi: [{ otazkaId: 'cizi', spravne: true, casMs: 1 }] }) },
      })),
    ).toThrow(/v duelu není/);
    expect(() =>
      validujDuel(duel({
        vysledky: {
          tata: vysledek({
            odpovedi: [
              { otazkaId: 'o-tema-a-0', spravne: true, casMs: 1, pouzityPowerup: 'zmrazeni-casu' },
              { otazkaId: 'o-tema-a-1', spravne: true, casMs: 1, pouzityPowerup: 'zmrazeni-casu' },
            ],
          }),
        },
      })),
    ).toThrow(/víckrát/);
  });

  it('odmítne špatný počet otázek, vítěze mimo duel a neplatný stav', () => {
    expect(() => validujDuel(duel({ pocetOtazek: 7 as never }))).toThrow();
    expect(() => validujDuel(duel({ otazkyIds: Array.from({ length: 6 }, (_, i) => `o-${i}`) })))
      .toThrow(/delší než pocetOtazek/);
    expect(() => validujDuel(duel({ vitezProfilId: 'babicka' }))).toThrow(/účastníkem/);
    expect(() => validujDuel(duel({ stav: 'rozehrany' as never }))).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Líná expirace (sdílený vzorec serveru i klienta)

describe('expirujDuel', () => {
  it('běžící duel po vyprsi překlopí na vyprsely s kontumačním vítězem', () => {
    const bezici = duel({ stav: 'prijaty', vysledky: { tata: vysledek({ body: 100 }) } });
    const po = expirujDuel(bezici, '2026-09-05T10:00:00.000Z'); // přesně vyprsi
    expect(po.stav).toBe('vyprsely');
    expect(po.vitezProfilId).toBe('tata'); // kdo odehrál, vyhrává

    const nikdoNehral = expirujDuel(duel({ stav: 'cekajici' }), '2026-09-06T00:00:00.000Z');
    expect(nikdoNehral.stav).toBe('vyprsely');
    expect(nikdoNehral.vitezProfilId).toBeNull();
  });

  it('otevřená výzva bez soupeře: vítěz jen s výsledkem vyzyvatele', () => {
    const sVysledkem = duel({
      stav: 'cekajici',
      souper: undefined,
      handicap: { tata: 1 },
      vysledky: { tata: vysledek({ body: 50 }) },
    });
    expect(vitezPoVyprseni(sVysledkem)).toBe('tata');
    expect(vitezPoVyprseni({ ...sVysledkem, vysledky: {} })).toBeNull();
  });

  it('před vypršením a u dokončeného duelu vrací TENTÝŽ objekt', () => {
    const bezici = duel({ stav: 'prijaty' });
    expect(expirujDuel(bezici, '2026-09-05T09:59:59.999Z')).toBe(bezici);
    const hotovy = duel({ stav: 'hotovy', vitezProfilId: 'tata' });
    expect(expirujDuel(hotovy, '2026-09-06T00:00:00.000Z')).toBe(hotovy);
  });
});

// ---------------------------------------------------------------------------
// Serverový přepočet výsledku (anti-cheat)

describe('prepoctiVysledekDuelu', () => {
  const b = banka();
  // otazkyIds duelu: o-tema-a-0 (obt. 1, limit 14 s), o-tema-a-1 (obt. 2, 18 s),
  // o-tema-a-2 (obt. 3, 22 s), o-tema-a-3 (obt. 4, 26 s), o-tema-a-4 (obt. 5, 30 s).

  it('body i celkovyCasMs spočítá sám — klientským hodnotám nevěří', () => {
    const d = duel({ stav: 'prijaty' });
    const podvrh = vysledek({
      odpovedi: [
        { otazkaId: 'o-tema-a-0', spravne: true, casMs: 0 },
        { otazkaId: 'o-tema-a-1', spravne: false, casMs: 4_000 },
      ],
      body: 9_999_999,
      celkovyCasMs: 1,
    });
    const prepocet = prepoctiVysledekDuelu(d, 'tata', podvrh, b);
    expect(prepocet.ok).toBe(true);
    if (prepocet.ok) {
      expect(prepocet.vysledek.body).toBe(150); // 100 + plný bonus; špatná = 0
      expect(prepocet.vysledek.celkovyCasMs).toBe(4_000);
    }
  });

  it('prázdné odpovědi = 0 bodů, ať klient tvrdí cokoli', () => {
    const prepocet = prepoctiVysledekDuelu(
      duel(),
      'tata',
      vysledek({ odpovedi: [], body: 9_999_999, celkovyCasMs: 0 }),
      b,
    );
    expect(prepocet.ok).toBe(true);
    if (prepocet.ok) expect(prepocet.vysledek.body).toBe(0);
  });

  it('respektuje handicap hráče a zmrazení času na otázce s power-upem', () => {
    const d = duel(); // syn má handicap 1.2
    const naHrane = vysledek({
      odpovedi: [
        // limit syna: 14 000 × 1.2 = 16 800 (+ rezerva 2 000 = strop 18 800)
        { otazkaId: 'o-tema-a-0', spravne: true, casMs: 16_800 },
        // se zmrazením: 18 000 × 1.2 + 10 000 = 31 600
        { otazkaId: 'o-tema-a-1', spravne: true, casMs: 31_000, pouzityPowerup: 'zmrazeni-casu' },
      ],
    });
    const prepocet = prepoctiVysledekDuelu(d, 'syn', naHrane, b);
    expect(prepocet.ok).toBe(true);

    const bezPowerupu = vysledek({
      odpovedi: [{ otazkaId: 'o-tema-a-1', spravne: true, casMs: 31_000 }],
    });
    expect(prepoctiVysledekDuelu(d, 'syn', bezPowerupu, b).ok).toBe(false);
  });

  it('odmítne čas přes limit + rezervu, duplicitní otázku a otázku mimo banku', () => {
    const d = duel();
    const presLimit = prepoctiVysledekDuelu(
      d,
      'tata',
      vysledek({ odpovedi: [{ otazkaId: 'o-tema-a-0', spravne: true, casMs: 16_001 }] }),
      b,
    ); // limit 14 000 + 2 000 rezerva = 16 000
    expect(presLimit.ok).toBe(false);

    const duplicitni = prepoctiVysledekDuelu(
      d,
      'tata',
      vysledek({
        odpovedi: [
          { otazkaId: 'o-tema-a-0', spravne: true, casMs: 1_000 },
          { otazkaId: 'o-tema-a-0', spravne: true, casMs: 1_000 },
        ],
      }),
      b,
    );
    expect(duplicitni.ok).toBe(false);

    const mimoBanku = prepoctiVysledekDuelu(
      d,
      'tata',
      vysledek({ odpovedi: [{ otazkaId: 'o-neexistuje', spravne: true, casMs: 1_000 }] }),
      b,
    );
    expect(mimoBanku.ok).toBe(false);
  });

  it('štít promění jen PRVNÍ špatnou odpověď od aktivace (dřívější chyby ne)', () => {
    const d = duel();
    const prepocet = prepoctiVysledekDuelu(
      d,
      'tata',
      vysledek({
        odpovedi: [
          { otazkaId: 'o-tema-a-0', spravne: false, casMs: 1_000 }, // před štítem: 0
          { otazkaId: 'o-tema-a-1', spravne: false, casMs: 1_000, pouzityPowerup: 'stit' }, // 50
          { otazkaId: 'o-tema-a-2', spravne: false, casMs: 1_000 }, // štít spotřebován: 0
        ],
      }),
      b,
    );
    expect(prepocet.ok).toBe(true);
    if (prepocet.ok) expect(prepocet.vysledek.body).toBe(BODY_STITU);
  });
});

// ---------------------------------------------------------------------------
// Merge trofejí (LWW pull progresu mezi zařízeními)

describe('sloucTrofeje a prinasiTrofejeNavic', () => {
  const sTrofeji: TrofejeProfilu = {
    dvojice: { tata: { vyhry: 3, prohry: 1, remizy: 0, serieVyher: 2 } },
    tituly: [TITUL_VITEZNA_VLNA],
    serieVyherCelkem: 2,
    seriePodleOboru: { ekonomika: 2 },
    duelyCelkem: 4,
  };

  it('bere maxima počítadel a sjednocuje tituly (trofej se nikdy neztratí)', () => {
    const chudsi: TrofejeProfilu = {
      dvojice: { tata: { vyhry: 2, prohry: 1, remizy: 1, serieVyher: 0 }, mama: { vyhry: 1, prohry: 0, remizy: 0, serieVyher: 1 } },
      tituly: [TITUL_DUELANT],
      serieVyherCelkem: 0,
      seriePodleOboru: { pravo: 1 },
      duelyCelkem: 5,
    };
    const sloucene = sloucTrofeje(chudsi, sTrofeji);
    expect(sloucene.dvojice.tata).toEqual({ vyhry: 3, prohry: 1, remizy: 1, serieVyher: 2 });
    expect(sloucene.dvojice.mama).toEqual(chudsi.dvojice.mama);
    expect(sloucene.tituly.sort()).toEqual([TITUL_DUELANT, TITUL_VITEZNA_VLNA].sort());
    expect(sloucene.serieVyherCelkem).toBe(2);
    expect(sloucene.seriePodleOboru).toEqual({ ekonomika: 2, pravo: 1 });
    expect(sloucene.duelyCelkem).toBe(5);
  });

  it('prinasiTrofejeNavic pozná, jestli má lokál něco navíc (řídí bump + push)', () => {
    expect(prinasiTrofejeNavic(sTrofeji, vychoziTrofeje())).toBe(true);
    expect(prinasiTrofejeNavic(vychoziTrofeje(), sTrofeji)).toBe(false);
    expect(prinasiTrofejeNavic(sTrofeji, sTrofeji)).toBe(false);
    expect(prinasiTrofejeNavic(sloucTrofeje(sTrofeji, vychoziTrofeje()), sTrofeji)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Schéma: duplicitní otázka v odpovědích

describe('vysledekDueluSchema — duplicitní otázky', () => {
  it('odmítne dvakrát zodpovězenou tutéž otázku', () => {
    expect(() =>
      validujDuel(
        duel({
          vysledky: {
            tata: vysledek({
              odpovedi: [
                { otazkaId: 'o-tema-a-0', spravne: true, casMs: 1 },
                { otazkaId: 'o-tema-a-0', spravne: true, casMs: 1 },
              ],
            }),
          },
        }),
      ),
    ).toThrow(/zodpovězená víckrát/);
  });
});
