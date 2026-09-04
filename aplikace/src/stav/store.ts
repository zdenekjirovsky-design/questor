// Centrální zustand store — SKLÁDÁ slice soubory, sám žádnou logiku nemá.
// Tenhle soubor je „zmrazený“: nové stavy a akce patří do slice souborů;
// pravidla persistu (verze, migrace, partialize) drží ./migrace.ts.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { vytvorTestySlice, type TestySlice } from './testySlice';
import { vytvorHraSlice, type HraSlice } from './hraSlice';
import { vytvorVyukaSlice, type VyukaSlice } from './vyukaSlice';
import { migrujPersistovanyStav, partializujStav, VERZE_PERSISTU } from './migrace';

export type QUESTORStav = TestySlice & HraSlice & VyukaSlice;

export const pouzijStav = create<QUESTORStav>()(
  persist(
    (...a) => ({
      ...vytvorTestySlice(...a),
      ...vytvorHraSlice(...a),
      ...vytvorVyukaSlice(...a),
    }),
    {
      name: 'questor-stav',
      version: VERZE_PERSISTU,
      migrate: migrujPersistovanyStav,
      partialize: partializujStav,
    },
  ),
);

// Obsah předmětů (banky, výuky) není persistovaný — po startu se načte async
// z bundlovaných chunků a IndexedDB. Dynamický import drží obsahovou cestu
// mimo počáteční JS chunk; v testech (Node, žádné window) se nespouští.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void import('../data/nacteniObsahu')
    .then((m) => m.nactiObsahPriStartu())
    .catch(() => {});
}
