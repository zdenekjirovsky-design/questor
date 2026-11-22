// Slice testového enginu — VLASTNÍ agent APP-TESTY.
// Drží banky otázek, průběh aktuálního testu (serializovatelný stav enginu)
// a poslední výsledek. Čistá logika průběhu je v ../testy/engine.ts.
// Bleskovky (rychlý dril, ../testy/blesk.ts) jedou stejným stavem
// `aktualniTest` — kolo se pozná podle pole `blesk`.
import type { StateCreator } from 'zustand';
import { denZData } from '@questor/sdilene';
import type { BankaOtazek, Otazka, TestKonfigurace, TestVysledek } from '@questor/sdilene';
import {
  dalsiOtazkaVEnginu,
  inicializujBlesk,
  inicializujBleskZOtazek,
  inicializujTest,
  odpovezVEnginu,
  pocitaSeJakoBleskovky,
  vyhodnotTest,
  type OdpovedHodnota,
  type TestStav,
} from '../testy/engine';
import { bylaDnesTruhlaZBlesku, jeKoloBleskovek, type BleskKonfigurace } from '../testy/blesk';
import type { QUESTORStav } from './store';

export interface TestySlice {
  banky: Record<string, BankaOtazek>;
  /** Serializovatelný stav právě běžícího testu (null = žádný neběží). */
  aktualniTest: TestStav | null;
  posledniVysledek: TestVysledek | null;

  /** Spustí test z banky dle konfigurace. Vrací false, když banka/otázky chybí. */
  zacniTest(konfigurace: TestKonfigurace, vyzvaId?: string): boolean;
  /**
   * Spustí kolo bleskovek (jen bleskové otázky banky, vážený výběr podle
   * Leitnerových boxů). Vrací false, když banka chybí nebo žádnou bleskovou
   * otázku pro daný výběr témat nemá.
   */
  zacniBlesk(konfigurace: BleskKonfigurace): boolean;
  /**
   * Spustí OPRAVNÉ kolo bleskovek z daných otázek banky (chyby předchozího
   * kola, v daném pořadí). Otázky, které banka už nezná, se vynechají;
   * vrací false, když žádná nezbyde. Opravné kolo nedává truhlu.
   */
  zacniBleskOpravu(predmetId: string, otazkaIds: string[]): boolean;
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

    zacniBlesk: (konfigurace) => {
      const banka = get().banky[konfigurace.predmetId];
      if (!banka) return false;
      const stav = inicializujBlesk(
        banka,
        konfigurace,
        get().progres.statistikyOtazek,
        Math.random,
        new Date().toISOString(),
      );
      if (stav.otazky.length === 0) return false;
      set({ aktualniTest: stav });
      return true;
    },

    zacniBleskOpravu: (predmetId, otazkaIds) => {
      const banka = get().banky[predmetId];
      if (!banka) return false;
      const podleId = new Map(banka.otazky.map((o) => [o.id, o]));
      const otazky = otazkaIds.flatMap((id): Otazka[] => {
        const otazka = podleId.get(id);
        return otazka ? [otazka] : [];
      });
      // Výběr témat původního kola se přenáší do konfigurace opravy, aby
      // „Další kolo“ po opravě zůstalo u stejných témat (typicky dril z lekce).
      const predchozi = get().posledniVysledek;
      const temataId =
        predchozi && jeKoloBleskovek(predchozi) && predchozi.konfigurace.predmetId === predmetId
          ? predchozi.konfigurace.temataId
          : undefined;
      const stav = inicializujBleskZOtazek(predmetId, otazky, new Date().toISOString(), temataId);
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
      // Koeficient XP (blesková otázka v jakémkoli testu) se bere z enginu,
      // aby XP v progresu sedělo se ziskaneXp výsledku.
      get().zapocitejOdpoved(vysledek.zaznam, vysledek.stav.combo, vysledek.koeficientXp);
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
      const ted = new Date();
      // Truhla z rychlých otázek je DENNÍ DÁVKA: dává ji jen první kolo dne,
      // které na ni dosáhne (úspěšnost jako u testu), opravné kolo nikdy.
      // Dávku sdílí bleskovky s běžnými testy, ve kterých je aspoň polovina
      // otázek blesková (pocitaSeJakoBleskovky). „Už dnes byla“ se pozná
      // z historie testů — žádný nový persistovaný stav.
      const truhlaZBlesku =
        pocitaSeJakoBleskovky(stav) &&
        stav.blesk?.oprava !== true &&
        !bylaDnesTruhlaZBlesku(get().historieTestu, denZData(ted));
      const vysledek = vyhodnotTest(stav, ted.toISOString(), Math.random, { truhlaZBlesku });
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
