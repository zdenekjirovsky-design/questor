// Duel odkazem (faze 2) — HOSTOVSKA logika mimo rodinny sync.
// Host otevre webovou aplikaci pres odkaz #duel=<duelId>.<kodHosta>, zada jen
// jmeno a hraje pres /api/hoste/* JEN s kodem (zadny profil, zadny rodinny
// kod, zadny registr). Tenhle modul drzi cistou logiku hostovskeho rezimu:
// parsovani hashe, generovani odkazu, lokalni stav hosta (navrat pres tentyz
// odkaz) a fetch klienta hostovskych endpointu. UI je v HostDuel.tsx.
//
// POZOR: hostovsky rezim NESMI sahat na rodinny sync (sync/sync.ts se tady
// nikdy neimportuje) ani zakladat profil — stav hosta zije ve vlastnich
// klicich localStorage mimo zustand persist.

import type { Duel, VysledekDuelu } from '@questor/sdilene';
import { hostProfilId } from '@questor/sdilene';
import {
  ChybaSyncu,
  VYCHOZI_SYNC_NASTAVENI,
  vychoziUloziste,
  type FetchFunkce,
  type Uloziste,
} from '../sync/klient';
import type { DuelPrubeh } from './engine';

// ---------------------------------------------------------------------------
// Odkaz pro hosta

/**
 * Verejna webova adresa aplikace — host odkaz VZDY otevira ve webove verzi
 * (obsah bank ma bundlovany). Z Tauri desktopu se proto generuje tahle
 * adresa, ne lokalni origin desktop shellu.
 */
export const WEB_ADRESA_APLIKACE = 'https://koordinator-server.cz/questor/';

/** Prostredi pro generovani odkazu (injektovane — cista funkce, testy). */
export interface ProstrediOdkazu {
  /** Bezi aplikace v Tauri desktop shellu? (jeTauriProstredi v sync/klient) */
  tauri: boolean;
  /** window.location.origin (napr. 'https://koordinator-server.cz'). */
  origin: string;
  /** import.meta.env.BASE_URL (napr. '/questor/' nebo '/'). */
  base: string;
}

/**
 * Odkaz pro hosta: ${origin}${base}#duel=<duelId>.<kodHosta>. Fragment `#`
 * nechodi na server (kod se neobjevi v logach). Na desktopu (Tauri) se VZDY
 * generuje verejna webova adresa — host prece otevira web, ne desktop shell.
 */
export function odkazProHosta(duelId: string, kodHosta: string, prostredi: ProstrediOdkazu): string {
  const fragment = `#duel=${duelId}.${kodHosta}`;
  if (prostredi.tauri) return `${WEB_ADRESA_APLIKACE}${fragment}`;
  const origin = prostredi.origin.replace(/\/+$/, '');
  let base = prostredi.base || '/';
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base = `${base}/`;
  return `${origin}${base}${fragment}`;
}

// ---------------------------------------------------------------------------
// Parsovani hashe pozvanky

export interface HostPozvanka {
  duelId: string;
  kod: string;
}

/**
 * Zparsuje location.hash tvaru `#duel=<duelId>.<kod>` (mrizka volitelna).
 * duelId je UUID (bez tecek), kod base64url — tecka je jednoznacny oddelovac.
 * Cokoli jineho (cizi hash, chybejici kod, prazdno) → null.
 */
export function zpracujHashPozvanky(hash: string): HostPozvanka | null {
  if (typeof hash !== 'string') return null;
  const shoda = /^#?duel=([A-Za-z0-9-]{8,64})\.([A-Za-z0-9_-]{16,128})$/.exec(hash.trim());
  if (!shoda) return null;
  return { duelId: shoda[1], kod: shoda[2] };
}

let startovniPozvanka: HostPozvanka | null | undefined;

/**
 * Precte pozvanku z location.hash pri startu aplikace a hash hned VYCISTI
 * (kod hosta nema zustavat v adresnim radku, historii ani screenshotech).
 * Memoizovane — opakovane volani (StrictMode, re-render) vraci tyz vysledek.
 */
export function pozvankaZeStartu(
  w: Window | undefined = typeof window !== 'undefined' ? window : undefined,
): HostPozvanka | null {
  if (startovniPozvanka !== undefined) return startovniPozvanka;
  startovniPozvanka = null;
  if (!w) return null;
  try {
    const pozvanka = zpracujHashPozvanky(w.location.hash ?? '');
    if (pozvanka) {
      w.history.replaceState(null, '', w.location.pathname + w.location.search);
      startovniPozvanka = pozvanka;
    }
  } catch {
    startovniPozvanka = null;
  }
  return startovniPozvanka;
}

/** Jen pro testy: zapomene memoizovanou pozvanku startu. */
export function _resetujPozvankuZeStartu(): void {
  startovniPozvanka = undefined;
}

// ---------------------------------------------------------------------------
// Lokalni stav hosta (navrat pres tentyz odkaz, reload behem hrani)

/**
 * Vsechno, co si host drzi lokalne: kod (vstupenka), jmeno, prijaty duel
 * (vc. sady otazek), rozehrany prubeh (reload cas nevraci) a dokonceny
 * vysledek s priznakem odeslani. Zadny profil, zadny rodinny sync.
 */
