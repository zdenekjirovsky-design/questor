// Uloziste obsahu predmetu (banky otazek, vyuky) v IndexedDB — BEZ zavislosti.
//
// Obsah NESMI byt v zustand persist (localStorage ma kvotu ~5 MB a 14
// predmetu by ji preteklo). Bundlovany obsah se nacita z async chunku;
// tohle uloziste drzi JEN obsah stazeny ze serveru (vyssi verze nez bundle),
// aby prezil restart aplikace. Pri startu se jim bundle preplacne, kdyz ma
// vyssi verzi (versionovani resi prijmiBanku/prijmiVyuku).
//
// Vsechno je fail-safe: kdyz IndexedDB neni (Node v testech, private mode)
// nebo operace selze, cteni vrati prazdno a zapis se tise preskoci —
// aplikace pak proste jede jen z bundlu a serveru.

const DB_NAZEV = 'questor-obsah';
const DB_VERZE = 1;

export type TypObsahu = 'banky' | 'vyuky';

function otevriDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let indexedDb: IDBFactory | undefined;
    try {
      indexedDb = typeof indexedDB !== 'undefined' ? indexedDB : undefined;
    } catch {
      indexedDb = undefined;
    }
    if (!indexedDb) {
      resolve(null);
      return;
    }
    try {
      const zadost = indexedDb.open(DB_NAZEV, DB_VERZE);
      zadost.onupgradeneeded = () => {
        const db = zadost.result;
        if (!db.objectStoreNames.contains('banky')) db.createObjectStore('banky');
        if (!db.objectStoreNames.contains('vyuky')) db.createObjectStore('vyuky');
      };
      zadost.onsuccess = () => resolve(zadost.result);
      zadost.onerror = () => resolve(null);
      zadost.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Ulozi obsah predmetu (klic = predmetId, hodnota = cely JSON). Tise selze. */
export async function ulozObsah(typ: TypObsahu, predmetId: string, obsah: unknown): Promise<void> {
  const db = await otevriDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transakce = db.transaction(typ, 'readwrite');
      transakce.objectStore(typ).put(obsah, predmetId);
      transakce.oncomplete = () => resolve();
      transakce.onerror = () => resolve();
      transakce.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Nacte vsechen ulozeny obsah daneho typu. Pri chybe vrati prazdne pole. */
export async function nactiVsechenObsah(typ: TypObsahu): Promise<unknown[]> {
  const db = await otevriDb();
  if (!db) return [];
  const vysledek = await new Promise<unknown[]>((resolve) => {
    try {
      const zadost = db.transaction(typ, 'readonly').objectStore(typ).getAll();
      zadost.onsuccess = () => resolve(Array.isArray(zadost.result) ? zadost.result : []);
      zadost.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  return vysledek;
}

/** Smaze ulozeny obsah predmetu (napr. kdyz ho server uz nenabizi). Tise selze. */
export async function smazObsah(typ: TypObsahu, predmetId: string): Promise<void> {
  const db = await otevriDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transakce = db.transaction(typ, 'readwrite');
      transakce.objectStore(typ).delete(predmetId);
      transakce.oncomplete = () => resolve();
      transakce.onerror = () => resolve();
      transakce.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}
