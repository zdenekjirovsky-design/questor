// Fetch klient serveru QUESTORu — tenká vrstva nad API kontraktem
// (viz docs/ARCHITEKTURA.md). Fetch i úložiště se injektují kvůli testům.
import type {
  BankaOtazek,
  Duel,
  ProfilRegistrZaznam,
  ProgresStudenta,
  TestVysledek,
  VysledekDuelu,
  Vyzva,
} from '@questor/sdilene';

// ---------------------------------------------------------------------------
// Nastavení připojení (URL + rodinný kód) — stránka Nastavení a dialog
// „Připojit rodinu" na výběru profilů.

export interface SyncNastaveni {
  url: string;
  /** Rodinný kód (= studentský token serveru). Prázdný = sync vypnutý,
   * aplikace běží čistě lokálně. */
  token: string;
}

/** Prostředí, ve kterém aplikace běží — vstup čisté funkce výchozích adres. */
export interface ProstrediKlienta {
  /** window.location.protocol včetně dvojtečky (např. 'https:'). */
  protocol: string;
  hostname: string;
  /** window.location.origin (např. 'https://koordinator-server.cz'). */
  origin: string;
  /** Běžíme v Tauri desktop shellu? (viz jeTauriProstredi) */
  tauri: boolean;
}

/**
 * Výchozí adresa serveru a rodinný kód podle prostředí:
 * - Tauri desktop → veřejný server (aplikace běží mimo web origin),
 * - web přes https → stejný origin + /questor-api (projde CSP connect-src 'self'),
 * - dev (http + localhost) → lokální server s dev tokenem,
 * - jinde (např. http přes LAN) → sync vypnutý, dokud uživatel nevyplní adresu.
 * Rodinný kód je VŠUDE prázdný (čistě lokální běh) kromě dev prostředí.
 */
export function urciVychoziNastaveni(prostredi: ProstrediKlienta): SyncNastaveni {
  if (prostredi.tauri) {
    return { url: 'https://koordinator-server.cz/questor-api', token: '' };
  }
  if (prostredi.protocol === 'https:') {
    return { url: `${prostredi.origin}/questor-api`, token: '' };
  }
  const lokalni =
    prostredi.hostname === 'localhost' ||
    prostredi.hostname === '127.0.0.1' ||
    prostredi.hostname === '[::1]';
  if (prostredi.protocol === 'http:' && lokalni) {
    return { url: 'http://localhost:8787', token: 'student-dev' };
  }
  return { url: '', token: '' };
}

/**
 * Robustní detekce Tauri desktop shellu: interní globály (Tauri 2 je
 * injektuje vždy) + fallback na protokol tauri: (macOS/Linux) a hostname
 * tauri.localhost (Windows servíruje app přes http/https). Fail-safe → false.
 */
export function jeTauriProstredi(w: unknown = typeof window !== 'undefined' ? window : undefined): boolean {
  if (!w || typeof w !== 'object') return false;
  try {
    const okno = w as Record<string, unknown> & { location?: Location };
    if (okno.__TAURI_INTERNALS__ !== undefined || okno.__TAURI__ !== undefined) return true;
    const protocol = okno.location?.protocol ?? '';
    const hostname = okno.location?.hostname ?? '';
    return (
      protocol === 'tauri:' || hostname === 'tauri.localhost' || hostname.endsWith('.tauri.localhost')
    );
  } catch {
    return false;
  }
}

function aktualniProstredi(): ProstrediKlienta {
  if (typeof window === 'undefined') {
    // Node (testy, SSR) — chová se jako dev prostředí.
    return { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost', tauri: false };
  }
  return {
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    origin: window.location.origin,
    tauri: jeTauriProstredi(),
  };
}

export const VYCHOZI_SYNC_NASTAVENI: SyncNastaveni = urciVychoziNastaveni(aktualniProstredi());

const KLIC_NASTAVENI = 'questor-sync-nastaveni';

/** Minimální rozhraní úložiště (localStorage v aplikaci, in-memory v testech). */
export interface Uloziste {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
  removeItem(klic: string): void;
}

/** In-memory náhrada, když localStorage není (testy v Node, private mode). */
export function pametoveUloziste(): Uloziste {
  const mapa = new Map<string, string>();
  return {
    getItem: (k) => mapa.get(k) ?? null,
    setItem: (k, v) => void mapa.set(k, v),
    removeItem: (k) => void mapa.delete(k),
  };
}

let zalozniUloziste: Uloziste | null = null;

export function vychoziUloziste(): Uloziste {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // localStorage může vyhodit (zakázané cookies apod.) — spadneme na paměť.
  }
  zalozniUloziste ??= pametoveUloziste();
  return zalozniUloziste;
}

