// Testy serveru QUESTOR — přes app.request() bez poslouchání na portu,
// DB ':memory:' (migrace schématu jedou nad dočasným souborem). Pokrývá auth,
// banky (včetně kontroly verze), progres a události per profil (včetně migrace
// staré DB a zpětné kompatibility bez profilId), životní cyklus výzev včetně
// cílení na profil a dogenerování (503 + zapnutá cesta).

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type {
  BankaOtazek,
  Otazka,
  ProgresStudenta,
  TestVysledek,
  VyukaPredmetu,
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

function vzorovaVyuka(verze = 1): VyukaPredmetu {
  return {
    predmetId: 'ekonomika-podnikani',
    verze,
    vytvoreno: '2026-09-04',
    lekce: [
      {
        temaId: 'trh',
        nazev: 'Trh a tržní mechanismus',
        poradi: 0,
        bloky: [
          { typ: 'text', obsah: 'Trh je místo, kde se potkává **nabídka** s poptávkou.' },
          {
            typ: 'klicove-pojmy',
            polozky: [{ pojem: 'Nabídka', definice: 'Množství zboží, které chtějí výrobci prodat.' }],
          },
          {
            typ: 'widget',
            widgetId: 'pexeso',
            parametry: {
              dvojice: [
                { a: 'Nabídka', b: 'Výrobci chtějí prodat' },
                { a: 'Poptávka', b: 'Kupující chtějí koupit' },
              ],
            },
          },
        ],
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
    avatar: {
      pohlavi: 'zena',
      tvarObliceje: 'ovalny',
      barvaPleti: '#f2c9a0',
      barvaVlasu: '#8b5cf6',
      stylVlasu: 'kratke',
      vybava: { oci: 'bryle-cerne' },
    },
    vlastnenaVybava: ['bryle-cerne'],
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

describe('výuka', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  async function nahrajVyuku(vyuka: VyukaPredmetu) {
    return app.request(`/api/vyuka/${vyuka.predmetId}`, {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(vyuka),
    });
  }

  it('GET /api/vyuka vyžaduje token, PUT admin token', async () => {
    const bezTokenu = await app.request('/api/vyuka');
    expect(bezTokenu.status).toBe(401);

    const studentPut = await app.request('/api/vyuka/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovaVyuka()),
    });
    expect(studentPut.status).toBe(401);
  });

  it('PUT odmítne neplatnou výuku (400)', async () => {
    const odpoved = await app.request('/api/vyuka/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify({ predmetId: 'ekonomika-podnikani', verze: 1 }),
    });
    expect(odpoved.status).toBe(400);
    expect(await odpoved.json()).toHaveProperty('chyba');
  });

  it('PUT odmítne výuku s rozbitými parametry widgetu (400 přes validujVyuku)', async () => {
    const rozbita = vzorovaVyuka();
    rozbita.lekce[0].bloky.push({
      typ: 'widget',
      widgetId: 'tridicka',
      parametry: { zadani: 'Roztřiď' }, // chybí kategorie a polozky
    } as unknown as VyukaPredmetu['lekce'][0]['bloky'][0]);
    const odpoved = await app.request('/api/vyuka/ekonomika-podnikani', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(rozbita),
    });
    expect(odpoved.status).toBe(400);
  });

  it('PUT odmítne nesoulad predmetId v URL a v těle (400)', async () => {
    const odpoved = await app.request('/api/vyuka/jiny-predmet', {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(vzorovaVyuka()),
    });
    expect(odpoved.status).toBe(400);
  });

  it('nahraje výuku, vrátí ji zpět a objeví se v seznamu', async () => {
    const ulozeni = await nahrajVyuku(vzorovaVyuka());
    expect(ulozeni.status).toBe(200);
    expect(await ulozeni.json()).toEqual({ ok: true, verze: 1 });

    const seznam = await app.request('/api/vyuka', { headers: STUDENT });
    expect(seznam.status).toBe(200);
    expect(await seznam.json()).toEqual([{ predmetId: 'ekonomika-podnikani', verze: 1 }]);

    const detail = await app.request('/api/vyuka/ekonomika-podnikani', { headers: STUDENT });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(vzorovaVyuka());
  });

  it('GET neexistující výuky vrací 404', async () => {
    const odpoved = await app.request('/api/vyuka/neexistuje', { headers: STUDENT });
    expect(odpoved.status).toBe(404);
    expect(await odpoved.json()).toHaveProperty('chyba');
  });

  it('verze musí růst: stejná a nižší → 409, vyšší projde', async () => {
    await nahrajVyuku(vzorovaVyuka(2));

    const stejna = await nahrajVyuku(vzorovaVyuka(2));
    expect(stejna.status).toBe(409);
    expect(await stejna.json()).toHaveProperty('chyba');

    const nizsi = await nahrajVyuku(vzorovaVyuka(1));
    expect(nizsi.status).toBe(409);

    const vyssi = await nahrajVyuku(vzorovaVyuka(3));
    expect(vyssi.status).toBe(200);
    expect(await vyssi.json()).toEqual({ ok: true, verze: 3 });

    const detail = await app.request('/api/vyuka/ekonomika-podnikani', { headers: STUDENT });
    expect(((await detail.json()) as VyukaPredmetu).verze).toBe(3);
  });

  it('admin stránka obsahuje sekci Výuka s uploadem', async () => {
    const odpoved = await app.request('/admin');
    const html = await odpoved.text();
    expect(html).toContain('panel-vyuka');
    expect(html).toContain('/api/vyuka/');
  });
});

// ---------------------------------------------------------------------------

type ProfilProgresu = {
  profilId: string;
  jmeno: string;
  progres: ProgresStudenta;
  prijato: string;
  level: { level: number };
};

describe('progres', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  it('GET bez uloženého progresu vrací prázdné pole profilů', async () => {
    const odpoved = await app.request('/api/progres', { headers: ADMIN });
    expect(odpoved.status).toBe(200);
    expect(await odpoved.json()).toEqual([]);
  });

  it('POST neplatného progresu vrací 400', async () => {
    const odpoved = await app.request('/api/progres', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: JSON.stringify({ xp: 'hodne' }),
    });
    expect(odpoved.status).toBe(400);
  });

  it('uloží snapshot bez profilu jako výchozí profil a admin ho přečte i s levelem', async () => {
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
    const data = (await odpoved.json()) as ProfilProgresu[];
    expect(data).toHaveLength(1);
    expect(data[0].profilId).toBe('vychozi');
    expect(data[0].jmeno).toBe('Student');
    expect(data[0].progres).toEqual(progres);
    expect(typeof data[0].prijato).toBe('string');
    expect(data[0].level.level).toBeGreaterThanOrEqual(2); // 350 XP ≈ level 3 (sdílená křivka)
  });

  it('novější snapshot téhož profilu přepíše starší (drží se jen poslední)', async () => {
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
    const data = (await odpoved.json()) as ProfilProgresu[];
    expect(data).toHaveLength(1);
    expect(data[0].progres.xp).toBe(999);
  });
});

