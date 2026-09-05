// Testy persistu store (src/stav/migrace.ts):
// - obsah predmetu (banky, vyuky) se NEpersistuje (partialize),
// - migrace v1 → v2 zahodi banky/vyuky ze stareho snapshotu,
// - migrace v2 → v3 prevede stary avatar { barvaVlasu, doplnek?, pozadi? }
//   na novy plne prizpusobitelny tvar a doplni vlastnenaVybava: [],
// - migrace v3 → v4 udela z existujicich dat profil „Student" (rovnou
//   aktivni) a osobni data necha v pracovni sade beze zmeny,
// - progres, sbirka, streak, XP a postup lekci se NIKDY neztrati.
import { describe, expect, it } from 'vitest';
import { VYCHOZI_AVATAR } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';
import type { Profil } from '../src/stav/profilySlice';
import {
  migrujPersistovanyStav,
  partializujStav,
  VERZE_PERSISTU,
} from '../src/stav/migrace';

describe('persist — partialize', () => {
  it('verze persistu je 4 (lokalni profily)', () => {
    expect(VERZE_PERSISTU).toBe(4);
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