export interface HostUlozenyStav {
  duelId: string;
  kod: string;
  jmeno: string | null;
  /**
   * Jmeno z POSLEDNIHO pokusu o prijeti — uklada se PRED odeslanim POSTu.
   * Rozhodci pri ztracene odpovedi: kdyz server prijeti zapsal, ale odpoved
   * nedosla (timeout, vypadek site), pozdejsi GET vrati duel s hostem tehoz
   * jmena a klient se pozna jako uspesne prijaty (viz obnovHostDuel) misto
   * falesneho „odkaz uz nekdo pouzil“.
   */
  jmenoPokus: string | null;
  duel: Duel | null;
  prubeh: DuelPrubeh | null;
  vysledek: VysledekDuelu | null;
  odeslano: boolean;
}

export function vychoziHostStav(pozvanka: HostPozvanka): HostUlozenyStav {
  return {
    duelId: pozvanka.duelId,
    kod: pozvanka.kod,
    jmeno: null,
    jmenoPokus: null,
    duel: null,
    prubeh: null,
    vysledek: null,
    odeslano: false,
  };
}

const PREFIX_KLICE_HOSTA = 'questor-host-duel:';

function klicHosta(duelId: string): string {
  return `${PREFIX_KLICE_HOSTA}${duelId}`;
}

