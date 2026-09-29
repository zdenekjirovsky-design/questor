import { describe, expect, it } from 'vitest';
import {
  sestavPrehledRodiny,
  slucPostupLekci,
  vychoziProgres,
  type BankaOtazek,
  type PostupLekce,
  type ProfilRegistrZaznam,
  type SnimekProgresu,
  type TestVysledek,
  type VyukaPredmetu,
} from '../src';

const HOTOVA: PostupLekce = {
  dokonceneBloky: [0, 1, 2],
  dokoncenoPoprve: '2026-09-10T10:00:00.000Z',
  posledniXpDen: '2026-09-10',
  pocetDokonceni: 1,
};

describe('slucPostupLekci', () => {
  it('sjednotí lekce z obou stran a u dokončení vezme monotónní maximum', () => {
    const server = {
      a: HOTOVA,
      b: { dokonceneBloky: [0], dokoncenoPoprve: null, posledniXpDen: null, pocetDokonceni: 0 },
    };
    const zarizeni = {
      a: { dokonceneBloky: [], dokoncenoPoprve: '2026-09-12T08:00:00.000Z', posledniXpDen: '2026-09-12', pocetDokonceni: 2 },
      c: HOTOVA,
    };
    const vysledek = slucPostupLekci(server, zarizeni);
    expect(Object.keys(vysledek).sort()).toEqual(['a', 'b', 'c']);
    expect(vysledek.a.dokoncenoPoprve).toBe('2026-09-10T10:00:00.000Z'); // dřívější
    expect(vysledek.a.posledniXpDen).toBe('2026-09-12'); // pozdější
    expect(vysledek.a.pocetDokonceni).toBe(2); // vyšší
    expect(vysledek.a.dokonceneBloky).toEqual([]); // bloky z přednostní strany („začít znovu")
    expect(vysledek.b.dokonceneBloky).toEqual([0]);
  });

  it('snese chybějící strany a vadná data', () => {
    expect(slucPostupLekci(undefined, undefined)).toEqual({});
    const vadny = { x: { dokonceneBloky: [1, 1, -2, 'x'], pocetDokonceni: -3 } } as unknown as Record<string, PostupLekce>;
    expect(slucPostupLekci(vadny, undefined).x).toEqual({
      dokonceneBloky: [1],
      dokoncenoPoprve: null,
      posledniXpDen: null,
      pocetDokonceni: 0,
    });
  });
});

// ---------------------------------------------------------------------------

const BANKA: BankaOtazek = {
  predmetId: 'ekonomika-podnikani',
  nazev: 'Ekonomika a podnikání',
  verze: 3,
  vytvoreno: '2026-09-20',
  temata: [
    { id: 'potreby', nazev: 'Potřeby', poradi: 0 },
    { id: 'trh', nazev: 'Trh', poradi: 1 },
  ],
  otazky: [
    { id: 'o-p-1', temaId: 'potreby', obtiznost: 1, typ: 'anone', zadani: 'A?', spravna: true, vysvetleni: 'Protože.' },
    { id: 'o-p-2', temaId: 'potreby', obtiznost: 2, typ: 'anone', zadani: 'B?', spravna: false, vysvetleni: 'Protože.' },
    { id: 'o-t-1', temaId: 'trh', obtiznost: 3, typ: 'anone', zadani: 'C?', spravna: true, vysvetleni: 'Protože.' },
  ],
};

const VYUKA: VyukaPredmetu = {
  predmetId: 'ekonomika-podnikani',
  verze: 2,
  vytvoreno: '2026-09-20',
  lekce: [
    { temaId: 'potreby', nazev: 'Potřeby', poradi: 0, bloky: [{ typ: 'text', obsah: 'Úvod.' }] },
    { temaId: 'trh', nazev: 'Trh', poradi: 1, bloky: [{ typ: 'text', obsah: 'Úvod.' }] },
  ],
};

function profil(id: string, jmeno: string, predmety: string[]): ProfilRegistrZaznam {
  return { profilId: id, jmeno, barva: '#8b5cf6', predmety, aktivniPredmetId: predmety[0], aktualizovano: '2026-09-01T00:00:00.000Z' };
}

function test(konec: string, uspesnost: number): TestVysledek {
  return {
    id: `t-${konec}`,
    konfigurace: { predmetId: 'ekonomika-podnikani', rezim: 'standard', pocetOtazek: 5 },
    zacatek: '2026-09-28T10:00:00.000Z',
    konec,
    odpovedi: [{ otazkaId: 'o-p-1', temaId: 'potreby', obtiznost: 1, spravne: true, casMs: 3000 }],
    uspesnost,
    ziskaneXp: 50,
    nejdelsiCombo: 1,
  };
}

