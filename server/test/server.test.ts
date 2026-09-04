// Testy serveru QUESTOR — přes app.request() bez poslouchání na portu,
// DB vždy ':memory:'. Pokrývá auth, banky (včetně kontroly verze), progres,
// události, životní cyklus výzev a dogenerování (503 + zapnutá cesta).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type {
  BankaOtazek,
  Otazka,
  ProgresStudenta,
  TestVysledek,
  Vyzva,
} from '@questor/sdilene';
import { vytvorApp, type MoznostiApp } from '../src/app';
import { otevriDb } from '../src/db';

const ADMIN = { 'x-questor-token': 'admin-dev' };
const STUDENT = { 'x-questor-token': 'student-dev' };
const JSON_HLAVICKY = { 'content-type': 'application/json' };

function novaApp(moznosti?: MoznostiApp): Hono {
  return vytvorApp(otevriDb(':memory:'), moznosti);
}

function vzorovaBanka(verze = 1): BankaOtazek {
  return {
    predmetId: 'ekonomika-podnikani',
    nazev: 'Ekonomika a podnikání',
    verze,
    vytvoreno: '2026-09-04',
    temata: [{ id: 'trh', nazev: 'Trh a tržní mechanismus', poradi: 0 }],
    otazky: [
      {
        id: 'o-1',
        temaId: 'trh',
        obtiznost: 2,
        typ: 'vyber',
        zadani: 'Co popisuje zákon nabídky?',
        moznosti: ['Cena roste, nabízené množství roste', 'Cena roste, nabízené množství klesá'],
        spravna: 0,
        vysvetleni: 'S rostoucí cenou se výrobcům vyplatí nabízet víc.',
      },
      {
        id: 'o-2',
        temaId: 'trh',
        obtiznost: 1,
        typ: 'anone',
        zadani: 'Je konkurence součástí tržního mechanismu?',
        spravna: true,
        vysvetleni: 'Konkurence je jeden ze základních prvků trhu.',
      },
    ],
  };
}

function vzorovyProgres(): ProgresStudenta {
  return {
    xp: 350,
    streak: { aktualni: 3, nejdelsi: 5, posledniDen: '2026-09-04', zmrazeni: 1 },
    questy: [],
    sbirka: { karty: ['smith'], truhelBezKarty: 1 },
    avatar: { barvaVlasu: '#8b5cf6' },
    statistikyOtazek: {
      'o-1': { otazkaId: 'o-1', box: 2, spravneCelkem: 3, spatneCelkem: 1, posledniOdpoved: '2026-09-04T10:00:00.000Z' },
    },
    rekordy: { nejlepsiUspesnost: 0.9, nejdelsiCombo: 7, nejrychlejsiBezchybnyMs: null, tydenniXp: { '2026-08-31': 350 } },
    dokonceneTesty: 4,
    aktualizovano: '2026-09-04T10:00:00.000Z',
  };
}

function vzorovyVysledek(uspesnost = 0.8): TestVysledek {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    konfigurace: { predmetId: 'ekonomika-podnikani', rezim: 'standard', pocetOtazek: 10 },
    zacatek: '2026-09-04T10:00:00.000Z',
    konec: '2026-09-04T10:08:00.000Z',
    odpovedi: [{ otazkaId: 'o-1', temaId: 'trh', obtiznost: 2, spravne: true, casMs: 4200 }],
    uspesnost,
    ziskaneXp: 120,
    nejdelsiCombo: 4,
    truhla: 'stribrna',
  };
}

// ---------------------------------------------------------------------------

