// Admin účet (přehled rodiny pro rodiče): admin kód = admin token serveru.
// Uloží se jen na zařízení správce (localStorage) — nikdy do stavu aplikace,
// sync fronty ani logů. Přihlášení jedním klepnutím: odkaz
// …/questor/#admin=<kód> (fragment nechodí na server; po přečtení se čistí).
import type { FrontaMaterialu, Material, PrehledRodiny } from '@questor/sdilene';
import { ChybaSyncu, vychoziUloziste, type FetchFunkce, type Uloziste } from '../sync/klient';

const KLIC_ADMIN_KODU = 'questor-admin-kod';
const TIMEOUT_MS = 15_000;

export function nactiAdminKod(uloziste: Uloziste = vychoziUloziste()): string | null {
  try {
    const kod = uloziste.getItem(KLIC_ADMIN_KODU);
    return kod && kod.trim() ? kod.trim() : null;
  } catch {
    return null;
  }
}

export function ulozAdminKod(kod: string, uloziste: Uloziste = vychoziUloziste()): void {
  try {
    uloziste.setItem(KLIC_ADMIN_KODU, kod.trim());
  } catch {
    // Tiché — přihlášení prostě nepřežije restart.
  }
}

export function smazAdminKod(uloziste: Uloziste = vychoziUloziste()): void {
  try {
    uloziste.removeItem(KLIC_ADMIN_KODU);
  } catch {
    // Tiché.
  }
}

/** Kód z fragmentu `#admin=<kód>`, jinak null. */
export function adminKodZHashe(hash: string): string | null {
  const shoda = /^#admin=([A-Za-z0-9._~-]{8,200})$/.exec(hash.trim());
  return shoda ? decodeURIComponent(shoda[1]) : null;
}

/**
 * Převezme přihlašovací odkaz před startem aplikace: uloží kód, vyčistí
 * fragment z adresy (kód nesmí zůstat v historii ani na screenshotu)
 * a přesměruje na /admin. Vrací true, když odkaz převzal.
 */
export function prevezmiAdminOdkaz(zaklad: string): boolean {
  if (typeof window === 'undefined') return false;
  const kod = adminKodZHashe(window.location.hash ?? '');
  if (!kod) return false;
  ulozAdminKod(kod);
  window.history.replaceState(null, '', `${zaklad.replace(/\/?$/, '/')}admin`);
  return true;
}

/** Stáhne přehled rodiny (GET /api/admin/prehled) s admin kódem. */
export async function stahniPrehledRodiny(
  url: string,
  kod: string,
  fetchFn: FetchFunkce = (vstup, init) => globalThis.fetch(vstup, init),
): Promise<PrehledRodiny> {
  const kontroler = new AbortController();
  const casovac = setTimeout(() => kontroler.abort(), TIMEOUT_MS);
  try {
    const odpoved = await fetchFn(`${url.replace(/\/+$/, '')}/api/admin/prehled`, {
      method: 'GET',
      headers: { 'x-questor-token': kod },
      signal: kontroler.signal,
    });
    if (!odpoved.ok) {
      throw new ChybaSyncu(`Server odpověděl ${odpoved.status}`, odpoved.status);
    }
    return (await odpoved.json()) as PrehledRodiny;
  } catch (chyba) {
    if (chyba instanceof ChybaSyncu) throw chyba;
    throw new ChybaSyncu(chyba instanceof Error ? chyba.message : 'Síťová chyba');
  } finally {
    clearTimeout(casovac);
  }
}

// ---------------------------------------------------------------------------
// Formátování pro přehled

/** Lidský relativní čas: „právě teď", „dnes 14:32", „včera 8:05", „před 3 dny", „12. 9.". */
export function kdyRelativne(iso: string | null, ted: Date = new Date()): string {
  if (!iso) return 'zatím nikdy';
  const cas = new Date(iso);
  if (Number.isNaN(cas.getTime())) return 'neznámo';
  const rozdilMs = ted.getTime() - cas.getTime();
  if (rozdilMs >= 0 && rozdilMs < 60_000) return 'právě teď';
  const hodiny = cas.toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit' });
  const den = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dny = Math.round((den(ted) - den(cas)) / 86_400_000);
  if (dny === 0) return `dnes ${hodiny}`;
  if (dny === 1) return `včera ${hodiny}`;
  if (dny > 1 && dny < 7) return `před ${dny} dny`;
  return cas.toLocaleDateString(
    'cs-CZ',
    cas.getFullYear() === ted.getFullYear()
      ? { day: 'numeric', month: 'numeric' }
      : { day: 'numeric', month: 'numeric', year: 'numeric' },
  );
}

export function procenta(podil: number | null): string {
  return podil === null ? '—' : `${Math.round(podil * 100)} %`;
}

/** Slabá témata: dost odpovědí a úspěšnost pod 70 %, nejslabší první. */
export function slabaTemata<T extends { odpovedi: number; uspesnost: number | null }>(
  temata: T[],
  minOdpovedi = 4,
): T[] {
  return temata
    .filter((t) => t.odpovedi >= minOdpovedi && t.uspesnost !== null && t.uspesnost < 0.7)
    .sort((a, b) => (a.uspesnost ?? 0) - (b.uspesnost ?? 0));
}

// ---------------------------------------------------------------------------
// Látka ke zpracování (fronta od studentů)

async function adminPozadavek<T>(
  url: string,
  kod: string,
  metoda: 'GET' | 'PUT' | 'POST' | 'DELETE',
  cesta: string,
  telo?: unknown,
  fetchFn: FetchFunkce = (vstup, init) => globalThis.fetch(vstup, init),
): Promise<T> {
  let odpoved: Response;
  try {
    odpoved = await fetchFn(`${url.replace(/\/+$/, '')}${cesta}`, {
      method: metoda,
      headers: {
        'x-questor-token': kod,
        ...(telo === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: telo === undefined ? undefined : JSON.stringify(telo),
    });
  } catch (chyba) {
    throw new ChybaSyncu(chyba instanceof Error ? chyba.message : 'Síťová chyba');
  }
  if (!odpoved.ok) {
    let zprava = `Server odpověděl ${odpoved.status}`;
    try {
      const data = (await odpoved.json()) as { chyba?: unknown };
      if (typeof data.chyba === 'string') zprava = data.chyba;
    } catch {
      // tělo není JSON
    }
    throw new ChybaSyncu(zprava, odpoved.status);
  }
  return (await odpoved.json()) as T;
}

export const stahniFrontuLatky = (url: string, kod: string, fetchFn?: FetchFunkce) =>
  adminPozadavek<FrontaMaterialu>(url, kod, 'GET', '/api/admin/materialy', undefined, fetchFn);

export const nastavPovoleniLatky = (url: string, kod: string, povoleneProfily: string[], fetchFn?: FetchFunkce) =>
  adminPozadavek<{ ok: boolean; povoleneProfily: string[] }>(
    url,
    kod,
    'PUT',
    '/api/admin/materialy/povoleni',
    { povoleneProfily },
    fetchFn,
  );

export const vratLatku = (url: string, kod: string, id: string, fetchFn?: FetchFunkce) =>
  adminPozadavek<Material>(url, kod, 'POST', `/api/admin/materialy/${encodeURIComponent(id)}/vratit`, undefined, fetchFn);

export const smazLatku = (url: string, kod: string, id: string, fetchFn?: FetchFunkce) =>
  adminPozadavek<{ ok: boolean }>(url, kod, 'DELETE', `/api/admin/materialy/${encodeURIComponent(id)}`, undefined, fetchFn);