export function nactiSyncNastaveni(uloziste: Uloziste = vychoziUloziste()): SyncNastaveni {
  try {
    const raw = uloziste.getItem(KLIC_NASTAVENI);
    if (!raw) return { ...VYCHOZI_SYNC_NASTAVENI };
    const data = JSON.parse(raw) as Partial<SyncNastaveni>;
    return {
      url: typeof data.url === 'string' && data.url ? data.url : VYCHOZI_SYNC_NASTAVENI.url,
      // Prázdný token je PLATNÁ hodnota (sync vypnutý — rodinný kód zatím
      // nezadaný), proto se na výchozí spadne jen u chybějícího/vadného pole.
      token: typeof data.token === 'string' ? data.token : VYCHOZI_SYNC_NASTAVENI.token,
    };
  } catch {
    return { ...VYCHOZI_SYNC_NASTAVENI };
  }
}

export function ulozSyncNastaveni(
  nastaveni: SyncNastaveni,
  uloziste: Uloziste = vychoziUloziste(),
): void {
  try {
    uloziste.setItem(KLIC_NASTAVENI, JSON.stringify(nastaveni));
  } catch {
    // Tiché — nastavení prostě nepřežije restart.
  }
}

// ---------------------------------------------------------------------------
// Klient

export class ChybaSyncu extends Error {
  constructor(
    zprava: string,
    public status?: number,
  ) {
    super(zprava);
    this.name = 'ChybaSyncu';
  }
}

const TIMEOUT_MS = 8000;

export interface QuestorKlient {
  zdravi(): Promise<{ ok: boolean; verze: string }>;
  seznamBank(): Promise<{ predmetId: string; nazev: string; verze: number }[]>;
  stahniBanku(predmetId: string): Promise<BankaOtazek>;
  /** Seznam vyuk na serveru (predmetId + verze) — vzor bank. */
  seznamVyuk(): Promise<{ predmetId: string; verze: number }[]>;
  /** Cela vyuka predmetu — volajici ji validuje pres validujVyuku. */
  stahniVyuku(predmetId: string): Promise<unknown>;
  posliProgres(progres: ProgresStudenta): Promise<void>;
  posliUdalost(vysledek: TestVysledek): Promise<void>;
  posliVysledekVyzvy(vyzvaId: string, telo: { uspesnost: number; xp: number }): Promise<void>;
  /** Registr profilů rodiny (GET /api/profily) — naposledy aktualizovaný první. */
  stahniProfily(): Promise<ProfilRegistrZaznam[]>;
  /**
   * Upsert profilu do registru (PUT /api/profily/:id, LWW dle aktualizovano).
   * Starší zápis server nepřijme (200 + prijato: false) — novější verzi si
   * klient vezme při příštím pullu registru, tady se nic nevrací.
   */
  posliProfil(zaznam: ProfilRegistrZaznam): Promise<void>;
  /** Smaže profil z registru i jeho progres (DELETE /api/profily/:id, idempotentní). */
  smazProfilNaServeru(profilId: string): Promise<void>;
  /** Pull kompletního postupu profilu (GET /api/progres/:profilId); 404 = server nic nemá. */
  stahniProgres(profilId: string): Promise<{ progres: unknown; prijato: string }>;
  /**
   * Otevrene vyzvy; s profilId server vrati jen vyzvy cilene na dany profil
   * + spolecne (kontrakt GET /api/vyzvy?profilId=). Bez profilId vsechny.
   */
  stahniVyzvy(profilId?: string): Promise<Vyzva[]>;
  /**
   * Zalozi duel (POST /api/duely) — server deterministicky vybere sadu otazek
   * (seed = id duelu) a spocita handicap ze snapshotu progresu. Vraci cely Duel.
   */
  vytvorDuel(telo: {
    predmetId: string;
    temataId?: string[];
    pocetOtazek: 5 | 10 | 20;
    vyzyvatelProfilId: string;
    vyzyvatelJmeno?: string;
    souperProfilId?: string;
    souperJmeno?: string;
  }): Promise<Duel>;
  /**
   * Duely profilu: bezici + poslednich 20 dokoncenych (moje) a cizi otevrene
   * rodinne vyzvy (otevrene). Kontrakt GET /api/duely?profilId=.
   */
  stahniDuely(profilId: string): Promise<{ moje: Duel[]; otevrene: Duel[] }>;
  /**
   * Prijeti vyzvy (POST /api/duely/:id/prijmout) — u otevrene first-wins,
   * server pri nem zmrazi handicap obou. Vraci aktualizovany Duel;
   * 409 = uz prijal nekdo jiny / vyprselo.
   */
  prijmiDuelNaServeru(duelId: string, telo: { profilId: string; jmeno: string }): Promise<Duel>;
  /**
   * Odevzdani vysledku pulky duelu (POST /api/duely/:id/vysledek) — plati
   * PRVNI zapis za profil, opakovany je 409. Posila offline fronta.
   */
  posliVysledekDuelu(
    duelId: string,
    telo: { profilId: string; vysledek: VysledekDuelu },
  ): Promise<void>;
}

