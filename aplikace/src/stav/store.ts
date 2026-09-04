// Centrální zustand store — SKLÁDÁ slice soubory, sám žádnou logiku nemá.
// Tenhle soubor je „zmrazený“: nové stavy a akce patří do slice souborů.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { vytvorTestySlice, type TestySlice } from './testySlice';
import { vytvorHraSlice, type HraSlice } from './hraSlice';
import { vytvorVyukaSlice, type VyukaSlice } from './vyukaSlice';

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
      version: 1,
    },
  ),
);
