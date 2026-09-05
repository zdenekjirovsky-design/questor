// Testy duelovych akci hraSlice — zasoba power-upu (truhla → spotreba
// v duelu), prubeh me pulky duelu pres store a trofeje (head-to-head,
// tituly, kazdy duel jen jednou + ochrana proti dvojimu zapocteni).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BankaOtazek, Duel, VysledekDuelu } from '@questor/sdilene';
import { TITUL_VITEZNA_VLNA, titulPostrach } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';

const testovaciBanka: BankaOtazek = {
  predmetId: 'p',
  nazev: 'Testovaci obor',
  verze: 1,
  vytvoreno: '2026-09-01',
  temata: [{ id: 't1', nazev: 'Tema 1', poradi: 0 }],
  otazky: (['o1', 'o2'] as const).map((id) => ({
    id,
    temaId: 't1',
    obtiznost: 3 as const,
    typ: 'vyber' as const,
    zadani: `Otazka ${id}?`,
    moznosti: ['a', 'b', 'c', 'd'],
    spravna: 0,
    vysvetleni: 'Protoze ano.',
  })),
};

function duel(prepis: Partial<Duel> = {}): Duel {
  return {
    id: 'd1',
    predmetId: 'p',
    pocetOtazek: 5,
    otazkyIds: ['o1', 'o2'],
    vyzyvatel: { profilId: 'tata', jmeno: 'Tata' },
    souper: { profilId: 'ja', jmeno: 'Ja' },
    otevrenyProRodinu: false,
    handicap: { tata: 1, ja: 1 },
    stav: 'cekajici',
    vysledky: {},
    vytvoreno: '2026-09-04T10:00:00.000Z',
    // Daleko v budoucnu — testy akci nesmi narazit na linou expiraci.
    vyprsi: '2100-01-01T00:00:00.000Z',
    ...prepis,
  };
}

function vysledekHrace(body: number, casMs = 9_000): VysledekDuelu {
  return {
    odpovedi: [{ otazkaId: 'o1', spravne: body > 0, casMs }],
    body,
    celkovyCasMs: casMs,
    dokonceno: '2026-09-04T11:00:00.000Z',
  };
}

