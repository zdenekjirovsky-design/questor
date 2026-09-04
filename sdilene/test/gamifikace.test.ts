// Testy gamifikačního jádra — čisté funkce, deterministické (náhoda i čas se injektují).
import { describe, expect, it } from 'vitest';
import {
  aktualizujStatistiku,
  aktualizujStreakPoAktivite,
  aplikujLekciNaQuesty,
  aplikujOdpovedNaQuesty,
  aplikujTestNaQuesty,
  comboNasobic,
  dalsiObtiznost,
  denZData,
  hashRetezce,
  idMistrovskeKarty,
  jeOdpovedSpravna,
  KARTY_VELIKANI,
  levelZXp,
  normalizujOdpoved,
  otevriTruhlu,
  PITY_LIMIT,
  pondeliTydne,
  prahLevelu,
  rozdilDnu,
  rozsahObtiznosti,
  stavLevelu,
  urciTruhlu,
  vahaOtazkyPodleBoxu,
  vazenyVyber,
  vyberOtazkyDoTestu,
  vychoziProgres,
  vygenerujDenniQuesty,
  vytvorNahodu,
  XP_ZA_LEKCI,
  xpZaOdpoved,
} from '../src/index';
import type {
  BankaOtazek,
  OdpovedZaznam,
  QuestDenni,
  Sbirka,
  StatistikaOtazky,
  Streak,
  TestVysledek,
} from '../src/index';

// ---------------------------------------------------------------------------
// Pomůcky

function zaznam(prepis: Partial<OdpovedZaznam> = {}): OdpovedZaznam {
  return {
    otazkaId: 'o-1',
    temaId: 'tema-a',
    obtiznost: 3,
    spravne: true,
    casMs: 4000,
    ...prepis,
  };
}

function testovaciBanka(): BankaOtazek {
  return {
    predmetId: 'testovaci',
    nazev: 'Testovací',
    verze: 1,
    vytvoreno: '2026-09-04',
    temata: [
      { id: 'tema-a', nazev: 'Téma A', poradi: 1 },
      { id: 'tema-b', nazev: 'Téma B', poradi: 2 },
    ],
    otazky: ([1, 2, 3, 4, 5] as const).flatMap((obtiznost) =>
      (['tema-a', 'tema-b'] as const).map((temaId) => ({
        id: `o-${temaId}-${obtiznost}`,
        temaId,
        obtiznost,
        typ: 'anone' as const,
        zadani: `Otázka ${temaId} obtížnosti ${obtiznost}?`,
        spravna: true,
        vysvetleni: 'Protože ano.',
      })),
    ),
  };
}

// ---------------------------------------------------------------------------
// XP a levely

describe('XP a combo', () => {
  it('comboNasobic roste po 0.1 a je zastropovaný na 2', () => {
    expect(comboNasobic(0)).toBe(1);
    expect(comboNasobic(5)).toBeCloseTo(1.5);
    expect(comboNasobic(10)).toBe(2);
    expect(comboNasobic(50)).toBe(2);
    expect(comboNasobic(-3)).toBe(1);
  });

  it('xpZaOdpoved = 10 × obtížnost × combo', () => {
    expect(xpZaOdpoved(1, 0)).toBe(10);
    expect(xpZaOdpoved(5, 0)).toBe(50);
    expect(xpZaOdpoved(3, 4)).toBe(Math.round(10 * 3 * 1.4));
    expect(xpZaOdpoved(5, 99)).toBe(100); // strop 2×
  });
});

describe('levely', () => {
  it('prahLevelu: level 1 = 0 XP, dál křivka 100·n^1.6', () => {
    expect(prahLevelu(1)).toBe(0);
    expect(prahLevelu(2)).toBe(100);
    expect(prahLevelu(3)).toBe(Math.ceil(100 * Math.pow(2, 1.6)));
  });

  it('levelZXp je konzistentní s prahLevelu', () => {
    for (const level of [1, 2, 3, 5, 10]) {
      const prah = prahLevelu(level);
      expect(levelZXp(prah)).toBe(level);
      if (prah > 0) expect(levelZXp(prah - 1)).toBe(level - 1);
    }
    expect(levelZXp(0)).toBe(1);
    expect(levelZXp(-50)).toBe(1);
  });

  it('stavLevelu vrací postup v rámci levelu', () => {
    const s = stavLevelu(150);
    expect(s.level).toBe(2);
    expect(s.xpVLevelu).toBe(50);
    expect(s.xpNaDalsiLevel).toBe(prahLevelu(3) - prahLevelu(2));
    expect(s.procento).toBeCloseTo(50 / (prahLevelu(3) - prahLevelu(2)));
  });
});

