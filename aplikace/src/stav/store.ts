// Centrální zustand store — SKLÁDÁ slice soubory, sám žádnou logiku nemá.
// Tenhle soubor je „zmrazený“: nové stavy a akce patří do slice souborů.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { vytvorTestySlice, type TestySlice } from './testySlice';
import { vytvorHraSlice, type HraSlice } from './hraSlice';

export type QUESTORStav = TestySlice & HraSlice;

export const pouzijStav = create<QUESTORStav>()(
  persist(
    (...a) => ({
      ...vytvorTestySlice(...a),
      ...vytvorHraSlice(...a),
    }),
    {
      name: 'questor-stav',
      version: 1,
    },
  ),
);
