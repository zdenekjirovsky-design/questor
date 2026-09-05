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
import {
  doplnDuelovyProgres,
  prinasiTrofejeNavic,
  sloucTrofeje,
  validujBanku,
  validujVyuku,
} from '@questor/sdilene';
import type {
  ProfilRegistrZaznam,
  ProgresStudenta,
  TestVysledek,
  VysledekDuelu,
} from '@questor/sdilene';
import { pouzijStav, type QUESTORStav } from '../stav/store';
import { aktivniPredmetProfilu, predmetyProfilu, type Profil } from '../stav/profilySlice';
import { ChybaSyncu, nactiSyncNastaveni, vytvorKlienta, vychoziUloziste, type QuestorKlient } from './klient';
import {
  klicFrontyProfilu,
  KLIC_FRONTY,
  KLIC_FRONTY_REGISTRU,
  smazUlozenouFrontuProfilu,
  SyncFronta,
} from './fronta';
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

/**
 * Zaznam registru profilu pro PUT /api/profily/:id. `predmety` se posilaji
 * SUROVE (vc. id docasne mimo registr — druhe zarizeni je muze znat), avatar
 * se bere z pracovni sady (aktivni profil) nebo snimku (neaktivni).
 */
function zaznamRegistru(profil: Profil, stav: QUESTORStav): ProfilRegistrZaznam {
  const avatar =
    profil.id === stav.aktivniProfilId
      ? stav.progres.avatar
      : stav.dataProfilu[profil.id]?.progres.avatar;
  return {
    profilId: profil.id,
    jmeno: profil.jmeno,
    barva: profil.barva,
    predmety: profil.predmety,
    aktivniPredmetId: profil.aktivniPredmetId,
    aktualizovano: profil.aktualizovano,
    ...(profil.pinHash ? { pinHash: profil.pinHash } : {}),
    ...(avatar ? { avatar } : {}),
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
 * Fronta registru profilu — drzi operace, ktere neprezijou frontu konkretniho
 * profilu (smazani profilu na serveru). Nikdy se nezapomina.
 */
let frontaRegistruInstance: SyncFronta | null = null;

function frontaRegistru(): SyncFronta {
  frontaRegistruInstance ??= new SyncFronta(vychoziUloziste(), KLIC_FRONTY_REGISTRU);
  return frontaRegistruInstance;
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

/** Součet čekajících položek přes fronty všech existujících profilů + registr. */
function celkemVeFronte(): number {
  let soucet = frontaRegistru().velikost();
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
  /** Právě letí pull postupu aktivovaného profilu („Načítám postup…" v HUD). */
  nacitamPostup: boolean;
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
  nacitamPostup: false,
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

export type DuvodSyncu =
  | 'start'
  | 'po-testu'
  | 'rucne'
  /** Otevření výběru profilů / připojení rodiny — hlavně merge registru. */
  | 'profily'
  | 'zmena-profilu'
  | 'zmena-progresu';

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
  // Bez adresy serveru NEBO bez rodinného kódu je sync vypnutý — aplikace
  // běží čistě lokálně (server by bez tokenu stejně vracel 401).
  if (!nastaveni.url || !nastaveni.token) return;
  nastavStav({ bezi: true });
  try {
    const klient = vytvorKlienta(nastaveni);

    // --- push ---------------------------------------------------------------
    // Odesílají se fronty VŠECH profilů (položky nesou profilId/profilJmeno,
    // takže atribuce nezávisí na tom, kdo je zrovna přihlášený). Snapshot
    // progresu aktivního profilu při startu NEnahrává napevno — o něj se
    // stará LWW pull postupu níž (server může mít novější z jiného zařízení).
    for (const p of pouzijStav.getState().profily) {
      const fronta = frontaProfilu(p.id);
      if (duvod === 'rucne') fronta.vynulujOdklad();
      await fronta.odesli(klient); // nikdy nevyhazuje, selhání = položky zůstávají
    }
    // Fronta registru (smazání profilů) MUSÍ odejít před pullem registru,
    // jinak by merge profil smazaný na tomhle zařízení zase přidal.
    if (duvod === 'rucne') frontaRegistru().vynulujOdklad();
    await frontaRegistru().odesli(klient);

    // --- registr profilů (LWW merge; viz aplikujRegistrProfilu) --------------
    // Vlastní try/catch: starší server bez /api/profily nesmí shodit zbytek.
    try {
      const serverove = await klient.stahniProfily();
      const { pushnout, smazane } = pouzijStav.getState().aplikujRegistrProfilu(serverove);
      // Profil smazaný na jiném zařízení: zapomenout i jeho frontu.
      for (const id of smazane) zapomenFrontuProfilu(id);
      // Lokálně novější / server neznámé profily → PUT přes frontu.
      const stav = pouzijStav.getState();
      for (const p of pushnout) frontaProfilu(p.id).pridejProfil(zaznamRegistru(p, stav));
      for (const p of pushnout) await frontaProfilu(p.id).odesli(klient);
    } catch {
      // Tiché — registr je bonus, lokální profily jedou dál.
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

      // --- pull: duely aktivniho profilu -----------------------------------
      // Vlastni try/catch: starsi server bez /api/duely nesmi shodit sync.
      // Plati pravidlo pullu osobnich dat (prepnuti profilu behem letu =
      // zahodit). Nove vyzvy se propisi do indikatoru na Domu i v navigaci
      // (odvozuji se ze store — pocetCekajicichVyzev).
      try {
        const duely = await klient.stahniDuely(aktivniId);
        if (pouzijStav.getState().aktivniProfilId === aktivniId) {
          pouzijStav.getState().prijmiDuely(duely.moje, duely.otevrene);
        }
      } catch {
        // Tiche — duely jsou bonus, zbytek syncu jede dal.
      }
    }

    // --- pull: kompletní postup aktivního profilu (LWW) ----------------------
    // Při startu (aplikace se probouzí třeba na jiném zařízení než včera)
    // a při ručním syncu. Aktivace profilu volá stahniPostupProfilu přímo.
    if (duvod === 'start' || duvod === 'rucne') {
      try {
        await pullPostupAktivnihoProfilu(klient);
      } catch {
        // Tiché — starší server bez GET /api/progres/:id nesmí shodit sync.
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

/**
 * Volá hraSlice po dokončení mé půlky duelu: zařadí výsledek do fronty
 * AKTIVNÍHO profilu (typ 'duel-vysledek' — at-least-once, přežije offline)
 * spolu se snapshotem progresu (spotřebované power-upy) a zkusí sync.
 * Síť se zkouší jen v prohlížeči; v testech se položky jen zařadí.
 */
export function zaznamenejVysledekDuelu(duelId: string, vysledek: VysledekDuelu): void {
  const profil = aktivniProfil();
  if (!profil) return;
  const fronta = frontaProfilu(profil.id);
  fronta.pridejVysledekDuelu(duelId, profil.id, vysledek);
  fronta.pridejProgres(oznacProgres(pouzijStav.getState().progres, profil));
  nastavStav({});
  if (typeof window !== 'undefined') void synchronizuj('po-testu');
}

/**
 * Push snapshotu progresu aktivního profilu po další aktivitě, která server
 * zajímá (dokončená lekce, otevřená truhla) — ať je serverový postup čerstvý
 * pro pull na druhém zařízení. Síť se zkouší jen v prohlížeči; v testech se
 * položka jen zařadí do fronty.
 */
export function zaznamenejZmenuProgresu(): void {
  const profil = aktivniProfil();
  if (!profil) return;
  frontaProfilu(profil.id).pridejProgres(oznacProgres(pouzijStav.getState().progres, profil));
  nastavStav({});
  if (typeof window !== 'undefined') void synchronizuj('zmena-progresu');
}

/**
 * Zařadí PUT změněného profilu do jeho fronty (volá profilySlice po každé
 * změně profilu — jméno, PIN, barva, banky, aktivní banka; hraSlice po změně
 * avatara). Ve frontě zůstává vždy jen nejnovější záznam profilu.
 */
export function zaznamenejZmenuProfilu(profilId: string): void {
  const stav = pouzijStav.getState();
  const profil = stav.profily.find((p) => p.id === profilId);
  if (!profil) return;
  frontaProfilu(profilId).pridejProfil(zaznamRegistru(profil, stav));
  nastavStav({});
  if (typeof window !== 'undefined') void synchronizuj('zmena-profilu');
}

/**
 * Smazání profilu: zapomene jeho frontu (viz zapomenFrontuProfilu) a do
 * fronty REGISTRU zařadí DELETE na server, aby profil zmizel i na ostatních
 * zařízeních. Položka žije mimo frontu mazaného profilu, jinak by se smazala
 * sama se sebou. Volá profilySlice.smazProfil.
 */
export function zaznamenejSmazaniProfilu(profilId: string): void {
  zapomenFrontuProfilu(profilId);
  frontaRegistru().pridejSmazaniProfilu(profilId);
  nastavStav({});
  if (typeof window !== 'undefined') void synchronizuj('zmena-profilu');
}

// ---------------------------------------------------------------------------
// Pull kompletního postupu profilu (sync postupu přes zařízení)

/**
 * Minimální strukturální kontrola progresu ze serveru (server ho při POSTu
 * validoval zodem, tohle chrání jen proti driftu verzí / vadné odpovědi).
 */
function prectiServerovyProgres(data: unknown): ProgresStudenta | null {
  if (data === null || typeof data !== 'object') return null;
  const p = data as Record<string, unknown>;
  if (typeof p.xp !== 'number' || typeof p.aktualizovano !== 'string' || !p.aktualizovano) {
    return null;
  }
  if (p.streak === null || typeof p.streak !== 'object') return null;
  if (!Array.isArray(p.questy)) return null;
  if (p.sbirka === null || typeof p.sbirka !== 'object') return null;
  if (p.avatar === null || typeof p.avatar !== 'object') return null;
  if (p.statistikyOtazek === null || typeof p.statistikyOtazek !== 'object') return null;
  if (p.rekordy === null || typeof p.rekordy !== 'object') return null;
  if (typeof p.dokonceneTesty !== 'number') return null;
  const progres = data as ProgresStudenta;
  return Array.isArray(p.vlastnenaVybava) ? progres : { ...progres, vlastnenaVybava: [] };
}

/**
 * LWW pull postupu AKTIVNÍHO profilu: serverový snapshot s novějším
 * `aktualizovano` nahradí celý lokální ProgresStudenta (a obnoví odvozené —
 * questy dne), lokálně novější postup se naopak pushne. 404 = server o
 * profilu nic nemá → lokální postup je pravda a pushne se.
 * PRAVIDLO pullu osobních dat: po každém awaitu se aktivní profil znovu
 * porovná — přepnutí během letícího požadavku výsledek ZAHODÍ.
 */
async function pullPostupAktivnihoProfilu(klient: QuestorKlient): Promise<void> {
  const profil = aktivniProfil();
  if (!profil) return;
  nastavStav({ nacitamPostup: true });
  try {
    let odpoved: { progres: unknown; prijato: string };
    try {
      odpoved = await klient.stahniProgres(profil.id);
    } catch (chyba) {
      if (chyba instanceof ChybaSyncu && chyba.status === 404) {
        const stav = pouzijStav.getState();
        if (stav.aktivniProfilId === profil.id) {
          frontaProfilu(profil.id).pridejProgres(oznacProgres(stav.progres, profil));
          await frontaProfilu(profil.id).odesli(klient);
        }
        return;
      }
      throw chyba;
    }
    const stav = pouzijStav.getState();
    if (stav.aktivniProfilId !== profil.id) return; // přepnuto během letu → zahodit
    const serverovy = prectiServerovyProgres(odpoved.progres);
    if (!serverovy) return;
    if (serverovy.aktualizovano > stav.progres.aktualizovano) {
      // Server je novější (hrálo se na jiném zařízení) → nahradit CELÝ snímek
      // a obnovit odvozené (questy dne se případně dogenerují pro dnešek).
      // questyOdmeneno se serverem NEsynchronizuje (žije mimo ProgresStudenta),
      // proto se odvodí ze splněných questů snapshotu: splneno nastavuje tatáž
      // akce, která quest hned odměňuje (hraSlice/vyukaSlice), takže splněný
      // quest ze serveru UŽ odměněný je — bez odvození by ho první
      // zapocitejOdpoved/dokonciLekci na tomhle zařízení odměnil podruhé.
      const questyOdmeneno = [
        ...new Set([
          ...stav.questyOdmeneno,
          ...serverovy.questy.filter((q) => q.splneno).map((q) => q.id),
        ]),
      ];
      // TROFEJE se pri LWW nahrade MERGUJI (max citacu, sjednoceni titulu,
      // sloucTrofeje) — novejsi snapshot z druheho zarizeni, ktery trofej z
      // mistne dohraneho duelu jeste nema, by ji jinak NENAVRATNE smazal
      // (duelyZapocitane blokuje prepocet). Kdyz merge neco prida, bumpne se
      // aktualizovano a snapshot se pushne, at trofej dorazi i na server
      // a ostatni zarizeni; jinak se serverovy snapshot prebira beze zmeny.
      const lokalniTrofeje = doplnDuelovyProgres(stav.progres).trofeje!;
      const serverovyDoplneny = doplnDuelovyProgres(serverovy);
      const mergovat = prinasiTrofejeNavic(lokalniTrofeje, serverovyDoplneny.trofeje!);
      const prijaty = mergovat
        ? {
            ...serverovyDoplneny,
            trofeje: sloucTrofeje(serverovyDoplneny.trofeje!, lokalniTrofeje),
            aktualizovano: new Date().toISOString(),
          }
        : serverovy;
      pouzijStav.setState({ progres: prijaty, questyOdmeneno });
      pouzijStav.getState().obnovDenniQuesty();
      if (mergovat) {
        frontaProfilu(profil.id).pridejProgres(
          oznacProgres(pouzijStav.getState().progres, profil),
        );
        await frontaProfilu(profil.id).odesli(klient);
      }
    } else if (stav.progres.aktualizovano > serverovy.aktualizovano) {
      // Lokál je novější → server si má vzít náš snapshot.
      frontaProfilu(profil.id).pridejProgres(oznacProgres(stav.progres, profil));
      await frontaProfilu(profil.id).odesli(klient);
    }
  } finally {
    nastavStav({ nacitamPostup: false });
  }
}

/**
 * Veřejný vstup pullu postupu — volá ho prepniProfil při aktivaci profilu.
 * Bez zapnutého syncu (chybí adresa nebo rodinný kód) no-op; selhání tiché.
 */
export async function stahniPostupProfilu(): Promise<void> {
  const nastaveni = nactiSyncNastaveni();
  if (!nastaveni.url || !nastaveni.token) return;
  try {
    await pullPostupAktivnihoProfilu(vytvorKlienta(nastaveni));
  } catch {
    // Tiché — offline-first, postup se srovná při příštím syncu.
  }
}

// ---------------------------------------------------------------------------
// Sync při startu aplikace (modul se načítá přes stránku Nastavení → App.tsx).
// V testech (Node, žádné window) se nespouští.

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setTimeout(() => {
    void synchronizuj('start');
  }, 1_000);
}
