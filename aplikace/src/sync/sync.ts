// Orchestrace synchronizace (offline-first):
// - push: fronty neodeslaných událostí VŠECH profilů + snapshot progresu
//   aktivního profilu (události i progres nesou top-level pole profilId
//   a profilJmeno vedle stávajících dat — starý server je ignoruje),
// - pull: banky (jen vyšší verze → merge do testySlice) a výzvy (→ hraSlice
//   aktivního profilu; bez aktivního profilu se výzvy nestahují).
// Fronta je per PROFIL (osobní data) — klíč v localStorage nese id profilu;
// položky se do ní řadí už OBOHACENÉ o profil, takže přepnutí profilu před
// odesláním atribuci nezmění. Selhání sítě je TICHÉ — žádné chybové UI
// uprostřed hry, jen nenápadný indikátor stavu (Nastavení / Domů).
import { validujBanku, validujVyuku } from '@questor/sdilene';
import type { ProgresStudenta, TestVysledek } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { aktivniPredmetProfilu, predmetyProfilu, type Profil } from '../stav/profilySlice';
import { nactiSyncNastaveni, vytvorKlienta, vychoziUloziste } from './klient';
import { klicFrontyProfilu, KLIC_FRONTY, smazUlozenouFrontuProfilu, SyncFronta } from './fronta';
import { ulozObsah } from './uloziste';

// ---------------------------------------------------------------------------
// Označení profilu na odesílaných datech (top-level pole vedle stávajících —
// zpětně kompatibilní: starý server neznámá pole zahodí/ignoruje).

export interface ProfilOznaceni {
  profilId: string;
  profilJmeno: string;
}

function oznacProfilem<T extends object>(data: T, profil: Profil): T & ProfilOznaceni {
  return { ...data, profilId: profil.id, profilJmeno: profil.jmeno };
}

/**
 * Snapshot progresu navic nese studijni banky profilu (predmety +
 * aktivniPredmetId) — dalsi top-level pole vedle profilId/profilJmeno
 * v temze JSON blobu. Server je pri validaci progresu odstripuje (zod),
 * POST projde beze zmeny — serverova cast se NEMENI.
 */
function oznacProgres(
  progres: ProgresStudenta,
  profil: Profil,
): ProgresStudenta & ProfilOznaceni & { predmety: string[]; aktivniPredmetId: string | null } {
  return {
    ...oznacProfilem(progres, profil),
    predmety: predmetyProfilu(profil),
    aktivniPredmetId: aktivniPredmetProfilu(profil),
  };
}

// ---------------------------------------------------------------------------
// Fronty per profil (lazy; adopce staré společné fronty viz fronta.ts)

const fronty = new Map<string, SyncFronta>();

function frontaProfilu(profilId: string): SyncFronta {
  let fronta = fronty.get(profilId);
  if (!fronta) {
    fronta = new SyncFronta(vychoziUloziste(), klicFrontyProfilu(profilId), KLIC_FRONTY);
    fronty.set(profilId, fronta);
  }
  return fronta;
}

/**
 * Úplné zapomenutí fronty smazaného profilu: zruší in-memory instanci
 * (už nikdy nic nezapíše — letící odesli() ji po awaitu najde prázdnou),
 * odebere ji z mapy a smaže uložený klíč. Volá profilySlice.smazProfil;
 * bez zrušení instance by běžící sync klíč v localStorage znovu založil
 * a osobní data smazaného profilu by v něm zůstala navždy.
 */
export function zapomenFrontuProfilu(profilId: string): void {
  fronty.get(profilId)?.zrus();
  fronty.delete(profilId);
  smazUlozenouFrontuProfilu(profilId);
}

function aktivniProfil(): Profil | null {
  const stav = pouzijStav.getState();
  return stav.profily.find((p) => p.id === stav.aktivniProfilId) ?? null;
}

/** Součet čekajících položek přes fronty všech existujících profilů. */
function celkemVeFronte(): number {
  let soucet = 0;
  for (const profil of pouzijStav.getState().profily) {
    soucet += frontaProfilu(profil.id).velikost();
  }
  return soucet;
}

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
  veFronte: 0,
};

const posluchaci = new Set<() => void>();

