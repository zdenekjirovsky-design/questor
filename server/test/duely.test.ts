// Testy duelů na serveru — přes app.request() nad DB ':memory:'. Pokrývá
// vytvoření (deterministická sada ze seedu = id duelu), závod o přijetí
// otevřené výzvy (first-wins, druhý 409), dvojité odeslání výsledku (409,
// anti-cheat), SERVEROVÝ PŘEPOČET výsledku (podvržené body, nemožné časy,
// duplicitní otázky), zatajování sady otázek před hrou, vyhodnocení
// (body → čas → remíza), línou expiraci s kontumací a handicap ze snapshotů
// progresu (bez progresu násobiče 1.0).

import { beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import {
  bodyZaOdpoved,
  casLimitProHrace,
  DUEL_TRVANI_MS,
  handicapNasobice,
  nahodaProDuel,
  vyberOtazekDuelu,
  type BankaOtazek,
  type Duel,
  type Otazka,
  type ProgresStudenta,
  type VysledekDuelu,
} from '@questor/sdilene';
import { vytvorApp } from '../src/app';
import { otevriDb } from '../src/db';

const ADMIN = { 'x-questor-token': 'admin-dev' };
const STUDENT = { 'x-questor-token': 'student-dev' };
const JSON_HLAVICKY = { 'content-type': 'application/json' };

type SeznamDuelu = { moje: Duel[]; otevrene: Duel[] };

/** Banka se 12 otázkami ve 2 tématech (trh: o-1…o-6, marketing: o-7…o-12). */
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

/** Progres profilu; otazkyVBoxu = id otázek zvládnutých v Leitner boxu ≥ 3. */
function progresProfilu(otazkyVBoxu: string[] = []): ProgresStudenta {
  const statistikyOtazek: ProgresStudenta['statistikyOtazek'] = {};
  for (const id of otazkyVBoxu) {
    statistikyOtazek[id] = {
      otazkaId: id,
      box: 4,
      spravneCelkem: 5,
      spatneCelkem: 1,
      posledniOdpoved: '2026-09-04T10:00:00.000Z',
    };
  }
  return {
    xp: 100,
    streak: { aktualni: 1, nejdelsi: 2, posledniDen: '2026-09-04', zmrazeni: 0 },
    questy: [],
    sbirka: { karty: [], truhelBezKarty: 0 },
    avatar: {
      pohlavi: 'muz',
      tvarObliceje: 'ovalny',
      barvaPleti: '#f2c9a0',
      barvaVlasu: '#222222',
      stylVlasu: 'kratke',
      vybava: {},
    },
    vlastnenaVybava: [],
    statistikyOtazek,
    rekordy: { nejlepsiUspesnost: 0.5, nejdelsiCombo: 3, nejrychlejsiBezchybnyMs: null, tydenniXp: {} },
    dokonceneTesty: 1,
    aktualizovano: '2026-09-04T10:00:00.000Z',
  };
}

/**
 * Poctivý výsledek půlky duelu — server body/celkovyCasMs PŘEPOČÍTÁVÁ ze
 * syrových odpovědí (klientským hodnotám nevěří), takže testy řídí skóre
 * počtem správných odpovědí a časem na otázku (musí být pod limitem každé
 * obtížnosti banky — min. limit je 14 s při handicapu 1).
 */
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
    // Klientským hodnotám server nevěří — 0 tu dokazuje, že je přepočítá.
    body: 0,
    celkovyCasMs: casNaOtazku * otazkyIds.length,
    dokonceno: '2026-09-05T10:00:00.000Z',
  };
}

/** Očekávané body po serverovém přepočtu (stejný vzorec jako klient). */
function ocekavaneBody(
  banka: BankaOtazek,
  vysledek: VysledekDuelu,
  nasobic = 1,
): number {
  return vysledek.odpovedi.reduce((soucet, odpoved) => {
    const otazka = banka.otazky.find((o) => o.id === odpoved.otazkaId)!;
    const limit = casLimitProHrace(otazka.obtiznost, nasobic);
    return soucet + bodyZaOdpoved(odpoved.spravne, odpoved.casMs, limit);
  }, 0);
}

