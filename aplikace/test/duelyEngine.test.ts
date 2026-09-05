// Testy klientskeho enginu duelu — limity s handicapem, timeouty, power-upy
// (50:50, zmrazeni, stit), sestaveni vysledku, trideni a merge seznamu duelu.
import { describe, expect, it } from 'vitest';
import type { BankaOtazek, Duel, Otazka, OtazkaVyber } from '@questor/sdilene';
import { vytvorNahodu } from '@questor/sdilene';
import {
  limitOtazkyPrubehu,
  muzeHratDuel,
  muzePouzitPowerup,
  odpovezVPrubehu,
  odstartujPrubeh,
  otazkyDuelu,
  pocetCekajicichVyzev,
  pouzijPowerupVPrubehu,
  rozdelDuely,
  sloucDuely,
  timeoutVPrubehu,
  vysledekZPrubehu,
  vytvorDuelPrubeh,
  zbyvaMsVPrubehu,
} from '../src/duely/engine';

// ---------------------------------------------------------------------------
// Pomucky

function otazkaVyber(id: string, obtiznost: 1 | 2 | 3 | 4 | 5 = 3): OtazkaVyber {
  return {
    id,
    temaId: 't1',
    obtiznost,
    typ: 'vyber',
    zadani: `Otazka ${id}?`,
    moznosti: ['a', 'b', 'c', 'd'],
    spravna: 0,
    vysvetleni: 'Protoze ano.',
  };
}

function banka(otazky: Otazka[]): BankaOtazek {
  return {
    predmetId: 'p',
    nazev: 'Testovaci',
    verze: 1,
    vytvoreno: '2026-09-01',
    temata: [{ id: 't1', nazev: 'Tema 1', poradi: 0 }],
    otazky,
  };
}

/** „Ted" pro linou expiraci v testech — pred vyprsenim duelu nize. */
const TED = '2026-09-04T12:00:00.000Z';

function duel(prepis: Partial<Duel> = {}): Duel {
  return {
    id: 'd1',
    predmetId: 'p',
    pocetOtazek: 5,
    otazkyIds: ['o1', 'o2'],
    vyzyvatel: { profilId: 'tata', jmeno: 'Tata' },
    souper: { profilId: 'ja', jmeno: 'Ja' },
    otevrenyProRodinu: false,
    handicap: { tata: 1, ja: 1.25 },
    stav: 'cekajici',
    vysledky: {},
    vytvoreno: '2026-09-04T10:00:00.000Z',
    vyprsi: '2026-09-05T10:00:00.000Z',
    ...prepis,
  };
}

const vysledekHrace = (body: number, casMs = 10_000) => ({
  odpovedi: [{ otazkaId: 'o1', spravne: body > 0, casMs }],
  body,
  celkovyCasMs: casMs,
  dokonceno: '2026-09-04T11:00:00.000Z',
});

// ---------------------------------------------------------------------------

describe('prubeh duelu — cas a limity', () => {
  it('limit otazky nasobi muj handicap (limit × 1.25) a zmrazeni pridava 10 s', () => {
    const d = duel();
    let prubeh = odstartujPrubeh(vytvorDuelPrubeh(d, 'ja', '2026-09-04T10:00:00.000Z'), 1000);
    const o = otazkaVyber('o1', 3); // (10 + 12) s = 22 000 ms
    expect(limitOtazkyPrubehu(prubeh, o)).toBe(27_500); // × 1.25

    const sPowerupem = pouzijPowerupVPrubehu(prubeh, 'zmrazeni-casu', o, vytvorNahodu(1));
    expect(sPowerupem).not.toBeNull();
    prubeh = sPowerupem!;
    expect(limitOtazkyPrubehu(prubeh, o)).toBe(37_500); // + 10 s
    expect(zbyvaMsVPrubehu(prubeh, o, 11_000)).toBe(27_500); // 10 s ubehlo
  });

  it('vyzyvatel bez handicapu ma zakladni limit', () => {
    const prubeh = vytvorDuelPrubeh(duel(), 'tata', '2026-09-04T10:00:00.000Z');
    expect(limitOtazkyPrubehu(prubeh, otazkaVyber('o1', 1))).toBe(14_000);
    expect(limitOtazkyPrubehu(prubeh, otazkaVyber('o1', 5))).toBe(30_000);
  });
});

