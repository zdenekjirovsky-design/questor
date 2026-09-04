// HTTP aplikace serveru QUESTOR (Hono) — API kontrakt viz docs/ARCHITEKTURA.md.
// Aplikace se vytváří továrnou vytvorApp(db), aby šla testovat přes app.request()
// nad DB ':memory:' bez poslouchání na portu.

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import {
  otazkaSchema,
  stavLevelu,
  validujBanku,
  type BankaOtazek,
  type Otazka,
  type ProgresStudenta,
  type Tema,
  type TestVysledek,
  type Vyzva,
} from '@questor/sdilene';
import {
  dogenerovatSchema,
  novaVyzvaSchema,
  vysledekVyzvySchema,
  zvalidujProgres,
  zvalidujTestVysledek,
} from './validace';
import { ADMIN_HTML } from './admin';

export const VERZE = '0.1.0';

const CHYBA_GENEROVANI_VYPNUTO = 'Dogenerování není na serveru zapnuté';

// ---------------------------------------------------------------------------
// Auth — hlavička x-questor-token; admin smí všechno studentské.

function adminToken(): string {
  return process.env.QUESTOR_ADMIN_TOKEN ?? 'admin-dev';
}

function studentToken(): string {
  return process.env.QUESTOR_STUDENT_TOKEN ?? 'student-dev';
}

function overAuth(role: 'student' | 'admin') {
  return async (c: Context, next: Next) => {
    const token = c.req.header('x-questor-token');
    const jeAdmin = token === adminToken();
    const povoleno = role === 'admin' ? jeAdmin : jeAdmin || token === studentToken();
    if (!token || !povoleno) {
      return c.json({ chyba: 'Chybí nebo neplatí token (hlavička x-questor-token)' }, 401);
    }
    await next();
  };
}

async function prectiJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

/** Chyby, které znamenají „chybí/neplatí API klíč“ → kontrakt velí 503. */
function jeChybaKlice(chyba: unknown): boolean {
  const text = chyba instanceof Error ? `${chyba.name}: ${chyba.message}` : String(chyba);
  return /anthropic_api_key|api[\s_-]?key|x-api-key|authentication/i.test(text);
}

/** Typ garantovaný generátorem (dynamický import, ať server bez něj nastartuje). */
type DogenerujOtazky = (vstup: {
  nazevPredmetu: string;
  tema: Tema;
  obtiznost: number;
  pocet: number;
  kontextUciva?: string;
}) => Promise<Otazka[]>;

export interface MoznostiApp {
  /** Testovací háček — nahrazuje dynamický import '@questor/generator'. */
  nactiGenerator?: () => Promise<{ dogenerujOtazky: DogenerujOtazky }>;
}

// ---------------------------------------------------------------------------

