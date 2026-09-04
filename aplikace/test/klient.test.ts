// Testy fetch klienta serveru — URL, autentizační hlavička, chyby.
import { describe, expect, it, vi } from 'vitest';
import type { TestVysledek } from '@questor/sdilene';
import {
  ChybaSyncu,
  nactiSyncNastaveni,
  pametoveUloziste,
  ulozSyncNastaveni,
  vytvorKlienta,
  VYCHOZI_SYNC_NASTAVENI,
  type FetchFunkce,
} from '../src/sync/klient';

const NASTAVENI = { url: 'http://server.test:8787/', token: 'tajny-token' };

function mockFetch(telo: unknown, status = 200) {
  return vi.fn<FetchFunkce>(async () =>
    new Response(JSON.stringify(telo), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('vytvorKlienta', () => {
  it('skládá URL (bez dvojitého lomítka) a posílá studentský token', async () => {
    const f = mockFetch({ ok: true, verze: '0.1.0' });
    const klient = vytvorKlienta(NASTAVENI, f);
    const odpoved = await klient.zdravi();

    expect(odpoved).toEqual({ ok: true, verze: '0.1.0' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('http://server.test:8787/zdravi');
    expect((init?.headers as Record<string, string>)['x-questor-token']).toBe('tajny-token');
    expect(init?.method).toBe('GET');
  });

  it('POST událostí serializuje tělo jako JSON', async () => {
    const f = mockFetch({ ok: true });
    const klient = vytvorKlienta(NASTAVENI, f);
    const vysledek = { id: 'v1', uspesnost: 0.8 } as unknown as TestVysledek;
    await klient.posliUdalost(vysledek);

    const [url, init] = f.mock.calls[0];
    expect(url).toBe('http://server.test:8787/api/udalosti');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ id: 'v1', uspesnost: 0.8 });
  });

  it('neúspěšná odpověď vyhodí ChybaSyncu se statusem', async () => {
    const klient = vytvorKlienta(NASTAVENI, mockFetch({ chyba: 'Chybný token' }, 401));
    await expect(klient.stahniVyzvy()).rejects.toBeInstanceOf(ChybaSyncu);
    await expect(klient.stahniVyzvy()).rejects.toMatchObject({ status: 401 });
  });

  it('síťovou chybu zabalí do ChybaSyncu (bez statusu)', async () => {
    const f = vi.fn<FetchFunkce>(async () => {
      throw new TypeError('fetch failed');
    });
    const klient = vytvorKlienta(NASTAVENI, f);
    await expect(klient.zdravi()).rejects.toBeInstanceOf(ChybaSyncu);
  });

  it('escapuje predmetId v cestě', async () => {
    const f = mockFetch({ predmetId: 'x', nazev: 'X', verze: 1 });
    await vytvorKlienta(NASTAVENI, f).stahniBanku('ekonomika/podnikani');
    expect(f.mock.calls[0][0]).toBe(
      'http://server.test:8787/api/banky/ekonomika%2Fpodnikani',
    );
  });
});

describe('nastavení připojení', () => {
  it('vrací defaulty, dokud nic není uložené', () => {
    const uloziste = pametoveUloziste();
    expect(nactiSyncNastaveni(uloziste)).toEqual(VYCHOZI_SYNC_NASTAVENI);
  });

  it('uložené nastavení se načte zpátky', () => {
    const uloziste = pametoveUloziste();
    ulozSyncNastaveni({ url: 'http://jinde:9999', token: 'abc' }, uloziste);
    expect(nactiSyncNastaveni(uloziste)).toEqual({ url: 'http://jinde:9999', token: 'abc' });
  });

  it('rozbité JSON v úložišti nepoloží aplikaci — vrátí defaulty', () => {
    const uloziste = pametoveUloziste();
    uloziste.setItem('questor-sync-nastaveni', '{rozbité');
    expect(nactiSyncNastaveni(uloziste)).toEqual(VYCHOZI_SYNC_NASTAVENI);
  });
});
