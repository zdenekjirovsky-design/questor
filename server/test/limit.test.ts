// Testy rate limitu (server/src/limit.ts) — injektované hodiny, žádné čekání.
// Jednotkově nad malou Hono aplikací + integrace přes vytvorApp (limit kryje
// jen /api/*, veřejné cesty jedou bez limitu).

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { vytvorRateLimit } from '../src/limit';
import { vytvorApp } from '../src/app';
import { otevriDb } from '../src/db';

/** Malá aplikace s limitem na všem — čistý test middlewaru. */
function appSLimitem(
  maxPozadavku: number,
  oknoMs: number,
  ted: () => number,
  duverujProxy?: number,
): Hono {
  const app = new Hono();
  app.use(
    '*',
    vytvorRateLimit({
      maxPozadavku,
      oknoMs,
      ted,
      ...(duverujProxy !== undefined ? { duverujProxy } : {}),
    }),
  );
  app.get('/x', (c) => c.json({ ok: true }));
  return app;
}

describe('rate limit — jednotkově', () => {
  it('do limitu pouští, nad limit vrací 429 { chyba } s retry-after', async () => {
    const app = appSLimitem(3, 60_000, () => 1_000_000);
    for (let i = 0; i < 3; i++) {
      expect((await app.request('/x')).status).toBe(200);
    }
    const nadLimit = await app.request('/x');
    expect(nadLimit.status).toBe(429);
    expect(await nadLimit.json()).toHaveProperty('chyba');
    expect(Number(nadLimit.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('po uplynutí okna (posun injektovaných hodin) zase pouští', async () => {
    let cas = 1_000_000;
    const app = appSLimitem(2, 60_000, () => cas);
    expect((await app.request('/x')).status).toBe(200);
    expect((await app.request('/x')).status).toBe(200);
    expect((await app.request('/x')).status).toBe(429);

    cas += 59_999; // těsně před koncem okna — pořád blokuje
    expect((await app.request('/x')).status).toBe(429);

    cas += 1; // okno uplynulo — nové okno, čistý účet
    expect((await app.request('/x')).status).toBe(200);
  });

  it('IP se počítají zvlášť (x-forwarded-for od reverzní proxy)', async () => {
    const app = appSLimitem(1, 60_000, () => 1_000_000, 1);
    const zIp = (ip: string) => app.request('/x', { headers: { 'x-forwarded-for': ip } });
    expect((await zIp('10.0.0.1')).status).toBe(200);
    expect((await zIp('10.0.0.1')).status).toBe(429);
    expect((await zIp('10.0.0.2')).status).toBe(200); // jiná IP má vlastní účet
  });

  it('bere POSLEDNÍ adresu z X-Forwarded-For — rotace podvržené první limit neobejde', async () => {
    // Standardní proxy (nginx/Caddy/Apache) hodnotu APPENDUJE za klientem
    // poslanou hlavičku: první položku plně ovládá útočník, poslední přidala
    // vlastní proxy. Braním první adresy by rotace smyšlených IP dala každému
    // požadavku čerstvé okno a brute force na tokeny by běžel plnou rychlostí.
    const app = appSLimitem(2, 60_000, () => 1_000_000, 1);
    const zXff = (xff: string) => app.request('/x', { headers: { 'x-forwarded-for': xff } });
    expect((await zXff('1.2.3.4, 89.0.0.7')).status).toBe(200);
    expect((await zXff('5.6.7.8, 89.0.0.7')).status).toBe(200);
    // Třetí požadavek z téže skutečné IP (poslední adresa) → 429, i když si
    // útočník první adresu pokaždé vymyslel jinou.
    expect((await zXff('9.9.9.9, 89.0.0.7')).status).toBe(429);
    // Jiná skutečná IP (poslední adresa) má vlastní účet.
    expect((await zXff('9.9.9.9, 89.0.0.8')).status).toBe(200);
  });

  it('duverujProxy=2 bere druhou adresu od konce (řetěz dvou proxy)', async () => {
    const app = appSLimitem(1, 60_000, () => 1_000_000, 2);
    const zXff = (xff: string) => app.request('/x', { headers: { 'x-forwarded-for': xff } });
    // [podvržené, klient, proxy1] — klient je druhý od konce.
    expect((await zXff('6.6.6.6, 89.0.0.7, 10.0.0.2')).status).toBe(200);
    expect((await zXff('7.7.7.7, 89.0.0.7, 10.0.0.2')).status).toBe(429);
    // Kratší seznam než počet proxy → bere se první dostupná adresa.
    expect((await zXff('89.0.0.9')).status).toBe(200);
  });

  it('duverujProxy=0 hlavičku ignoruje úplně (server bez proxy)', async () => {
    const app = appSLimitem(1, 60_000, () => 1_000_000, 0);
    const zXff = (xff: string) => app.request('/x', { headers: { 'x-forwarded-for': xff } });
    // Bez proxy by si X-Forwarded-For psal sám klient — nesmí jí jít limit
    // obejít; všechny požadavky (bez soketu v testu) padají do jednoho klíče.
    expect((await zXff('1.1.1.1')).status).toBe(200);
    expect((await zXff('2.2.2.2')).status).toBe(429);
  });
});

describe('rate limit — integrace v serveru', () => {
  it('kryje /api/* (i chybné tokeny — brzda hrubé síly), /zdravi ne', async () => {
    let cas = 1_000_000;
    const app = vytvorApp(otevriDb(':memory:'), {
      rateLimit: { maxPozadavku: 2, oknoMs: 60_000, ted: () => cas },
    });

    const spatny = { 'x-questor-token': 'hadam' };
    expect((await app.request('/api/banky', { headers: spatny })).status).toBe(401);
    expect((await app.request('/api/banky', { headers: spatny })).status).toBe(401);
    const treti = await app.request('/api/banky', { headers: spatny });
    expect(treti.status).toBe(429);
    expect(await treti.json()).toHaveProperty('chyba');

    // Veřejné cesty mimo /api/* limit neřeší.
    expect((await app.request('/zdravi')).status).toBe(200);
    expect((await app.request('/admin')).status).toBe(200);

    // Po uplynutí okna API zase odpovídá.
    cas += 60_000;
    expect((await app.request('/api/banky', { headers: spatny })).status).toBe(401);
  });

  it('429 nese CORS hlavičku (aplikace na jiném originu se o limitu dozví)', async () => {
    const app = vytvorApp(otevriDb(':memory:'), {
      rateLimit: { maxPozadavku: 1, oknoMs: 60_000, ted: () => 1_000_000 },
    });
    const hlavicky = { 'x-questor-token': 'student-dev', origin: 'http://localhost:5173' };
    expect((await app.request('/api/banky', { headers: hlavicky })).status).toBe(200);
    const limitovana = await app.request('/api/banky', { headers: hlavicky });
    expect(limitovana.status).toBe(429);
    expect(limitovana.headers.get('access-control-allow-origin')).toBe('*');
  });
});
