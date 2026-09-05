// Testy persistu store (src/stav/migrace.ts):
// - obsah predmetu (banky, vyuky) se NEpersistuje (partialize),
// - migrace v1 → v2 zahodi banky/vyuky ze stareho snapshotu,
// - migrace v2 → v3 prevede stary avatar { barvaVlasu, doplnek?, pozadi? }
//   na novy plne prizpusobitelny tvar a doplni vlastnenaVybava: [],
// - progres, sbirka, streak, XP a postup lekci se NIKDY neztrati.
import { describe, expect, it } from 'vitest';
import { VYCHOZI_AVATAR } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';
import {
  migrujPersistovanyStav,
  partializujStav,
  VERZE_PERSISTU,
} from '../src/stav/migrace';

describe('persist — partialize', () => {
  it('verze persistu je 3 (obsah mimo localStorage, novy avatar + vybava)', () => {
    expect(VERZE_PERSISTU).toBe(3);
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
