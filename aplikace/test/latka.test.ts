// Posílání látky: načtení stavu a povolení profilu (nactiMojiLatku)
// a správcovské akce fronty (chybová zpráva serveru se dostane k uživateli).
import { describe, expect, it, vi } from 'vitest';
import { nactiMojiLatku } from '../src/latka/latka';
import { stahniFrontuLatky, vratLatku } from '../src/admin/admin';
import { ChybaSyncu, type FetchFunkce } from '../src/sync/klient';

describe('nactiMojiLatku', () => {
  it('pošle rodinný kód a profil v dotazu', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ smiNahravat: true, materialy: [] }), { status: 200 }));
    const moje = await nactiMojiLatku({ url: 'https://s.test/questor-api/', token: 'rodina' }, 'matej 1', f as unknown as typeof fetch);
    expect(moje.smiNahravat).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://s.test/questor-api/api/materialy?profilId=matej%201');
    expect((init.headers as Record<string, string>)['x-questor-token']).toBe('rodina');
  });

  it('chyba serveru → ChybaSyncu se statusem', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(
      nactiMojiLatku({ url: 'https://s.test', token: 'x' }, 'p', f as unknown as typeof fetch),
    ).rejects.toBeInstanceOf(ChybaSyncu);
  });
});

describe('správcovské akce fronty', () => {
  it('fronta se načte s admin kódem', async () => {
    const f = vi.fn<FetchFunkce>(async () =>
      new Response(JSON.stringify({ povoleneProfily: ['m'], materialy: [] }), { status: 200 }),
    );
    const fronta = await stahniFrontuLatky('https://s.test', 'admin', f);
    expect(fronta.povoleneProfily).toEqual(['m']);
    expect(f.mock.calls[0][0]).toBe('https://s.test/api/admin/materialy');
  });

  it('odmítnuté vrácení nese lidskou zprávu serveru', async () => {
    const f = vi.fn<FetchFunkce>(async () =>
      new Response(JSON.stringify({ chyba: 'Po této změně přibylo další zpracování — vrať nejdřív to novější' }), { status: 409 }),
    );
    await expect(vratLatku('https://s.test', 'admin', 'abc', f)).rejects.toMatchObject({
      status: 409,
      message: 'Po této změně přibylo další zpracování — vrať nejdřív to novější',
    });
  });
});
