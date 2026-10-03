// Nacitani bundlovaneho obsahu predmetu (src/data/predmety.ts) — soubeh.
// Chunky se stahuji paralelne (Promise.all), vysledek ale musi zustat
// presne stejny jako pri postupnem nacitani: stejne poradi (podle cest
// souboru), stejny obsah (validovana data souboru) a vadny/nenacitatelny
// soubor se dal jen preskoci.
// Navic start (src/data/nacteniObsahu.ts + sync): banky jdou do store hned
// po svem stazeni, nezavisle na vyukach, a sync na startovni obsah ceka jen
// omezene dlouho.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validujBanku, validujVyuku } from '@questor/sdilene';
import { nactiBundlovaneBanky, nactiBundlovaneVyuky } from '../src/data/predmety';

const SLOZKA_PREDMETU = fileURLToPath(new URL('../src/data/predmety', import.meta.url));

function nactiPrimo<T>(pripona: string, validuj: (data: unknown) => T): T[] {
  return readdirSync(SLOZKA_PREDMETU)
    .filter((s) => s.endsWith(pripona))
    .sort()
    .map((s) => validuj(JSON.parse(readFileSync(`${SLOZKA_PREDMETU}/${s}`, 'utf8'))));
}

describe('bundlovany obsah — paralelni nacteni bez zmeny vysledku', () => {
  it('banky: stejne poradi i obsah jako primo ze souboru', async () => {
    const banky = await nactiBundlovaneBanky();
    expect(banky.length).toBeGreaterThan(0);
    expect(banky).toEqual(nactiPrimo('.banka.json', validujBanku));
  });

  it('vyuky: stejne poradi i obsah jako primo ze souboru', async () => {
    const vyuky = await nactiBundlovaneVyuky();
    expect(vyuky.length).toBeGreaterThan(0);
    expect(vyuky).toEqual(nactiPrimo('.vyuka.json', validujVyuku));
  });

  it('soubezne volani obou nacitacu vraci totez co samostatne', async () => {
    const [banky, vyuky] = await Promise.all([nactiBundlovaneBanky(), nactiBundlovaneVyuky()]);
    expect(banky.map((b) => b.predmetId)).toEqual(
      nactiPrimo('.banka.json', validujBanku).map((b) => b.predmetId),
    );
    expect(vyuky.map((v) => v.predmetId)).toEqual(
      nactiPrimo('.vyuka.json', validujVyuku).map((v) => v.predmetId),
    );
  });
});

describe('nactiObsahPriStartu — banky nezavisle na vyukach', () => {
  afterEach(() => {
    vi.doUnmock('../src/data/predmety');
    vi.resetModules();
  });

  it('banky jsou ve store driv, nez dobehnou vyuky (questy na nich visi)', async () => {
    const banka = nactiPrimo('.banka.json', validujBanku)[0];
    let pustVyuky: (v: never[]) => void = () => {};
    vi.resetModules();
    vi.doMock('../src/data/predmety', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../src/data/predmety')>()),
      nactiBundlovaneBanky: () => Promise.resolve([banka]),
      nactiBundlovaneVyuky: () =>
        new Promise<never[]>((r) => {
          pustVyuky = r;
        }),
    }));
    const { nactiObsahPriStartu } = await import('../src/data/nacteniObsahu');
    const { pouzijStav } = await import('../src/stav/store');

    let hotovo = false;
    const nacitani = nactiObsahPriStartu().then(() => {
      hotovo = true;
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(pouzijStav.getState().banky[banka.predmetId]).toEqual(banka);
    expect(hotovo).toBe(false); // vyuky jeste visi → cele nacitani nedobehlo

    // Idempotence: dalsi volani vraci TYZ promise (sync, Domu na nej cekaji).
    expect(nactiObsahPriStartu()).toBe(nactiObsahPriStartu());
    pustVyuky([]);
    await nacitani;
    expect(hotovo).toBe(true);
  });
});

describe('pockejNaObsah — sync ceka na startovni obsah omezene', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('obsah nacteny → pokracuje hned', async () => {
    const { pockejNaObsah } = await import('../src/sync/sync');
    const nacti = vi.fn(() => Promise.resolve());
    await pockejNaObsah(nacti, 15_000);
    expect(nacti).toHaveBeenCalledTimes(1);
  });

  it('chyba nacitani se spolkne (sync jede dal)', async () => {
    const { pockejNaObsah } = await import('../src/sync/sync');
    await expect(pockejNaObsah(() => Promise.reject(new Error('chunk')), 15_000)).resolves.toBeUndefined();
  });

  it('zaseknute nacitani neblokuje sync dele nez limit', async () => {
    vi.useFakeTimers();
    const { pockejNaObsah, LIMIT_CEKANI_NA_OBSAH_MS } = await import('../src/sync/sync');
    let hotovo = false;
    const cekani = pockejNaObsah(() => new Promise<void>(() => {})).then(() => {
      hotovo = true;
    });
    await vi.advanceTimersByTimeAsync(LIMIT_CEKANI_NA_OBSAH_MS - 1);
    expect(hotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await cekani;
    expect(hotovo).toBe(true);
  });

  it('po nacteni nenechava viset casovac limitu', async () => {
    vi.useFakeTimers();
    const { pockejNaObsah } = await import('../src/sync/sync');
    await pockejNaObsah(() => Promise.resolve(), 15_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