describe('zdraví a auth', () => {
  it('GET /zdravi je veřejné', async () => {
    const odpoved = await novaApp().request('/zdravi');
    expect(odpoved.status).toBe(200);
    expect(await odpoved.json()).toMatchObject({ ok: true });
  });

  it('bez tokenu vrací 401 s { chyba }', async () => {
    const odpoved = await novaApp().request('/api/banky');
    expect(odpoved.status).toBe(401);
    expect(await odpoved.json()).toHaveProperty('chyba');
  });

  it('chybný token vrací 401', async () => {
    const odpoved = await novaApp().request('/api/banky', {
      headers: { 'x-questor-token': 'spatny' },
    });
    expect(odpoved.status).toBe(401);
  });

  it('studentský token nesmí na admin endpoint', async () => {
    const odpoved = await novaApp().request('/api/progres', { headers: STUDENT });
    expect(odpoved.status).toBe(401);
  });

  it('admin token smí i studentské endpointy', async () => {
    const odpoved = await novaApp().request('/api/banky', { headers: ADMIN });
    expect(odpoved.status).toBe(200);
    expect(await odpoved.json()).toEqual([]);
  });

  it('GET /admin servíruje HTML stránku bez tokenu', async () => {
    const odpoved = await novaApp().request('/admin');
    expect(odpoved.status).toBe(200);
    const html = await odpoved.text();
    expect(html).toContain('QUESTOR');
    expect(html).toContain('x-questor-token');
  });
});

// ---------------------------------------------------------------------------

describe('banky', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  async function nahrajBanku(banka: BankaOtazek) {
    return app.request(`/api/banky/${banka.predmetId}`, {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(banka),
    });
  }

  it('PUT vyžaduje admin token', async () => {
    const odpoved = await app.request('/api/banky/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovaBanka()),
    });
    expect(odpoved.status).toBe(401);
  });

  it('PUT odmítne neplatnou banku (400)', async () => {
    const odpoved = await app.request('/api/banky/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify({ predmetId: 'ekonomika-podnikani', nazev: 'X' }),
    });
    expect(odpoved.status).toBe(400);
    expect(await odpoved.json()).toHaveProperty('chyba');
  });

  it('PUT odmítne nesoulad predmetId v URL a v těle (400)', async () => {
    const odpoved = await app.request('/api/banky/jiny-predmet', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovaBanka()),
    });
    expect(odpoved.status).toBe(400);
  });

  it('nahraje banku, vrátí ji zpět a objeví se v seznamu', async () => {
    const ulozeni = await nahrajBanku(vzorovaBanka());
    expect(ulozeni.status).toBe(200);
    expect(await ulozeni.json()).toEqual({ ok: true, verze: 1 });

    const seznam = await app.request('/api/banky', { headers: STUDENT });
    expect(await seznam.json()).toEqual([
      { predmetId: 'ekonomika-podnikani', nazev: 'Ekonomika a podnikání', verze: 1 },
    ]);

    const detail = await app.request('/api/banky/ekonomika-podnikani', { headers: STUDENT });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(vzorovaBanka());
  });

  it('GET neexistující banky vrací 404', async () => {
    const odpoved = await app.request('/api/banky/neexistuje', { headers: STUDENT });
    expect(odpoved.status).toBe(404);
  });

  it('verze musí růst: stejná a nižší → 409, vyšší projde', async () => {
    await nahrajBanku(vzorovaBanka(2));

    const stejna = await nahrajBanku(vzorovaBanka(2));
    expect(stejna.status).toBe(409);
    expect(await stejna.json()).toHaveProperty('chyba');

    const nizsi = await nahrajBanku(vzorovaBanka(1));
    expect(nizsi.status).toBe(409);

    const vyssi = await nahrajBanku(vzorovaBanka(3));
    expect(vyssi.status).toBe(200);
    expect(await vyssi.json()).toEqual({ ok: true, verze: 3 });

    const detail = await app.request('/api/banky/ekonomika-podnikani', { headers: STUDENT });
    expect(((await detail.json()) as BankaOtazek).verze).toBe(3);
  });
});

// ---------------------------------------------------------------------------

