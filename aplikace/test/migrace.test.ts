// Testy persistu store (src/stav/migrace.ts):
// - obsah predmetu (banky, vyuky) se NEpersistuje (partialize),
// - migrace v1 → v2 zahodi banky/vyuky ze stareho snapshotu,
// - migrace v2 → v3 prevede stary avatar { barvaVlasu, doplnek?, pozadi? }
//   na novy plne prizpusobitelny tvar a doplni vlastnenaVybava: [],
// - migrace v3 → v4 udela z existujicich dat profil „Student" (rovnou
//   aktivni) a osobni data necha v pracovni sade beze zmeny,
// - migrace v4 → v5 da profilum VSECHNY studijni banky registru; aktivni
//   banka se odvozuje z POUZIVANI (nejnovejsi test v historii profilu,
//   fallback prvni banka registru) a doplni se prazdne questyPodleBank,
// - migrace v5 → v6 doplni tydenniXpTestuPodleBank (seed z historie testu),
// - migrace v6 → v7 doplni profilum aktualizovano (LWW sync mezi zarizenimi),
// - progres, sbirka, streak, XP a postup lekci se NIKDY neztrati.
import { describe, expect, it } from 'vitest';
import { VYCHOZI_AVATAR } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';
import type { Profil } from '../src/stav/profilySlice';
import { PREDMETY } from '../src/data/predmety';
import {
  migrujPersistovanyStav,
  partializujStav,
  VERZE_PERSISTU,
} from '../src/stav/migrace';

describe('persist — partialize', () => {
  it('verze persistu je 7 (sync profilu mezi zarizenimi)', () => {
    expect(VERZE_PERSISTU).toBe(7);
  });

  it('vynechava banky a vyuky, zbytek stavu necha', () => {
    const stav = pouzijStav.getState();
    const persistovane = partializujStav(stav) as Record<string, unknown>;
    expect('banky' in persistovane).toBe(false);
    expect('vyuky' in persistovane).toBe(false);
    // Herni stav zustava.
    expect(persistovane.progres).toBe(stav.progres);
    expect(persistovane.postupLekci).toBe(stav.postupLekci);
    expect(persistovane.cekajiciTruhly).toBe(stav.cekajiciTruhly);
    expect(persistovane.historieTestu).toBe(stav.historieTestu);
    // Profily se persistuji (jsou soucasti stavu, ne obsahu predmetu).
    expect(persistovane.profily).toBe(stav.profily);
    expect(persistovane.aktivniProfilId).toBe(stav.aktivniProfilId);
    expect(persistovane.dataProfilu).toBe(stav.dataProfilu);
  });
});

