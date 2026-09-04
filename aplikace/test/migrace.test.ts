// Testy persistu store (src/stav/migrace.ts):
// - obsah predmetu (banky, vyuky) se NEpersistuje (partialize),
// - migrace v1 → v2 zahodi banky/vyuky ze stareho snapshotu, ale ZACHOVA
//   progres studenta, postup lekci a dalsi herni stav.
import { describe, expect, it } from 'vitest';
import { pouzijStav } from '../src/stav/store';
import {
  migrujPersistovanyStav,
  partializujStav,
  VERZE_PERSISTU,
} from '../src/stav/migrace';

describe('persist — partialize', () => {
  it('verze persistu je 2 (obsah mimo localStorage)', () => {
    expect(VERZE_PERSISTU).toBe(2);
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

describe('persist — migrace v1 → v2', () => {
  const starySnapshot = {
    banky: { 'ekonomika-podnikani': { predmetId: 'ekonomika-podnikani', verze: 2 } },
    vyuky: { zbozinalstvi: { predmetId: 'zbozinalstvi', verze: 1 } },
    progres: { xp: 1234, dokonceneTesty: 7 },
    postupLekci: { 'zakladni-pojmy': { dokonceneBloky: [0, 1], pocetDokonceni: 1 } },
    cekajiciTruhly: ['bronzova'],
    aktualniTest: null,
  };

  it('zahodi banky a vyuky, progres a postup lekci zachova', () => {
    const migrovane = migrujPersistovanyStav(starySnapshot, 1) as Record<string, unknown>;
    expect('banky' in migrovane).toBe(false);
    expect('vyuky' in migrovane).toBe(false);
    expect(migrovane.progres).toEqual({ xp: 1234, dokonceneTesty: 7 });
    expect(migrovane.postupLekci).toEqual({
      'zakladni-pojmy': { dokonceneBloky: [0, 1], pocetDokonceni: 1 },
    });
    expect(migrovane.cekajiciTruhly).toEqual(['bronzova']);
  });

  it('puvodni snapshot nemutuje', () => {
    migrujPersistovanyStav(starySnapshot, 1);
    expect('banky' in starySnapshot).toBe(true);
    expect('vyuky' in starySnapshot).toBe(true);
  });

  it('snapshot aktualni verze projde beze zmeny', () => {
    const aktualni = { progres: { xp: 5 }, postupLekci: {} };
    expect(migrujPersistovanyStav(aktualni, VERZE_PERSISTU)).toBe(aktualni);
  });

  it('prezije i nesmyslny snapshot (null)', () => {
    expect(migrujPersistovanyStav(null, 1)).toBe(null);
  });
});