describe('prubeh duelu — odpovedi a bodovani', () => {
  it('spravna odpoved da 100 + casovy bonus, spatna 0; timeout 0 a dalsi otazka', () => {
    const d = duel();
    let prubeh = odstartujPrubeh(vytvorDuelPrubeh(d, 'tata', '2026-09-04T10:00:00.000Z'), 0);
    const o1 = otazkaVyber('o1', 3); // limit 22 000

    prubeh = odpovezVPrubehu(prubeh, o1, true, 0, 5_000);
    expect(prubeh.body).toBe(150); // 100 + plny bonus
    expect(prubeh.index).toBe(1);
    expect(prubeh.zacatekOtazkyMs).toBe(5_000);

    const o2 = otazkaVyber('o2', 3);
    prubeh = timeoutVPrubehu(prubeh, o2, 30_000);
    expect(prubeh.body).toBe(150); // timeout = 0 bodu
    expect(prubeh.odpovedi[1]).toMatchObject({ otazkaId: 'o2', spravne: false, casMs: 22_000 });
    expect(prubeh.dokonceno).toBe(true); // 2 otazky duelu odehrany
  });

  it('odpoved v polovine limitu da 100 + 25 bodu (round 50 × zbyvajici/limit)', () => {
    const prubeh = odstartujPrubeh(
      vytvorDuelPrubeh(duel(), 'tata', '2026-09-04T10:00:00.000Z'),
      0,
    );
    const po = odpovezVPrubehu(prubeh, otazkaVyber('o1', 3), true, 11_000, 12_000);
    expect(po.body).toBe(125);
    expect(po.posledniBody).toBe(125);
  });

  it('vysledekZPrubehu secte body a casy vsech odpovedi', () => {
    const d = duel();
    let prubeh = odstartujPrubeh(vytvorDuelPrubeh(d, 'tata', '2026-09-04T10:00:00.000Z'), 0);
    prubeh = odpovezVPrubehu(prubeh, otazkaVyber('o1', 3), true, 2_000, 3_000);
    prubeh = odpovezVPrubehu(prubeh, otazkaVyber('o2', 3), false, 4_000, 8_000);
    const vysledek = vysledekZPrubehu(prubeh, '2026-09-04T10:05:00.000Z');
    expect(vysledek.body).toBe(prubeh.body);
    expect(vysledek.celkovyCasMs).toBe(6_000);
    expect(vysledek.odpovedi).toHaveLength(2);
    expect(vysledek.dokonceno).toBe('2026-09-04T10:05:00.000Z');
  });
});

describe('power-upy', () => {
  const d = duel({ otazkyIds: ['o1', 'o2', 'o3'] });
  const start = () =>
    odstartujPrubeh(vytvorDuelPrubeh(d, 'ja', '2026-09-04T10:00:00.000Z'), 0);

  it('50:50 skryje 2 spatne moznosti (spravna nikdy) a zapise se do odpovedi', () => {
    const o = otazkaVyber('o1');
    const prubeh = pouzijPowerupVPrubehu(start(), 'pade-na-pade', o, vytvorNahodu(7))!;
    expect(prubeh.skryteMoznosti).toHaveLength(2);
    expect(prubeh.skryteMoznosti).not.toContain(o.spravna);
    const po = odpovezVPrubehu(prubeh, o, true, 1_000, 2_000);
    expect(po.odpovedi[0].pouzityPowerup).toBe('pade-na-pade');
    expect(po.skryteMoznosti).toEqual([]); // dalsi otazka bez skryvani
  });

  it('50:50 nejde na jinou otazku nez vyberovou', () => {
    const anone: Otazka = {
      id: 'o1',
      temaId: 't1',
      obtiznost: 2,
      typ: 'anone',
      zadani: 'Plati to?',
      spravna: true,
      vysvetleni: 'Plati.',
    };
    expect(muzePouzitPowerup(start(), 'pade-na-pade', anone)).toBe(false);
    expect(pouzijPowerupVPrubehu(start(), 'pade-na-pade', anone, vytvorNahodu(1))).toBeNull();
  });

  it('kazdy typ max 1× za duel a max 1 power-up na otazku', () => {
    const o1 = otazkaVyber('o1');
    let prubeh = pouzijPowerupVPrubehu(start(), 'zmrazeni-casu', o1, vytvorNahodu(1))!;
    // Druhy power-up na TEZE otazce nejde.
    expect(muzePouzitPowerup(prubeh, 'pade-na-pade', o1)).toBe(false);
    prubeh = odpovezVPrubehu(prubeh, o1, true, 1_000, 2_000);
    const o2 = otazkaVyber('o2');
    // Zmrazeni uz je vycerpane pro cely duel, jiny typ jde.
    expect(muzePouzitPowerup(prubeh, 'zmrazeni-casu', o2)).toBe(false);
    expect(muzePouzitPowerup(prubeh, 'stit', o2)).toBe(true);
  });

  it('stit promeni PRVNI spatnou odpoved na 50 bodu, dalsi uz ne', () => {
    const o1 = otazkaVyber('o1');
    let prubeh = pouzijPowerupVPrubehu(start(), 'stit', o1, vytvorNahodu(1))!;
    expect(prubeh.stitAktivni).toBe(true);
    prubeh = odpovezVPrubehu(prubeh, o1, true, 1_000, 2_000);
    expect(prubeh.stitAktivni).toBe(true); // spravna odpoved stit nespotrebuje
    const poSpravne = prubeh.body; // 100 + round(50 × 21/22) = 148
    expect(poSpravne).toBe(148);
    prubeh = odpovezVPrubehu(prubeh, otazkaVyber('o2'), false, 1_000, 3_000);
    expect(prubeh.body).toBe(poSpravne + 50); // stit: 50 misto 0
    expect(prubeh.stitAktivni).toBe(false);
    expect(prubeh.stitSpotrebovan).toBe(true);
    prubeh = odpovezVPrubehu(prubeh, otazkaVyber('o3'), false, 1_000, 4_000);
    expect(prubeh.body).toBe(poSpravne + 50); // druha chyba uz 0
  });

  it('pred odstartovanim (intro) power-up pouzit nejde', () => {
    const prubeh = vytvorDuelPrubeh(d, 'ja', '2026-09-04T10:00:00.000Z');
    expect(muzePouzitPowerup(prubeh, 'stit', otazkaVyber('o1'))).toBe(false);
  });
});