describe('persist — migrace v1/v2 → v3', () => {
  const starySnapshot = {
    banky: { 'ekonomika-podnikani': { predmetId: 'ekonomika-podnikani', verze: 2 } },
    vyuky: { zbozinalstvi: { predmetId: 'zbozinalstvi', verze: 1 } },
    progres: {
      xp: 1234,
      dokonceneTesty: 7,
      streak: { aktualni: 5, nejdelsi: 9, posledniDen: '2026-09-01', zmrazeni: 2 },
      sbirka: { karty: ['smith', 'bata'], truhelBezKarty: 1 },
      avatar: { barvaVlasu: '#d16ba5', doplnek: 'bryle', pozadi: 'hvezdy' },
    },
    postupLekci: { 'zakladni-pojmy': { dokonceneBloky: [0, 1], pocetDokonceni: 1 } },
    cekajiciTruhly: ['bronzova'],
    aktualniTest: null,
  };

  it('v1: zahodi banky a vyuky, progres a postup lekci zachova', () => {
    const migrovane = migrujPersistovanyStav(starySnapshot, 1) as Record<string, unknown>;
    expect('banky' in migrovane).toBe(false);
    expect('vyuky' in migrovane).toBe(false);
    const progres = migrovane.progres as Record<string, unknown>;
    expect(progres.xp).toBe(1234);
    expect(progres.dokonceneTesty).toBe(7);
    expect(migrovane.postupLekci).toEqual({
      'zakladni-pojmy': { dokonceneBloky: [0, 1], pocetDokonceni: 1 },
    });
    expect(migrovane.cekajiciTruhly).toEqual(['bronzova']);
  });

  it('v2 → v3: stary avatar prevede na novy tvar, barvu vlasu zachova', () => {
    const { banky: _b, vyuky: _v, ...snapshotV2 } = starySnapshot;
    const migrovane = migrujPersistovanyStav(snapshotV2, 2) as Record<string, unknown>;
    const progres = migrovane.progres as Record<string, unknown>;

    expect(progres.avatar).toEqual({
      ...VYCHOZI_AVATAR,
      barvaVlasu: '#d16ba5',
      vybava: {},
    });
    // Stara pole avataru se zahodila.
    expect('doplnek' in (progres.avatar as object)).toBe(false);
    expect('pozadi' in (progres.avatar as object)).toBe(false);
    // Vlastnena vybava zacina prazdna.
    expect(progres.vlastnenaVybava).toEqual([]);
    // XP, streak, sbirka, postup lekci — nic se neztratilo.
    expect(progres.xp).toBe(1234);
    expect(progres.streak).toEqual({
      aktualni: 5,
      nejdelsi: 9,
      posledniDen: '2026-09-01',
      zmrazeni: 2,
    });
    expect(progres.sbirka).toEqual({ karty: ['smith', 'bata'], truhelBezKarty: 1 });
    expect(migrovane.postupLekci).toEqual(snapshotV2.postupLekci);
    expect(migrovane.cekajiciTruhly).toEqual(['bronzova']);
  });

  it('v1 → v3 projde obema kroky najednou (banky pryc, avatar novy)', () => {
    const migrovane = migrujPersistovanyStav(starySnapshot, 1) as Record<string, unknown>;
    expect('banky' in migrovane).toBe(false);
    const progres = migrovane.progres as Record<string, unknown>;
    expect((progres.avatar as Record<string, unknown>).stylVlasu).toBe('rozpustene');
    expect((progres.avatar as Record<string, unknown>).barvaVlasu).toBe('#d16ba5');
    expect(progres.vlastnenaVybava).toEqual([]);
  });

  it('puvodni snapshot nemutuje', () => {
    migrujPersistovanyStav(starySnapshot, 1);
    expect('banky' in starySnapshot).toBe(true);
    expect('vyuky' in starySnapshot).toBe(true);
    expect(starySnapshot.progres.avatar).toEqual({
      barvaVlasu: '#d16ba5',
      doplnek: 'bryle',
      pozadi: 'hvezdy',
    });
    expect('vlastnenaVybava' in starySnapshot.progres).toBe(false);
  });

  it('snapshot aktualni verze projde beze zmeny', () => {
    const aktualni = { progres: { xp: 5 }, postupLekci: {} };
    expect(migrujPersistovanyStav(aktualni, VERZE_PERSISTU)).toBe(aktualni);
  });

  it('prezije i nesmyslny snapshot (null, chybejici avatar)', () => {
    expect(migrujPersistovanyStav(null, 1)).toBe(null);
    const bezAvataru = migrujPersistovanyStav({ progres: { xp: 3 } }, 2) as Record<string, unknown>;
    const progres = bezAvataru.progres as Record<string, unknown>;
    expect(progres.avatar).toEqual({ ...VYCHOZI_AVATAR, vybava: {} });
    expect(progres.vlastnenaVybava).toEqual([]);
    expect(progres.xp).toBe(3);
  });
});

