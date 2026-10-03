// Ciste pomucky vyukove casti (bez DOM a bez Reactu) — rozhodnuti o posunu
// stranky v lekci, stabilni klice bloku, doporuceni „pokracuj tady" a lupa
// schematu (ObrazekBlok).
// Testy: lekceLogika.test.ts.
import type { Lekce, VyukovyBlok } from '@questor/sdilene';
import { hashRetezce } from '@questor/sdilene';

export type ZarovnaniBloku = 'start' | 'center';

/**
 * Jak zarovnat nove odkryty blok po „Pokracovat ↓“ (scrollIntoView):
 * - mobil: VZDY zacatek bloku pod prilepenou listu lekce — bloky jsou na
 *   uzkem displeji vysoke a stred by poslal nadpis nad okraj / pod listu,
 * - desktop: stred jako dosud; jen blok vyssi nez misto pod listou jde na
 *   zacatek (jinak by jeho zacatek zajel pod prilepenou listu).
 */
export function zarovnaniBloku(p: {
  mobil: boolean;
  vyskaBloku: number;
  vyskaOkna: number;
  /** Spodni hrana prilepene listy (jeji vyska + odsazeni od horniho okraje). */
  vyskaListy: number;
}): ZarovnaniBloku {
  if (p.mobil) return 'start';
  return p.vyskaBloku > p.vyskaOkna - p.vyskaListy ? 'start' : 'center';
}

/**
 * Stabilni React klic bloku: index + typ + otisk obsahu. Nova verze lekce
 * (sync, IndexedDB po bundlu) tak zmeneny blok namontuje znovu (widget nedostane
 * nova data se starym vnitrnim stavem), nezmenene bloky si stav drzi.
 */
export function klicBloku(blok: VyukovyBlok, index: number): string {
  return `${index}:${blok.typ}:${hashRetezce(JSON.stringify(blok)).toString(36)}`;
}

/** Maji dve verze lekce stejny obsah? (identita objektu se meni s kazdou verzi vyuky) */
export function stejnyObsahLekce(a: Lekce, b: Lekce): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Doporuceni „pokracuj tady“ na Ucit se: prvni rozdelana lekce, jinak prvni
 * nezacata. Uz zobrazene (pripnute) doporuceni plati po celou navstevu
 * stranky, dokud lekce existuje a neni hotova — pozdni pull postupu z jineho
 * zarizeni tak kartu nevymeni studentovi pod prstem. Pripnuti plati jen ve
 * svem kontextu (viz pripnuteVKontextu).
 */
export function vyberDoporuceni<T extends { lekce: { temaId: string }; zacata: boolean; hotovo: boolean }>(
  lekce: readonly T[],
  pripnuteTemaId: string | null,
): T | null {
  if (pripnuteTemaId !== null) {
    const pripnuta = lekce.find((l) => l.lekce.temaId === pripnuteTemaId);
    if (pripnuta && !pripnuta.hotovo) return pripnuta;
  }
  return lekce.find((l) => l.zacata && !l.hotovo) ?? lekce.find((l) => !l.hotovo) ?? null;
}

/** Pripnute doporuceni + kontext (profil | aktivni banka), ve kterem vzniklo. */
export interface PripnutiDoporuceni {
  kontext: string;
  temaId: string | null;
}

/** Klic kontextu pripnuti doporuceni: profil + aktivni banka. */
export function kontextDoporuceni(profilId: string | null | undefined, aktivniBanka: string | null): string {
  return `${profilId ?? ''}|${aktivniBanka ?? ''}`;
}

/**
 * Pripnute tema doporuceni, jen kdyz vzniklo ve stejnem kontextu. Prepnuti
 * banky nebo profilu je vedoma volba studenta (ne pozdni sync) — pripnuti
 * rusi a doporuceni se vybere znovu (aktivni banka je v seznamu prvni).
 */
export function pripnuteVKontextu(pripnuti: PripnutiDoporuceni, kontext: string): string | null {
  return pripnuti.kontext === kontext ? pripnuti.temaId : null;
}

/**
 * Lupa schematu nic neprida? Zvetsena sirka SVG (--obrazek-sirka) se vejde
 * do vnitrni sirky platna (nebo ji prekroci o mene nez 15 %) — na telefonu
 * na sirku a malem tabletu by tlacitko „Zvětšit“ jen menilo text. Neznama
 * sirka (0, platno jeste nema layout) = lupu nechat.
 */
export function jeZvetseniZbytecne(sirkaZvetseni: number, vnitrniSirkaPlatna: number): boolean {
  return vnitrniSirkaPlatna > 0 && sirkaZvetseni <= vnitrniSirkaPlatna * 1.15;
}