function nastavStav(zmena: Partial<StavSynchronizace>): void {
  stav = { ...stav, ...zmena, veFronte: celkemVeFronte() };
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
  const nastaveni = nactiSyncNastaveni();
  // Bez adresy serveru je sync vypnutý (typicky hostovaná webová verze).
  if (!nastaveni.url) return;
  nastavStav({ bezi: true });
  try {
    const klient = vytvorKlienta(nastaveni);

    // --- push ---------------------------------------------------------------
    const profil = aktivniProfil();
    if (duvod === 'start' && profil) {
      // Při startu se pošle aktuální snapshot progresu aktivního profilu.
      frontaProfilu(profil.id).pridejProgres(
        oznacProgres(pouzijStav.getState().progres, profil),
      );
    }
    // Odesílají se fronty VŠECH profilů (položky nesou profilId/profilJmeno,
    // takže atribuce nezávisí na tom, kdo je zrovna přihlášený).
    for (const p of pouzijStav.getState().profily) {
      const fronta = frontaProfilu(p.id);
      if (duvod === 'rucne') fronta.vynulujOdklad();
      await fronta.odesli(klient); // nikdy nevyhazuje, selhání = položky zůstávají
    }

    // --- pull: banky (jen vyšší verze) --------------------------------------
    const seznam = await klient.seznamBank();
    for (const zaznam of seznam) {
      const lokalni = pouzijStav.getState().banky[zaznam.predmetId];
      if (lokalni && zaznam.verze <= lokalni.verze) continue;
      const banka = validujBanku(await klient.stahniBanku(zaznam.predmetId));
      // Stazeny obsah do IndexedDB (ne do zustand persist — localStorage
      // kvota), aby vyssi verze nez bundle prezila restart aplikace.
      if (pouzijStav.getState().prijmiBanku(banka)) void ulozObsah('banky', banka.predmetId, banka);
    }

    // --- pull: výuka (jen vyšší verze) — drží vzor bank ----------------------
    // Vlastní try/catch: starší server bez /api/vyuka nesmí shodit zbytek syncu.
    try {
      const seznamVyuk = await klient.seznamVyuk();
      for (const zaznam of seznamVyuk) {
        const lokalni = pouzijStav.getState().vyuky[zaznam.predmetId];
        if (lokalni && zaznam.verze <= lokalni.verze) continue;
        const vyuka = validujVyuku(await klient.stahniVyuku(zaznam.predmetId));
        if (pouzijStav.getState().prijmiVyuku(vyuka))
          void ulozObsah('vyuky', vyuka.predmetId, vyuka);
      }
    } catch {
      // Tiché — výuka je bonus, offline-first základ je bundlovaný.
    }

    // --- pull: výzvy → hraSlice aktivního profilu ---------------------------
    // Bez aktivního profilu (obrazovka výběru) se výzvy nestahují — patří
    // do osobních dat a neměly by přistát v prázdné pracovní sadě. Server
    // dostává ?profilId= a vrací jen výzvy cílené na aktivní profil + společné.
    const aktivniId = pouzijStav.getState().aktivniProfilId;
    if (aktivniId) {
      const vyzvy = await klient.stahniVyzvy(aktivniId);
      // Pravidlo pro KAŽDÝ pull osobních dat: mezi čtením profilu a zápisem
      // leží await — přepne-li se mezitím profil (klik na avatara během
      // pomalé sítě), výsledek se ZAHODÍ, jinak by výzvy cílené na původní
      // profil přistály v pracovní sadě jiného. Správný profil si je stáhne
      // při příštím syncu.
      if (pouzijStav.getState().aktivniProfilId === aktivniId) {
        pouzijStav.getState().prijmiVyzvy(vyzvy);
      }
    }

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

/**
 * Volá testySlice po dokončení testu: zařadí událost + progres do fronty
 * AKTIVNÍHO profilu (payloady obohacené o profilId/profilJmeno) a zkusí sync.
 * Bez aktivního profilu (nemělo by nastat — aplikace je za gate) se nic neřadí.
 */
export function zaznamenejDokoncenyTest(vysledek: TestVysledek): void {
  const profil = aktivniProfil();
  if (!profil) return;
  const fronta = frontaProfilu(profil.id);
  fronta.pridejUdalost(oznacProfilem(vysledek, profil));
  if (vysledek.vyzvaId) {
    fronta.pridejVysledekVyzvy(vysledek.vyzvaId, {
      uspesnost: vysledek.uspesnost,
      xp: vysledek.ziskaneXp,
    });
  }
  fronta.pridejProgres(oznacProgres(pouzijStav.getState().progres, profil));
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