describe('persist — migrace v3 → v4 (lokalni profily)', () => {
  const snapshotV3 = {
    progres: {
      xp: 2500,
      dokonceneTesty: 12,
      streak: { aktualni: 4, nejdelsi: 8, posledniDen: '2026-09-03', zmrazeni: 1 },
      sbirka: { karty: ['smith'], truhelBezKarty: 2 },
      avatar: { ...VYCHOZI_AVATAR, barvaVlasu: '#123456', vybava: {} },
      vlastnenaVybava: ['bryle-kulate'],
      statistikyOtazek: {
        o1: { otazkaId: 'o1', box: 3, spravneCelkem: 5, spatneCelkem: 1, posledniOdpoved: 'x' },
      },
    },
    postupLekci: { 'zakladni-pojmy': { dokonceneBloky: [0, 1, 2], pocetDokonceni: 2 } },
    aktualniTest: null,
    posledniVysledek: null,
    questyOdmeneno: ['2026-09-03:odpovez'],
    historieTestu: [{ id: 't-1' }],
    cekajiciTruhly: ['zlata'],
  };

  it('existujici data se stanou profilem Student a ten je rovnou aktivni', () => {
    const migrovane = migrujPersistovanyStav(snapshotV3, 3) as Record<string, unknown>;
    const profily = migrovane.profily as Profil[];
    expect(profily).toHaveLength(1);
    expect(profily[0].jmeno).toBe('Student');
    expect(profily[0].id).toBeTruthy();
    expect(profily[0].pinHash).toBeUndefined();
    expect(migrovane.aktivniProfilId).toBe(profily[0].id);
    // Snimky neaktivnich profilu zacinaji prazdne — data aktivniho profilu
    // ziji dal v pracovni sade.
    expect(migrovane.dataProfilu).toEqual({});
  });

  it('NIC se neztrati — osobni data zustavaji v pracovni sade beze zmeny', () => {
    const migrovane = migrujPersistovanyStav(snapshotV3, 3) as Record<string, unknown>;
    expect(migrovane.progres).toBe(snapshotV3.progres);
    expect(migrovane.postupLekci).toBe(snapshotV3.postupLekci);
    expect(migrovane.questyOdmeneno).toBe(snapshotV3.questyOdmeneno);
    expect(migrovane.historieTestu).toBe(snapshotV3.historieTestu);
    expect(migrovane.cekajiciTruhly).toBe(snapshotV3.cekajiciTruhly);
    const progres = migrovane.progres as Record<string, unknown>;
    expect(progres.xp).toBe(2500);
    expect(progres.vlastnenaVybava).toEqual(['bryle-kulate']);
  });

  it('v1 → v4 projde vsemi kroky (banky pryc, novy avatar, profil Student)', () => {
    const staryV1 = {
      banky: { p: { predmetId: 'p', verze: 1 } },
      progres: { xp: 77, avatar: { barvaVlasu: '#abcdef' } },
    };
    const migrovane = migrujPersistovanyStav(staryV1, 1) as Record<string, unknown>;
    expect('banky' in migrovane).toBe(false);
    const progres = migrovane.progres as Record<string, unknown>;
    expect(progres.xp).toBe(77);
    expect((progres.avatar as Record<string, unknown>).barvaVlasu).toBe('#abcdef');
    expect((migrovane.profily as Profil[])[0].jmeno).toBe('Student');
    expect(migrovane.aktivniProfilId).toBe((migrovane.profily as Profil[])[0].id);
  });

  it('id profilu Student je nahodne (dve migrace = dva ruzne id)', () => {
    const a = migrujPersistovanyStav(snapshotV3, 3) as Record<string, unknown>;
    const b = migrujPersistovanyStav(snapshotV3, 3) as Record<string, unknown>;
    expect((a.profily as Profil[])[0].id).not.toBe((b.profily as Profil[])[0].id);
  });
});