describe('progres', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  it('GET bez uloženého progresu vrací 404', async () => {
    const odpoved = await app.request('/api/progres', { headers: ADMIN });
    expect(odpoved.status).toBe(404);
  });

  it('POST neplatného progresu vrací 400', async () => {
    const odpoved = await app.request('/api/progres', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ xp: 'hodne' }),
    });
    expect(odpoved.status).toBe(400);
  });

  it('uloží snapshot a admin ho přečte i s levelem', async () => {
    const progres = vzorovyProgres();
    const ulozeni = await app.request('/api/progres', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(progres),
    });
    expect(ulozeni.status).toBe(200);
    expect(await ulozeni.json()).toEqual({ ok: true });

    const odpoved = await app.request('/api/progres', { headers: ADMIN });
    expect(odpoved.status).toBe(200);
    const data = (await odpoved.json()) as {
      progres: ProgresStudenta;
      prijato: string;
      level: { level: number };
    };
    expect(data.progres).toEqual(progres);
    expect(typeof data.prijato).toBe('string');
    expect(data.level.level).toBeGreaterThanOrEqual(2); // 350 XP ≈ level 3 (sdílená křivka)
  });

  it('novější snapshot přepíše starší (drží se jen poslední)', async () => {
    await app.request('/api/progres', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovyProgres()),
    });
    const novejsi = { ...vzorovyProgres(), xp: 999 };
    await app.request('/api/progres', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(novejsi),
    });
    const odpoved = await app.request('/api/progres', { headers: ADMIN });
    const data = (await odpoved.json()) as { progres: ProgresStudenta };
    expect(data.progres.xp).toBe(999);
  });
});

// ---------------------------------------------------------------------------