// ---------------------------------------------------------------------------

describe('profily', () => {
  type RadekUdalosti = { cas: string; profilId: string; profilJmeno: string; vysledek: TestVysledek };

  describe('migrace staré DB', () => {
    let slozka: string;
    beforeEach(() => {
      slozka = mkdtempSync(join(tmpdir(), 'questor-db-'));
    });
    afterEach(() => {
      rmSync(slozka, { recursive: true, force: true });
    });

    it('progres id=1 a staré události přežijí jako výchozí profil', async () => {
      const cesta = join(slozka, 'questor.db');
      // Stará DB se schématem před profily — přesně jak ho zakládal starý server.
      const stara = new DatabaseSync(cesta);
      stara.exec(`
        CREATE TABLE progres (id INT PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, prijato TEXT NOT NULL);
        CREATE TABLE udalosti (id INTEGER PRIMARY KEY AUTOINCREMENT, cas TEXT NOT NULL, json TEXT NOT NULL);
        CREATE UNIQUE INDEX udalosti_vysledek_id ON udalosti (json_extract(json, '$.id'));
      `);
      const progres = vzorovyProgres();
      const vysledek = vzorovyVysledek(0.7);
      stara
        .prepare('INSERT INTO progres (id, json, prijato) VALUES (1, ?, ?)')
        .run(JSON.stringify(progres), '2026-09-01T08:00:00.000Z');
      stara
        .prepare('INSERT INTO udalosti (cas, json) VALUES (?, ?)')
        .run('2026-09-01T08:05:00.000Z', JSON.stringify(vysledek));
      stara.close();

      const app = vytvorApp(otevriDb(cesta));

      const progresOdpoved = await app.request('/api/progres', { headers: ADMIN });
      expect(progresOdpoved.status).toBe(200);
      const profily = (await progresOdpoved.json()) as ProfilProgresu[];
      expect(profily).toHaveLength(1);
      expect(profily[0].profilId).toBe('vychozi');
      expect(profily[0].jmeno).toBe('Student');
      expect(profily[0].prijato).toBe('2026-09-01T08:00:00.000Z');
      expect(profily[0].progres).toEqual(progres);

      const udalostiOdpoved = await app.request('/api/udalosti', { headers: ADMIN });
      const radky = (await udalostiOdpoved.json()) as RadekUdalosti[];
      expect(radky).toHaveLength(1);
      expect(radky[0].profilId).toBe('vychozi');
      expect(radky[0].profilJmeno).toBe('Student');
      expect(radky[0].vysledek).toEqual(vysledek);
    });

    it('otevření nové i už zmigrované DB je idempotentní', async () => {
      const cesta = join(slozka, 'questor.db');
      otevriDb(cesta).close(); // založení nové DB
      otevriDb(cesta).close(); // druhé otevření nesmí nic rozbít
      const app = vytvorApp(otevriDb(cesta));
      const ulozeni = await app.request('/api/progres', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify({ ...vzorovyProgres(), profilId: 'mama', profilJmeno: 'Marie' }),
      });
      expect(ulozeni.status).toBe(200);
      const odpoved = await app.request('/api/progres', { headers: ADMIN });
      const profily = (await odpoved.json()) as ProfilProgresu[];
      expect(profily.map((p) => p.profilId)).toEqual(['mama']);
    });
  });

  describe('per-profil progres a události', () => {
    let app: Hono;
    beforeEach(() => {
      app = novaApp();
    });

    it('drží progres každého profilu zvlášť a vrací je v jednom poli', async () => {
      await app.request('/api/progres', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify({ ...vzorovyProgres(), profilId: 'mama', profilJmeno: 'Marie', xp: 120 }),
      });
      await app.request('/api/progres', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify(vzorovyProgres()), // bez profilu → 'vychozi' / 'Student'
      });

      const odpoved = await app.request('/api/progres', { headers: ADMIN });
      const profily = (await odpoved.json()) as ProfilProgresu[];
      expect(profily).toHaveLength(2);
      const mama = profily.find((p) => p.profilId === 'mama');
      const vychozi = profily.find((p) => p.profilId === 'vychozi');
      expect(mama?.jmeno).toBe('Marie');
      expect(mama?.progres.xp).toBe(120);
      expect(vychozi?.jmeno).toBe('Student');
      expect(vychozi?.progres.xp).toBe(350);
      // Uložený progres zůstává čistý ProgresStudenta — bez profilových polí.
      expect(mama?.progres).not.toHaveProperty('profilId');
    });

    it('neplatná profilová pole vrací 400 (nic se nezapíše do výchozího profilu)', async () => {
      for (const spatne of [{ profilId: 42 }, { profilId: '' }, { profilJmeno: '' }]) {
        const odpoved = await app.request('/api/progres', {
          method: 'POST',
          headers: { ...STUDENT, ...JSON_HLAVICKY },
          body: JSON.stringify({ ...vzorovyProgres(), ...spatne }),
        });
        expect(odpoved.status).toBe(400);
      }
      const odpoved = await app.request('/api/progres', { headers: ADMIN });
      expect(await odpoved.json()).toEqual([]);
    });

    it('události nesou profil; bez profilu patří výchozímu', async () => {
      const mamin = vzorovyVysledek(0.9);
      const studentuv = vzorovyVysledek(0.6);
      await app.request('/api/udalosti', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify({ ...mamin, profilId: 'mama', profilJmeno: 'Marie' }),
      });
      await app.request('/api/udalosti', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify(studentuv),
      });

      const odpoved = await app.request('/api/udalosti', { headers: ADMIN });
      const radky = (await odpoved.json()) as RadekUdalosti[];
      expect(radky).toHaveLength(2);
      expect(radky[0].profilId).toBe('vychozi'); // nejnovější první
      expect(radky[0].profilJmeno).toBe('Student');
      expect(radky[0].vysledek).toEqual(studentuv);
      expect(radky[1].profilId).toBe('mama');
      expect(radky[1].profilJmeno).toBe('Marie');
      expect(radky[1].vysledek).toEqual(mamin); // JSON výsledku bez profilových polí
    });
  });

  describe('výzvy cílené na profil', () => {
    let app: Hono;
    beforeEach(() => {
      app = novaApp();
    });

    async function zalozVyzvu(telo: Record<string, unknown>): Promise<Vyzva & { cilovyProfilId?: string }> {
      const odpoved = await app.request('/api/vyzvy', {
        method: 'POST',
        headers: { ...ADMIN, ...JSON_HLAVICKY },
        body: JSON.stringify({
          zprava: 'Zkus to!',
          konfigurace: { predmetId: 'ekonomika-podnikani', rezim: 'standard', pocetOtazek: 10 },
          ...telo,
        }),
      });
      expect(odpoved.status).toBe(200);
      return (await odpoved.json()) as Vyzva & { cilovyProfilId?: string };
    }

    it('výzva pro profil se vrací jen jemu, společná všem', async () => {
      const spolecna = await zalozVyzvu({});
      const mamina = await zalozVyzvu({ cilovyProfilId: 'mama' });
      const proVychozi = await zalozVyzvu({ cilovyProfilId: 'vychozi' });
      expect(spolecna.cilovyProfilId).toBeUndefined();
      expect(mamina.cilovyProfilId).toBe('mama');

      const proMamu = await app.request('/api/vyzvy?profilId=mama', { headers: STUDENT });
      expect(((await proMamu.json()) as Vyzva[]).map((v) => v.id).sort()).toEqual(
        [spolecna.id, mamina.id].sort(),
      );

      const proStudenta = await app.request('/api/vyzvy?profilId=vychozi', { headers: STUDENT });
      expect(((await proStudenta.json()) as Vyzva[]).map((v) => v.id).sort()).toEqual(
        [proVychozi.id, spolecna.id].sort(),
      );

      // Bez profilId (stará aplikace) platí výchozí profil `vychozi`: společné
      // + cílené na `vychozi`. Cizí cílené výzvy starý klient NEsmí dostat —
      // dokončil by je (POST /vysledek profil nezná) a adresátovi by zmizely.
      const bezProfilu = await app.request('/api/vyzvy', { headers: STUDENT });
      expect(((await bezProfilu.json()) as Vyzva[]).map((v) => v.id).sort()).toEqual(
        [proVychozi.id, spolecna.id].sort(),
      );
    });

    it('dokončení cílené výzvy funguje beze změny', async () => {
      const mamina = await zalozVyzvu({ cilovyProfilId: 'mama' });
      const dokonceni = await app.request(`/api/vyzvy/${mamina.id}/vysledek`, {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify({ uspesnost: 0.9, xp: 100 }),
      });
      expect(dokonceni.status).toBe(200);
      const otevrene = await app.request('/api/vyzvy?profilId=mama', { headers: STUDENT });
      expect(await otevrene.json()).toEqual([]);
    });
  });

  it('admin stránka zobrazuje profily a výběr cíle výzvy', async () => {
    const odpoved = await novaApp().request('/admin');
    const html = await odpoved.text();
    expect(html).toContain('Progres profilů');
    expect(html).toContain('vyzva-profil');
    expect(html).toContain('Komu');
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

  it('duplicitní doručení téhož výsledku (retry fronty) výsledek nezdvojí', async () => {
    const vysledek = vzorovyVysledek(0.8);
    for (let i = 0; i < 3; i++) {
      const odpoved = await app.request('/api/udalosti', {
        method: 'POST',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify(vysledek),
      });
      expect(odpoved.status).toBe(200); // idempotentní — i duplikát vrací { ok }
    }
    const vsechny = await app.request('/api/udalosti', { headers: ADMIN });
    const seznam = (await vsechny.json()) as { vysledek: TestVysledek }[];
    expect(seznam).toHaveLength(1);
    expect(seznam[0].vysledek.id).toBe(vysledek.id);
  });
});

