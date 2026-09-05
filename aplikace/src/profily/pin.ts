// PIN profilu — MEKKA ochrana soukromi mezi cleny domacnosti na jednom
// pocitaci (zadne sitove overovani, zadny e-mail). Hash: SHA-256 pres
// crypto.subtle se soli = id profilu, ulozeny jako hex retezec.
//
// Brzda hrubou silou drzi UI (viz VyberProfilu): 3 spatne pokusy = 30 s
// pauza. Stav pokusu zije v modulove mape (per id profilu), aby ho
// remount obrazovky nevynuloval.

/** PIN je 4–6 cislic. */
export const PIN_REGEX = /^[0-9]{4,6}$/;

export const MAX_POKUSU = 3;
export const PAUZA_MS = 30_000;

export function jePlatnyPin(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

/**
 * crypto.subtle existuje jen v zabezpecenem kontextu (https, localhost,
 * Tauri) — hostovana web verze pres http://<ip> na LAN ho NEMA. Formulare
 * PIN pole pri nepodpore schovaji s vysvetlenim, aby hash nespadl tise
 * a uzivatel neveril, ze ma profil zamceny.
 */
export function jePinPodporovan(): boolean {
  try {
    return typeof crypto !== 'undefined' && typeof crypto.subtle?.digest === 'function';
  } catch {
    return false;
  }
}

function naHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** SHA-256(`${idProfilu}:${pin}`) → hex. Sul je id profilu (nahodne per profil). */
export async function zahashujPin(pin: string, idProfilu: string): Promise<string> {
  const data = new TextEncoder().encode(`${idProfilu}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return naHex(digest);
}

export async function overPin(pin: string, idProfilu: string, pinHash: string): Promise<boolean> {
  if (!jePlatnyPin(pin)) return false;
  return (await zahashujPin(pin, idProfilu)) === pinHash;
}

// ---------------------------------------------------------------------------
// Brzda pokusu (in-memory; po restartu aplikace se pocita znovu — mekka ochrana)

interface StavPokusu {
  spatnychPoSobe: number;
  /** Timestamp (ms), pred kterym je zadani PINu zablokovane; null = volno. */
  blokovanoDo: number | null;
}

const pokusy = new Map<string, StavPokusu>();

/** Kolik ms jeste trva pauza po 3 spatnych pokusech (0 = zadna). */
export function zbyvaPauzaMs(idProfilu: string, ted: number = Date.now()): number {
  const stav = pokusy.get(idProfilu);
  if (!stav || stav.blokovanoDo === null) return 0;
  return Math.max(0, stav.blokovanoDo - ted);
}

/** Zaznamena vysledek pokusu o PIN; pri 3. spatnem po sobe spusti 30 s pauzu. */
export function zaznamenejPokus(idProfilu: string, spravne: boolean, ted: number = Date.now()): void {
  if (spravne) {
    pokusy.delete(idProfilu);
    return;
  }
  const stav = pokusy.get(idProfilu) ?? { spatnychPoSobe: 0, blokovanoDo: null };
  const spatnychPoSobe = stav.spatnychPoSobe + 1;
  pokusy.set(idProfilu, {
    spatnychPoSobe,
    blokovanoDo: spatnychPoSobe % MAX_POKUSU === 0 ? ted + PAUZA_MS : stav.blokovanoDo,
  });
}

/** Jen pro testy — vynuluje pametovy stav pokusu. */
export function vynulujPokusyProTesty(): void {
  pokusy.clear();
}