describe('události', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  it('POST neplatného výsledku vrací 400', async () => {
    const odpoved = await app.request('/api/udalosti', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ id: 'x' }),
    });
    expect(odpoved.status).toBe(400);
  });

  it('appenduje výsledky a vrací je nejnovější první s limitem', async () => {
    const prvni = vzorovyVysledek(0.5);
    const druhy = vzorovyVysledek(0.9);
    for (const vysledek of [prvni, druhy]) {
      const odpoved = await app.request('/api/udalosti', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify(vysledek),
      });
      expect(odpoved.status).toBe(200);
    }

    const vsechny = await app.request('/api/udalosti', { headers: ADMIN });
    const seznam = (await vsechny.json()) as { cas: string; vysledek: TestVysledek }[];
    expect(seznam).toHaveLength(2);
    expect(seznam[0].vysledek.id).toBe(druhy.id); // nejnovější první
    expect(seznam[1].vysledek.id).toBe(prvni.id);

    const omezene = await app.request('/api/udalosti?limit=1', { headers: ADMIN });
    const jeden = (await omezene.json()) as { vysledek: TestVysledek }[];
    expect(jeden).toHaveLength(1);
    expect(jeden[0].vysledek.id).toBe(druhy.id);
  });

  it('GET /api/udalosti je jen pro admina', async () => {
    const odpoved = await app.request('/api/udalosti', { headers: STUDENT });
    expect(odpoved.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------

describe('výzvy — životní cyklus', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  it('POST /api/vyzvy je jen pro admina, validuje tělo', async () => {
    const cizi = await app.request('/api/vyzvy', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ zprava: 'x' }),
    });
    expect(cizi.status).toBe(401);

    const spatne = await app.request('/api/vyzvy', {
      method: 'POST',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify({ zprava: 'Chybí konfigurace' }),
    });
    expect(spatne.status).toBe(400);
  });

  it('vytvoření → student vidí → výsledek → zmizí z otevřených', async () => {
    const zalozeni = await app.request('/api/vyzvy', {
      method: 'POST',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify({
        zprava: 'Dáš trh na 80 %?',
        konfigurace: { predmetId: 'ekonomika-podnikani', rezim: 'standard', pocetOtazek: 10 },
        cilovaUspesnost: 0.8,
      }),
    });
    expect(zalozeni.status).toBe(200);
    const vyzva = (await zalozeni.json()) as Vyzva;
    expect(vyzva.id).toBeTruthy();
    expect(vyzva.stav).toBe('nova');
    expect(vyzva.cilovaUspesnost).toBe(0.8);

    const otevrene = await app.request('/api/vyzvy', { headers: STUDENT });
    expect(((await otevrene.json()) as Vyzva[]).map((v) => v.id)).toContain(vyzva.id);

    const dokonceni = await app.request(`/api/vyzvy/${vyzva.id}/vysledek`, {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ uspesnost: 0.85, xp: 140 }),
    });
    expect(dokonceni.status).toBe(200);
    expect(await dokonceni.json()).toEqual({ ok: true });

    const poDokonceni = await app.request('/api/vyzvy', { headers: STUDENT });
    expect(await poDokonceni.json()).toEqual([]);
  });

  it('výsledek neexistující výzvy vrací 404, neplatné tělo 400', async () => {
    const chybejici = await app.request('/api/vyzvy/neni/vysledek', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ uspesnost: 0.5, xp: 10 }),
    });
    expect(chybejici.status).toBe(404);

    const spatne = await app.request('/api/vyzvy/neni/vysledek', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ uspesnost: 5 }),
    });
    expect(spatne.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe('dogenerování', () => {
  const TELO = { predmetId: 'ekonomika-podnikani', temaId: 'trh', obtiznost: 3, pocet: 5 };
  let puvodniKlic: string | undefined;

  beforeEach(() => {
    puvodniKlic = process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (puvodniKlic === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = puvodniKlic;
  });

  it('bez ANTHROPIC_API_KEY vrací 503 s dohodnutou hláškou', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const odpoved = await novaApp().request('/api/generovani/dogenerovat', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(TELO),
    });
    expect(odpoved.status).toBe(503);
    expect(await odpoved.json()).toEqual({ chyba: 'Dogenerování není na serveru zapnuté' });
  });

  it('neplatné tělo vrací 400 ještě před kontrolou klíče', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const odpoved = await novaApp().request('/api/generovani/dogenerovat', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ predmetId: 'x' }),
    });
    expect(odpoved.status).toBe(400);
  });

  it('s klíčem a bankou zvaliduje výstup generátoru a vrátí jen platné otázky', async () => {
    process.env.ANTHROPIC_API_KEY = 'testovaci-klic';
    const platna: Otazka = {
      id: 'o-nova',
      temaId: 'trh',
      obtiznost: 3,
      typ: 'anone',
      zadani: 'Ovlivňuje cena poptávané množství?',
      spravna: true,
      vysvetleni: 'Zákon poptávky: vyšší cena, nižší poptávané množství.',
    };
    const app = novaApp({
      nactiGenerator: async () => ({
        dogenerujOtazky: async () => [platna, { rozbite: true } as unknown as Otazka],
      }),
    });
    await app.request('/api/banky/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovaBanka()),
    });

    const odpoved = await app.request('/api/generovani/dogenerovat', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(TELO),
    });
    expect(odpoved.status).toBe(200);
    expect(await odpoved.json()).toEqual({ otazky: [platna] });
  });

  it('selhání generátoru kvůli klíči mapuje na 503, banka mimo server na 404', async () => {
    process.env.ANTHROPIC_API_KEY = 'testovaci-klic';
    const app = novaApp({
      nactiGenerator: async () => ({
        dogenerujOtazky: async () => {
          throw new Error('Could not resolve authentication: invalid x-api-key');
        },
      }),
    });

    const bezBanky = await app.request('/api/generovani/dogenerovat', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(TELO),
    });
    expect(bezBanky.status).toBe(404);

    await app.request('/api/banky/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovaBanka()),
    });
    const odpoved = await app.request('/api/generovani/dogenerovat', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(TELO),
    });
    expect(odpoved.status).toBe(503);
  });
});