// ---------------------------------------------------------------------------

describe('CORS a limity těla', () => {
  let app: Hono;
  beforeEach(() => {
    app = novaApp();
  });

  it('preflight OPTIONS projde s CORS hlavičkami (aplikace běží na jiném originu)', async () => {
    const odpoved = await app.request('/zdravi', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'x-questor-token',
      },
    });
    expect(odpoved.status).toBeLessThan(300);
    expect(odpoved.headers.get('access-control-allow-origin')).toBe('*');
    expect(odpoved.headers.get('access-control-allow-headers') ?? '').toMatch(/x-questor-token/i);
  });

  it('běžné odpovědi API nesou Access-Control-Allow-Origin', async () => {
    const odpoved = await app.request('/zdravi', {
      headers: { origin: 'http://tauri.localhost' },
    });
    expect(odpoved.status).toBe(200);
    expect(odpoved.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('příliš velké tělo vrací 413 a server ho nezpracuje', async () => {
    const obri = JSON.stringify({ ...vzorovyProgres(), vata: 'x'.repeat(2 * 1024 * 1024 + 1) });
    const odpoved = await app.request('/api/progres', {
      method: 'POST',
      headers: { ...STUDENT, ...JSON_HLAVICKY },
      body: obri,
    });
    expect(odpoved.status).toBe(413);
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
