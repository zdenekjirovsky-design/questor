// Posílání látky ke zpracování (jen profil povolený správcem): API fronty,
// příprava fotek (zmenšení + převod HEIC → JPEG v zařízení) a nahrání
// s průběhem. Zpracování běží u správce — docs/ZPRACOVANI-LATKY.md.
import { useEffect, useState } from 'react';
import type { Material, MojeMaterialy } from '@questor/sdilene';
import { ChybaSyncu, nactiSyncNastaveni, type SyncNastaveni } from '../sync/klient';

/** Delší strana fotky po zmenšení — ručně psaný sešit je pořád dobře čitelný. */
export const MAX_STRANA_FOTKY = 2400;
const TIMEOUT_NAHRANI_MS = 5 * 60_000;

function zaklad(nastaveni: SyncNastaveni): string {
  return nastaveni.url.replace(/\/+$/, '');
}

export async function nactiMojiLatku(
  nastaveni: SyncNastaveni,
  profilId: string,
  fetchFn: typeof fetch = (vstup, init) => globalThis.fetch(vstup, init),
): Promise<MojeMaterialy> {
  const odpoved = await fetchFn(
    `${zaklad(nastaveni)}/api/materialy?profilId=${encodeURIComponent(profilId)}`,
    { headers: { 'x-questor-token': nastaveni.token } },
  );
  if (!odpoved.ok) throw new ChybaSyncu(`Server odpověděl ${odpoved.status}`, odpoved.status);
  return (await odpoved.json()) as MojeMaterialy;
}