describe('sestavPrehledRodiny', () => {
  const ted = new Date('2026-09-29T12:00:00');

  it('spočítá lekce, zvládnutí, úspěšnost a testy po předmětech a tématech', () => {
    const progres: SnimekProgresu = {
      ...vychoziProgres('2026-09-28T10:10:00.000Z'),
      xp: 420,
      streak: { aktualni: 4, nejdelsi: 6, posledniDen: '2026-09-28', zmrazeni: 0 },
      statistikyOtazek: {
        'o-p-1': { otazkaId: 'o-p-1', box: 3, spravneCelkem: 3, spatneCelkem: 1, posledniOdpoved: '2026-09-28T10:00:00.000Z' },
        'o-p-2': { otazkaId: 'o-p-2', box: 1, spravneCelkem: 1, spatneCelkem: 3, posledniOdpoved: '2026-09-28T10:00:00.000Z' },
      },
      rekordy: { nejlepsiUspesnost: 0.8, nejdelsiCombo: 3, nejrychlejsiBezchybnyMs: null, tydenniXp: { '2026-09-28': 120, '2026-09-21': 300 } },
      postupLekci: { potreby: HOTOVA, trh: { dokonceneBloky: [0], dokoncenoPoprve: null, posledniXpDen: null, pocetDokonceni: 0 } },
      aktualizovano: '2026-09-28T10:10:00.000Z',
    };
    const prehled = sestavPrehledRodiny({
      profily: [profil('matej', 'Matěj', ['ekonomika-podnikani'])],
      progresy: [{ profilId: 'matej', jmeno: 'Matěj', progres, prijato: '2026-09-28T10:10:05.000Z' }],
      udalosti: [
        { profilId: 'matej', vysledek: test('2026-09-27T10:05:00.000Z', 0.6) },
        { profilId: 'matej', vysledek: test('2026-09-28T10:05:00.000Z', 0.8) },
      ],
      banky: [BANKA],
      vyuky: [VYUKA],
      ted,
    });

    expect(prehled.profily).toHaveLength(1);
    const p = prehled.profily[0];
    expect(p.jmeno).toBe('Matěj');
    expect(p.level.level).toBeGreaterThanOrEqual(2);
    expect(p.streak.aktualni).toBe(4); // včera hrál → streak platí
    expect(p.lekceHotovo).toBe(1);
    expect(p.posledniAktivita).toBe('2026-09-28T10:10:00.000Z');
    expect(p.tydenniXp).toHaveLength(6);
    expect(p.tydenniXp.at(-1)).toEqual({ tyden: '2026-09-28', xp: 120 });
    expect(p.tydenniXp.at(-2)).toEqual({ tyden: '2026-09-21', xp: 300 });

    const ekonomika = p.predmety[0];
    expect(ekonomika).toMatchObject({
      predmetId: 'ekonomika-podnikani',
      studuje: true,
      aktivni: true,
      lekceHotovo: 1,
      lekceCelkem: 2,
      otazekCelkem: 3,
      otazekZodpovezeno: 2,
      zvladnuto: 1,
      testu: 2,
      posledniTest: '2026-09-28T10:05:00.000Z',
    });
    expect(ekonomika.uspesnost).toBeCloseTo(4 / 8);
    const [potreby, trh] = ekonomika.temata;
    expect(potreby).toMatchObject({ temaId: 'potreby', lekceHotova: true, zvladnuto: 1, odpovedi: 8 });
    expect(trh).toMatchObject({ temaId: 'trh', lekceHotova: false, lekceRozpracovana: true, odpovedi: 0, uspesnost: null });
    expect(p.posledniTesty.map((t) => t.konec)).toEqual(['2026-09-28T10:05:00.000Z', '2026-09-27T10:05:00.000Z']);
    expect(p.posledniTesty[0]).toMatchObject({ nazevPredmetu: 'Ekonomika a podnikání', delkaMs: 300_000, pocetOtazek: 1 });
  });

  it('prošlý streak ukáže jako 0 a profil bez progresu nechá bez aktivity', () => {
    const progres: SnimekProgresu = {
      ...vychoziProgres('2026-09-20T10:00:00.000Z'),
      streak: { aktualni: 9, nejdelsi: 9, posledniDen: '2026-09-20', zmrazeni: 1 },
    };
    const prehled = sestavPrehledRodiny({
      profily: [profil('teta', 'Teta', ['ekonomika-podnikani']), profil('novy', 'Nový', ['ekonomika-podnikani'])],
      progresy: [{ profilId: 'teta', jmeno: 'Teta', progres, prijato: '2026-09-20T10:00:00.000Z' }],
      udalosti: [],
      banky: [BANKA],
      vyuky: [VYUKA],
      ted,
    });
    const [teta, novy] = prehled.profily; // aktivní dřív, bez aktivity na konci
    expect(teta.jmeno).toBe('Teta');
    expect(teta.streak).toMatchObject({ aktualni: 0, nejdelsi: 9 });
    expect(novy).toMatchObject({ jmeno: 'Nový', maProgres: false, posledniAktivita: null, xp: 0 });
    expect(novy.predmety[0]).toMatchObject({ lekceHotovo: 0, lekceCelkem: 2, uspesnost: null });
  });

  it('předmět mimo studijní banky ukáže jen při aktivitě a neznámý předmět vynechá', () => {
    const progres: SnimekProgresu = {
      ...vychoziProgres('2026-09-28T10:00:00.000Z'),
      statistikyOtazek: {
        'o-t-1': { otazkaId: 'o-t-1', box: 4, spravneCelkem: 2, spatneCelkem: 0, posledniOdpoved: '2026-09-28T10:00:00.000Z' },
      },
    };
    const prehled = sestavPrehledRodiny({
      profily: [profil('matej', 'Matěj', ['zbozinalstvi'])],
      progresy: [{ profilId: 'matej', jmeno: 'Matěj', progres, prijato: '2026-09-28T10:00:00.000Z' }],
      udalosti: [],
      banky: [BANKA],
      vyuky: [VYUKA],
      ted,
    });
    const predmety = prehled.profily[0].predmety;
    expect(predmety.map((p) => p.predmetId)).toEqual(['ekonomika-podnikani']); // zbozinalstvi server nezná
    expect(predmety[0]).toMatchObject({ studuje: false, zvladnuto: 1 });
  });
});
