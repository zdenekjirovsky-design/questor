// Vstupní bod serveru QUESTOR — otevře DB (server/data/questor.db) a poslouchá
// na portu QUESTOR_PORT (default 8787). Logika je v app.ts (testovatelná továrna).

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { vytvorApp } from './app';
import { otevriDb } from './db';

const slozkaDat = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(slozkaDat, { recursive: true });

const db = otevriDb(join(slozkaDat, 'questor.db'));
const app = vytvorApp(db);

const port = Number(process.env.QUESTOR_PORT ?? 8787);
// QUESTOR_HOST=127.0.0.1 na sdíleném hostingu — server je pak dosažitelný
// jen přes reverzní proxy, ne přímo z internetu na portu.
const hostname = process.env.QUESTOR_HOST ?? '0.0.0.0';
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`QUESTOR server běží na http://localhost:${info.port} (admin: /admin)`);
});
