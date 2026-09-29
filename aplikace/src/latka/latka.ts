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

export function jeObrazek(soubor: File): boolean {
  return soubor.type.startsWith('image/') || /\.(heic|heif)$/i.test(soubor.name);
}

async function nactiObrazek(soubor: File): Promise<{ zdroj: CanvasImageSource; sirka: number; vyska: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmapa = await createImageBitmap(soubor, { imageOrientation: 'from-image' });
      return { zdroj: bitmapa, sirka: bitmapa.width, vyska: bitmapa.height };
    } catch {
      // Starší prohlížeč nebo formát — zkusí se <img>.
    }
  }
  const url = URL.createObjectURL(soubor);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { zdroj: img, sirka: img.naturalWidth, vyska: img.naturalHeight };
  } finally {
    // Obrázek už je dekódovaný, URL se může uvolnit až po vykreslení —
    // proto zpožděně.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/**
 * Připraví fotku k odeslání: HEIC a velké fotky převede na JPEG s delší
 * stranou nejvýš MAX_STRANA_FOTKY. Malé JPEG/PNG/WebP pošle beze změny.
 * Nepodaří-li se fotku přečíst, vrátí null (HEIC by server nepřijal).
 */
export async function pripravFotku(soubor: File): Promise<File | null> {
  const podporovany = ['image/jpeg', 'image/png', 'image/webp'].includes(soubor.type);
  let obrazek: Awaited<ReturnType<typeof nactiObrazek>>;
  try {
    obrazek = await nactiObrazek(soubor);
  } catch {
    return podporovany ? soubor : null;
  }
  const delsi = Math.max(obrazek.sirka, obrazek.vyska);
  if (podporovany && delsi <= MAX_STRANA_FOTKY && soubor.size <= 1.5 * 1024 * 1024) return soubor;
  const meritko = Math.min(1, MAX_STRANA_FOTKY / delsi);
  const platno = document.createElement('canvas');
  platno.width = Math.max(1, Math.round(obrazek.sirka * meritko));
  platno.height = Math.max(1, Math.round(obrazek.vyska * meritko));
  const kontext = platno.getContext('2d');
  if (!kontext) return podporovany ? soubor : null;
  kontext.drawImage(obrazek.zdroj, 0, 0, platno.width, platno.height);
  const blob = await new Promise<Blob | null>((vyres) => platno.toBlob(vyres, 'image/jpeg', 0.85));
  if (!blob) return podporovany ? soubor : null;
  const nazev = `${soubor.name.replace(/\.[^.]+$/, '') || 'fotka'}.jpg`;
  return new File([blob], nazev, { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// Povolení (smí aktivní profil posílat látku?)

const povoleniCache = new Map<string, boolean>();

/** Zeptá se serveru (jednou za běh aplikace na profil); bez syncu vždy false. */
export function usePovoleniLatky(profilId: string | undefined): boolean {
  const [smi, setSmi] = useState(() => (profilId ? (povoleniCache.get(profilId) ?? false) : false));
  useEffect(() => {
    if (!profilId) return;
    if (povoleniCache.has(profilId)) {
      setSmi(povoleniCache.get(profilId)!);
      return;
    }
    const nastaveni = nactiSyncNastaveni();
    if (!nastaveni.url || !nastaveni.token) return;
    let zruseno = false;
    nactiMojiLatku(nastaveni, profilId)
      .then((m) => {
        povoleniCache.set(profilId, m.smiNahravat);
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
  povoleniCache.set(profilId, smi);
}
