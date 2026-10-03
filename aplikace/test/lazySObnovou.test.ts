// Líné stránky s obnovou po nasazení (src/komponenty/lazySObnovou.ts):
// chunk smazaný novým nasazením → jednou reload (pojistka časem
// v sessionStorage), jinak srozumitelná chyba místo prázdné obrazovky.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  ChybaNacteni,
  KLIC_OBNOVY,
  nactiSObnovou,
  ROZESTUP_OBNOV_MS,
  zkusObnovit,
  type ProstrediObnovy,
} from '../src/komponenty/lazySObnovou';

afterEach(() => {
  vi.restoreAllMocks();
});

function Stranka() {
  return createElement('p', null, 'stránka');
}

function prostredi(volby: { ted?: number; ulozeno?: string; online?: boolean; rozbiteUloziste?: boolean } = {}) {
  const data = new Map<string, string>();
  if (volby.ulozeno !== undefined) data.set(KLIC_OBNOVY, volby.ulozeno);
  const obnov = vi.fn();
  const p: ProstrediObnovy = {
    ted: () => volby.ted ?? 1_000_000,
    uloziste: () =>
      volby.rozbiteUloziste
        ? {
            getItem: () => {
              throw new Error('SecurityError');
            },
            setItem: () => {
              throw new Error('SecurityError');
            },
          }
        : { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
    online: () => volby.online ?? true,
    obnov,
  };
  return { p, data, obnov };
}

/** Promise, který se do pár ms nevyřeší (= čeká na reload). */
async function visi(promise: Promise<unknown>): Promise<boolean> {
  const znacka = Symbol('visi');
  const vysledek = await Promise.race([promise, new Promise((r) => setTimeout(() => r(znacka), 20))]);
  return vysledek === znacka;
}

describe('zkusObnovit — pojistka proti smyčce', () => {
  it('první chyba smí obnovit a zapíše čas pokusu', () => {
    const { p, data } = prostredi({ ted: 50_000 });
    expect(zkusObnovit(p)).toBe(true);
    expect(data.get(KLIC_OBNOVY)).toBe('50000');
  });

  it('chyba krátce po obnově už neobnovuje (obnova nepomohla)', () => {
    const { p } = prostredi({ ted: 50_000, ulozeno: String(50_000 - ROZESTUP_OBNOV_MS + 1) });
    expect(zkusObnovit(p)).toBe(false);
  });

  it('po rozestupu smí obnovit znovu (PWA session trvá dny, další nasazení)', () => {
    const { p } = prostredi({ ted: 50_000 + ROZESTUP_OBNOV_MS, ulozeno: '50000' });
    expect(zkusObnovit(p)).toBe(true);
  });

  it('offline ani nefunkční úložiště neobnovují', () => {
    expect(zkusObnovit(prostredi({ online: false }).p)).toBe(false);
    expect(zkusObnovit(prostredi({ rozbiteUloziste: true }).p)).toBe(false);
    expect(zkusObnovit({ ...prostredi().p, uloziste: () => null })).toBe(false);
  });

  it('čas z budoucnosti (posunuté hodiny) obnovu neblokuje', () => {
    expect(zkusObnovit(prostredi({ ted: 1_000, ulozeno: '999999' }).p)).toBe(true);
  });
});

describe('nactiSObnovou', () => {
  it('úspěšné načtení vrátí modul beze změny', async () => {
    const { p, obnov } = prostredi();
    const modul = await nactiSObnovou(async () => ({ default: Stranka }), p);
    expect(modul.default).toBe(Stranka);
    expect(obnov).not.toHaveBeenCalled();
  });

  it('smazaný chunk → jednou reload a promise čeká (Suspense drží fallback)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { p, obnov, data } = prostredi({ ted: 77_000 });
    const nacitani = nactiSObnovou(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')), p);
    expect(await visi(nacitani)).toBe(true);
    expect(obnov).toHaveBeenCalledTimes(1);
    expect(data.get(KLIC_OBNOVY)).toBe('77000');
  });

  it('chyba hned po obnově → ChybaNacteni místo pádu, bez dalšího reloadu', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { p, obnov } = prostredi({ ted: 77_500, ulozeno: '77000' });
    const modul = await nactiSObnovou(() => Promise.reject(new Error('chunk')), p);
    expect(modul.default).toBe(ChybaNacteni);
    expect(obnov).not.toHaveBeenCalled();
  });

  it('modul bez komponenty (preventDefault na vite:preloadError) je taky chyba', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { p, obnov } = prostredi({ online: false });
    const modul = await nactiSObnovou(async () => undefined as unknown as { default: typeof Stranka }, p);
    expect(modul.default).toBe(ChybaNacteni);
    expect(obnov).not.toHaveBeenCalled();
  });
});

describe('ChybaNacteni', () => {
  it('ukáže srozumitelnou hlášku s tlačítkem Načíst znovu', () => {
    const html = renderToStaticMarkup(createElement(ChybaNacteni));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Načíst znovu');
    expect(html).toContain('<button type="button"');
  });
});