export function vytvorApp(db: DatabaseSync, moznosti: MoznostiApp = {}): Hono {
  const app = new Hono();

  const nactiGenerator =
    moznosti.nactiGenerator ??
    (async () => {
      // Specifikátor v proměnné: TS modul generátoru neresolvuje (staví se
      // paralelně), runtime kontrakt exportu dogenerujOtazky je závazný.
      const modul = '@questor/generator';
      return (await import(modul)) as { dogenerujOtazky: DogenerujOtazky };
    });

  app.notFound((c) => c.json({ chyba: 'Nenalezeno' }, 404));
  app.onError((chyba, c) => {
    console.error('Neošetřená chyba serveru:', chyba);
    return c.json({ chyba: 'Interní chyba serveru' }, 500);
  });

  // --- Veřejné -------------------------------------------------------------

  app.get('/zdravi', (c) => c.json({ ok: true, verze: VERZE }));

  app.get('/', (c) => c.redirect('/admin'));

  // Stránka je veřejná schválně: sama žádná data nenese, token do ní zadává
  // admin a teprve s ním jdou fetch requesty na chráněné API.
  app.get('/admin', (c) => c.html(ADMIN_HTML));

  // --- Banky ---------------------------------------------------------------

  app.get('/api/banky', overAuth('student'), (c) => {
    const radky = db
      .prepare('SELECT predmet_id, verze, json FROM banky ORDER BY predmet_id')
      .all() as { predmet_id: string; verze: number; json: string }[];
    const seznam = radky.map((r) => {
      const banka = JSON.parse(r.json) as BankaOtazek;
      return { predmetId: r.predmet_id, nazev: banka.nazev, verze: r.verze };
    });
    return c.json(seznam);
  });

  app.get('/api/banky/:predmetId', overAuth('student'), (c) => {
    const radek = db
      .prepare('SELECT json FROM banky WHERE predmet_id = ?')
      .get(c.req.param('predmetId') ?? '') as { json: string } | undefined;
    if (!radek) return c.json({ chyba: 'Banka pro tenhle předmět na serveru není' }, 404);
    return c.json(JSON.parse(radek.json) as BankaOtazek);
  });

  app.put('/api/banky/:predmetId', overAuth('admin'), async (c) => {
    const telo = await prectiJson(c);
    let banka: BankaOtazek;
    try {
      banka = validujBanku(telo);
    } catch (chyba) {
      return c.json({ chyba: chyba instanceof Error ? chyba.message : 'Neplatná banka' }, 400);
    }
    const predmetId = c.req.param('predmetId');
    if (banka.predmetId !== predmetId) {
      return c.json(
        { chyba: `predmetId v URL („${predmetId}“) nesouhlasí s bankou („${banka.predmetId}“)` },
        400,
      );
    }
    const stavajici = db
      .prepare('SELECT verze FROM banky WHERE predmet_id = ?')
      .get(predmetId) as { verze: number } | undefined;
    if (stavajici && banka.verze <= stavajici.verze) {
      return c.json(
        {
          chyba: `Verze banky musí růst — na serveru je verze ${stavajici.verze}, přišla ${banka.verze}`,
        },
        409,
      );
    }
    db.prepare(
      `INSERT INTO banky (predmet_id, verze, json) VALUES (?, ?, ?)
       ON CONFLICT(predmet_id) DO UPDATE SET verze = excluded.verze, json = excluded.json`,
    ).run(predmetId, banka.verze, JSON.stringify(banka));
    return c.json({ ok: true, verze: banka.verze });
  });

  // --- Progres -------------------------------------------------------------

  app.post('/api/progres', overAuth('student'), async (c) => {
    const progres = zvalidujProgres(await prectiJson(c));
    if (!progres) return c.json({ chyba: 'Tělo neodpovídá typu ProgresStudenta' }, 400);
    db.prepare(
      `INSERT INTO progres (id, json, prijato) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, prijato = excluded.prijato`,
    ).run(JSON.stringify(progres), new Date().toISOString());
    return c.json({ ok: true });
  });

  app.get('/api/progres', overAuth('admin'), (c) => {
    const radek = db.prepare('SELECT json, prijato FROM progres WHERE id = 1').get() as
      | { json: string; prijato: string }
      | undefined;
    if (!radek) return c.json({ chyba: 'Žádný progres zatím nedorazil' }, 404);
    const progres = JSON.parse(radek.json) as ProgresStudenta;
    // level navíc (nad rámec kontraktu, aditivně): počítá ho sdílená funkce,
    // aby admin stránka (vanilla JS) nemusela duplikovat křivku levelů.
    return c.json({ progres, prijato: radek.prijato, level: stavLevelu(progres.xp) });
  });

  // --- Události (výsledky testů) ------------------------------------------

  app.post('/api/udalosti', overAuth('student'), async (c) => {
    const vysledek = zvalidujTestVysledek(await prectiJson(c));
    if (!vysledek) return c.json({ chyba: 'Tělo neodpovídá typu TestVysledek' }, 400);
    db.prepare('INSERT INTO udalosti (cas, json) VALUES (?, ?)').run(
      new Date().toISOString(),
      JSON.stringify(vysledek),
    );
    return c.json({ ok: true });
  });

  app.get('/api/udalosti', overAuth('admin'), (c) => {
    const surovy = Number.parseInt(c.req.query('limit') ?? '50', 10);
    const limit = Math.min(Math.max(Number.isNaN(surovy) ? 50 : surovy, 1), 500);
    const radky = db
      .prepare('SELECT cas, json FROM udalosti ORDER BY id DESC LIMIT ?')
      .all(limit) as { cas: string; json: string }[];
    return c.json(radky.map((r) => ({ cas: r.cas, vysledek: JSON.parse(r.json) as TestVysledek })));
  });

  // --- Výzvy ---------------------------------------------------------------

  app.get('/api/vyzvy', overAuth('student'), (c) => {
    const radky = db.prepare('SELECT json FROM vyzvy').all() as { json: string }[];
    const otevrene = radky
      .map((r) => JSON.parse(r.json) as Vyzva)
      .filter((v) => v.stav !== 'dokoncena')
      .sort((a, b) => (a.vytvoreno < b.vytvoreno ? 1 : -1));
    return c.json(otevrene);
  });

  app.post('/api/vyzvy', overAuth('admin'), async (c) => {
    const telo = novaVyzvaSchema.safeParse(await prectiJson(c));
    if (!telo.success) {
      return c.json({ chyba: 'Výzva potřebuje zprava a konfigurace (TestKonfigurace)' }, 400);
    }
    const vyzva: Vyzva = {
      id: crypto.randomUUID(),
      zprava: telo.data.zprava,
      konfigurace: telo.data.konfigurace,
      vytvoreno: new Date().toISOString(),
      stav: 'nova',
      ...(telo.data.cilovaUspesnost !== undefined
        ? { cilovaUspesnost: telo.data.cilovaUspesnost }
        : {}),
    };
    db.prepare('INSERT INTO vyzvy (id, json) VALUES (?, ?)').run(vyzva.id, JSON.stringify(vyzva));
    return c.json(vyzva);
  });

  app.post('/api/vyzvy/:id/vysledek', overAuth('student'), async (c) => {
    const telo = vysledekVyzvySchema.safeParse(await prectiJson(c));
    if (!telo.success) return c.json({ chyba: 'Tělo musí být { uspesnost, xp }' }, 400);
    const id = c.req.param('id') ?? '';
    const radek = db.prepare('SELECT json FROM vyzvy WHERE id = ?').get(id) as
      | { json: string }
      | undefined;
    if (!radek) return c.json({ chyba: 'Výzva neexistuje' }, 404);
    const vyzva = JSON.parse(radek.json) as Vyzva;
    const hotova: Vyzva = {
      ...vyzva,
      stav: 'dokoncena',
      vysledek: {
        uspesnost: telo.data.uspesnost,
        xp: telo.data.xp,
        dokonceno: new Date().toISOString(),
      },
    };
    db.prepare('UPDATE vyzvy SET json = ? WHERE id = ?').run(JSON.stringify(hotova), id);
    return c.json({ ok: true });
  });

  // --- Dogenerování otázek -------------------------------------------------

  app.post('/api/generovani/dogenerovat', overAuth('student'), async (c) => {
    const telo = dogenerovatSchema.safeParse(await prectiJson(c));
    if (!telo.success) {
      return c.json({ chyba: 'Tělo musí být { predmetId, temaId, obtiznost 1–5, pocet 1–20 }' }, 400);
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return c.json({ chyba: CHYBA_GENEROVANI_VYPNUTO }, 503);
    }
    const radek = db
      .prepare('SELECT json FROM banky WHERE predmet_id = ?')
      .get(telo.data.predmetId) as { json: string } | undefined;
    if (!radek) return c.json({ chyba: 'Banka pro tenhle předmět na serveru není' }, 404);
    const banka = JSON.parse(radek.json) as BankaOtazek;
    const tema = banka.temata.find((t) => t.id === telo.data.temaId);
    if (!tema) return c.json({ chyba: 'Téma v bance neexistuje' }, 404);

    let vygenerovane: Otazka[];
    try {
      const generator = await nactiGenerator();
      vygenerovane = await generator.dogenerujOtazky({
        nazevPredmetu: banka.nazev,
        tema,
        obtiznost: telo.data.obtiznost,
        pocet: telo.data.pocet,
      });
    } catch (chyba) {
      if (jeChybaKlice(chyba)) {
        return c.json({ chyba: CHYBA_GENEROVANI_VYPNUTO }, 503);
      }
      console.error('Dogenerování selhalo:', chyba);
      return c.json({ chyba: 'Dogenerování otázek selhalo' }, 500);
    }

    const otazky: Otazka[] = [];
    for (const kandidat of Array.isArray(vygenerovane) ? vygenerovane : []) {
      const v = otazkaSchema.safeParse(kandidat);
      if (v.success) otazky.push(v.data as Otazka);
    }
    if (otazky.length === 0) {
      return c.json({ chyba: 'Generátor nevrátil žádnou platnou otázku' }, 500);
    }
    return c.json({ otazky });
  });

  return app;
}
