// Slice testového enginu — VLASTNÍ agent APP-TESTY.
// Drží banky otázek, průběh aktuálního testu a poslední výsledek.
import type { StateCreator } from 'zustand';
import type { BankaOtazek, TestVysledek } from '@questor/sdilene';
import type { QUESTORStav } from './store';

export interface TestySlice {
  banky: Record<string, BankaOtazek>;
  posledniVysledek: TestVysledek | null;
  // Akce a stav průběhu testu doplní agent APP-TESTY.
}

export const vytvorTestySlice: StateCreator<QUESTORStav, [], [], TestySlice> = () => ({
  banky: {},
  posledniVysledek: null,
});
