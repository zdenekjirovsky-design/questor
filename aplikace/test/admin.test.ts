// Admin účet (přehled rodiny): přihlašovací odkaz #admin=<kód>, uložení
// kódu, načtení přehledu a formátovací pomůcky.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adminKodZHashe,
  kdyRelativne,
  nactiAdminKod,
  procenta,
  slabaTemata,
  smazAdminKod,
  stahniPrehledRodiny,
  ulozAdminKod,
} from '../src/admin/admin';
import { ChybaSyncu, pametoveUloziste, type FetchFunkce } from '../src/sync/klient';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('přihlašovací odkaz a uložení kódu', () => {
  it('přečte kód z #admin=… a nic jiného nepustí', () => {
    expect(adminKodZHashe('#admin=qadmin-abc12345')).toBe('qadmin-abc12345');
    expect(adminKodZHashe('#duel=abc.def')).toBeNull();
    expect(adminKodZHashe('#admin=')).toBeNull();
    expect(adminKodZHashe('#admin=<script>')).toBeNull();
    expect(adminKodZHashe('')).toBeNull();
  });

  it('kód se uloží, načte a smaže', () => {
    const uloziste = pametoveUloziste();
    expect(nactiAdminKod(uloziste)).toBeNull();
    ulozAdminKod('  qadmin-xyz98765  ', uloziste);
    expect(nactiAdminKod(uloziste)).toBe('qadmin-xyz98765');
    smazAdminKod(uloziste);
    expect(nactiAdminKod(uloziste)).toBeNull();
  });
});

describe('stahniPrehledRodiny', () => {
  it('pošle admin kód hlavičkou a vrátí přehled', async () => {
    const f = vi.fn<FetchFunkce>(async () =>
      new Response(JSON.stringify({ vygenerovano: 'x', profily: [] }), { status: 200 }),
    );
    const prehled = await stahniPrehledRodiny('https://server.test/questor-api/', 'qadmin-1', f);
    expect(prehled.profily).toEqual([]);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://server.test/questor-api/api/admin/prehled');
    expect((init?.headers as Record<string, string>)['x-questor-token']).toBe('qadmin-1');
  });

  it('neplatný kód → ChybaSyncu se statusem 401', async () => {
    const f = vi.fn<FetchFunkce>(async () => new Response('{}', { status: 401 }));
    await expect(stahniPrehledRodiny('https://server.test', 'spatny', f)).rejects.toMatchObject({
      status: 401,
    });
    await expect(stahniPrehledRodiny('https://server.test', 'spatny', f)).rejects.toBeInstanceOf(ChybaSyncu);
  });
});

describe('formátování přehledu', () => {
  const ted = new Date('2026-09-29T15:00:00');

  it('relativní čas', () => {
    expect(kdyRelativne(null, ted)).toBe('zatím nikdy');
    expect(kdyRelativne(new Date('2026-09-29T14:59:30').toISOString(), ted)).toBe('právě teď');
    expect(kdyRelativne(new Date('2026-09-29T09:05:00').toISOString(), ted)).toMatch(/^dnes 9:05/);
    expect(kdyRelativne(new Date('2026-09-28T20:00:00').toISOString(), ted)).toMatch(/^včera 20:00/);
    expect(kdyRelativne(new Date('2026-09-26T20:00:00').toISOString(), ted)).toBe('před 3 dny');
    expect(kdyRelativne(new Date('2026-09-12T20:00:00').toISOString(), ted)).toMatch(/12\. ?9\./);
  });

  it('procenta a slabá témata', () => {
    expect(procenta(null)).toBe('—');
    expect(procenta(0.456)).toBe('46 %');
    const temata = [
      { nazev: 'A', odpovedi: 10, uspesnost: 0.5 },
      { nazev: 'B', odpovedi: 2, uspesnost: 0.1 }, // málo odpovědí
      { nazev: 'C', odpovedi: 8, uspesnost: 0.9 },
      { nazev: 'D', odpovedi: 6, uspesnost: 0.3 },
    ];
    expect(slabaTemata(temata).map((t) => t.nazev)).toEqual(['D', 'A']);
  });
});
