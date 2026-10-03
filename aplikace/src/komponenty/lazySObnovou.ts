// Líně načítaná stránka (React.lazy) s obnovou po nasazení nové verze webu.
//
// Po nasazení zmizí ze serveru staré chunky s hashem v názvu. Tab nebo PWA
// otevřená přes nasazení drží v paměti starý index-*.js, a když student
// poprvé klepne na línou stránku (/latka, /admin), import() selže — server
// na chybějící asset navíc vrací SPA fallback (HTML), takže modul nejde ani
// spustit. Holé React.lazy chybu vyhodí, nic ji nechytí a React odpojí celý
// kořen = prázdná tmavá obrazovka bez navigace (v PWA bez tlačítka obnovit).
//
// Postup: při chybě načtení se stránka JEDNOU obnoví (nový index.html zná
// nové chunky). Pojistka proti smyčce je ČAS posledního pokusu
// v sessionStorage, ne jednorázový příznak — session PWA trvá i dny a při
// dalším nasazení musí obnova zabrat znovu. Když obnova před chvílí už
// proběhla, zařízení je offline (reload by v PWA bez service workeru skončil
// chybovou stránkou prohlížeče) nebo úložiště nejde použít, ukáže se místo
// pádu srozumitelná chyba s tlačítkem „Načíst znovu“.
//
// Pozor na `vite:preloadError`: posluchač, který zavolá e.preventDefault()
// a pak NEobnoví stránku, způsobí, že import() vrátí undefined. Proto se tu
// kontroluje i tvar modulu (undefined = stejná chyba jako výjimka) a žádný
// takový posluchač se do main.tsx nepřidává — Vite chybu bez něj vyhodí
// a zachytí ji nactiSObnovou.
import { createElement, lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Klíč v sessionStorage: čas (ms) poslední automatické obnovy. */
export const KLIC_OBNOVY = 'questor-obnova-chunku';
/** Selže-li načtení znovu do této doby od obnovy, obnova nepomohla. */
export const ROZESTUP_OBNOV_MS = 15_000;

/** Prostředí injektované kvůli testům (čas, úložiště, síť, reload). */
export interface ProstrediObnovy {
  ted: () => number;
  uloziste: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  online: () => boolean;
  obnov: () => void;
}

const vychoziProstredi: ProstrediObnovy = {
  ted: () => Date.now(),
  uloziste: () => {
    try {
      return typeof sessionStorage === 'undefined' ? null : sessionStorage;
    } catch {
      // Zablokované úložiště (soukromý režim, politika prohlížeče).
      return null;
    }
  },
  // navigator.onLine === false je spolehlivé („určitě offline“), true ne.
  online: () => typeof navigator === 'undefined' || navigator.onLine !== false,
  obnov: () => window.location.reload(),
};

/**
 * Smí se po chybě načtení chunku stránka automaticky obnovit? Když ano,
 * rovnou si pokus zapíše (další chyba do ROZESTUP_OBNOV_MS už obnovu nespustí).
 */
export function zkusObnovit(prostredi: ProstrediObnovy = vychoziProstredi): boolean {
  if (!prostredi.online()) return false;
  const uloziste = prostredi.uloziste();
  if (!uloziste) return false;
  try {
    const ted = prostredi.ted();
    const posledni = Number(uloziste.getItem(KLIC_OBNOVY) ?? 0);
    const odPosledni = ted - posledni;
    // Čas z budoucnosti (posunuté hodiny) pojistku neblokuje.
    if (Number.isFinite(odPosledni) && odPosledni >= 0 && odPosledni < ROZESTUP_OBNOV_MS) return false;
    uloziste.setItem(KLIC_OBNOVY, String(ted));
    return true;
  } catch {
    // Bez zápisu pojistky by obnova mohla běžet dokola — radši chyba.
    return false;
  }
}

/** Náhradní obsah, když se část aplikace nepodařilo načíst ani po obnově. */
export function ChybaNacteni() {
  return createElement(
    'div',
    { style: { padding: 'calc(24px + env(safe-area-inset-top, 0px)) 16px 24px' } },
    createElement(
      'div',
      {
        className: 'panel',
        role: 'alert',
        style: { maxWidth: 520, margin: '0 auto', textAlign: 'center' },
      },
      createElement('h2', { style: { marginTop: 0 } }, 'Tuhle část se nepodařilo načíst'),
      createElement(
        'p',
        null,
        'Aplikace se mezitím nejspíš aktualizovala, nebo vypadlo připojení. Zkontroluj internet a načti ji znovu — tvůj postup zůstává uložený.',
      ),
      createElement(
        'button',
        {
          type: 'button',
          className: 'tlacitko tlacitko--primarni',
          onClick: () => window.location.reload(),
        },
        '🔄 Načíst znovu',
      ),
    ),
  );
}

// ComponentType<any> stejně jako v typech React.lazy (props se neověřují).
type ModulStranky<T> = { default: T };

/**
 * Načte modul stránky; při chybě jednou obnoví stránku (promise pak zůstane
 * viset — Suspense do reloadu drží svůj fallback), jinak vrátí ChybaNacteni.
 * Nikdy nevyhodí výjimku ani nevrátí modul bez komponenty.
 */
export async function nactiSObnovou<T extends ComponentType<any>>(
  nacti: () => Promise<ModulStranky<T>>,
  prostredi: ProstrediObnovy = vychoziProstredi,
): Promise<ModulStranky<T>> {
  let chyba: unknown;
  try {
    const modul = await nacti();
    if (modul && modul.default != null) return modul;
    chyba = new Error('Modul stránky se načetl bez komponenty');
  } catch (e) {
    chyba = e;
  }
  console.error('Načtení části aplikace selhalo:', chyba);
  if (zkusObnovit(prostredi)) {
    prostredi.obnov();
    return new Promise<never>(() => {});
  }
  return { default: ChybaNacteni as unknown as T };
}

/** React.lazy s obnovou po nasazení (viz hlavička souboru). */
export function lazySObnovou<T extends ComponentType<any>>(
  nacti: () => Promise<ModulStranky<T>>,
): LazyExoticComponent<T> {
  return lazy(() => nactiSObnovou(nacti));
}