describe('otazkyDuelu', () => {
  it('vraci otazky v poradi otazkyIds; chybejici otazka → null', () => {
    const b = banka([otazkaVyber('o2'), otazkaVyber('o1')]);
    const d = duel({ otazkyIds: ['o1', 'o2'] });
    expect(otazkyDuelu(d, b)?.map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(otazkyDuelu(duel({ otazkyIds: ['o1', 'oX'] }), b)).toBeNull();
    expect(otazkyDuelu(d, undefined)).toBeNull();
  });

  it('sada zatajena serverem (prazdne otazkyIds) → null, duel nejde hrat', () => {
    const b = banka([otazkaVyber('o1')]);
    expect(otazkyDuelu(duel({ otazkyIds: [] }), b)).toBeNull();
  });
});

describe('trideni a indikatory', () => {
  const cilenaProMe = duel({ id: 'vyzva' });
  const naTahu = duel({ id: 'na-tahu', stav: 'prijaty' });
  const cekamNaSoupere = duel({ id: 'cekam', stav: 'prijaty', vysledky: { ja: vysledekHrace(100) } });
  const mojeOtevrena = duel({
    id: 'moje-otevrena',
    vyzyvatel: { profilId: 'ja', jmeno: 'Ja' },
    souper: undefined,
    otevrenyProRodinu: true,
    handicap: { ja: 1 },
  });
  const hotovy = duel({ id: 'hotovy', stav: 'hotovy', vitezProfilId: 'ja' });
  const ciziOtevrena = duel({
    id: 'cizi-otevrena',
    vyzyvatel: { profilId: 'mama', jmeno: 'Mama' },
    souper: undefined,
    otevrenyProRodinu: true,
    handicap: { mama: 1 },
  });

  it('rozdelDuely roztridi vyzvy, rozehrane, cekajici a historii', () => {
    const r = rozdelDuely(
      [cilenaProMe, naTahu, cekamNaSoupere, mojeOtevrena, hotovy],
      [ciziOtevrena],
      'ja',
      TED,
    );
    expect(r.vyzvyProMe.map((d) => d.id)).toEqual(['vyzva']);
    expect(r.naTahu.map((d) => d.id)).toEqual(['na-tahu']);
    expect(r.cekameNaSoupere.map((d) => d.id)).toEqual(['cekam']);
    expect(r.cekaNaPrijeti.map((d) => d.id)).toEqual(['moje-otevrena']);
    expect(r.historie.map((d) => d.id)).toEqual(['hotovy']);
    expect(r.otevrene.map((d) => d.id)).toEqual(['cizi-otevrena']);
  });

  it('rozdelDuely expiruje bezici duely LOKALNE: po vyprsi patri do historie s kontumaci', () => {
    const poVyprseni = '2026-09-05T10:00:01.000Z'; // vterinu po vyprsi
    const r = rozdelDuely(
      [cilenaProMe, duel({ id: 'odehrany', stav: 'prijaty', vysledky: { ja: vysledekHrace(100) } })],
      [ciziOtevrena],
      'ja',
      poVyprseni,
    );
    expect(r.vyzvyProMe).toEqual([]);
    expect(r.naTahu).toEqual([]);
    expect(r.otevrene).toEqual([]); // vyprsela otevrena vyzva neni k prijeti
    expect(r.historie.map((d) => d.id).sort()).toEqual(['odehrany', 'vyzva']);
    const kontumace = r.historie.find((d) => d.id === 'odehrany');
    expect(kontumace?.stav).toBe('vyprsely');
    expect(kontumace?.vitezProfilId).toBe('ja'); // kdo odehral, vyhrava
    // Vyzvu nikdo neodehral → kontumace bez viteze.
    expect(r.historie.find((d) => d.id === 'vyzva')?.vitezProfilId).toBeNull();
  });

  it('pocetCekajicichVyzev = cilene na me + cizi otevrene (vyprsele se nepocitaji)', () => {
    expect(pocetCekajicichVyzev([cilenaProMe, naTahu], [ciziOtevrena], 'ja', TED)).toBe(2);
    expect(pocetCekajicichVyzev([naTahu], [], 'ja', TED)).toBe(0);
    expect(
      pocetCekajicichVyzev([cilenaProMe, naTahu], [ciziOtevrena], 'ja', '2026-09-06T00:00:00.000Z'),
    ).toBe(0);
  });

  it('muzeHratDuel: jen se souperem, bez meho vysledku, nedokonceny a nevyprsely', () => {
    expect(muzeHratDuel(cilenaProMe, 'ja', TED)).toBe(true);
    expect(muzeHratDuel(mojeOtevrena, 'ja', TED)).toBe(false); // bez soupere
    expect(muzeHratDuel(cekamNaSoupere, 'ja', TED)).toBe(false); // uz odehrano
    expect(muzeHratDuel(hotovy, 'ja', TED)).toBe(false);
    expect(muzeHratDuel(cilenaProMe, 'ja', '2026-09-05T10:00:00.000Z')).toBe(false); // vyprsel
  });
});

describe('sloucDuely', () => {
  it('lokalne odehrany vysledek neprepise server bez nej; oba vysledky → hotovy', () => {
    const lokalni = duel({
      stav: 'prijaty',
      vysledky: { ja: vysledekHrace(250, 8_000) },
    });
    const zeServeru = duel({ stav: 'prijaty', vysledky: { tata: vysledekHrace(100, 9_000) } });
    const [sloucen] = sloucDuely([zeServeru], [lokalni], 'ja');
    expect(sloucen.vysledky.ja.body).toBe(250);
    expect(sloucen.stav).toBe('hotovy');
    expect(sloucen.vitezProfilId).toBe('ja');
  });

  it('serverovy zaznam s mym vysledkem vyhrava a lokalni duel mimo odpoved serveru zustava', () => {
    const lokalniJen = duel({ id: 'stary', stav: 'hotovy', vitezProfilId: 'tata' });
    const zeServeru = duel({ vysledky: { ja: vysledekHrace(100) }, stav: 'prijaty' });
    const vysledek = sloucDuely([zeServeru], [duel({ vysledky: { ja: vysledekHrace(999) } }), lokalniJen], 'ja');
    expect(vysledek.find((d) => d.id === 'd1')?.vysledky.ja.body).toBe(100);
    expect(vysledek.some((d) => d.id === 'stary')).toBe(true);
  });

  it('zatajena sada ze serveru (prazdne otazkyIds) neprepise lokalne znamou sadu', () => {
    const lokalni = duel({ otazkyIds: ['o1', 'o2'] });
    const zeServeru = duel({ otazkyIds: [] });
    const [sloucen] = sloucDuely([zeServeru], [lokalni], 'ja');
    expect(sloucen.otazkyIds).toEqual(['o1', 'o2']);
    // Bez lokalni sady zustava zatajena (server ji vyda az s prijetim).
    const [bezLokalni] = sloucDuely([zeServeru], [], 'ja');
    expect(bezLokalni.otazkyIds).toEqual([]);
  });
});