describe('persist — migrace v4 → v5 (studijni banky per profil)', () => {
  const snapshotV4 = {
    profily: [
      { id: 'p-kuba', jmeno: 'Kuba', barva: '#8b5cf6' },
      { id: 'p-mama', jmeno: 'Máma', barva: '#f472b6', pinHash: 'abc' },
    ],
    aktivniProfilId: 'p-kuba',
    dataProfilu: {
      'p-mama': {
        progres: { xp: 42 },
        postupLekci: { tema: { dokonceneBloky: [0] } },
        questyOdmeneno: ['2026-09-04:odpovez'],
      },
    },
    progres: { xp: 900 },
    postupLekci: {},
    questyOdmeneno: [],
    historieTestu: [],
    cekajiciTruhly: [],
  };

  it('kazdy profil dostane VSECHNY banky registru a aktivni je prvni (zadna zmena chovani)', () => {
    const migrovane = migrujPersistovanyStav(snapshotV4, 4) as Record<string, unknown>;
    const profily = migrovane.profily as Profil[];
    const vsechna = PREDMETY.map((p) => p.id);
    expect(profily).toHaveLength(2);
    for (const profil of profily) {
      expect(profil.predmety).toEqual(vsechna);
      expect(profil.aktivniPredmetId).toBe(vsechna[0]);
    }
    // Ostatni pole profilu zustavaji (vc. pinHash).
    expect(profily[1].pinHash).toBe('abc');
    expect(profily[0].jmeno).toBe('Kuba');
    expect(migrovane.aktivniProfilId).toBe('p-kuba');
  });

  it('snimky dataProfilu i pracovni sada dostanou prazdne questyPodleBank, NIC se neztrati', () => {
    const migrovane = migrujPersistovanyStav(snapshotV4, 4) as Record<string, unknown>;
    const dataProfilu = migrovane.dataProfilu as Record<string, Record<string, unknown>>;
    expect(dataProfilu['p-mama'].questyPodleBank).toEqual({});
    // Osobni data snimku zustavaji beze zmeny.
    expect(dataProfilu['p-mama'].progres).toEqual({ xp: 42 });
    expect(dataProfilu['p-mama'].questyOdmeneno).toEqual(['2026-09-04:odpovez']);
    expect(dataProfilu['p-mama'].postupLekci).toEqual({ tema: { dokonceneBloky: [0] } });
    // Pracovni sada aktivniho profilu netknuta + prazdny slovnik questu bank.
    expect(migrovane.progres).toBe(snapshotV4.progres);
    expect(migrovane.questyPodleBank).toEqual({});
  });

  it('v1 → v5 projde vsemi kroky najednou', () => {
    const staryV1 = {
      banky: { p: { predmetId: 'p', verze: 1 } },
      progres: { xp: 77, avatar: { barvaVlasu: '#abcdef' } },
    };
    const migrovane = migrujPersistovanyStav(staryV1, 1) as Record<string, unknown>;
    const profily = migrovane.profily as Profil[];
    expect(profily[0].jmeno).toBe('Student');
    expect(profily[0].predmety).toEqual(PREDMETY.map((p) => p.id));
    expect(profily[0].aktivniPredmetId).toBe(PREDMETY[0].id);
    expect(migrovane.questyPodleBank).toEqual({});
    expect((migrovane.progres as Record<string, unknown>).xp).toBe(77);
  });

  it('prezije i nesmyslny snapshot v4 (chybejici profily/dataProfilu)', () => {
    const migrovane = migrujPersistovanyStav({ progres: { xp: 1 } }, 4) as Record<string, unknown>;
    expect(migrovane.questyPodleBank).toEqual({});
    expect((migrovane.progres as Record<string, unknown>).xp).toBe(1);
  });

  it('aktivni banka se odvozuje z historie testu profilu (nejnovejsi test)', () => {
    const snapshot = {
      ...snapshotV4,
      // Pracovni sada aktivniho profilu (p-kuba): nejnovejsi test je PRVNI
      // (zapocitejTest predrazuje); neznamy predmet se preskakuje.
      historieTestu: [
        { id: 't3', konfigurace: { predmetId: 'uz-neexistuje' } },
        { id: 't2', konfigurace: { predmetId: 'fyzika' } },
        { id: 't1', konfigurace: { predmetId: 'matematika' } },
      ],
      dataProfilu: {
        'p-mama': {
          ...snapshotV4.dataProfilu['p-mama'],
          historieTestu: [{ id: 't9', konfigurace: { predmetId: 'zaklady-vareni' } }],
        },
      },
    };
    const migrovane = migrujPersistovanyStav(snapshot, 4) as Record<string, unknown>;
    const profily = migrovane.profily as Profil[];
    expect(profily[0].aktivniPredmetId).toBe('fyzika'); // p-kuba (aktivni, pracovni sada)
    expect(profily[1].aktivniPredmetId).toBe('zaklady-vareni'); // p-mama (snimek)
    // Nabidka bank zustava plna (v4 zadny vyber nemel).
    expect(profily[0].predmety).toEqual(PREDMETY.map((p) => p.id));
  });

  it('bez pouzitelne historie spadne aktivni banka na prvni z registru', () => {
    const snapshot = {
      ...snapshotV4,
      historieTestu: [{ id: 't1', konfigurace: { predmetId: 'neznamy-predmet' } }, null, 'vadny'],
    };
    const migrovane = migrujPersistovanyStav(snapshot, 4) as Record<string, unknown>;
    const profily = migrovane.profily as Profil[];
    expect(profily[0].aktivniPredmetId).toBe(PREDMETY[0].id);
    expect(profily[1].aktivniPredmetId).toBe(PREDMETY[0].id);
  });
});