export function nactiHostStav(
  duelId: string,
  uloziste: Uloziste = vychoziUloziste(),
): HostUlozenyStav | null {
  try {
    const raw = uloziste.getItem(klicHosta(duelId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<HostUlozenyStav>;
    if (typeof data.duelId !== 'string' || typeof data.kod !== 'string') return null;
    return {
      duelId: data.duelId,
      kod: data.kod,
      jmeno: typeof data.jmeno === 'string' ? data.jmeno : null,
      jmenoPokus: typeof data.jmenoPokus === 'string' ? data.jmenoPokus : null,
      duel: data.duel && typeof data.duel === 'object' ? (data.duel as Duel) : null,
      prubeh: data.prubeh && typeof data.prubeh === 'object' ? (data.prubeh as DuelPrubeh) : null,
      vysledek:
        data.vysledek && typeof data.vysledek === 'object'
          ? (data.vysledek as VysledekDuelu)
          : null,
      odeslano: data.odeslano === true,
    };
  } catch {
    return null;
  }
}

export function ulozHostStav(
  stav: HostUlozenyStav,
  uloziste: Uloziste = vychoziUloziste(),
): void {
  try {
    uloziste.setItem(klicHosta(stav.duelId), JSON.stringify(stav));
  } catch {
    // Tiche — stav proste neprezije reload (soukromy rezim apod.).
  }
}

// ---------------------------------------------------------------------------
// Fetch klient hostovskych endpointu (/api/hoste/* — BEZ rodinneho tokenu)

const TIMEOUT_MS = 8000;

export interface HostKlient {
  /** Stav duelu pro hosta (GET /api/hoste/duely/:id, kod v hlavicce). */
  stavDuelu(duelId: string, kod: string): Promise<Duel>;
  /** Prijeti duelu hostem — vraci plny duel vc. otazkyIds; first-wins (409). */
  prijmiDuel(duelId: string, kod: string, jmeno: string): Promise<Duel>;
  /** Odevzdani vysledku hosta — plati prvni zapis (409 pri opakovani). */
  posliVysledekHosta(duelId: string, kod: string, vysledek: VysledekDuelu): Promise<Duel>;
}

/**
 * Klient hostovskych endpointu. Vychozi adresa serveru je environmentalni
 * default (web pres https → stejny origin + /questor-api) — host NIKDY
 * nepouziva ulozene rodinne nastaveni ani token.
 */
export function vytvorHostKlienta(
  url: string = VYCHOZI_SYNC_NASTAVENI.url,
  fetchFn?: FetchFunkce,
): HostKlient {
  const zakladUrl = url.replace(/\/+$/, '');
  const f: FetchFunkce = fetchFn ?? ((vstup, init) => globalThis.fetch(vstup, init));

  async function pozadavek<T>(
    metoda: 'GET' | 'POST',
    cesta: string,
    telo?: unknown,
    hlavicky?: Record<string, string>,
  ): Promise<T> {
    if (!zakladUrl) throw new ChybaSyncu('Adresa serveru není známá');
    const kontroler = new AbortController();
    const casovac = setTimeout(() => kontroler.abort(), TIMEOUT_MS);
    try {
      const odpoved = await f(`${zakladUrl}${cesta}`, {
        method: metoda,
        headers: { 'content-type': 'application/json', ...(hlavicky ?? {}) },
        body: telo === undefined ? undefined : JSON.stringify(telo),
        signal: kontroler.signal,
      });
      if (!odpoved.ok) {
        throw new ChybaSyncu(`Server odpověděl ${odpoved.status}`, odpoved.status);
      }
      return (await odpoved.json()) as T;
    } catch (chyba) {
      if (chyba instanceof ChybaSyncu) throw chyba;
      throw new ChybaSyncu(chyba instanceof Error ? chyba.message : 'Síťová chyba');
    } finally {
      clearTimeout(casovac);
    }
  }

  return {
    // Kod jde u GET HLAVICKOU, ne query stringem: query konci v access logu
    // serveru/proxy a poprel by smysl fragmentu # v odkazu (kod nesmi do logu).
    stavDuelu: (duelId, kod) =>
      pozadavek('GET', `/api/hoste/duely/${encodeURIComponent(duelId)}`, undefined, {
        'x-questor-host-kod': kod,
      }),
    prijmiDuel: (duelId, kod, jmeno) =>
      pozadavek('POST', `/api/hoste/duely/${encodeURIComponent(duelId)}/prijmout`, { kod, jmeno }),
    posliVysledekHosta: (duelId, kod, vysledek) =>
      pozadavek('POST', `/api/hoste/duely/${encodeURIComponent(duelId)}/vysledek`, {
        kod,
        vysledek,
      }),
  };
}

// ---------------------------------------------------------------------------
// Kroky hostovskeho toku (ciste nad klientem + ulozistem, testovatelne)

/**
 * Prijeti pozvanky: POST prijmout, ulozi jmeno + plny duel (sada otazek).
 * Jmeno pokusu se do uloziste zapisuje PRED odeslanim: kdyz server prijeti
 * zapise, ale odpoved se ztrati, pozdejsi obnova stavu se podle nej pozna
 * jako uspesne prijata (viz obnovHostDuel) — host se nezamkne ze sveho duelu.
 */
export async function prijmiPozvanku(
  klient: HostKlient,
  stav: HostUlozenyStav,
  jmeno: string,
  uloziste: Uloziste = vychoziUloziste(),
): Promise<HostUlozenyStav> {
  const sPokusem: HostUlozenyStav = { ...stav, jmenoPokus: jmeno };
  ulozHostStav(sPokusem, uloziste);
  const duel = await klient.prijmiDuel(stav.duelId, stav.kod, jmeno);
  const novy: HostUlozenyStav = { ...sPokusem, jmeno, duel };
  ulozHostStav(novy, uloziste);
  return novy;
}

/**
 * Odeslani dokonceneho vysledku hosta. Uspech vraci stav s odeslano: true
 * a cerstvym duelem ze serveru (po obou vysledcich uz hotovym).
 */
export async function odesliHostVysledek(
  klient: HostKlient,
  stav: HostUlozenyStav,
  uloziste: Uloziste = vychoziUloziste(),
): Promise<HostUlozenyStav> {
  if (!stav.vysledek) return stav;
  const duel = await klient.posliVysledekHosta(stav.duelId, stav.kod, stav.vysledek);
  const novy: HostUlozenyStav = { ...stav, duel, odeslano: true };
  ulozHostStav(novy, uloziste);
  return novy;
}

/**
 * Ztracena odpoved na prijeti: server hosta zapsal, ale klient odpoved
 * nedostal (jmeno tak zustalo null). Kdyz jmeno hosta na serveru odpovida
 * mistnimu jmenu POKUSU o prijeti, jsem to ja — pokracuje se jako uspesne
 * prijaty. Dva drzitele tehoz kodu se stejnym jmenem stejne nejde rozlisit
 * (kod je jediny credential). Neadoptuje se rozehrany cizi vysledek hosta
 * u nedokonceneho duelu (to by vedlo k opakovanemu hrani a 409).
 */
function prijetiPatriMne(stav: HostUlozenyStav, duel: Duel): boolean {
  if (stav.jmeno !== null || !stav.jmenoPokus || !duel.host) return false;
  if (duel.host.jmeno !== stav.jmenoPokus) return false;
  const hostMaVysledek = Boolean(duel.vysledky[hostProfilId(duel.id)]);
  const dokonceny = duel.stav === 'hotovy' || duel.stav === 'vyprsely';
  return !hostMaVysledek || dokonceny;
}

/**
 * Obnoveni stavu duelu ze serveru (navrat pres tentyz odkaz — treba uz
 * dohral i vyzyvatel). Sada otazek lokalne znama se zatajenou verzi ze
 * serveru neprepisuje (pred prijetim server otazkyIds skryva). Zaroven
 * srovnava ztracenou odpoved na prijeti (prijetiPatriMne).
 */
export async function obnovHostDuel(
  klient: HostKlient,
  stav: HostUlozenyStav,
  uloziste: Uloziste = vychoziUloziste(),
): Promise<HostUlozenyStav> {
  const serverovy = await klient.stavDuelu(stav.duelId, stav.kod);
  const duel: Duel =
    serverovy.otazkyIds.length === 0 && stav.duel && stav.duel.otazkyIds.length > 0
      ? { ...serverovy, otazkyIds: stav.duel.otazkyIds, vysledky: stav.duel.vysledky }
      : serverovy;
  const novy: HostUlozenyStav = prijetiPatriMne(stav, duel)
    ? { ...stav, duel, jmeno: stav.jmenoPokus }
    : { ...stav, duel };
  ulozHostStav(novy, uloziste);
  return novy;
}