beforeEach(() => {
  pouzijStav.getState().resetujProgres();
  pouzijStav.setState({
    profily: [
      {
        id: 'ja',
        jmeno: 'Ja',
        barva: '#8b5cf6',
        predmety: [],
        aktivniPredmetId: '',
        aktualizovano: new Date().toISOString(),
      },
    ],
    aktivniProfilId: 'ja',
    banky: { p: testovaciBanka },
    duely: [],
    otevreneDuely: [],
    aktualniDuel: null,
    duelyZapocitane: [],
    noveTituly: [],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('power-upy z truhly', () => {
  it('odmena powerup z truhly pricte kus do zasoby v progresu', () => {
    pouzijStav.setState({ cekajiciTruhly: ['bronzova'] });
    // Bronzova pasma: karta <0.20, vybava <0.32, POWERUP <0.42. Prvni los
    // 0.35 → powerup, druhy los 0.1 → typ index 0 (pade-na-pade).
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.35).mockReturnValueOnce(0.1);

    const odmena = pouzijStav.getState().otevriTruhluAkce('bronzova');

    expect(odmena).toEqual({ typ: 'powerup', powerupTyp: 'pade-na-pade' });
    expect(pouzijStav.getState().progres.powerupy?.['pade-na-pade']).toBe(1);
  });
});

describe('prubeh duelu pres store', () => {
  it('zacni → odstartuj → odpovedi → vysledek v duelu a prazdny aktualniDuel', () => {
    pouzijStav.setState({ duely: [duel()] });

    expect(pouzijStav.getState().zacniDuelAkce('d1')).toBe(true);
    expect(pouzijStav.getState().aktualniDuel?.zahajeno).toBe(false);
    pouzijStav.getState().odstartujDuelAkce();
    expect(pouzijStav.getState().aktualniDuel?.zahajeno).toBe(true);

    pouzijStav.getState().odpovezVDueluAkce({ typ: 'vyber', vybrana: 0 }, 2_000); // spravne
    expect(pouzijStav.getState().aktualniDuel?.index).toBe(1);
    pouzijStav.getState().odpovezVDueluAkce(null, 0); // timeout = 0 bodu

    const stav = pouzijStav.getState();
    expect(stav.aktualniDuel).toBeNull();
    const muj = stav.duely[0].vysledky['ja'];
    expect(muj).toBeDefined();
    expect(muj.odpovedi).toHaveLength(2);
    expect(muj.odpovedi[1].spravne).toBe(false);
    expect(muj.body).toBeGreaterThanOrEqual(100);
    // Vysledek cileneho soupere je zaroven prijeti vyzvy.
    expect(stav.duely[0].stav).toBe('prijaty');
  });

  it('kdyz souper uz hral, muj vysledek duel uzavre a zapocita trofeje', () => {
    pouzijStav.setState({
      duely: [duel({ stav: 'prijaty', vysledky: { tata: vysledekHrace(50) } })],
    });

    pouzijStav.getState().zacniDuelAkce('d1');
    pouzijStav.getState().odstartujDuelAkce();
    pouzijStav.getState().odpovezVDueluAkce({ typ: 'vyber', vybrana: 0 }, 1_000);
    pouzijStav.getState().odpovezVDueluAkce({ typ: 'vyber', vybrana: 0 }, 1_000);

    const stav = pouzijStav.getState();
    expect(stav.duely[0].stav).toBe('hotovy');
    expect(stav.duely[0].vitezProfilId).toBe('ja');
    expect(stav.duelyZapocitane).toContain('d1');
    expect(stav.progres.trofeje?.dvojice['tata']).toMatchObject({
      vyhry: 1,
      prohry: 0,
      serieVyher: 1,
    });
  });

  it('zacniDuelAkce odmitne duel bez soupere, dohrany, s neznamou otazkou i vyprsely', () => {
    pouzijStav.setState({
      duely: [
        duel({ id: 'bez-soupere', souper: undefined, otevrenyProRodinu: true, handicap: { tata: 1 } }),
        duel({ id: 'hotovy', stav: 'hotovy', vitezProfilId: 'ja' }),
        duel({ id: 'cizi-otazky', otazkyIds: ['o1', 'oX'] }),
        duel({ id: 'vyprsely-termin', vyprsi: '2020-01-01T00:00:00.000Z' }),
        duel({ id: 'zatajena-sada', otazkyIds: [] }),
      ],
    });
    expect(pouzijStav.getState().zacniDuelAkce('bez-soupere')).toBe(false);
    expect(pouzijStav.getState().zacniDuelAkce('hotovy')).toBe(false);
    expect(pouzijStav.getState().zacniDuelAkce('cizi-otazky')).toBe(false);
    // Lina expirace i lokalne: po 24h terminu duel nejde spustit (offline cheat).
    expect(pouzijStav.getState().zacniDuelAkce('vyprsely-termin')).toBe(false);
    // Server sadu adresatovi pred prijetim zatajuje — bez ni hrat nejde.
    expect(pouzijStav.getState().zacniDuelAkce('zatajena-sada')).toBe(false);
  });

  it('duel vyprsely BEHEM hrani se uzavre kontumaci bez meho vysledku (zadne trofeje z vyhry)', () => {
    // Souper odehral vcas; ja zacinam pred terminem, dohravam po nem.
    pouzijStav.setState({
      duely: [duel({ stav: 'prijaty', vysledky: { tata: vysledekHrace(150) } })],
    });
    pouzijStav.getState().zacniDuelAkce('d1');
    pouzijStav.getState().odstartujDuelAkce();
    pouzijStav.getState().odpovezVDueluAkce({ typ: 'vyber', vybrana: 0 }, 1_000);
    // Mezi odpovedmi duel vyprsi (termin v minulosti).
    pouzijStav.setState({
      duely: [
        duel({
          stav: 'prijaty',
          vysledky: { tata: vysledekHrace(150) },
          vyprsi: '2020-01-01T00:00:00.000Z',
        }),
      ],
    });
    pouzijStav.getState().odpovezVDueluAkce({ typ: 'vyber', vybrana: 0 }, 1_000);

    const stav = pouzijStav.getState();
    expect(stav.aktualniDuel).toBeNull();
    const uzavreny = stav.duely[0];
    expect(uzavreny.stav).toBe('vyprsely');
    expect(uzavreny.vysledky['ja']).toBeUndefined(); // pozdni vysledek neplati
    expect(uzavreny.vitezProfilId).toBe('tata'); // kontumace: kdo odehral, vyhrava
    // Trofeje z kontumace: moje PROHRA (zadna podvodna vyhra ani serie).
    expect(stav.duelyZapocitane).toContain('d1');
    expect(stav.progres.trofeje?.dvojice['tata']).toMatchObject({
      vyhry: 0,
      prohry: 1,
      serieVyher: 0,
    });
  });

  it('pouzijPowerupAkce spotrebuje kus ze zasoby a druhe pouziti odmitne', () => {
    pouzijStav.setState({ duely: [duel()] });
    pouzijStav.setState({
      progres: {
        ...pouzijStav.getState().progres,
        powerupy: { 'pade-na-pade': 1, 'zmrazeni-casu': 0, stit: 0 },
      },
    });
    pouzijStav.getState().zacniDuelAkce('d1');
    pouzijStav.getState().odstartujDuelAkce();

    expect(pouzijStav.getState().pouzijPowerupAkce('zmrazeni-casu')).toBe(false); // dosla zasoba
    expect(pouzijStav.getState().pouzijPowerupAkce('pade-na-pade', () => 0.5)).toBe(true);
    expect(pouzijStav.getState().progres.powerupy?.['pade-na-pade']).toBe(0);
    expect(pouzijStav.getState().aktualniDuel?.skryteMoznosti).toHaveLength(2);
    expect(pouzijStav.getState().pouzijPowerupAkce('pade-na-pade')).toBe(false); // uz pouzity
  });
});

describe('prijmiDuely a trofeje', () => {
  it('duel dokonceny uz pri prvnim stazeni se jen oznaci (trofeje nezdvoji)', () => {
    pouzijStav
      .getState()
      .prijmiDuely([duel({ stav: 'hotovy', vitezProfilId: 'ja', vysledky: { ja: vysledekHrace(100), tata: vysledekHrace(50) } })], []);

    const stav = pouzijStav.getState();
    expect(stav.duelyZapocitane).toContain('d1');
    expect(stav.progres.trofeje?.duelyCelkem ?? 0).toBe(0); // nezapocteno
  });

  it('dokonceni lokalne znameho beziciho duelu trofeje zapocita a udeli tituly za serii', () => {
    const bezici = [1, 2, 3].map((i) =>
      duel({ id: `d${i}`, vytvoreno: `2026-09-0${i}T10:00:00.000Z`, stav: 'prijaty' }),
    );
    pouzijStav.setState({ duely: bezici });

    const dokoncene = bezici.map((d) =>
      ({
        ...d,
        stav: 'hotovy' as const,
        vitezProfilId: 'ja',
        vysledky: { ja: vysledekHrace(200), tata: vysledekHrace(100) },
      }),
    );
    pouzijStav.getState().prijmiDuely(dokoncene, []);

    const stav = pouzijStav.getState();
    const trofeje = stav.progres.trofeje!;
    expect(trofeje.dvojice['tata']).toMatchObject({ vyhry: 3, serieVyher: 3 });
    expect(trofeje.duelyCelkem).toBe(3);
    expect(trofeje.tituly).toContain(TITUL_VITEZNA_VLNA);
    expect(trofeje.tituly).toContain(titulPostrach('Testovaci obor'));
    expect(stav.noveTituly).toContain(TITUL_VITEZNA_VLNA);
    // Opakovany pull uz nic nepriicita.
    pouzijStav.getState().prijmiDuely(dokoncene, []);
    expect(pouzijStav.getState().progres.trofeje?.duelyCelkem).toBe(3);
  });

  it('lokalne odehrany vysledek prezije pull bez nej a otevrene cizi vyzvy se ulozi', () => {
    const muj = vysledekHrace(150);
    pouzijStav.setState({ duely: [duel({ vysledky: { ja: muj } })] });
    const otevrena = duel({
      id: 'otevrena',
      vyzyvatel: { profilId: 'mama', jmeno: 'Mama' },
      souper: undefined,
      otevrenyProRodinu: true,
      handicap: { mama: 1 },
    });

    pouzijStav.getState().prijmiDuely([duel()], [otevrena]);

    const stav = pouzijStav.getState();
    expect(stav.duely[0].vysledky['ja']).toEqual(muj);
    expect(stav.otevreneDuely.map((d) => d.id)).toEqual(['otevrena']);
  });
});