/** Nahrání zásilky (multipart) s průběhem — XHR kvůli upload.onprogress. */
export function posliLatku(
  nastaveni: SyncNastaveni,
  formular: FormData,
  onPrubeh?: (podil: number) => void,
): Promise<Material> {
  return new Promise((vyres, odmitni) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${zaklad(nastaveni)}/api/materialy`);
    xhr.setRequestHeader('x-questor-token', nastaveni.token);
    xhr.timeout = TIMEOUT_NAHRANI_MS;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onPrubeh?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        vyres(JSON.parse(xhr.responseText) as Material);
        return;
      }
      let zprava = `Server odpověděl ${xhr.status}`;
      try {
        const telo = JSON.parse(xhr.responseText) as { chyba?: unknown };
        if (typeof telo.chyba === 'string') zprava = telo.chyba;
      } catch {
        // tělo není JSON — zůstane obecná zpráva
      }
      odmitni(new ChybaSyncu(zprava, xhr.status));
    };
    xhr.onerror = () => odmitni(new ChybaSyncu('Nepodařilo se spojit se serverem'));
    xhr.ontimeout = () => odmitni(new ChybaSyncu('Nahrávání trvalo moc dlouho'));
    xhr.send(formular);
  });
}

// ---------------------------------------------------------------------------
// Fotky
//
// CSP produkčního webu má `img-src 'self' data:` — obrázky z blob: URL tam
// prohlížeč zablokuje (náhledy i záložní dekódování přes <img>). Proto se
// fotky čtou jako data: URL (FileReader) a náhledy jsou malé JPEG data: URL
// z plátna. Paměť (hlavně iOS): 12Mpx fotka má po dekódování ~49 MB, takže
// se fotky dekódují PO JEDNÉ (fronta), bitmapa se hned zavře a sdílené
// plátno se po použití zmenší na 0×0 (Safari jinak drží paměť pláten do GC).

export function jeObrazek(soubor: File): boolean {
  return soubor.type.startsWith('image/') || /\.(heic|heif)$/i.test(soubor.name);
}

/** Delší strana náhledu ve výběru fotek (px) — buňka mřížky má ~100–200 CSS px. */
export const STRANA_NAHLEDU = 360;

const frontaPrednostni: Array<() => void> = [];
const frontaBezna: Array<() => void> = [];
let fotkaSeZpracovava = false;

function spustDalsiFotku(): void {
  const dalsi = frontaPrednostni.shift() ?? frontaBezna.shift();
  fotkaSeZpracovava = !!dalsi;
  dalsi?.();
}

/**
 * Spustí úkol až po doběhnutí předchozích — dekódování fotek po jedné.
 * `prednost` (příprava k odeslání) předběhne čekající náhledy, aby student
 * po klepnutí na „Poslat“ nečekal, než se dodělají náhledy celého výběru.
 */
export function poJedne<T>(ukol: () => Promise<T>, prednost = false): Promise<T> {
  return new Promise<T>((vyres, odmitni) => {
    const start = () => {
      Promise.resolve()
        .then(ukol)
        .then(vyres, odmitni)
        .finally(spustDalsiFotku);
    };
    (prednost ? frontaPrednostni : frontaBezna).push(start);
    if (!fotkaSeZpracovava) spustDalsiFotku();
  });
}

function nactiJakoDataUrl(soubor: Blob): Promise<string> {
  return new Promise((vyres, odmitni) => {
    const ctecka = new FileReader();
    ctecka.onload = () =>
      typeof ctecka.result === 'string' ? vyres(ctecka.result) : odmitni(new Error('Soubor nejde přečíst'));
    ctecka.onerror = () => odmitni(ctecka.error ?? new Error('Soubor nejde přečíst'));
    ctecka.readAsDataURL(soubor);
  });
}

interface NactenyObrazek {
  zdroj: CanvasImageSource;
  sirka: number;
  vyska: number;
  /** Uvolní dekódovaná data (ImageBitmap.close); smí se volat opakovaně. */
  uvolni: () => void;
}

async function nactiObrazek(soubor: File): Promise<NactenyObrazek> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmapa = await createImageBitmap(soubor, { imageOrientation: 'from-image' });
      return { zdroj: bitmapa, sirka: bitmapa.width, vyska: bitmapa.height, uvolni: () => bitmapa.close() };
    } catch {
      // Starší prohlížeč nebo formát — zkusí se <img>.
    }
  }
  // data: URL, ne blob: — blob: obrázky produkční CSP blokuje.
  const img = new Image();
  img.src = await nactiJakoDataUrl(soubor);
  await img.decode();
  return {
    zdroj: img,
    sirka: img.naturalWidth,
    vyska: img.naturalHeight,
    uvolni: () => img.removeAttribute('src'),
  };
}

let sdilenePlatno: HTMLCanvasElement | null = null;

/** Vykreslí obrázek zmenšený (delší strana ≤ maxStrana) na sdílené plátno. */
function vykresliZmensene(obrazek: NactenyObrazek, maxStrana: number): HTMLCanvasElement | null {
  const meritko = Math.min(1, maxStrana / Math.max(obrazek.sirka, obrazek.vyska));
  sdilenePlatno ??= document.createElement('canvas');
  const platno = sdilenePlatno;
  platno.width = Math.max(1, Math.round(obrazek.sirka * meritko));
  platno.height = Math.max(1, Math.round(obrazek.vyska * meritko));
  const kontext = platno.getContext('2d');
  if (!kontext) return null;
  kontext.drawImage(obrazek.zdroj, 0, 0, platno.width, platno.height);
  return platno;
}

/** Plátno 0×0 = Safari hned vrátí jeho paměť (limit paměti pláten na iOS). */
function uvolniPlatno(): void {
  if (!sdilenePlatno) return;
  sdilenePlatno.width = 0;
  sdilenePlatno.height = 0;
}

/**
 * Malý náhled fotky pro výběr jako data: URL (JPEG, desítky kB) — projde CSP
 * webu. null = fotku nejde přečíst (např. HEIF v Chrome) nebo je úkol zrušený
 * (stránka opuštěna); výběr pak ukáže jen ikonu.
 */
export function vytvorNahled(soubor: File, jeZruseno: () => boolean = () => false): Promise<string | null> {
  return poJedne(async () => {
    if (jeZruseno()) return null;
    let obrazek: NactenyObrazek;
    try {
      obrazek = await nactiObrazek(soubor);
    } catch {
      return null;
    }
    try {
      const platno = vykresliZmensene(obrazek, STRANA_NAHLEDU);
      const url = platno?.toDataURL('image/jpeg', 0.75);
      return url && url !== 'data:,' ? url : null;
    } catch {
      return null;
    } finally {
      obrazek.uvolni();
      uvolniPlatno();
    }
  });
}

/**
 * Připraví fotku k odeslání: HEIC a velké fotky převede na JPEG s delší
 * stranou nejvýš MAX_STRANA_FOTKY. Malé JPEG/PNG/WebP pošle beze změny.
 * Nepodaří-li se fotku přečíst, vrátí null (HEIC by server nepřijal).
 */
export function pripravFotku(soubor: File): Promise<File | null> {
  return poJedne(async () => {
    const podporovany = ['image/jpeg', 'image/png', 'image/webp'].includes(soubor.type);
    let obrazek: NactenyObrazek;
    try {
      obrazek = await nactiObrazek(soubor);
    } catch {
      return podporovany ? soubor : null;
    }
    try {
      const delsi = Math.max(obrazek.sirka, obrazek.vyska);
      if (podporovany && delsi <= MAX_STRANA_FOTKY && soubor.size <= 1.5 * 1024 * 1024) return soubor;
      const platno = vykresliZmensene(obrazek, MAX_STRANA_FOTKY);
      // Plná bitmapa už je na plátně — uvolnit ji dřív, než se kóduje JPEG.
      obrazek.uvolni();
      if (!platno) return podporovany ? soubor : null;
      const blob = await new Promise<Blob | null>((vyres) => platno.toBlob(vyres, 'image/jpeg', 0.85));
      if (!blob) return podporovany ? soubor : null;
      const nazev = `${soubor.name.replace(/\.[^.]+$/, '') || 'fotka'}.jpg`;
      return new File([blob], nazev, { type: 'image/jpeg' });
    } finally {
      obrazek.uvolni();
      uvolniPlatno();
    }
  }, true);
}

// ---------------------------------------------------------------------------
// Povolení (smí aktivní profil posílat látku?)

const povoleniCache = new Map<string, boolean>();

// Poslední známá odpověď serveru se drží i v localStorage per profil:
// tlačítko „Poslat látku“ v Učit se se pak ukáže hned při vykreslení a po
// síťovém dotazu neposune obsah pod prstem (server odpověď jen potvrdí).
const KLIC_POVOLENI = 'questor-latka-povoleni:';

function ulozenePovoleni(profilId: string): boolean | undefined {
  try {
    const hodnota = localStorage.getItem(KLIC_POVOLENI + profilId);
    return hodnota === '1' ? true : hodnota === '0' ? false : undefined;
  } catch {
    return undefined;
  }
}

function ulozPovoleni(profilId: string, smi: boolean): void {
  povoleniCache.set(profilId, smi);
  try {
    localStorage.setItem(KLIC_POVOLENI + profilId, smi ? '1' : '0');
  } catch {
    // Tiché — povolení se jen příště zjistí znovu ze serveru.
  }
}

function syncZapnuty(): boolean {
  const nastaveni = nactiSyncNastaveni();
  return !!nastaveni.url && !!nastaveni.token;
}

/** Poslední známé povolení (běh aplikace → localStorage); bez syncu false. */
export function znamePovoleniLatky(profilId: string | undefined): boolean {
  if (!profilId || !syncZapnuty()) return false;
  return povoleniCache.get(profilId) ?? ulozenePovoleni(profilId) ?? false;
}

/** Zeptá se serveru (jednou za běh aplikace na profil); bez syncu vždy false. */
export function usePovoleniLatky(profilId: string | undefined): boolean {
  const [smi, setSmi] = useState(() => znamePovoleniLatky(profilId));
  useEffect(() => {
    setSmi(znamePovoleniLatky(profilId));
    if (!profilId || povoleniCache.has(profilId)) return;
    const nastaveni = nactiSyncNastaveni();
    if (!nastaveni.url || !nastaveni.token) return;
    let zruseno = false;
    nactiMojiLatku(nastaveni, profilId)
      .then((m) => {
        ulozPovoleni(profilId, m.smiNahravat);
        if (!zruseno) setSmi(m.smiNahravat);
      })
      .catch(() => {});
    return () => {
      zruseno = true;
    };
  }, [profilId]);
  return smi;
}

/** Stránka Poslat látku si povolení zjistí čerstvě a uloží do cache. */
export function zapamatujPovoleni(profilId: string, smi: boolean): void {
  ulozPovoleni(profilId, smi);
}
