// Server QUESTORu — postaví agent SERVER podle docs/ARCHITEKTURA.md.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';

const app = new Hono();

app.get('/zdravi', (c) => c.json({ ok: true, verze: '0.1.0' }));

const port = Number(process.env.QUESTOR_PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => {
  console.log(`QUESTOR server běží na http://localhost:${port}`);
});