export type FetchFunkce = (vstup: string, init?: RequestInit) => Promise<Response>;

export function vytvorKlienta(nastaveni: SyncNastaveni, fetchFn?: FetchFunkce): QuestorKlient {
  const zakladUrl = nastaveni.url.replace(/\/+$/, '');
  const f: FetchFunkce = fetchFn ?? ((vstup, init) => globalThis.fetch(vstup, init));

  async function pozadavek<T>(
    metoda: 'GET' | 'POST' | 'PUT' | 'DELETE',
    cesta: string,
    telo?: unknown,
  ): Promise<T> {
    const kontroler = new AbortController();
    const casovac = setTimeout(() => kontroler.abort(), TIMEOUT_MS);
    try {
      const odpoved = await f(`${zakladUrl}${cesta}`, {
        method: metoda,
        headers: {
          'content-type': 'application/json',
          'x-questor-token': nastaveni.token,
        },
        body: telo === undefined ? undefined : JSON.stringify(telo),
        signal: kontroler.signal,
      });
      if (!odpoved.ok) {
        throw new ChybaSyncu(`Server odpověděl ${odpoved.status} na ${cesta}`, odpoved.status);
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
    zdravi: () => pozadavek('GET', '/zdravi'),
    seznamBank: () => pozadavek('GET', '/api/banky'),
    stahniBanku: (predmetId) => pozadavek('GET', `/api/banky/${encodeURIComponent(predmetId)}`),
    seznamVyuk: () => pozadavek('GET', '/api/vyuka'),
    stahniVyuku: (predmetId) => pozadavek('GET', `/api/vyuka/${encodeURIComponent(predmetId)}`),
    posliProgres: async (progres) => {
      await pozadavek('POST', '/api/progres', progres);
    },
    posliUdalost: async (vysledek) => {
      await pozadavek('POST', '/api/udalosti', vysledek);
    },
    posliVysledekVyzvy: async (vyzvaId, telo) => {
      await pozadavek('POST', `/api/vyzvy/${encodeURIComponent(vyzvaId)}/vysledek`, telo);
    },
    stahniProfily: () => pozadavek('GET', '/api/profily'),
    posliProfil: async (zaznam) => {
      // profilId nese URL, tělo je záznam bez něj (server by ho stejně stripnul).
      const { profilId, ...telo } = zaznam;
      await pozadavek('PUT', `/api/profily/${encodeURIComponent(profilId)}`, telo);
    },
    smazProfilNaServeru: async (profilId) => {
      await pozadavek('DELETE', `/api/profily/${encodeURIComponent(profilId)}`);
    },
    stahniProgres: (profilId) =>
      pozadavek('GET', `/api/progres/${encodeURIComponent(profilId)}`),
    stahniVyzvy: (profilId) =>
      pozadavek(
        'GET',
        profilId ? `/api/vyzvy?profilId=${encodeURIComponent(profilId)}` : '/api/vyzvy',
      ),
    vytvorDuel: (telo) => pozadavek('POST', '/api/duely', telo),
    stahniDuely: (profilId) =>
      pozadavek('GET', `/api/duely?profilId=${encodeURIComponent(profilId)}`),
    prijmiDuelNaServeru: (duelId, telo) =>
      pozadavek('POST', `/api/duely/${encodeURIComponent(duelId)}/prijmout`, telo),
    posliVysledekDuelu: async (duelId, telo) => {
      await pozadavek('POST', `/api/duely/${encodeURIComponent(duelId)}/vysledek`, telo);
    },
  };
}
