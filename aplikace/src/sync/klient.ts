// Fetch klient serveru QUESTORu — tenká vrstva nad API kontraktem
// (viz docs/ARCHITEKTURA.md). Fetch i úložiště se injektují kvůli testům.
import type { BankaOtazek, ProgresStudenta, TestVysledek, Vyzva } from '@questor/sdilene';

// ---------------------------------------------------------------------------
// Nastavení připojení (URL + studentský token) — stránka Nastavení

export interface SyncNastaveni {
  url: string;
  token: string;
}

export const VYCHOZI_SYNC_NASTAVENI: SyncNastaveni = {
  url: 'http://localhost:8787',
  token: 'student-dev',
};

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
      token:
        typeof data.token === 'string' && data.token ? data.token : VYCHOZI_SYNC_NASTAVENI.token,
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
  /**
   * Otevrene vyzvy; s profilId server vrati jen vyzvy cilene na dany profil
   * + spolecne (kontrakt GET /api/vyzvy?profilId=). Bez profilId vsechny.
   */
  stahniVyzvy(profilId?: string): Promise<Vyzva[]>;
}

export type FetchFunkce = (vstup: string, init?: RequestInit) => Promise<Response>;

export function vytvorKlienta(nastaveni: SyncNastaveni, fetchFn?: FetchFunkce): QuestorKlient {
  const zakladUrl = nastaveni.url.replace(/\/+$/, '');
  const f: FetchFunkce = fetchFn ?? ((vstup, init) => globalThis.fetch(vstup, init));

  async function pozadavek<T>(metoda: 'GET' | 'POST' | 'PUT', cesta: string, telo?: unknown): Promise<T> {
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
    stahniVyzvy: (profilId) =>
      pozadavek(
        'GET',
        profilId ? `/api/vyzvy?profilId=${encodeURIComponent(profilId)}` : '/api/vyzvy',
      ),
  };
}
