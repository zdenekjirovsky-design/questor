// HTTP aplikace serveru QUESTOR (Hono) — API kontrakt viz docs/ARCHITEKTURA.md.
// Aplikace se vytváří továrnou vytvorApp(db), aby šla testovat přes app.request()
// nad DB ':memory:' bez poslouchání na portu.

import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import type { DatabaseSync } from 'node:sqlite';
import {
  otazkaSchema,
  stavLevelu,
  validujBanku,
  validujVyuku,
  type BankaOtazek,
  type Otazka,
  type ProfilMetadata,
  type ProgresStudenta,
  type Tema,
  type TestVysledek,
  type VyukaPredmetu,
} from '@questor/sdilene';
import {
  dogenerovatSchema,
  novaVyzvaSchema,
  orizniCasBudoucnosti,
  profilTelaSchema,
  vysledekVyzvySchema,
  zvalidujProfilRegistr,
  zvalidujProgres,
  zvalidujTestVysledek,
  type VyzvaZaznam,
} from './validace';
import { vytvorRateLimit, type MoznostiRateLimit } from './limit';
import { VYCHOZI_PROFIL_ID, VYCHOZI_PROFIL_JMENO } from './db';
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

/**
 * Vytáhne profil z těla studentského POSTu. Chybějící pole = výchozí profil
 * (zpětná kompatibilita se staršími aplikacemi bez profilů); pole špatného
 * typu nebo prázdná → null (volající vrací 400, aby se cizí data nezapsala
 * omylem do výchozího profilu).
 */
