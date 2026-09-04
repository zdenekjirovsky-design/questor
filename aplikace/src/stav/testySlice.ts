// Slice testového enginu — VLASTNÍ agent APP-TESTY.
// Drží banky otázek, průběh aktuálního testu (serializovatelný stav enginu)
// a poslední výsledek. Čistá logika průběhu je v ../testy/engine.ts.
import type { StateCreator } from 'zustand';
import type { BankaOtazek, TestKonfigurace, TestVysledek } from '@questor/sdilene';
import {
  dalsiOtazkaVEnginu,
  inicializujTest,
  odpovezVEnginu,
  vyhodnotTest,
  type OdpovedHodnota,
  type TestStav,
} from '../testy/engine';
import type { QUESTORStav } from './store';

export interface TestySlice {
  banky: Record<string, BankaOtazek>;
  /** Serializovatelný stav právě běžícího testu (null = žádný neběží). */
  aktualniTest: TestStav | null;
  posledniVysledek: TestVysledek | null;

  /** Spustí test z banky dle konfigurace. Vrací false, když banka/otázky chybí. */
  zacniTest(konfigurace: TestKonfigurace, vyzvaId?: string): boolean;
  /** Odpověď na aktuální otázku; propíše záznam do hraSlice (questy, Leitner, XP). */
  odpovez(hodnota: OdpovedHodnota, casMs: number): void;
  dalsiOtazka(): void;
  /** Ukončí test, sestaví TestVysledek, započítá ho v hraSlice a pošle na server. */
  dokonciTest(): void;
  /** Merge banky ze serveru — přijme jen vyšší verzi. Vrací true, když ji uložil. */
  prijmiBanku(banka: BankaOtazek): boolean;
}

// Banky NEJSOU persistované (localStorage kvóta) a neplní se ani při vzniku
// slice — obsah se načítá async po startu (../data/nacteniObsahu.ts: bundlované
// chunky + IndexedDB) a chodí sem přes prijmiBanku (přijme jen vyšší verzi).
export const vytvorTestySlice: StateCreator<QUESTORStav, [], [], TestySlice> = (set, get) => {
  return {
    banky: {},
    aktualniTest: null,
    posledniVysledek: null,

    zacniTest: (konfigurace, vyzvaId) => {
      const banka = get().banky[konfigurace.predmetId];
      if (!banka) return false;
      const stav = inicializujTest(
        banka,
        konfigurace,
        get().progres.statistikyOtazek,
        Math.random,
        new Date().toISOString(),
        vyzvaId,
      );
      if (stav.otazky.length === 0) return false;
      set({ aktualniTest: stav });
      return true;
    },

    odpovez: (hodnota, casMs) => {
      const stav = get().aktualniTest;
      if (!stav) return;
      const vysledek = odpovezVEnginu(stav, hodnota, casMs);
      if (!vysledek) return;
      set({ aktualniTest: vysledek.stav });
      // Gamifikace (XP do progresu, Leitner, questy) — akci garantuje hraSlice.
      get().zapocitejOdpoved(vysledek.zaznam, vysledek.stav.combo);
    },

    dalsiOtazka: () => {
      const stav = get().aktualniTest;
      if (!stav) return;
      set({ aktualniTest: dalsiOtazkaVEnginu(stav) });
    },

    dokonciTest: () => {
      const stav = get().aktualniTest;
      if (!stav || stav.odpovedi.length === 0) {
        // Test bez jediné odpovědi se nevyhodnocuje (např. okamžitý odchod).
        set({ aktualniTest: null });
        return;
      }
      const vysledek = vyhodnotTest(stav, new Date().toISOString(), Math.random);
      set({ aktualniTest: null, posledniVysledek: vysledek });
      get().zapocitejTest(vysledek);
      // Sync (push událost + progres) — dynamický import brání cyklu závislostí
      // a selhání sítě je tiché (offline-first).
      void import('../sync/sync')
        .then((m) => m.zaznamenejDokoncenyTest(vysledek))
        .catch(() => {});
    },

    prijmiBanku: (banka) => {
      const lokalni = get().banky[banka.predmetId];
      if (lokalni && banka.verze <= lokalni.verze) return false;
      set({ banky: { ...get().banky, [banka.predmetId]: banka } });
      return true;
    },
  };
};
