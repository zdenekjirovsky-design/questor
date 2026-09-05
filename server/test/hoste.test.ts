// Testy duelu ODKAZEM (fáze 2) — hostovské endpointy /api/hoste/* bez
// rodinného tokenu. Pokrývá: založení s proOdkaz (jednorázový kodHosta,
// v DB jen hash se solí = id duelu), ověření kódu (správný / špatný / kód
// jiného duelu → jednotné 403), závod o přijetí (first-wins), zákaz
// power-upů hosta (400), serverový přepočet výsledku hosta (handicap 1.0),
// izolaci hostovského kódu (nikam jinam se s ním nedostane), expiraci
// a rate limit na /api/hoste/*.

import { beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import {
  bodyZaOdpoved,
  casLimitProHrace,
  hostProfilId,
  type BankaOtazek,
  type Duel,
  type Otazka,
  type VysledekDuelu,
} from '@questor/sdilene';
import { vytvorApp } from '../src/app';
import { otevriDb } from '../src/db';
import { DELKA_KODU_HOSTA, hashKoduHosta, vygenerujKodHosta } from '../src/duely';

const ADMIN = { 'x-questor-token': 'admin-dev' };
const STUDENT = { 'x-questor-token': 'student-dev' };
const JSON_HLAVICKY = { 'content-type': 'application/json' };

type DuelSKodem = Duel & { kodHosta: string };
type SeznamDuelu = { moje: Duel[]; otevrene: Duel[] };

/** Banka s 12 otázkami ve 2 tématech (stejný vzor jako testy rodinných duelů). */
function duelovaBanka(): BankaOtazek {
  const otazky: Otazka[] = [];
  for (let i = 1; i <= 12; i++) {
    otazky.push({
      id: `o-${i}`,
      temaId: i <= 6 ? 'trh' : 'marketing',
      obtiznost: (((i - 1) % 5) + 1) as Otazka['obtiznost'],
      typ: 'anone',
      zadani: `Testovací otázka číslo ${i}?`,
      spravna: i % 2 === 0,
      vysvetleni: `Vysvětlení otázky ${i}.`,
    });
  }
  return {
    predmetId: 'ekonomika-podnikani',
    nazev: 'Ekonomika a podnikání',
    verze: 1,
    vytvoreno: '2026-09-05',
    temata: [
      { id: 'trh', nazev: 'Trh a tržní mechanismus', poradi: 0 },
      { id: 'marketing', nazev: 'Marketing', poradi: 1 },
    ],
    otazky,
  };
}

/** Poctivý výsledek půlky duelu — server body/celkovyCasMs přepočítává sám. */
function vysledekHrace(
  otazkyIds: string[],
  moznosti: { spravnych?: number; casNaOtazkuMs?: number } = {},
): VysledekDuelu {
  const spravnych = moznosti.spravnych ?? otazkyIds.length;
  const casNaOtazku = moznosti.casNaOtazkuMs ?? 8_000;
  return {
    odpovedi: otazkyIds.map((id, i) => ({
      otazkaId: id,
      spravne: i < spravnych,
      casMs: casNaOtazku,
    })),
    body: 0,
    celkovyCasMs: casNaOtazku * otazkyIds.length,
    dokonceno: '2026-09-05T10:00:00.000Z',
  };
}

/** Očekávané body po serverovém přepočtu (host má vždy násobič 1.0). */
function ocekavaneBody(banka: BankaOtazek, vysledek: VysledekDuelu, nasobic = 1): number {
  return vysledek.odpovedi.reduce((soucet, odpoved) => {
    const otazka = banka.otazky.find((o) => o.id === odpoved.otazkaId)!;
    const limit = casLimitProHrace(otazka.obtiznost, nasobic);
    return soucet + bodyZaOdpoved(odpoved.spravne, odpoved.casMs, limit);
  }, 0);
}

describe('duel odkazem (hostovské endpointy)', () => {
  let db: DatabaseSync;
  let app: Hono;

  beforeEach(async () => {
    db = otevriDb(':memory:');
    app = vytvorApp(db);
    const banka = duelovaBanka();
    const nahrani = await app.request(`/api/banky/${banka.predmetId}`, {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(banka),
    });
    expect(nahrani.status).toBe(200);
  });

  async function post(cesta: string, telo: unknown, hlavicky: Record<string, string> = STUDENT) {
    return app.request(cesta, {
      method: 'POST',
      headers: { ...hlavicky, ...JSON_HLAVICKY },
      body: JSON.stringify(telo),
    });
  }

  /** POST hostovského endpointu — BEZ jakéhokoli tokenu (kód nese tělo). */
  async function postHosta(cesta: string, telo: unknown) {
    return post(cesta, telo, {});
  }

  /**
   * GET stavu duelu pro hosta — kód jde HLAVIČKOU x-questor-host-kod (primární
   * cesta klienta: kód nesmí do URL, query string končí v access logu proxy).
   */
  async function getHosta(duelId: string, kod: string) {
    return app.request(`/api/hoste/duely/${duelId}`, {
      headers: { 'x-questor-host-kod': kod },
    });
  }

  async function zalozDuelOdkazem(): Promise<DuelSKodem> {
    const odpoved = await post('/api/duely', {
      predmetId: 'ekonomika-podnikani',
      pocetOtazek: 5,
      vyzyvatelProfilId: 'tata',
      vyzyvatelJmeno: 'Táta',
      proOdkaz: true,
    });
    expect(odpoved.status).toBe(200);
    return (await odpoved.json()) as DuelSKodem;
  }

  async function seznamDuelu(profilId: string): Promise<SeznamDuelu> {
    const odpoved = await app.request(`/api/duely?profilId=${profilId}`, { headers: STUDENT });
    expect(odpoved.status).toBe(200);
    return (await odpoved.json()) as SeznamDuelu;
  }

  /** Přepíše vyprsi duelu přímo v DB (simulace uplynulých 24 hodin). */
  function nastavVyprsi(duelId: string, vyprsi: string): void {
    const radek = db.prepare('SELECT json FROM duely WHERE id = ?').get(duelId) as { json: string };
    const duel = JSON.parse(radek.json) as Duel;
    duel.vyprsi = vyprsi;
    db.prepare('UPDATE duely SET json = ? WHERE id = ?').run(JSON.stringify(duel), duelId);
  }

  function duelZDb(duelId: string): Duel {
    const radek = db.prepare('SELECT json FROM duely WHERE id = ?').get(duelId) as { json: string };
    return JSON.parse(radek.json) as Duel;
  }

  // -------------------------------------------------------------------------

  describe('založení (POST /api/duely s proOdkaz)', () => {
    it('vrátí kodHosta JEDNORÁZOVĚ, v DB je jen hash se solí = id duelu', async () => {
      const duel = await zalozDuelOdkazem();

      expect(duel.kodHosta).toMatch(new RegExp(`^[A-Za-z0-9_-]{${DELKA_KODU_HOSTA}}$`));
      expect(duel.proOdkaz).toBe(true);
      expect(duel.otevrenyProRodinu).toBe(false);
      expect(duel.souper).toBeUndefined();
      expect(duel.handicap).toEqual({ tata: 1 });
      // Hash NIKDY neopouští server — ani v odpovědi na založení.
      expect((duel as Duel).hostKodHash).toBeUndefined();

      const ulozeny = duelZDb(duel.id);
      expect(ulozeny.hostKodHash).toBe(hashKoduHosta(duel.id, duel.kodHosta));
      expect(ulozeny.hostKodHash).not.toContain(duel.kodHosta);
    });

    it('proOdkaz se vylučuje se souperProfilId (400)', async () => {
      const odpoved = await post('/api/duely', {
        predmetId: 'ekonomika-podnikani',
        pocetOtazek: 5,
        vyzyvatelProfilId: 'tata',
        souperProfilId: 'syn',
        proOdkaz: true,
      });
      expect(odpoved.status).toBe(400);
    });

    it('hash je pro každý duel jiný i při stejném kódu (sůl = id duelu)', () => {
      const kod = vygenerujKodHosta();
      expect(hashKoduHosta('duel-a', kod)).not.toBe(hashKoduHosta('duel-b', kod));
      expect(hashKoduHosta('duel-a', kod)).toBe(hashKoduHosta('duel-a', kod));
    });

    it('vyzyvatel duel vidí v moje (bez hashe), rodina ho nemá v otevřených', async () => {
      const duel = await zalozDuelOdkazem();

      const proTatu = await seznamDuelu('tata');
      const muj = proTatu.moje.find((d) => d.id === duel.id);
      expect(muj).toBeDefined();
      expect(muj?.proOdkaz).toBe(true);
      expect(muj?.hostKodHash).toBeUndefined();

      const proMamu = await seznamDuelu('mama');
      expect(proMamu.otevrene).toEqual([]);
      expect(proMamu.moje).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------

  describe('ověření kódu (GET /api/hoste/duely/:id)', () => {
    it('se správným kódem vrací duel BEZ otazkyIds a výsledků, dokud host nepřijme', async () => {
      const duel = await zalozDuelOdkazem();
      // Vyzyvatel mezitím odehrál — jeho odpovědi nesmí hostovi sadu prozradit.
      await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 3 }),
      });

      const odpoved = await getHosta(duel.id, duel.kodHosta);
      expect(odpoved.status).toBe(200);
      const proHosta = (await odpoved.json()) as Duel;
      expect(proHosta.otazkyIds).toEqual([]);
      expect(proHosta.vysledky).toEqual({});
      expect(proHosta.hostKodHash).toBeUndefined();
      expect(proHosta.vyzyvatel.jmeno).toBe('Táta');
    });

    it('kód v query stringu je jen fallback pro starší klienty — taky projde', async () => {
      const duel = await zalozDuelOdkazem();
      const odpoved = await app.request(`/api/hoste/duely/${duel.id}?kod=${duel.kodHosta}`);
      expect(odpoved.status).toBe(200);
    });

    it('špatný kód, chybějící kód, cizí kód i neexistující duel → jednotné 403', async () => {
      const duel = await zalozDuelOdkazem();
      const druhy = await zalozDuelOdkazem();

      const spatny = await getHosta(duel.id, 'uplne-spatny-kod');
      const chybejici = await app.request(`/api/hoste/duely/${duel.id}`);
      const cizi = await getHosta(duel.id, druhy.kodHosta);
      const neexistuje = await getHosta('neni', duel.kodHosta);

      for (const odpoved of [spatny, chybejici, cizi, neexistuje]) {
        expect(odpoved.status).toBe(403);
        expect(await odpoved.json()).toEqual({ chyba: 'Neplatný odkaz na duel' });
      }
    });

    it('kód nefunguje na rodinný duel bez proOdkaz (403)', async () => {
      const odkazem = await zalozDuelOdkazem();
      const rodinny = await post('/api/duely', {
        predmetId: 'ekonomika-podnikani',
        pocetOtazek: 5,
        vyzyvatelProfilId: 'tata',
        souperProfilId: 'syn',
      });
      const { id } = (await rodinny.json()) as Duel;
      const odpoved = await getHosta(id, odkazem.kodHosta);
      expect(odpoved.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('přijetí hostem (POST /api/hoste/duely/:id/prijmout)', () => {
    it('nastaví hosta (profilId host:<duelId>), vrátí plnou sadu a handicap 1.0 oběma', async () => {
      const duel = await zalozDuelOdkazem();
      const odpoved = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: '  Karel  ', // trim
      });
      expect(odpoved.status).toBe(200);
      const prijaty = (await odpoved.json()) as Duel;
      expect(prijaty.stav).toBe('prijaty');
      expect(prijaty.souper).toEqual({ profilId: hostProfilId(duel.id), jmeno: 'Karel' });
      expect(prijaty.host).toEqual({ jmeno: 'Karel' });
      expect(prijaty.handicap).toEqual({ tata: 1, [hostProfilId(duel.id)]: 1 });
      expect(prijaty.otazkyIds).toEqual(duel.otazkyIds);
      expect(prijaty.hostKodHash).toBeUndefined();

      // Po přijetí vidí host sadu i přes GET (reload stránky uprostřed hry).
      const znovu = await getHosta(duel.id, duel.kodHosta);
      expect(((await znovu.json()) as Duel).otazkyIds).toEqual(duel.otazkyIds);
    });

    it('závod o odkaz: druhé přijetí dostane 409 (first-wins)', async () => {
      const duel = await zalozDuelOdkazem();
      const prvni = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: 'Karel',
      });
      expect(prvni.status).toBe(200);

      const druhy = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: 'Pepa',
      });
      expect(druhy.status).toBe(409);
      expect(await druhy.json()).toHaveProperty('chyba');
      // Jméno prvního hosta zůstává.
      expect(duelZDb(duel.id).host).toEqual({ jmeno: 'Karel' });
    });

    it('opakované přijetí se STEJNÝM jménem je idempotentní (ztracená odpověď)', async () => {
      const duel = await zalozDuelOdkazem();
      const prvni = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: 'Karel',
      });
      expect(prvni.status).toBe(200);

      // Klientovi se ztratila odpověď (timeout) a POST poslal znovu: správný
      // kód + stejné jméno → 200 s duelem, host se nezamkne ze svého duelu.
      const znovu = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: 'Karel',
      });
      expect(znovu.status).toBe(200);
      const opakovany = (await znovu.json()) as Duel;
      expect(opakovany.stav).toBe('prijaty');
      expect(opakovany.otazkyIds).toEqual(duel.otazkyIds);
      expect(opakovany.host).toEqual({ jmeno: 'Karel' });
      expect(opakovany.hostKodHash).toBeUndefined();
    });

    it('špatný kód 403; neplatné jméno (prázdné, dlouhé, řídicí znaky) 400', async () => {
      const duel = await zalozDuelOdkazem();
      const spatnyKod = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: 'spatny',
        jmeno: 'Karel',
      });
      expect(spatnyKod.status).toBe(403);

      // Vedle řídicích znaků se odmítají i neviditelné/směrové Unicode znaky
      // (bidi override umí vizuálně převrátit text karty duelu, zero-width
      // znaky umí vyrobit dvě „stejná“ jména).
      for (const jmeno of [
        '',
        '   ',
        'x'.repeat(25),
        'Karel\u0007',
        'Ka\u009frel',
        'Karel\u202e', // RLO — bidi override
        'Ka\u200brel', // zero-width space
        'Karel\u2066', // LRI — bidi isolate
        'Ka\ufeffrel', // BOM/ZWNBSP uvnit\u0159 jm\u00e9na (krajn\u00ed BOM shod\u00ed u\u017e trim)
      ]) {
        const odpoved = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
          kod: duel.kodHosta,
          jmeno,
        });
        expect(odpoved.status).toBe(400);
      }
    });

    it('rodinné přijetí duelu odkazem je zablokované (409), i pro profil host:*  (400)', async () => {
      const duel = await zalozDuelOdkazem();
      const rodina = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      expect(rodina.status).toBe(409);

      // Vyhrazený prefix host: rodinným tělem neprojde ani se znalostí id duelu.
      const podvrh = await post(`/api/duely/${duel.id}/prijmout`, {
        profilId: hostProfilId(duel.id),
        jmeno: 'Podvrh',
      });
      expect(podvrh.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('výsledek hosta (POST /api/hoste/duely/:id/vysledek)', () => {
    async function prijmi(duel: DuelSKodem, jmeno = 'Karel'): Promise<Duel> {
      const odpoved = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno,
      });
      expect(odpoved.status).toBe(200);
      return (await odpoved.json()) as Duel;
    }

    it('před přijetím 409, s power-upem 400', async () => {
      const duel = await zalozDuelOdkazem();
      const predPrijetim = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(predPrijetim.status).toBe(409);

      await prijmi(duel);
      const sPowerupem = vysledekHrace(duel.otazkyIds);
      sPowerupem.odpovedi[0].pouzityPowerup = 'zmrazeni-casu';
      const odmitnuty = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: sPowerupem,
      });
      expect(odmitnuty.status).toBe(400);
      expect(await odmitnuty.json()).toHaveProperty('chyba');
    });

    it('výsledek přepočítá na serveru (handicap hosta 1.0) a platí první pokus', async () => {
      const duel = await zalozDuelOdkazem();
      await prijmi(duel);

      const podvrzeny = vysledekHrace(duel.otazkyIds, { spravnych: 2 });
      podvrzeny.body = 9_999_999; // klientským bodům server nevěří
      const odpoved = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: podvrzeny,
      });
      expect(odpoved.status).toBe(200);
      const poZapisu = (await odpoved.json()) as Duel;
      const hostId = hostProfilId(duel.id);
      expect(poZapisu.vysledky[hostId].body).toBe(ocekavaneBody(duelovaBanka(), podvrzeny));
      expect(poZapisu.vysledky[hostId].body).toBeLessThan(9_999_999);
      expect(poZapisu.vysledky[hostId].celkovyCasMs).toBe(5 * 8_000);

      const znovu = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(znovu.status).toBe(409);
    });

    it('odmítne čas přes limit + rezervu (host nemá prodloužené limity)', async () => {
      const duel = await zalozDuelOdkazem();
      await prijmi(duel);
      const pomaly = vysledekHrace(duel.otazkyIds);
      pomaly.odpovedi[0] = { ...pomaly.odpovedi[0], casMs: 1_000_000 };
      const odpoved = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: pomaly,
      });
      expect(odpoved.status).toBe(400);
    });

    it('odmítne výsledek, který nepokrývá všechny otázky sady (400)', async () => {
      // Vynechaná (špatná) odpověď by nesnížila body, ale snížila celkovyCasMs,
      // který rozhoduje tie-break — host s curl by tak uměl vyhrát na čas.
      const duel = await zalozDuelOdkazem();
      await prijmi(duel);
      const neuplny = vysledekHrace(duel.otazkyIds.slice(0, duel.otazkyIds.length - 1));
      const odpoved = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: neuplny,
      });
      expect(odpoved.status).toBe(400);
      expect(((await odpoved.json()) as { chyba: string }).chyba).toContain('všechny otázky');
    });

    it('po obou výsledcích server duel uzavře a host i vyzyvatel vidí vítěze', async () => {
      const duel = await zalozDuelOdkazem();
      // Vyzyvatel smí hrát dřív, než host odkaz otevře (handicap je fixní 1.0).
      const vyzyvatel = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 3 }),
      });
      expect(vyzyvatel.status).toBe(200);

      await prijmi(duel);
      const host = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 5 }),
      });
      expect(host.status).toBe(200);
      const hotovy = (await host.json()) as Duel;
      expect(hotovy.stav).toBe('hotovy');
      expect(hotovy.vitezProfilId).toBe(hostProfilId(duel.id));

      // Host vidí výsledek obou přes GET (stav po dohrání).
      const proHosta = await getHosta(duel.id, duel.kodHosta);
      const stav = (await proHosta.json()) as Duel;
      expect(stav.stav).toBe('hotovy');
      expect(Object.keys(stav.vysledky).sort()).toEqual(
        ['tata', hostProfilId(duel.id)].sort(),
      );

      // Vyzyvatel ho vidí ve svých duelech se jménem hosta a bez hashe.
      const proTatu = await seznamDuelu('tata');
      const muj = proTatu.moje.find((d) => d.id === duel.id);
      expect(muj?.stav).toBe('hotovy');
      expect(muj?.host).toEqual({ jmeno: 'Karel' });
      expect(muj?.souper?.jmeno).toBe('Karel');
      expect(muj?.hostKodHash).toBeUndefined();
    });

    it('rodinný endpoint výsledku hostovský profilId odmítá (400 bez znalosti kódu)', async () => {
      const duel = await zalozDuelOdkazem();
      await prijmi(duel);
      const podvrh = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: hostProfilId(duel.id),
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(podvrh.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('izolace hostovského kódu', () => {
    it('kód není token: /api/profily ani /api/duely s ním nic neotevřou (401)', async () => {
      const duel = await zalozDuelOdkazem();
      const hlavicky = { 'x-questor-token': duel.kodHosta };

      const profily = await app.request('/api/profily', { headers: hlavicky });
      expect(profily.status).toBe(401);

      const duely = await app.request('/api/duely?profilId=tata', { headers: hlavicky });
      expect(duely.status).toBe(401);

      const banky = await app.request('/api/banky', { headers: hlavicky });
      expect(banky.status).toBe(401);
    });

    it('kód jednoho duelu neotevře jiný duel odkazem', async () => {
      const prvni = await zalozDuelOdkazem();
      const druhy = await zalozDuelOdkazem();
      const odpoved = await postHosta(`/api/hoste/duely/${druhy.id}/prijmout`, {
        kod: prvni.kodHosta,
        jmeno: 'Karel',
      });
      expect(odpoved.status).toBe(403);
    });
  });

  // -------------------------------------------------------------------------

  describe('expirace duelu odkazem', () => {
    it('po vypršení: GET hlásí kontumaci, přijmout i výsledek 409', async () => {
      const duel = await zalozDuelOdkazem();
      await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 3 }),
      });
      nastavVyprsi(duel.id, '2020-01-01T00:00:00.000Z');

      const stav = await getHosta(duel.id, duel.kodHosta);
      expect(stav.status).toBe(200);
      const vyprsely = (await stav.json()) as Duel;
      expect(vyprsely.stav).toBe('vyprsely');
      expect(vyprsely.vitezProfilId).toBe('tata'); // kontumace: kdo odehrál, vyhrál

      const prijeti = await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: 'Karel',
      });
      expect(prijeti.status).toBe(409);

      const vysledek = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(vysledek.status).toBe(409);
    });

    it('vypršení po přijetí: pozdní výsledek hosta 409, kontumace platí', async () => {
      const duel = await zalozDuelOdkazem();
      await postHosta(`/api/hoste/duely/${duel.id}/prijmout`, {
        kod: duel.kodHosta,
        jmeno: 'Karel',
      });
      nastavVyprsi(duel.id, '2020-01-01T00:00:00.000Z');

      const pozde = await postHosta(`/api/hoste/duely/${duel.id}/vysledek`, {
        kod: duel.kodHosta,
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(pozde.status).toBe(409);
    });
  });

  // -------------------------------------------------------------------------

  describe('rate limit na /api/hoste/*', () => {
    it('nadlimitní požadavky dostanou 429 i bez tokenu', async () => {
      const limitovana = vytvorApp(otevriDb(':memory:'), {
        rateLimit: { maxPozadavku: 2, oknoMs: 60_000 },
      });
      const prvni = await limitovana.request('/api/hoste/duely/x?kod=y');
      const druhy = await limitovana.request('/api/hoste/duely/x?kod=y');
      const treti = await limitovana.request('/api/hoste/duely/x?kod=y');
      expect(prvni.status).toBe(403);
      expect(druhy.status).toBe(403);
      expect(treti.status).toBe(429);
      expect(await treti.json()).toHaveProperty('chyba');
    });
  });
});