function prectiProfil(telo: unknown): { profilId: string; profilJmeno: string } | null {
  const v = profilTelaSchema.safeParse(telo);
  if (!v.success) return null;
  return {
    profilId: v.data.profilId ?? VYCHOZI_PROFIL_ID,
    profilJmeno: v.data.profilJmeno ?? VYCHOZI_PROFIL_JMENO,
  };
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
  /** Nastavení rate limitu na /api/* (testy injektují hodiny a nižší limity). */
  rateLimit?: MoznostiRateLimit;
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

  // CORS: aplikace běží na jiném originu (Vite :5173, Tauri http://tauri.localhost)
  // a hlavička x-questor-token vynucuje preflight OPTIONS — bez CORS by
  // prohlížeč/WebView všechna volání API zablokoval.
  app.use(
    '*',
    cors({ allowHeaders: ['content-type', 'x-questor-token'] }),
  );

  // Rate limit per IP na celém /api/* — server běží veřejně a tokeny jsou
  // jediná vstupenka; limit brzdí hrubou sílu. Registruje se až ZA CORS,
  // aby i 429 nesla CORS hlavičky (jinak by ji prohlížeč aplikaci zatajil).
  app.use('/api/*', vytvorRateLimit(moznosti.rateLimit));

  // Limity velikosti těla — cizí (i validní token držící) klient nesmí server
  // shodit na OOM mnohasetmegovým JSONem.
  const limitTela = (maxSize: number) =>
    bodyLimit({
      maxSize,
      onError: (c) => c.json({ chyba: 'Tělo požadavku je příliš velké' }, 413),
    });
  const LIMIT_BANKY = limitTela(10 * 1024 * 1024); // 10 MB — celá banka otázek
  const LIMIT_BEZNY = limitTela(2 * 1024 * 1024); // 2 MB — progres, události, výzvy

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

  app.put('/api/banky/:predmetId', overAuth('admin'), LIMIT_BANKY, async (c) => {
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

  // --- Výuka ---------------------------------------------------------------
  // Stejný vzor jako banky: student čte, admin nahrává, verze musí růst.
  // Limit 10 MB jako u banky — výuka nese inline SVG obrázky, 2 MB by nestačily.

  app.get('/api/vyuka', overAuth('student'), (c) => {
    const radky = db
      .prepare('SELECT predmet_id, verze FROM vyuka ORDER BY predmet_id')
      .all() as { predmet_id: string; verze: number }[];
    return c.json(radky.map((r) => ({ predmetId: r.predmet_id, verze: r.verze })));
  });

  app.get('/api/vyuka/:predmetId', overAuth('student'), (c) => {
    const radek = db
      .prepare('SELECT json FROM vyuka WHERE predmet_id = ?')
      .get(c.req.param('predmetId') ?? '') as { json: string } | undefined;
    if (!radek) return c.json({ chyba: 'Výuka pro tenhle předmět na serveru není' }, 404);
    return c.json(JSON.parse(radek.json) as VyukaPredmetu);
  });

  app.put('/api/vyuka/:predmetId', overAuth('admin'), LIMIT_BANKY, async (c) => {
    const telo = await prectiJson(c);
    let vyuka: VyukaPredmetu;
    try {
      vyuka = validujVyuku(telo);
    } catch (chyba) {
      return c.json({ chyba: chyba instanceof Error ? chyba.message : 'Neplatná výuka' }, 400);
    }
    const predmetId = c.req.param('predmetId');
    if (vyuka.predmetId !== predmetId) {
      return c.json(
        { chyba: `predmetId v URL („${predmetId}“) nesouhlasí s výukou („${vyuka.predmetId}“)` },
        400,
      );
    }
    const stavajici = db
      .prepare('SELECT verze FROM vyuka WHERE predmet_id = ?')
      .get(predmetId) as { verze: number } | undefined;
    if (stavajici && vyuka.verze <= stavajici.verze) {
      return c.json(
        {
          chyba: `Verze výuky musí růst — na serveru je verze ${stavajici.verze}, přišla ${vyuka.verze}`,
        },
        409,
      );
    }
    db.prepare(
      `INSERT INTO vyuka (predmet_id, verze, json) VALUES (?, ?, ?)
       ON CONFLICT(predmet_id) DO UPDATE SET verze = excluded.verze, json = excluded.json`,
    ).run(predmetId, vyuka.verze, JSON.stringify(vyuka));
    return c.json({ ok: true, verze: vyuka.verze });
  });

  // --- Registr profilů (sync mezi zařízeními) ------------------------------
  // Rodina sdílí studentský token; profil založený na jednom zařízení se přes
  // registr objeví i na ostatních (včetně pinHash a studijních bank).
  // Konflikty řeší LWW podle `aktualizovano` — v rodině se u profilu střídají
  // zařízení, souběžná práce není cíl.

  app.get('/api/profily', overAuth('student'), (c) => {
    const radky = db
      .prepare('SELECT profil_id, json, aktualizovano FROM profily ORDER BY aktualizovano DESC')
      .all() as { profil_id: string; json: string; aktualizovano: string }[];
    return c.json(
      radky.map((r) => ({
        profilId: r.profil_id,
        ...(JSON.parse(r.json) as ProfilMetadata),
        aktualizovano: r.aktualizovano,
      })),
    );
  });

  app.put('/api/profily/:id', overAuth('student'), LIMIT_BEZNY, async (c) => {
    const zaznam = zvalidujProfilRegistr(await prectiJson(c));
    if (!zaznam) {
      return c.json(
        { chyba: 'Tělo musí být záznam profilu (jmeno, barva, predmety, aktivniPredmetId, aktualizovano)' },
        400,
      );
    }
    const profilId = c.req.param('id') ?? '';
    if (profilId.length < 1 || profilId.length > 64) {
      return c.json({ chyba: 'Id profilu musí mít 1–64 znaků' }, 400);
    }
    // Čas z budoucnosti (špatně nastavené hodiny zařízení) se ořízne na
    // serverové „teď“ — jinak by LWW zamrzl a záznam by šel změnit až
    // v onom budoucím roce (viz orizniCasBudoucnosti).
    const { aktualizovano: prichoziCas, ...metadata } = zaznam;
    const aktualizovano = orizniCasBudoucnosti(prichoziCas);
    const stavajici = db
      .prepare('SELECT json, aktualizovano FROM profily WHERE profil_id = ?')
      .get(profilId) as { json: string; aktualizovano: string } | undefined;
    // LWW: zapsat jen když příchozí čas >= uloženému (ISO řetězce se
    // porovnávají lexikograficky). Starší zápis se NEpřijme — klient dostane
    // aktuální (novější) záznam a vezme si ho.
    if (stavajici && aktualizovano < stavajici.aktualizovano) {
      return c.json({
        ok: true,
        prijato: false,
        aktualni: {
          profilId,
          ...(JSON.parse(stavajici.json) as ProfilMetadata),
          aktualizovano: stavajici.aktualizovano,
        },
      });
    }
    db.prepare(
      `INSERT INTO profily (profil_id, json, aktualizovano) VALUES (?, ?, ?)
       ON CONFLICT(profil_id) DO UPDATE SET
         json = excluded.json, aktualizovano = excluded.aktualizovano`,
    ).run(profilId, JSON.stringify(metadata), aktualizovano);
    return c.json({ ok: true, prijato: true });
  });

  // Smaže profil z registru i jeho progres; události zůstávají (jsou to
  // dějiny — staré řádky se v přehledech dál hlásí pod svým profilem).
  // Idempotentní: mazání neexistujícího profilu je taky { ok } (retry-safe).
  app.delete('/api/profily/:id', overAuth('student'), (c) => {
    const profilId = c.req.param('id') ?? '';
    db.prepare('DELETE FROM profily WHERE profil_id = ?').run(profilId);
    db.prepare('DELETE FROM progres WHERE profil_id = ?').run(profilId);
    return c.json({ ok: true });
  });

  // --- Progres -------------------------------------------------------------

  app.post('/api/progres', overAuth('student'), LIMIT_BEZNY, async (c) => {
    const telo = await prectiJson(c);
    const progres = zvalidujProgres(telo);
    if (!progres) return c.json({ chyba: 'Tělo neodpovídá typu ProgresStudenta' }, 400);
    // Profil vedle progresu: volitelná pole profilId/profilJmeno v témže těle
    // (zod je při validaci progresu odstriploval, uložený JSON zůstává čistý
    // ProgresStudenta). Chybí-li, jde o výchozí profil.
    const profil = prectiProfil(telo);
    if (!profil) {
      return c.json({ chyba: 'profilId a profilJmeno musí být neprázdné řetězce (max 64 znaků)' }, 400);
    }
    // LWW podle progres.aktualizovano — stejně jako u PUT /api/profily/:id.
    // Offline fronta může snapshot doručit dny po vzniku; bez porovnání by
    // zastaralý snapshot přepsal novější postup z jiného zařízení a následný
    // pull (GET /api/progres/:profilId) by vrátil ten starý — úterní hraní
    // by nenávratně zmizelo. Čas z budoucnosti se ořezává (viz PUT profilu),
    // aby LWW nezamrzl na špatně nastavených hodinách. Starší snapshot se
    // NEpřijme ({ prijato: false }); starý snapshot v DB bez aktualizovano
    // (řádek z dob před LWW) prohrává vždy.
    const kUlozeni: ProgresStudenta = {
      ...progres,
      aktualizovano: orizniCasBudoucnosti(progres.aktualizovano),
    };
    const stavajici = db
      .prepare('SELECT json FROM progres WHERE profil_id = ?')
      .get(profil.profilId) as { json: string } | undefined;
    if (stavajici) {
      const ulozeny = JSON.parse(stavajici.json) as Partial<ProgresStudenta>;
      if (
        typeof ulozeny.aktualizovano === 'string' &&
        kUlozeni.aktualizovano < ulozeny.aktualizovano
      ) {
        return c.json({ ok: true, prijato: false });
      }
    }
    db.prepare(
      `INSERT INTO progres (profil_id, profil_jmeno, json, prijato) VALUES (?, ?, ?, ?)
       ON CONFLICT(profil_id) DO UPDATE SET
         profil_jmeno = excluded.profil_jmeno, json = excluded.json, prijato = excluded.prijato`,
    ).run(profil.profilId, profil.profilJmeno, JSON.stringify(kUlozeni), new Date().toISOString());
    return c.json({ ok: true, prijato: true });
  });

  app.get('/api/progres', overAuth('admin'), (c) => {
    const radky = db
      .prepare(
        'SELECT profil_id, profil_jmeno, json, prijato FROM progres ORDER BY prijato DESC',
      )
      .all() as { profil_id: string; profil_jmeno: string | null; json: string; prijato: string }[];
    // Pole profilů (naposledy aktivní první); žádný progres = prázdné pole.
    // level navíc (aditivně): počítá ho sdílená funkce, aby admin stránka
    // (vanilla JS) nemusela duplikovat křivku levelů.
    return c.json(
      radky.map((r) => {
        const progres = JSON.parse(r.json) as ProgresStudenta;
        return {
          profilId: r.profil_id,
          jmeno: r.profil_jmeno ?? VYCHOZI_PROFIL_JMENO,
          progres,
          prijato: r.prijato,
          level: stavLevelu(progres.xp),
        };
      }),
    );
  });

  // Pull progresu (druhé zařízení si stáhne KOMPLETNÍ postup profilu).
  // Push (POST /api/progres výš) zůstává beze změny — starší klienti jedou dál.
  app.get('/api/progres/:profilId', overAuth('student'), (c) => {
    const radek = db
      .prepare('SELECT json, prijato FROM progres WHERE profil_id = ?')
      .get(c.req.param('profilId') ?? '') as { json: string; prijato: string } | undefined;
    if (!radek) return c.json({ chyba: 'Progres pro tenhle profil na serveru není' }, 404);
    return c.json({
      progres: JSON.parse(radek.json) as ProgresStudenta,
      prijato: radek.prijato,
    });
  });

  // --- Události (výsledky testů) ------------------------------------------

  app.post('/api/udalosti', overAuth('student'), LIMIT_BEZNY, async (c) => {
    const telo = await prectiJson(c);
    const vysledek = zvalidujTestVysledek(telo);
    if (!vysledek) return c.json({ chyba: 'Tělo neodpovídá typu TestVysledek' }, 400);
    const profil = prectiProfil(telo);
    if (!profil) {
      return c.json({ chyba: 'profilId a profilJmeno musí být neprázdné řetězce (max 64 znaků)' }, 400);
    }
    // Idempotence podle vysledek.id (unikátní index nad json_extract): klient
    // posílá at-least-once (timeout + retry fronty) — duplicitní doručení
    // nesmí výsledek v přehledu zdvojit. OR IGNORE + { ok } i pro duplikát.
    db.prepare(
      'INSERT OR IGNORE INTO udalosti (cas, json, profil_id, profil_jmeno) VALUES (?, ?, ?, ?)',
    ).run(new Date().toISOString(), JSON.stringify(vysledek), profil.profilId, profil.profilJmeno);
    return c.json({ ok: true });
  });

  app.get('/api/udalosti', overAuth('admin'), (c) => {
    const surovy = Number.parseInt(c.req.query('limit') ?? '50', 10);
    const limit = Math.min(Math.max(Number.isNaN(surovy) ? 50 : surovy, 1), 500);
    const radky = db
      .prepare('SELECT cas, json, profil_id, profil_jmeno FROM udalosti ORDER BY id DESC LIMIT ?')
      .all(limit) as {
      cas: string;
      json: string;
      profil_id: string | null;
      profil_jmeno: string | null;
    }[];
    // Staré řádky (před profily) mají NULL — patřily jedinému studentovi,
    // tedy výchozímu profilu.
    return c.json(
      radky.map((r) => ({
        cas: r.cas,
        profilId: r.profil_id ?? VYCHOZI_PROFIL_ID,
        profilJmeno: r.profil_jmeno ?? VYCHOZI_PROFIL_JMENO,
        vysledek: JSON.parse(r.json) as TestVysledek,
      })),
    );
  });

  // --- Výzvy ---------------------------------------------------------------

  app.get('/api/vyzvy', overAuth('student'), (c) => {
    // Volitelný ?profilId= vrátí výzvy cílené na daný profil + společné
    // (bez cilovyProfilId). Bez query platí výchozí profil `vychozi` —
    // starý klient bez profilů JE výchozí profil (stejně se atribuuje jeho
    // progres a události). Cizí cílené výzvy starý klient NEsmí dostat:
    // zobrazil by je jako běžnou výzvu, dokončil a globálně uzavřel
    // (POST /vysledek profil nezná), takže by adresátovi navždy zmizely.
    const profilId = c.req.query('profilId') ?? VYCHOZI_PROFIL_ID;
    const radky = db.prepare('SELECT json FROM vyzvy').all() as { json: string }[];
    const otevrene = radky
      .map((r) => JSON.parse(r.json) as VyzvaZaznam)
      .filter((v) => v.stav !== 'dokoncena')
      .filter((v) => !v.cilovyProfilId || v.cilovyProfilId === profilId)
      .sort((a, b) => (a.vytvoreno < b.vytvoreno ? 1 : -1));
    return c.json(otevrene);
  });

  app.post('/api/vyzvy', overAuth('admin'), LIMIT_BEZNY, async (c) => {
    const telo = novaVyzvaSchema.safeParse(await prectiJson(c));
    if (!telo.success) {
      return c.json({ chyba: 'Výzva potřebuje zprava a konfigurace (TestKonfigurace)' }, 400);
    }
    const vyzva: VyzvaZaznam = {
      id: crypto.randomUUID(),
      zprava: telo.data.zprava,
      konfigurace: telo.data.konfigurace,
      vytvoreno: new Date().toISOString(),
      stav: 'nova',
      ...(telo.data.cilovaUspesnost !== undefined
        ? { cilovaUspesnost: telo.data.cilovaUspesnost }
        : {}),
      ...(telo.data.cilovyProfilId !== undefined
        ? { cilovyProfilId: telo.data.cilovyProfilId }
        : {}),
    };
    db.prepare('INSERT INTO vyzvy (id, json) VALUES (?, ?)').run(vyzva.id, JSON.stringify(vyzva));
    return c.json(vyzva);
  });

  app.post('/api/vyzvy/:id/vysledek', overAuth('student'), LIMIT_BEZNY, async (c) => {
    const telo = vysledekVyzvySchema.safeParse(await prectiJson(c));
    if (!telo.success) return c.json({ chyba: 'Tělo musí být { uspesnost, xp }' }, 400);
    const id = c.req.param('id') ?? '';
    const radek = db.prepare('SELECT json FROM vyzvy WHERE id = ?').get(id) as
      | { json: string }
      | undefined;
    if (!radek) return c.json({ chyba: 'Výzva neexistuje' }, 404);
    const vyzva = JSON.parse(radek.json) as VyzvaZaznam;
    const hotova: VyzvaZaznam = {
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

  app.post('/api/generovani/dogenerovat', overAuth('student'), LIMIT_BEZNY, async (c) => {
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

    // Server zdrojové učivo nemá — jako kontext poslouží existující otázky
    // tématu z banky (zadání + vysvětlení). Bez kontextu by prompt přikazoval
    // „vycházej výhradně z učiva" nad prázdným učivem.
    const kontextUciva = banka.otazky
      .filter((o) => o.temaId === tema.id)
      .map((o) => `- ${o.zadani}\n  Vysvětlení: ${o.vysvetleni}`)
      .join('\n')
      .slice(0, 20_000);

    let vygenerovane: Otazka[];
    try {
      const generator = await nactiGenerator();
      vygenerovane = await generator.dogenerujOtazky({
        nazevPredmetu: banka.nazev,
        tema,
        obtiznost: telo.data.obtiznost,
        pocet: telo.data.pocet,
        ...(kontextUciva ? { kontextUciva } : {}),
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