describe('duely', () => {
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

  async function zalozDuel(telo: Record<string, unknown> = {}): Promise<Duel> {
    const odpoved = await post('/api/duely', {
      predmetId: 'ekonomika-podnikani',
      pocetOtazek: 5,
      vyzyvatelProfilId: 'tata',
      vyzyvatelJmeno: 'Táta',
      ...telo,
    });
    expect(odpoved.status).toBe(200);
    return (await odpoved.json()) as Duel;
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

  // -------------------------------------------------------------------------

  describe('vytvoření (POST /api/duely)', () => {
    it('vyžaduje studentský token a validní tělo', async () => {
      const bezTokenu = await app.request('/api/duely', {
        method: 'POST',
        headers: JSON_HLAVICKY,
        body: JSON.stringify({}),
      });
      expect(bezTokenu.status).toBe(401);

      const spatne = await post('/api/duely', { predmetId: 'ekonomika-podnikani', pocetOtazek: 7 });
      expect(spatne.status).toBe(400);
      expect(await spatne.json()).toHaveProperty('chyba');
    });

    it('bez banky 404, cizí téma 400, duel sám se sebou 400', async () => {
      const bezBanky = await post('/api/duely', {
        predmetId: 'neexistuje',
        pocetOtazek: 5,
        vyzyvatelProfilId: 'tata',
      });
      expect(bezBanky.status).toBe(404);

      const ciziTema = await post('/api/duely', {
        predmetId: 'ekonomika-podnikani',
        temataId: ['trh', 'vesmirne-lode'],
        pocetOtazek: 5,
        vyzyvatelProfilId: 'tata',
      });
      expect(ciziTema.status).toBe(400);

      const samSeSebou = await post('/api/duely', {
        predmetId: 'ekonomika-podnikani',
        pocetOtazek: 5,
        vyzyvatelProfilId: 'tata',
        souperProfilId: 'tata',
      });
      expect(samSeSebou.status).toBe(400);
    });

    it('vybere deterministickou sadu otázek (seed = id duelu) a nastaví vyprsi +24 h', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });

      expect(duel.stav).toBe('cekajici');
      expect(duel.otevrenyProRodinu).toBe(false);
      expect(duel.vyzyvatel).toEqual({ profilId: 'tata', jmeno: 'Táta' });
      expect(duel.souper).toEqual({ profilId: 'syn', jmeno: 'Syn' });
      expect(duel.otazkyIds).toHaveLength(5);
      expect(duel.vysledky).toEqual({});

      // Stejný seed (id duelu) → stejná sada ve stejném pořadí jako u klienta.
      const ocekavane = vyberOtazekDuelu(duelovaBanka(), undefined, 5, nahodaProDuel(duel.id));
      expect(duel.otazkyIds).toEqual(ocekavane.map((o) => o.id));

      expect(Date.parse(duel.vyprsi) - Date.parse(duel.vytvoreno)).toBe(DUEL_TRVANI_MS);

      // Zrcadlové sloupce pro přehledy odpovídají JSONu.
      const radek = db
        .prepare('SELECT stav, vytvoreno FROM duely WHERE id = ?')
        .get(duel.id) as { stav: string; vytvoreno: string };
      expect(radek.stav).toBe('cekajici');
      expect(radek.vytvoreno).toBe(duel.vytvoreno);
    });

    it('temataId zúží výběr; menší téma dá míň otázek než pocetOtazek', async () => {
      const duel = await zalozDuel({ temataId: ['marketing'], pocetOtazek: 10 });
      // Téma marketing má jen 6 otázek — sada je kratší, ale všechny z tématu.
      expect(duel.otazkyIds).toHaveLength(6);
      const banka = duelovaBanka();
      for (const id of duel.otazkyIds) {
        expect(banka.otazky.find((o) => o.id === id)?.temaId).toBe('marketing');
      }
      const ocekavane = vyberOtazekDuelu(banka, ['marketing'], 10, nahodaProDuel(duel.id));
      expect(duel.otazkyIds).toEqual(ocekavane.map((o) => o.id));
    });

    it('jména dohledá v registru profilů; neznámý profil má jméno = profilId', async () => {
      await app.request('/api/profily/mama', {
        method: 'PUT',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify({
          jmeno: 'Marie',
          barva: '#f5b942',
          predmety: ['ekonomika-podnikani'],
          aktivniPredmetId: 'ekonomika-podnikani',
          aktualizovano: '2026-09-04T10:00:00.000Z',
        }),
      });
      const odpoved = await post('/api/duely', {
        predmetId: 'ekonomika-podnikani',
        pocetOtazek: 5,
        vyzyvatelProfilId: 'mama',
        souperProfilId: 'zahadny-profil',
      });
      expect(odpoved.status).toBe(200);
      const duel = (await odpoved.json()) as Duel;
      expect(duel.vyzyvatel.jmeno).toBe('Marie');
      expect(duel.souper?.jmeno).toBe('zahadny-profil');
    });
  });

  // -------------------------------------------------------------------------

  describe('přijetí (POST /api/duely/:id/prijmout)', () => {
    it('otevřenou výzvu bere první — druhý dostane 409 (first-wins)', async () => {
      const duel = await zalozDuel(); // bez soupeře → otevřená pro rodinu
      expect(duel.otevrenyProRodinu).toBe(true);
      expect(duel.souper).toBeUndefined();
      expect(duel.handicap).toEqual({ tata: 1 });

      const prvni = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      expect(prvni.status).toBe(200);
      const prijaty = (await prvni.json()) as Duel;
      expect(prijaty.stav).toBe('prijaty');
      expect(prijaty.souper).toEqual({ profilId: 'syn', jmeno: 'Syn' });
      // Bez progresu v DB jsou násobiče 1.0 pro oba.
      expect(prijaty.handicap).toEqual({ tata: 1, syn: 1 });

      const druhy = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'mama', jmeno: 'Marie' });
      expect(druhy.status).toBe(409);
      expect(await druhy.json()).toHaveProperty('chyba');

      // Opakované přijetí týmž profilem je idempotentní (retry-safe).
      const znovu = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      expect(znovu.status).toBe(200);
      expect(((await znovu.json()) as Duel).stav).toBe('prijaty');
    });

    it('vlastní výzvu nejde přijmout, cílenou smí přijmout jen adresát', async () => {
      const otevreny = await zalozDuel();
      const vlastni = await post(`/api/duely/${otevreny.id}/prijmout`, { profilId: 'tata', jmeno: 'Táta' });
      expect(vlastni.status).toBe(409);

      const cileny = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      const cizi = await post(`/api/duely/${cileny.id}/prijmout`, { profilId: 'mama', jmeno: 'Marie' });
      expect(cizi.status).toBe(409);

      const adresat = await post(`/api/duely/${cileny.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      expect(adresat.status).toBe(200);
      const prijaty = (await adresat.json()) as Duel;
      expect(prijaty.stav).toBe('prijaty');
      // Handicap cílené výzvy vznikl už při vytvoření a přijetím se nemění.
      expect(prijaty.handicap).toEqual(cileny.handicap);
    });

    it('neexistující duel 404, neplatné tělo 400', async () => {
      expect((await post('/api/duely/neni/prijmout', { profilId: 'syn', jmeno: 'Syn' })).status).toBe(404);
      const duel = await zalozDuel();
      expect((await post(`/api/duely/${duel.id}/prijmout`, { profilId: '' })).status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------

  describe('výsledky a vyhodnocení (POST /api/duely/:id/vysledek)', () => {
    it('první zápis za profil platí, opakovaný dostane 409 (jeden pokus)', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      const vysledek = vysledekHrace(duel.otazkyIds);

      const prvni = await post(`/api/duely/${duel.id}/vysledek`, { profilId: 'tata', vysledek });
      expect(prvni.status).toBe(200);

      const znovu = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { casNaOtazkuMs: 1_000 }),
      });
      expect(znovu.status).toBe(409);
      expect(await znovu.json()).toHaveProperty('chyba');
    });

    it('po obou výsledcích duel vyhodnotí: víc bodů (správných odpovědí) vyhrává', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 3 }),
      });
      const druhy = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'syn',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 5 }),
      });
      expect(druhy.status).toBe(200);
      const hotovy = (await druhy.json()) as Duel;
      expect(hotovy.stav).toBe('hotovy');
      expect(hotovy.vitezProfilId).toBe('syn');
      expect(hotovy.vysledky.syn.body).toBeGreaterThan(hotovy.vysledky.tata.body);

      // Do hotového duelu už nejde zapisovat.
      const pozde = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(pozde.status).toBe(409);
    });

    it('při shodě bodů rozhoduje nižší součet časů, plná shoda je remíza', async () => {
      // Oba vše špatně (0 bodů) — rozhoduje jen součet časů.
      const shodaBodu = await zalozDuel({ souperProfilId: 'syn' });
      await post(`/api/duely/${shodaBodu.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(shodaBodu.otazkyIds, { spravnych: 0, casNaOtazkuMs: 8_000 }),
      });
      const rychlejsi = await post(`/api/duely/${shodaBodu.id}/vysledek`, {
        profilId: 'syn',
        vysledek: vysledekHrace(shodaBodu.otazkyIds, { spravnych: 0, casNaOtazkuMs: 7_000 }),
      });
      expect(((await rychlejsi.json()) as Duel).vitezProfilId).toBe('syn');

      const remiza = await zalozDuel({ souperProfilId: 'syn' });
      await post(`/api/duely/${remiza.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(remiza.otazkyIds, { spravnych: 0, casNaOtazkuMs: 8_000 }),
      });
      const stejny = await post(`/api/duely/${remiza.id}/vysledek`, {
        profilId: 'syn',
        vysledek: vysledekHrace(remiza.otazkyIds, { spravnych: 0, casNaOtazkuMs: 8_000 }),
      });
      const dohrany = (await stejny.json()) as Duel;
      expect(dohrany.stav).toBe('hotovy');
      expect(dohrany.vitezProfilId).toBeNull();
    });

    it('odmítne cizí id otázky, cizí profil a výsledek do nepřijaté otevřené výzvy', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });

      const ciziOtazka = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(['o-nepatri-sem']),
      });
      expect(ciziOtazka.status).toBe(400);

      const ciziProfil = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'mama',
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(ciziProfil.status).toBe(400);

      // Stejný power-up dvakrát v jednom duelu neprojde už zod schématem.
      const dvaStity = vysledekHrace(duel.otazkyIds);
      dvaStity.odpovedi[0].pouzityPowerup = 'stit';
      dvaStity.odpovedi[1].pouzityPowerup = 'stit';
      const duplicita = await post(`/api/duely/${duel.id}/vysledek`, { profilId: 'tata', vysledek: dvaStity });
      expect(duplicita.status).toBe(400);

      const otevreny = await zalozDuel();
      const predPrijetim = await post(`/api/duely/${otevreny.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(otevreny.otazkyIds),
      });
      expect(predPrijetim.status).toBe(409);
    });

    it('výsledek od cíleného soupeře je zároveň přijetí výzvy', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      const odpoved = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'syn',
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(odpoved.status).toBe(200);
      expect(((await odpoved.json()) as Duel).stav).toBe('prijaty');
    });
  });

  // -------------------------------------------------------------------------

  describe('serverový přepočet výsledku (anti-cheat)', () => {
    it('podvržené body ignoruje a přepočítá ze syrových odpovědí', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });

      // Cheat z nálezu: prázdné odpovědi + body 9 999 999. Projde strukturou,
      // ale server body přepočítá na 0 — duel tím vyhrát nejde.
      const podvrh = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: { odpovedi: [], body: 9_999_999, celkovyCasMs: 0, dokonceno: 'xxxx' },
      });
      expect(podvrh.status).toBe(200);
      expect(((await podvrh.json()) as Duel).vysledky.tata.body).toBe(0);

      // Poctivá půlka soupeře pak vyhrává.
      const poctivy = vysledekHrace(duel.otazkyIds, { spravnych: 5 });
      const druhy = await post(`/api/duely/${duel.id}/vysledek`, { profilId: 'syn', vysledek: poctivy });
      const hotovy = (await druhy.json()) as Duel;
      expect(hotovy.vitezProfilId).toBe('syn');
      expect(hotovy.vysledky.syn.body).toBe(ocekavaneBody(duelovaBanka(), poctivy));
      expect(hotovy.vysledky.syn.celkovyCasMs).toBe(5 * 8_000);
    });

    it('nadhodnocené klientské body u poctivých odpovědí nahradí přepočtem', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });
      const vysledek = vysledekHrace(duel.otazkyIds, { spravnych: 2 });
      vysledek.body = 750; // klient lže o skóre, odpovědi sedí
      const odpoved = await post(`/api/duely/${duel.id}/vysledek`, { profilId: 'tata', vysledek });
      expect(odpoved.status).toBe(200);
      const ulozeny = ((await odpoved.json()) as Duel).vysledky.tata;
      expect(ulozeny.body).toBe(ocekavaneBody(duelovaBanka(), vysledek));
      expect(ulozeny.body).toBeLessThan(750);
    });

    it('odmítne casMs přes limit otázky + rezervu (400)', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });
      const vysledek = vysledekHrace(duel.otazkyIds);
      vysledek.odpovedi[0] = { ...vysledek.odpovedi[0], casMs: 1_000_000_000 };
      const odpoved = await post(`/api/duely/${duel.id}/vysledek`, { profilId: 'tata', vysledek });
      expect(odpoved.status).toBe(400);
      expect(await odpoved.json()).toHaveProperty('chyba');
    });

    it('odmítne duplicitní otazkaId v odpovědích (400)', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });
      const petkratPrvni = vysledekHrace(
        [duel.otazkyIds[0], duel.otazkyIds[0], duel.otazkyIds[0], duel.otazkyIds[0], duel.otazkyIds[0]],
      );
      const odpoved = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: petkratPrvni,
      });
      expect(odpoved.status).toBe(400);
    });

    it('duel nese verzi banky, proti které vznikl', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });
      expect(duel.verzeBanky).toBe(1);
    });
  });

  // -------------------------------------------------------------------------

  describe('zatajování sady otázek (anti-cheat)', () => {
    it('adresát cílené výzvy sadu v GET nevidí, dostane ji až s přijetím', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      expect(duel.otazkyIds).toHaveLength(5); // vyzyvatel ji má ze založení

      const proSyna = await seznamDuelu('syn');
      expect(proSyna.moje.find((d) => d.id === duel.id)?.otazkyIds).toEqual([]);

      // Vyzyvatel svou sadu v GET vidí dál (hraje offline).
      const proTatu = await seznamDuelu('tata');
      expect(proTatu.moje.find((d) => d.id === duel.id)?.otazkyIds).toEqual(duel.otazkyIds);

      // Přijetí sadu odemkne — v odpovědi i v dalším GET.
      const prijeti = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      expect(((await prijeti.json()) as Duel).otazkyIds).toEqual(duel.otazkyIds);
      const znovu = await seznamDuelu('syn');
      expect(znovu.moje.find((d) => d.id === duel.id)?.otazkyIds).toEqual(duel.otazkyIds);
    });

    it('otevřené výzvy rodiny jdou ven bez sady otázek', async () => {
      const duel = await zalozDuel(); // otevřená
      const proMamu = await seznamDuelu('mama');
      expect(proMamu.otevrene.find((d) => d.id === duel.id)?.otazkyIds).toEqual([]);

      const prijeti = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'mama', jmeno: 'Marie' });
      expect(((await prijeti.json()) as Duel).otazkyIds).toEqual(duel.otazkyIds);
    });
  });

  // -------------------------------------------------------------------------

  describe('expirace a kontumace (líně při čtení)', () => {
    it('po vypršení vyhrává kontumačně ten, kdo odehrál', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 3 }),
      });
      nastavVyprsi(duel.id, '2020-01-01T00:00:00.000Z');

      const seznam = await seznamDuelu('tata');
      const vyprsely = seznam.moje.find((d) => d.id === duel.id);
      expect(vyprsely?.stav).toBe('vyprsely');
      expect(vyprsely?.vitezProfilId).toBe('tata');

      // Pozdní odevzdání soupeře už neprojde.
      const pozde = await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'syn',
        vysledek: vysledekHrace(duel.otazkyIds),
      });
      expect(pozde.status).toBe(409);
    });

    it('vypršelá otevřená výzva bez výsledků nemá vítěze a nejde přijmout', async () => {
      const duel = await zalozDuel();
      nastavVyprsi(duel.id, '2020-01-01T00:00:00.000Z');

      const seznam = await seznamDuelu('tata');
      expect(seznam.otevrene).toEqual([]);
      const vyprsely = seznam.moje.find((d) => d.id === duel.id);
      expect(vyprsely?.stav).toBe('vyprsely');
      expect(vyprsely?.vitezProfilId).toBeNull();

      const prijeti = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      expect(prijeti.status).toBe(409);
    });

    it('hotového duelu se expirace nedotkne', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });
      await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'tata',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 5 }),
      });
      await post(`/api/duely/${duel.id}/vysledek`, {
        profilId: 'syn',
        vysledek: vysledekHrace(duel.otazkyIds, { spravnych: 2 }),
      });
      nastavVyprsi(duel.id, '2020-01-01T00:00:00.000Z');

      const seznam = await seznamDuelu('tata');
      const hotovy = seznam.moje.find((d) => d.id === duel.id);
      expect(hotovy?.stav).toBe('hotovy');
      expect(hotovy?.vitezProfilId).toBe('tata');
    });
  });

  // -------------------------------------------------------------------------

  describe('handicap ze snapshotů progresu', () => {
    it('bez progresu v DB jsou násobiče 1.0 (cílená výzva)', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });
      expect(duel.handicap).toEqual({ tata: 1, syn: 1 });
    });

    it('slabší hráč dostane delší limity dle sdíleného vzorce', async () => {
      // Táta zvládá 6 z 12 otázek banky (box ≥ 3), syn žádnou.
      const otazkyTaty = ['o-1', 'o-2', 'o-3', 'o-4', 'o-5', 'o-6'];
      await post('/api/progres', { ...progresProfilu(otazkyTaty), profilId: 'tata', profilJmeno: 'Táta' });
      await post('/api/progres', { ...progresProfilu([]), profilId: 'syn', profilJmeno: 'Syn' });

      const duel = await zalozDuel({ souperProfilId: 'syn' });
      const ocekavane = handicapNasobice(0.5, 0);
      expect(duel.handicap).toEqual({ tata: ocekavane.a, syn: ocekavane.b });
      expect(duel.handicap.tata).toBe(1); // silnější hráč má vždy 1.0
      expect(duel.handicap.syn).toBe(1.25); // 1 + 0.5×(0.5 − 0)
    });

    it('u otevřené výzvy se handicap zmrazí při přijetí', async () => {
      const duel = await zalozDuel(); // otevřená — handicap zatím jen vyzyvatel 1.0
      expect(duel.handicap).toEqual({ tata: 1 });

      await post('/api/progres', {
        ...progresProfilu(duelovaBanka().otazky.map((o) => o.id)), // táta zvládá vše
        profilId: 'tata',
        profilJmeno: 'Táta',
      });
      await post('/api/progres', { ...progresProfilu([]), profilId: 'mama', profilJmeno: 'Marie' });

      const prijeti = await post(`/api/duely/${duel.id}/prijmout`, { profilId: 'mama', jmeno: 'Marie' });
      const prijaty = (await prijeti.json()) as Duel;
      expect(prijaty.handicap).toEqual({ tata: 1, mama: 1.5 }); // 1 + 0.5×(1 − 0), ořez na 1.5
    });
  });

  // -------------------------------------------------------------------------

  describe('seznam duelů (GET /api/duely)', () => {
    it('vrací moje duely (včetně čekajících na mě) a otevřené výzvy rodiny', async () => {
      const cileny = await zalozDuel({ souperProfilId: 'syn', souperJmeno: 'Syn' });
      const otevreny = await zalozDuel();

      const proSyna = await seznamDuelu('syn');
      expect(proSyna.moje.map((d) => d.id)).toEqual([cileny.id]); // čeká na mě
      expect(proSyna.otevrene.map((d) => d.id)).toEqual([otevreny.id]);

      const proTatu = await seznamDuelu('tata');
      expect(proTatu.moje.map((d) => d.id).sort()).toEqual([cileny.id, otevreny.id].sort());
      expect(proTatu.otevrene).toEqual([]); // vlastní otevřená výzva není k přijetí

      const proMamu = await seznamDuelu('mama');
      expect(proMamu.moje).toEqual([]);
      expect(proMamu.otevrene.map((d) => d.id)).toEqual([otevreny.id]);

      // Po přijetí otevřená výzva z nabídky rodiny zmizí.
      await post(`/api/duely/${otevreny.id}/prijmout`, { profilId: 'syn', jmeno: 'Syn' });
      const poPrijeti = await seznamDuelu('mama');
      expect(poPrijeti.otevrene).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------

  describe('admin', () => {
    it('GET /api/duely/prehled je jen pro admina a vrací všechny duely', async () => {
      const duel = await zalozDuel({ souperProfilId: 'syn' });

      const student = await app.request('/api/duely/prehled', { headers: STUDENT });
      expect(student.status).toBe(401);

      const admin = await app.request('/api/duely/prehled', { headers: ADMIN });
      expect(admin.status).toBe(200);
      const duely = (await admin.json()) as Duel[];
      expect(duely.map((d) => d.id)).toContain(duel.id);
    });

    it('admin stránka má sekci Duely', async () => {
      const odpoved = await app.request('/admin');
      const html = await odpoved.text();
      expect(html).toContain('panel-duely');
      expect(html).toContain('/api/duely/prehled');
    });
  });
});
