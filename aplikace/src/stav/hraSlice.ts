// Slice gamifikace — VLASTNÍ agent APP-HRA.
// Drží progres studenta (XP, streak, questy, sbírka, rekordy) a akce nad ním.
import type { StateCreator } from 'zustand';
import type { ProgresStudenta } from '@questor/sdilene';
import { vychoziProgres } from '@questor/sdilene';
import type { QUESTORStav } from './store';

export interface HraSlice {
  progres: ProgresStudenta;
  // Akce (zapocitejOdpoved, zapocitejTest, otevriTruhlu…) doplní agent APP-HRA.
}

export const vytvorHraSlice: StateCreator<QUESTORStav, [], [], HraSlice> = () => ({
  progres: vychoziProgres(new Date().toISOString()),
});