describe('persist — migrace v5 → v6 (tydenni XP z testu per banka)', () => {
  const snapshotV5 = {
    profily: [
      {
        id: 'p-kuba',
        jmeno: 'Kuba',
        barva: '#8b5cf6',
        predmety: ['matematika', 'fyzika'],
        aktivniPredmetId: 'matematika',
      },
    ],
    aktivniProfilId: 'p-kuba',
    dataProfilu: {
      'p-mama': {
        progres: { xp: 42 },
        historieTestu: [
          {
            id: 'm1',
            konfigurace: { predmetId: 'zaklady-vareni' },
            ziskaneXp: 55,
            konec: '2026-09-01T10:00:00.000Z',
          },
        ],
      },
    },
    progres: { xp: 900 },
    historieTestu: [
      {
        id: 't1',
        konfigurace: { predmetId: 'matematika' },
        ziskaneXp: 100,
        konec: '2026-09-01T10:00:00.000Z', // pondeli tydne 2026-08-31
      },
      {
        id: 't2',
        konfigurace: { predmetId: 'matematika' },
        ziskaneXp: 50,
        konec: '2026-08-25T10:00:00.000Z', // pondeli tydne 2026-08-24
      },
      {
        id: 't3',
        konfigurace: { predmetId: 'fyzika' },
        ziskaneXp: 70,
        konec: '2026-09-01T12:00:00.000Z',
      },
      { id: 'vadny', konfigurace: { predmetId: 'fyzika' }, ziskaneXp: 10, konec: 'neni-datum' },
    ],
    questyPodleBank: {},
  };

  it('seedne agregat z historie testu pracovni sady i snimku', () => {
    const migrovane = migrujPersistovanyStav(snapshotV5, 5) as Record<string, unknown>;
    expect(migrovane.tydenniXpTestuPodleBank).toEqual({
      matematika: { '2026-08-31': 100, '2026-08-24': 50 },
      fyzika: { '2026-08-31': 70 },
    });
    const dataProfilu = migrovane.dataProfilu as Record<string, Record<string, unknown>>;
    expect(dataProfilu['p-mama'].tydenniXpTestuPodleBank).toEqual({
      'zaklady-vareni': { '2026-08-31': 55 },
    });
    // Nic jineho se nemeni (profilum pribyva jen `aktualizovano` z kroku v7).
    expect(migrovane.progres).toBe(snapshotV5.progres);
    expect(migrovane.historieTestu).toBe(snapshotV5.historieTestu);
    expect(dataProfilu['p-mama'].progres).toEqual({ xp: 42 });
    expect(migrovane.profily).toEqual([
      { ...snapshotV5.profily[0], aktualizovano: expect.any(String) },
    ]);
  });

  it('prezije snapshot bez historie (prazdny agregat)', () => {
    const migrovane = migrujPersistovanyStav({ progres: { xp: 1 } }, 5) as Record<string, unknown>;
    expect(migrovane.tydenniXpTestuPodleBank).toEqual({});
    expect((migrovane.progres as Record<string, unknown>).xp).toBe(1);
  });

  it('v1 → v6 projde vsemi kroky najednou', () => {
    const staryV1 = {
      banky: { p: { predmetId: 'p', verze: 1 } },
      progres: { xp: 77, avatar: { barvaVlasu: '#abcdef' } },
    };
    const migrovane = migrujPersistovanyStav(staryV1, 1) as Record<string, unknown>;
    expect((migrovane.profily as Profil[])[0].jmeno).toBe('Student');
    expect(migrovane.questyPodleBank).toEqual({});
    expect(migrovane.tydenniXpTestuPodleBank).toEqual({});
    expect((migrovane.progres as Record<string, unknown>).xp).toBe(77);
  });
});

