// Scroll pri navigaci mezi strankami. App.tsx je „zmrazeny", proto samostatna
// komponenta, kterou main.tsx vklada do BrowserRouteru PRED <App/>.
//
// - PUSH/REPLACE na JINOU cestu → okamzite nahoru. Bez toho nova stranka
//   dedila scrollY predchozi (vysledek testu odrolovany dolu bez skore, lekce
//   otevrena uprostred, test po „Jdeme na to!" ve vysce dashboardu).
// - POP (zpet/vpred, gesto Zpet na Androidu, swipe-back v Safari) → vrati
//   pozici, kterou stranka mela, kdyz z ni student odesel. Neznamou pozici
//   (napr. po reloadu) nechava byt — po reloadu pozici obnovi prohlizec
//   (pri odchodu ze stranky se vraci 'auto', viz vratAutoPriOdchodu).
//
// Proc useLayoutEffect: BrowserRouter v react-router 7 meni location uvnitr
// startTransition, nova routa se tedy vykresli az nekdy po kliknuti/popstate.
// Layout efekt bezi v commitu, kde uz je v DOM nova routa, a jeste pred
// vykreslenim snimku — reset neodroluje starou stranku a student nevidi
// poskok. Bezi pred pasivnimi efekty stranek (LekceViewer si po nem muze
// plynule najet na rozdelany blok).
//
// Proc history.scrollRestoration = 'manual': prohlizec pozici obnovuje hned
// po popstate, tedy nad STAROU strankou (React novou vykresli az pozdeji
// v transition). Pozice se orizne podle vysky stare stranky a po vykresleni
// nove stranka skoci nebo zustane jinde. Rucni obnova po commitu nove routy
// je deterministicka — stejny princip jako <ScrollRestoration> data routeru,
// ktery s BrowserRouterem pouzit nejde. Pozice se prubezne ukladaji podle
// location.key (kazdy zaznam historie ma vlastni) jen v pameti tabu.
//
// Rezim obnovy se ale uklada k ZAZNAMU historie a prezije reload (Chrome,
// WebKit, Gecko) — s trvalym 'manual' by prohlizec po F5, obnove zahozeneho
// tabu nebo navratu z jineho dokumentu bez bfcache pozici neobnovil a pamet
// pozic (jen v modulu) je po reloadu prazdna → stranka by zacala nahore.
// Proto pri odchodu (pagehide, schovani tabu — iOS umi tab na pozadi zahodit
// bez pagehide) vracime 'auto' a pri navratu (pageshow z bfcache, zviditelneni)
// zase 'manual'. Stejne to dela <ScrollRestoration> data routeru. SPA
// navigace bezi jen ve viditelnem dokumentu, rucni obnovu to nenarusi.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/** Kolik poslednich zaznamu historie si pamatujeme (pamet nesmi rust bez mezi). */
export const LIMIT_POZIC = 50;

/** Okno, jak ho pozice potrebuje (v testech podvrh). */
export interface OknoProScroll {
  readonly scrollY: number;
  addEventListener(typ: 'scroll', posluchac: () => void, volby?: AddEventListenerOptions): void;
  removeEventListener(typ: 'scroll', posluchac: () => void): void;
}

/** History, jak ho potrebuje rucni obnova (v testech podvrh). */
export interface HistorieProScroll {
  scrollRestoration?: ScrollRestoration;
}

/**
 * Srovna scroll po zmene cesty: PUSH/REPLACE → nahoru, POP → ulozena pozice
 * cile (nezname-li ji, nic). Telo layout efektu — samostatne kvuli testum.
 */
export function srovnejScrollPoNavigaci(
  typNavigace: string,
  klic: string,
  pamet: ReadonlyMap<string, number>,
  scrollTo: (x: number, y: number) => void,
): void {
  const cil = typNavigace === 'POP' ? pamet.get(klic) : 0;
  if (cil !== undefined) scrollTo(0, cil);
}

/** Ulozi pozici zaznamu historie; nejstarsi zaznamy nad limit zahodi. */
export function zapamatujPozici(
  pamet: Map<string, number>,
  klic: string,
  y: number,
  limit: number = LIMIT_POZIC,
): void {
  // delete + set posune klic na konec — Map drzi poradi vlozeni, takze
  // na zacatku zustavaji nejdele nenavstivene zaznamy.
  pamet.delete(klic);
  pamet.set(klic, y);
  while (pamet.size > limit) {
    const nejstarsi = pamet.keys().next().value;
    if (nejstarsi === undefined) break;
    pamet.delete(nejstarsi);
  }
}

