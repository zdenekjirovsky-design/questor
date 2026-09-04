// Persist konfigurace store — verze, migrace a partialize (co se uklada).
//
// Od verze 2 se obsah predmetu (banky, vyuky) NEpersistuje: localStorage ma
// kvotu ~5 MB a obsah 14 predmetu by ji pretekl. Obsah zije v nepersistovanem
// stavu (nacita se async pri startu z bundlu — ../data/nacteniObsahu.ts —
// a obsah ze serveru cachuje IndexedDB pres ../sync/uloziste.ts).
// Progres studenta, postup lekci a dalsi herni stav se persistuje dal.
import type { QUESTORStav } from './store';

export const VERZE_PERSISTU = 2;

/** Klice stavu, ktere se NEpersistuji (obsah predmetu — viz hlavicka souboru). */
const NEPERSISTOVANE_KLICE = ['banky', 'vyuky'] as const;

export type PersistovanyStav = Omit<QUESTORStav, (typeof NEPERSISTOVANE_KLICE)[number]>;

/** Partialize pro zustand persist: vynecha obsah predmetu, zbytek necha. */
export function partializujStav(stav: QUESTORStav): PersistovanyStav {
  const { banky: _banky, vyuky: _vyuky, ...zbytek } = stav;
  return zbytek;
}

/**
 * Migrace persistovaneho snapshotu na aktualni verzi.
 * v1 → v2: banky a vyuky se ze snapshotu zahodi (obsah uz neni persistovany;
 * nacte se z bundlu/IndexedDB/serveru). Progres, postup lekci, historie
 * testu, truhly atd. se ZACHOVAVAJI beze zmeny.
 */
export function migrujPersistovanyStav(stav: unknown, verzeSnapshotu: number): PersistovanyStav {
  if (verzeSnapshotu < 2 && stav !== null && typeof stav === 'object') {
    const kopie = { ...(stav as Record<string, unknown>) };
    for (const klic of NEPERSISTOVANE_KLICE) delete kopie[klic];
    return kopie as PersistovanyStav;
  }
  return stav as PersistovanyStav;
}