// ---------------------------------------------------------------------------

describe('persist — migrace v6 → v7 (sync profilu mezi zarizenimi)', () => {
  it('kazdy profil dostane aktualizovano (soucasny cas), uz pritomne se zachovava', () => {
    const snapshotV6 = {
      profily: [
        {
          id: 'p-kuba',
          jmeno: 'Kuba',
          barva: '#8b5cf6',
          predmety: ['matematika'],
          aktivniPredmetId: 'matematika',
        },
        {
          id: 'p-mama',
          jmeno: 'Mama',
          barva: '#f5b942',
          predmety: ['chemie'],
          aktivniPredmetId: 'chemie',
          aktualizovano: '2026-01-01T00:00:00.000Z',
        },
      ],
      progres: { xp: 5 },
    };
    const pred = Date.now();
    const migrovane = migrujPersistovanyStav(snapshotV6, 6) as Record<string, unknown>;
    const profily = migrovane.profily as Profil[];
    expect(typeof profily[0].aktualizovano).toBe('string');
    const cas = new Date(profily[0].aktualizovano).getTime();
    expect(cas).toBeGreaterThanOrEqual(pred - 1000);
    expect(cas).toBeLessThanOrEqual(Date.now() + 1000);
    // Uz pritomna hodnota (nemelo by nastat) zustava.
    expect(profily[1].aktualizovano).toBe('2026-01-01T00:00:00.000Z');
    // Priznak naServeru se NEdoplnuje — lokalni profil se pri merge nemaze.
    expect('naServeru' in profily[0]).toBe(false);
    // Nic jineho se nemeni.
    expect(migrovane.progres).toBe(snapshotV6.progres);
  });

  it('v1 → v7 projde vsemi kroky najednou (profil Student ma aktualizovano)', () => {
    const staryV1 = {
      banky: { p: { predmetId: 'p', verze: 1 } },
      progres: { xp: 77, avatar: { barvaVlasu: '#abcdef' } },
    };
    const migrovane = migrujPersistovanyStav(staryV1, 1) as Record<string, unknown>;
    const profil = (migrovane.profily as Profil[])[0];
    expect(profil.jmeno).toBe('Student');
    expect(typeof profil.aktualizovano).toBe('string');
    expect(profil.aktualizovano.length).toBeGreaterThan(4);
  });

  it('prezije snapshot bez profily (nesmyslny stav)', () => {
    const migrovane = migrujPersistovanyStav({ progres: { xp: 1 } }, 6) as Record<string, unknown>;
    expect(migrovane.profily).toBeUndefined();
    expect((migrovane.progres as Record<string, unknown>).xp).toBe(1);
  });
});
