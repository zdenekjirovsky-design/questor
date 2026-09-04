// Orchestrace synchronizace (offline-first):
// - push: fronta neodeslaných událostí + snapshot progresu,
// - pull: banky (jen vyšší verze → merge do testySlice) a výzvy (→ hraSlice).
// Selhání sítě je TICHÉ — žádné chybové UI uprostřed hry, jen nenápadný
// indikátor stavu (Nastavení / Domů) přes odběr stavu níže.
import { validujBanku } from '@questor/sdilene';
import type { TestVysledek } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { nactiSyncNastaveni, vytvorKlienta, vychoziUloziste } from './klient';
import { SyncFronta } from './fronta';

// ---------------------------------------------------------------------------
// Stav synchronizace (pro indikátor v UI — useSyncExternalStore)

export interface StavSynchronizace {
  bezi: boolean;
  /** ISO čas posledního úspěšného syncu (přežívá restart). */
  posledniUspech: string | null;
  /** Popis poslední chyby (jen pro nenápadný indikátor, ne pro vyskakovací UI). */
  posledniChyba: string | null;
  /** Počet položek čekajících ve frontě. */
  veFronte: number;
}

const KLIC_POSLEDNI_USPECH = 'questor-sync-posledni-uspech';

const fronta = new SyncFronta();

let stav: StavSynchronizace = {
  bezi: false,
  posledniUspech: (() => {
    try {
      return vychoziUloziste().getItem(KLIC_POSLEDNI_USPECH);
    } catch {
      return null;
    }
  })(),
  posledniChyba: null,
  veFronte: fronta.velikost(),
};

const posluchaci = new Set<() => void>();

function nastavStav(zmena: Partial<StavSynchronizace>): void {
  stav = { ...stav, ...zmena, veFronte: fronta.velikost() };
  for (const p of posluchaci) p();
}

/** Odběr změn stavu syncu (kompatibilní s useSyncExternalStore). */
export function pripojSeKeStavuSyncu(poslouchej: () => void): () => void {
  posluchaci.add(poslouchej);
  return () => posluchaci.delete(poslouchej);
}

export function stavSynchronizace(): StavSynchronizace {
  return stav;
}

// ---------------------------------------------------------------------------
// Vlastní synchronizace

export type DuvodSyncu = 'start' | 'po-testu' | 'rucne';

let probihajiciSync: Promise<void> | null = null;

export function synchronizuj(duvod: DuvodSyncu): Promise<void> {
  if (probihajiciSync) return probihajiciSync;
  probihajiciSync = provedSync(duvod).finally(() => {
    probihajiciSync = null;
  });
  return probihajiciSync;
}

async function provedSync(duvod: DuvodSyncu): Promise<void> {
  nastavStav({ bezi: true });
  try {
    const klient = vytvorKlienta(nactiSyncNastaveni());

    // --- push ---------------------------------------------------------------
    if (duvod === 'start') {
      // Při startu se pošle aktuální snapshot progresu.
      fronta.pridejProgres(pouzijStav.getState().progres);
    }
    if (duvod === 'rucne') fronta.vynulujOdklad();
    await fronta.odesli(klient); // nikdy nevyhazuje, selhání = položky zůstávají

    // --- pull: banky (jen vyšší verze) --------------------------------------
    const seznam = await klient.seznamBank();
    for (const zaznam of seznam) {
      const lokalni = pouzijStav.getState().banky[zaznam.predmetId];
      if (lokalni && zaznam.verze <= lokalni.verze) continue;
      const banka = validujBanku(await klient.stahniBanku(zaznam.predmetId));
      pouzijStav.getState().prijmiBanku(banka);
    }

    // --- pull: výzvy → hraSlice ---------------------------------------------
    const vyzvy = await klient.stahniVyzvy();
    pouzijStav.getState().prijmiVyzvy(vyzvy);

    const ted = new Date().toISOString();
    try {
      vychoziUloziste().setItem(KLIC_POSLEDNI_USPECH, ted);
    } catch {
      // tiché
    }
    nastavStav({ posledniUspech: ted, posledniChyba: null });
  } catch (chyba) {
    // TICHO: jen indikátor, žádné vyskakovací chyby.
    nastavStav({ posledniChyba: chyba instanceof Error ? chyba.message : 'Neznámá chyba' });
  } finally {
    nastavStav({ bezi: false });
  }
}

/** Volá testySlice po dokončení testu: zařadí událost + progres a zkusí sync. */
export function zaznamenejDokoncenyTest(vysledek: TestVysledek): void {
  fronta.pridejUdalost(vysledek);
  if (vysledek.vyzvaId) {
    fronta.pridejVysledekVyzvy(vysledek.vyzvaId, {
      uspesnost: vysledek.uspesnost,
      xp: vysledek.ziskaneXp,
    });
  }
  fronta.pridejProgres(pouzijStav.getState().progres);
  nastavStav({});
  void synchronizuj('po-testu');
}

// ---------------------------------------------------------------------------
// Sync při startu aplikace (modul se načítá přes stránku Nastavení → App.tsx).
// V testech (Node, žádné window) se nespouští.

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTimeout(() => {
    void synchronizuj('start');
  }, 1_000);
}