/** Prubezne uklada scrollY aktualniho zaznamu historie; vraci uklid. */
export function sledujPozici(
  okno: OknoProScroll,
  aktualniKlic: () => string,
  pamet: Map<string, number>,
): () => void {
  const priScrollu = () => zapamatujPozici(pamet, aktualniKlic(), okno.scrollY);
  okno.addEventListener('scroll', priScrollu, { passive: true });
  return () => okno.removeEventListener('scroll', priScrollu);
}

/**
 * Prepne obnovu scrollu pri zpet/vpred na rucni; vraci uklid, ktery vrati
 * puvodni hodnotu. Bez podpory (stara WebView) nic nedela.
 */
export function nastavRucniObnovu(historie: HistorieProScroll): () => void {
  if (!('scrollRestoration' in historie)) return () => {};
  const puvodni = historie.scrollRestoration;
  historie.scrollRestoration = 'manual';
  return () => {
    historie.scrollRestoration = puvodni;
  };
}

/** Cil udalosti odchodu/navratu (window, document; v testech podvrh). */
export interface CilUdalostiOdchodu {
  addEventListener(typ: string, posluchac: (e: Event) => void): void;
  removeEventListener(typ: string, posluchac: (e: Event) => void): void;
}

/** Dokument, jak ho potrebuje vratAutoPriOdchodu (v testech podvrh). */
export interface DokumentProOdchod extends CilUdalostiOdchodu {
  readonly visibilityState: string;
}

/**
 * Pri odchodu ze stranky vrati obnove scrollu 'auto' (rezim se uklada
 * k zaznamu historie a prezije reload — prohlizec pak pozici obnovi sam),
 * pri navratu nastavi zpet 'manual':
 *  - pagehide → 'auto'; pageshow z bfcache (persisted) → 'manual',
 *  - visibilitychange: hidden → 'auto', visible → 'manual' (iOS umi tab
 *    na pozadi zahodit bez pagehide — best effort).
 * Vraci uklid (odebere posluchace). Bez podpory scrollRestoration nic nedela.
 */
export function vratAutoPriOdchodu(
  okno: CilUdalostiOdchodu,
  dokument: DokumentProOdchod,
  historie: HistorieProScroll,
): () => void {
  if (!('scrollRestoration' in historie)) return () => {};
  const priOdchodu = () => {
    historie.scrollRestoration = 'auto';
  };
  const priZobrazeni = (e: Event) => {
    if ((e as Event & { persisted?: boolean }).persisted) historie.scrollRestoration = 'manual';
  };
  const priZmeneViditelnosti = () => {
    historie.scrollRestoration = dokument.visibilityState === 'hidden' ? 'auto' : 'manual';
  };
  okno.addEventListener('pagehide', priOdchodu);
  okno.addEventListener('pageshow', priZobrazeni);
  dokument.addEventListener('visibilitychange', priZmeneViditelnosti);
  return () => {
    okno.removeEventListener('pagehide', priOdchodu);
    okno.removeEventListener('pageshow', priZobrazeni);
    dokument.removeEventListener('visibilitychange', priZmeneViditelnosti);
  };
}

// Pamet pozic zije v modulu — prezije remount (StrictMode) i prepnuti
// profilove brany, ktere ResetScrollu neodpoji.
const pozice = new Map<string, number>();

export default function ResetScrollu(): null {
  const { pathname, key } = useLocation();
  const typNavigace = useNavigationType();
  // Klic zaznamu, pod ktery se uklada pozice. Meni se v commitu nove routy
  // (layout efekt), takze scroll udalosti po navigaci uz patri nove strance.
  const klicRef = useRef(key);

  useEffect(() => {
    const uklidObnovy = nastavRucniObnovu(window.history);
    const uklidOdchodu = vratAutoPriOdchodu(window, document, window.history);
    return () => {
      uklidOdchodu();
      uklidObnovy();
    };
  }, []);
  useEffect(() => sledujPozici(window, () => klicRef.current, pozice), []);

  // Poradi efektu: klic napred, at reset nize zapise pod novy zaznam.
  useLayoutEffect(() => {
    klicRef.current = key;
  }, [key]);

  // Jen zmena CESTY — typ navigace a klic se meni v tomtez renderu (BrowserRouter
  // nastavuje action + location jednim setState), proto je cte primo.
  useLayoutEffect(() => {
    srovnejScrollPoNavigaci(typNavigace, key, pozice, (x, y) => window.scrollTo(x, y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