// ---------------------------------------------------------------------------
// Deterministická náhoda

describe('deterministická náhoda', () => {
  it('hashRetezce je stabilní a rozlišuje vstupy', () => {
    expect(hashRetezce('questy:2026-09-04')).toBe(hashRetezce('questy:2026-09-04'));
    expect(hashRetezce('a')).not.toBe(hashRetezce('b'));
  });

  it('vytvorNahodu dává stejnou sekvenci pro stejný seed, hodnoty v [0, 1)', () => {
    const a = vytvorNahodu(42);
    const b = vytvorNahodu(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('vazenyVyber vybere požadovaný počet bez opakování', () => {
    const polozky = ['a', 'b', 'c', 'd', 'e'];
    const vybrane = vazenyVyber(polozky, [1, 1, 1, 1, 1], 3, vytvorNahodu(7));
    expect(vybrane).toHaveLength(3);
    expect(new Set(vybrane).size).toBe(3);
    // Víc než je k dispozici → vrátí všechno.
    expect(vazenyVyber(polozky, [1, 1, 1, 1, 1], 99, vytvorNahodu(7))).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Datumy

describe('datumové pomůcky', () => {
  it('denZData formátuje YYYY-MM-DD', () => {
    expect(denZData(new Date(2026, 8, 4))).toBe('2026-09-04');
    expect(denZData(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('rozdilDnu počítá dny mezi lokálními dny', () => {
    expect(rozdilDnu('2026-09-01', '2026-09-04')).toBe(3);
    expect(rozdilDnu('2026-09-04', '2026-09-04')).toBe(0);
    expect(rozdilDnu('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('pondeliTydne vrací pondělí týdne', () => {
    expect(pondeliTydne('2026-09-04')).toBe('2026-08-31'); // pátek → pondělí
    expect(pondeliTydne('2026-08-31')).toBe('2026-08-31'); // pondělí → totéž
    expect(pondeliTydne('2026-09-06')).toBe('2026-08-31'); // neděle → pondělí téhož týdne
  });
});

// ---------------------------------------------------------------------------
// Streak

describe('aktualizujStreakPoAktivite', () => {
  const zaklad: Streak = { aktualni: 3, nejdelsi: 5, posledniDen: '2026-09-03', zmrazeni: 1 };

  it('stejný den nic nemění', () => {
    const s = { ...zaklad, posledniDen: '2026-09-04' };
    expect(aktualizujStreakPoAktivite(s, '2026-09-04')).toBe(s);
  });

  it('následující den streak prodlouží', () => {
    const s = aktualizujStreakPoAktivite(zaklad, '2026-09-04');
    expect(s.aktualni).toBe(4);
    expect(s.posledniDen).toBe('2026-09-04');
    expect(s.zmrazeni).toBe(1);
  });

  it('jeden vynechaný den zachrání zmrazení', () => {
    const s = aktualizujStreakPoAktivite(zaklad, '2026-09-05');
    expect(s.aktualni).toBe(4);
    expect(s.zmrazeni).toBe(0);
  });

  it('vynechaný den bez zmrazení resetuje na 1', () => {
    const s = aktualizujStreakPoAktivite({ ...zaklad, zmrazeni: 0 }, '2026-09-05');
    expect(s.aktualni).toBe(1);
  });

  it('delší mezeru zmrazení nezachrání', () => {
    const s = aktualizujStreakPoAktivite(zaklad, '2026-09-07');
    expect(s.aktualni).toBe(1);
    expect(s.zmrazeni).toBe(1);
  });

  it('první aktivita začíná streak 1 a drží nejdelší rekord', () => {
    const s = aktualizujStreakPoAktivite({ aktualni: 0, nejdelsi: 0, posledniDen: null, zmrazeni: 1 }, '2026-09-04');
    expect(s.aktualni).toBe(1);
    expect(s.nejdelsi).toBe(1);
    const s2 = aktualizujStreakPoAktivite(zaklad, '2026-09-04');
    expect(s2.nejdelsi).toBe(5); // rekord 5 zůstává
  });
});

// ---------------------------------------------------------------------------
// Truhly

describe('truhly', () => {
  it('urciTruhlu podle úspěšnosti (50/70/90 %)', () => {
    expect(urciTruhlu(0.49)).toBeNull();
    expect(urciTruhlu(0.5)).toBe('bronzova');
    expect(urciTruhlu(0.69)).toBe('bronzova');
    expect(urciTruhlu(0.7)).toBe('stribrna');
    expect(urciTruhlu(0.9)).toBe('zlata');
    expect(urciTruhlu(1)).toBe('zlata');
  });

  it('pity timer garantuje kartu a vynuluje počítadlo', () => {
    const sbirka: Sbirka = { karty: [], truhelBezKarty: PITY_LIMIT };
    // los 0.99 by kartu normálně nedal — pity ji vynutí
    const { odmena, sbirka: nova } = otevriTruhlu('bronzova', sbirka, KARTY_VELIKANI, () => 0.99);
    expect(odmena.typ).toBe('karta');
    expect(odmena.kartaId).toBeDefined();
    expect(nova.karty).toContain(odmena.kartaId);
    expect(nova.truhelBezKarty).toBe(0);
  });

  it('bez dostupných karet padne odměna na zmrazení/XP a počítadlo roste', () => {
    const sbirka: Sbirka = { karty: KARTY_VELIKANI.map((k) => k.id), truhelBezKarty: PITY_LIMIT };
    const { odmena, sbirka: nova } = otevriTruhlu('zlata', sbirka, KARTY_VELIKANI, () => 0.99);
    expect(odmena.typ).toBe('xp');
    expect(nova.truhelBezKarty).toBe(PITY_LIMIT + 1);
  });

  it('XP odměna je v rozsahu konfigurace truhly', () => {
    const sbirka: Sbirka = { karty: [], truhelBezKarty: 0 };
    for (let seed = 0; seed < 20; seed++) {
      const { odmena } = otevriTruhlu('zlata', sbirka, [], vytvorNahodu(seed));
      if (odmena.typ === 'xp') {
        expect(odmena.xp).toBeGreaterThanOrEqual(80);
        expect(odmena.xp).toBeLessThanOrEqual(150);
      } else {
        expect(odmena.typ).toBe('zmrazeni');
      }
    }
  });

  it('los pod prahem karty dá kartu, mezi prahy zmrazení', () => {
    const sbirka: Sbirka = { karty: [], truhelBezKarty: 0 };
    const karta = otevriTruhlu('bronzova', sbirka, KARTY_VELIKANI, () => 0.1);
    expect(karta.odmena.typ).toBe('karta');
    const zmrazeni = otevriTruhlu('bronzova', sbirka, KARTY_VELIKANI, () => 0.25);
    expect(zmrazeni.odmena.typ).toBe('zmrazeni');
  });
});

// ---------------------------------------------------------------------------
// Sbírka

describe('sbírka', () => {
  it('KARTY_VELIKANI má 12 karet s unikátními id a Baťa je legendární', () => {
    expect(KARTY_VELIKANI).toHaveLength(12);
    expect(new Set(KARTY_VELIKANI.map((k) => k.id)).size).toBe(12);
    expect(KARTY_VELIKANI.find((k) => k.id === 'bata')?.vzacnost).toBe('legendarni');
  });

  it('idMistrovskeKarty skládá stabilní id', () => {
    expect(idMistrovskeKarty('marketing', 'zlato')).toBe('tema:marketing:zlato');
  });
});

// ---------------------------------------------------------------------------
// Denní questy

describe('denní questy', () => {
  const ctx = { temata: testovaciBanka().temata, nejslabsiTemaId: 'tema-b' };

  it('vygenerujDenniQuesty je deterministické z data a dává 3 questy', () => {
    const a = vygenerujDenniQuesty('2026-09-04', ctx);
    const b = vygenerujDenniQuesty('2026-09-04', ctx);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const q of a) {
      expect(q.id).toBe(`2026-09-04:${q.sablona}`);
      expect(q.postup).toBe(0);
      expect(q.splneno).toBe(false);
    }
    // Jiný den → jiná sada nebo aspoň jiná id.
    const c = vygenerujDenniQuesty('2026-09-05', ctx);
    expect(c.every((q) => q.datum === '2026-09-05')).toBe(true);
  });

  it('aplikujOdpovedNaQuesty počítá jednotlivé šablony', () => {
    const questy: QuestDenni[] = [
      { id: 'q1', sablona: 'odpovez', popis: '', cil: 2, postup: 0, splneno: false, odmenaXp: 10, datum: '2026-09-04' },
      { id: 'q2', sablona: 'obtiznost', popis: '', cil: 2, postup: 0, splneno: false, odmenaXp: 10, datum: '2026-09-04', parametry: { minObtiznost: 3 } },
      { id: 'q3', sablona: 'tema', popis: '', cil: 2, postup: 0, splneno: false, odmenaXp: 10, datum: '2026-09-04', parametry: { temaId: 'tema-b' } },
      { id: 'q4', sablona: 'bezchyby', popis: '', cil: 5, postup: 0, splneno: false, odmenaXp: 10, datum: '2026-09-04' },
    ];
    const po = aplikujOdpovedNaQuesty(questy, zaznam({ obtiznost: 4, temaId: 'tema-b' }), 3);
    expect(po[0].postup).toBe(1); // odpovez vždy
    expect(po[1].postup).toBe(1); // obtížnost 4 ≥ 3 a správně
    expect(po[2].postup).toBe(1); // téma sedí
    expect(po[3].postup).toBe(3); // bezchyby = aktuální combo

    // Špatná odpověď: obtiznost quest nepočítá, bezchyby drží dosažené maximum.
    const poSpatne = aplikujOdpovedNaQuesty(po, zaznam({ spravne: false, obtiznost: 5, temaId: 'tema-b' }), 0);
    expect(poSpatne[1].postup).toBe(1);
    expect(poSpatne[3].postup).toBe(3);
  });

  it('quest se po dosažení cíle označí splněno a dál se nemění', () => {
    const questy: QuestDenni[] = [
      { id: 'q1', sablona: 'odpovez', popis: '', cil: 1, postup: 0, splneno: false, odmenaXp: 10, datum: '2026-09-04' },
    ];
    const po = aplikujOdpovedNaQuesty(questy, zaznam(), 1);
    expect(po[0].splneno).toBe(true);
    expect(po[0].postup).toBe(1);
    const po2 = aplikujOdpovedNaQuesty(po, zaznam(), 2);
    expect(po2[0]).toEqual(po[0]);
  });

  it('šablona „lekce“ se losuje mezi denními questy a XP_ZA_LEKCI je 40', () => {
    expect(XP_ZA_LEKCI).toBe(40);
    // Deterministický průchod řadou dnů — šablona lekce musí padnout aspoň jednou
    // a vždy se správným zněním a odměnou.
    const lekcove: QuestDenni[] = [];
    for (let den = 1; den <= 30; den++) {
      const datum = `2026-09-${String(den).padStart(2, '0')}`;
      lekcove.push(...vygenerujDenniQuesty(datum, ctx).filter((q) => q.sablona === 'lekce'));
    }
    expect(lekcove.length).toBeGreaterThan(0);
    for (const q of lekcove) {
      expect(q.popis).toBe('Projdi dnes 1 lekci');
      expect(q.cil).toBe(1);
      expect(q.odmenaXp).toBe(60);
    }
  });

  it('aplikujLekciNaQuesty plní quest lekce a ostatních se nedotkne', () => {
    const questy: QuestDenni[] = [
      { id: 'q1', sablona: 'lekce', popis: 'Projdi dnes 1 lekci', cil: 1, postup: 0, splneno: false, odmenaXp: 60, datum: '2026-09-04' },
      { id: 'q2', sablona: 'odpovez', popis: '', cil: 10, postup: 2, splneno: false, odmenaXp: 40, datum: '2026-09-04' },
    ];
    const po = aplikujLekciNaQuesty(questy, 'tema-a');
    expect(po[0].postup).toBe(1);
    expect(po[0].splneno).toBe(true);
    expect(po[1]).toBe(questy[1]); // jiné šablony beze změny
    // splněný quest se už nemění (postup nepřeteče přes cíl)
    const po2 = aplikujLekciNaQuesty(po, 'tema-b');
    expect(po2[0]).toBe(po[0]);
  });

  it('aplikujLekciNaQuesty respektuje volitelný parametr temaId', () => {
    const questy: QuestDenni[] = [
      { id: 'q1', sablona: 'lekce', popis: '', cil: 2, postup: 0, splneno: false, odmenaXp: 60, datum: '2026-09-04', parametry: { temaId: 'tema-b' } },
    ];
    expect(aplikujLekciNaQuesty(questy, 'tema-a')[0].postup).toBe(0);
    expect(aplikujLekciNaQuesty(questy, 'tema-b')[0].postup).toBe(1);
  });

  it('aplikujTestNaQuesty plní quest úspěšnosti od 80 %', () => {
    const questy: QuestDenni[] = [
      { id: 'q1', sablona: 'uspesnost', popis: '', cil: 1, postup: 0, splneno: false, odmenaXp: 80, datum: '2026-09-04' },
    ];
    const vysledek = { uspesnost: 0.79 } as TestVysledek;
    expect(aplikujTestNaQuesty(questy, vysledek)[0].splneno).toBe(false);
    expect(aplikujTestNaQuesty(questy, { uspesnost: 0.8 } as TestVysledek)[0].splneno).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Výběr otázek do testu

describe('výběr otázek do testu', () => {
  it('rozsahObtiznosti mapuje režimy', () => {
    expect(rozsahObtiznosti('rozcvicka')).toEqual([1, 2]);
    expect(rozsahObtiznosti('standard')).toEqual([2, 4]);
    expect(rozsahObtiznosti('hardcore')).toEqual([4, 5]);
    expect(rozsahObtiznosti('adaptivni')).toEqual([1, 5]);
    expect(rozsahObtiznosti('zkouska')).toEqual([1, 5]);
  });

  it('vahaOtazkyPodleBoxu zvýhodňuje nové a slabé otázky', () => {
    expect(vahaOtazkyPodleBoxu(undefined)).toBe(3.5);
    const stat = (box: StatistikaOtazky['box']): StatistikaOtazky => ({
      otazkaId: 'o', box, spravneCelkem: 0, spatneCelkem: 0, posledniOdpoved: '2026-09-04',
    });
    expect(vahaOtazkyPodleBoxu(stat(0))).toBe(5);
    expect(vahaOtazkyPodleBoxu(stat(4))).toBe(1);
  });

  it('filtruje podle režimu a témat', () => {
    const banka = testovaciBanka();
    // tema-a má v hardcore přesně 2 otázky (obtížnost 4 a 5) — žádost o 2 fallback nespustí.
    const otazky = vyberOtazkyDoTestu(banka, 'hardcore', 2, ['tema-a'], {}, vytvorNahodu(1));
    expect(otazky).toHaveLength(2);
    for (const o of otazky) {
      expect(o.temaId).toBe('tema-a');
      expect(o.obtiznost).toBeGreaterThanOrEqual(4);
    }
  });

  it('při nedostatku kandidátů povolí všechny obtížnosti', () => {
    const banka = testovaciBanka();
    // hardcore v jednom tématu má jen 2 otázky (obtížnost 4 a 5) — chceme 5.
    const otazky = vyberOtazkyDoTestu(banka, 'hardcore', 5, ['tema-a'], {}, vytvorNahodu(1));
    expect(otazky).toHaveLength(5);
    expect(otazky.every((o) => o.temaId === 'tema-a')).toBe(true);
  });

  it('dalsiObtiznost se posouvá a drží v mezích 1–5', () => {
    expect(dalsiObtiznost(3, true)).toBe(4);
    expect(dalsiObtiznost(3, false)).toBe(2);
    expect(dalsiObtiznost(5, true)).toBe(5);
    expect(dalsiObtiznost(1, false)).toBe(1);
  });

  it('aktualizujStatistiku posouvá Leitnerův box (nová otázka startuje na 2)', () => {
    const spravne = aktualizujStatistiku(undefined, 'o-1', true, '2026-09-04T10:00:00Z');
    expect(spravne.box).toBe(3);
    expect(spravne.spravneCelkem).toBe(1);
    const spatne = aktualizujStatistiku(spravne, 'o-1', false, '2026-09-04T10:01:00Z');
    expect(spatne.box).toBe(2);
    expect(spatne.spatneCelkem).toBe(1);
    // clamps
    const dole = aktualizujStatistiku({ ...spatne, box: 0 }, 'o-1', false, '2026-09-04T10:02:00Z');
    expect(dole.box).toBe(0);
    const nahore = aktualizujStatistiku({ ...spravne, box: 4 }, 'o-1', true, '2026-09-04T10:03:00Z');
    expect(nahore.box).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Výchozí progres a normalizace odpovědí

describe('výchozí progres', () => {
  it('začíná na nule s 1 zmrazením a dlouhovlasým avatarem', () => {
    const p = vychoziProgres('2026-09-04T10:00:00Z');
    expect(p.xp).toBe(0);
    expect(p.streak.zmrazeni).toBe(1);
    expect(p.avatar.barvaVlasu).toBeTruthy();
    expect(p.aktualizovano).toBe('2026-09-04T10:00:00Z');
    expect(p.dokonceneTesty).toBe(0);
  });
});

describe('normalizace odpovědí', () => {
  it('normalizujOdpoved sjednocuje velikost, diakritiku a mezery', () => {
    expect(normalizujOdpoved('  Poptávka  ')).toBe('poptavka');
    expect(normalizujOdpoved('ČNB\t cíluje')).toBe('cnb ciluje');
  });

  it('jeOdpovedSpravna uznává varianty bez ohledu na diakritiku', () => {
    expect(jeOdpovedSpravna('POPTÁVKA', ['poptavka', 'agregátní poptávka'])).toBe(true);
    expect(jeOdpovedSpravna('nabídka', ['poptavka'])).toBe(false);
  });
});
