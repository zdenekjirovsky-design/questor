// Posuny stranky v testu, duelu a parovani. Na telefonu se zpetna vazba
// s tlacitkem „Dalsi" vykresli pod ohybem (a pod fixni spodni listou) a nova
// otazka zdedi stary scroll — student pak po kazde odpovedi scrolluje dolu
// a zase nahoru. Pomucky tu proto:
// - po odpovedi plynule doroluji prvek do zorneho pole, JEN kdyz neni cely
//   videt (scrollIntoView block 'nearest' — na desktopu typicky nic),
// - po zmene otazky vrati jeji zacatek do zorneho pole, JEN kdyz je nad
//   hornim okrajem.
// Okraje (fixni spodni lista + safe-area dole, safe-area nahore) drzi CSS
// pres scroll-margin (testy.css, Duely.css); prilepenou hlavicku lekce
// (parovani v mini-kvizu) zohlednuje okrajPrilepeneListy.
import { useLayoutEffect, type RefObject } from 'react';

/** Plynuly posun, pokud si uzivatel nevyzadal omezeni pohybu. */
export function chovaniPosunu(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  } catch {
    return 'smooth';
  }
}

/**
 * Plynule doroluje prvek do zorneho pole — jen kdyz neni cely videt
 * (`block: 'nearest'` respektuje scroll-margin prvku, takze pocita i s fixni
 * spodni listou). Prvek vyssi nez okno se zarovna zacatkem.
 */
export function posunDoZorneho(prvek: Element | null | undefined): void {
  if (!prvek || typeof prvek.scrollIntoView !== 'function') return;
  prvek.scrollIntoView({ block: 'nearest', behavior: chovaniPosunu() });
}

/**
 * Je horni hrana prvku (px od horniho okraje okna) nad hornim okrajem
 * zorneho pole (`okrajPx` = scroll-margin-top, napr. safe-area)? Cista
 * funkce; 1 px tolerance proti zaokrouhleni.
 */
export function jeNadHornimOkrajem(horniHranaPx: number, okrajPx: number): boolean {
  return horniHranaPx < okrajPx - 1;
}

/**
 * Spodni hrana prilepene hlavicky lekce (px od horniho okraje okna) — kdyz
 * je prvek uvnitr lekce a hlavicka je sticky; jinak null. Pocita se z jejiho
 * `top` (vc. safe-area) + vysky, tedy pro stav „prilepeno".
 */
export function okrajPrilepeneListy(prvek: Element): number | null {
  if (typeof window === 'undefined') return null;
  const lista = prvek.closest('.lekce')?.querySelector<HTMLElement>('.lekce__hlavicka');
  if (!lista) return null;
  const styl = window.getComputedStyle(lista);
  if (styl.position !== 'sticky' && styl.position !== '-webkit-sticky') return null;
  return (parseFloat(styl.top) || 0) + lista.getBoundingClientRect().height;
}

/**
 * Jako posunDoZorneho, ale uvnitr lekce posune horni okraj pod prilepenou
 * hlavicku lekce (scroll-margin-top inline — jeji vyska se meni se zalomenim
 * nazvu, konstanta v CSS by nesedela). Mimo lekci plati scroll-margin z CSS.
 */
export function posunPodListou(prvek: HTMLElement | null | undefined): void {
  if (!prvek) return;
  const lista = okrajPrilepeneListy(prvek);
  if (lista !== null) prvek.style.scrollMarginTop = `${Math.ceil(lista) + 8}px`;
  posunDoZorneho(prvek);
}

/**
 * Po zmene `klic` (dalsi otazka) a pri mountu vrati zacatek prvku do zorneho
 * pole, kdyz je nad hornim okrajem. Bez animace a jeste pred vykreslenim
 * (layout efekt) — nova otazka se rovnou ukaze od zacatku.
 */
export function pouzijNavratNaZacatek(ref: RefObject<HTMLElement | null>, klic: unknown): void {
  useLayoutEffect(() => {
    const prvek = ref.current;
    if (!prvek || typeof window === 'undefined' || typeof prvek.scrollIntoView !== 'function') {
      return;
    }
    const okraj = parseFloat(window.getComputedStyle(prvek).scrollMarginTop) || 0;
    if (!jeNadHornimOkrajem(prvek.getBoundingClientRect().top, okraj)) return;
    prvek.scrollIntoView({ block: 'start', behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ref je stabilni, ridi jen klic
  }, [klic]);
}
