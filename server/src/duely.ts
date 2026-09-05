// Duely na serveru — asynchronní výzvy mezi profily JEDNÉ rodiny (sdílený
// studentský token). Čistá pravidla (deterministický výběr otázek ze seedu
// = id duelu, handicap férovosti, vyhodnocení, kontumace) žijí ve
// @questor/sdilene (sdilene/src/duely.ts); tady je HTTP + SQLite vrstva:
// tabulka duely(id TEXT PK, json TEXT, stav TEXT, vytvoreno TEXT) — zdroj
// pravdy je json, sloupce stav/vytvoreno jsou zrcadlo pro přehledy.
//
// Životní cyklus:
//   cekajici → (prijmout / první výsledek soupeře) → prijaty
//            → (oba výsledky) → hotovy (vitezProfilId dle vyhodnotDuel)
//            → (vyprsi bez obou výsledků, líně při čtení) → vyprsely
//              (kontumace: kdo odehrál, vyhrává; nikdo → bez vítěze).
//
// Handicap je NEMĚNNÝ po celý duel: u cílené výzvy se počítá při VYTVOŘENÍ,
// u otevřené („kdokoli z rodiny“) při PŘIJETÍ — proto se u otevřené výzvy
// výsledky přijímají až po přijetí (do té doby handicap není finální).

import type { Hono, MiddlewareHandler } from 'hono';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  duelSchema,
  expirujDuel,
  handicapNasobice,
  hostProfilId,
  nahodaProDuel,
  prepoctiVysledekDuelu,
  vyberOtazekDuelu,
  vyhodnotDuel,
  vyprsiDuelu,
  zvladnutiOboru,
  type BankaOtazek,
  type Duel,
  type ProgresStudenta,
  type StavDuelu,
} from '@questor/sdilene';
import {
  hostPrijmoutSchema,
  hostVysledekSchema,
  novyDuelSchema,
  prijmoutDuelSchema,
  vysledekDueluTeloSchema,
} from './validace';
import { VYCHOZI_PROFIL_ID } from './db';

/** Kolik posledních dokončených duelů profilu vrací GET /api/duely. */
export const LIMIT_HOTOVYCH_DUELU = 20;

/** Kolik duelů vrací adminí přehled GET /api/duely/prehled. */
export const LIMIT_PREHLEDU_DUELU = 100;

// ---------------------------------------------------------------------------
// Hostovský kód duelu odkazem (fáze 2)

/** Kolik náhodných bajtů nese hostovský kód (18 B → přesně 24 znaků base64url). */
const BAJTU_KODU_HOSTA = 18;

/** Délka hostovského kódu ve znacích (base64url bez paddingu). */
export const DELKA_KODU_HOSTA = 24;

/** Jednorázový hostovský kód — kryptograficky náhodný, vázaný jen na jeden duel. */
export function vygenerujKodHosta(): string {
  return randomBytes(BAJTU_KODU_HOSTA).toString('base64url');
}

/**
 * SHA-256 hash hostovského kódu se solí = id duelu. Do DB jde JEN hash: únik
 * databáze neprozradí platné odkazy a sůl brání přenosu kódu mezi duely
 * (stejný kód by u jiného duelu měl jiný hash).
 */
export function hashKoduHosta(duelId: string, kod: string): string {
  return createHash('sha256').update(`${duelId}:${kod}`).digest('hex');
}

/** Porovná příchozí kód s uloženým hashem (konstantní čas, žádné výjimky). */
function platiKodHosta(duel: Duel, kod: string | undefined): boolean {
  if (!duel.proOdkaz || !duel.hostKodHash || !kod) return false;
  const ulozeny = Buffer.from(duel.hostKodHash, 'utf8');
  const prichozi = Buffer.from(hashKoduHosta(duel.id, kod), 'utf8');
  return ulozeny.length === prichozi.length && timingSafeEqual(ulozeny, prichozi);
}

/**
 * Duel bez hostKodHash pro odpovědi API — hash NIKDY neopouští server
 * (v žádném seznamu ani detailu; otevřený kód existuje jen jednorázově
 * v odpovědi na založení).
 */
function bezHasheKodu(duel: Duel): Duel {
  if (duel.hostKodHash === undefined) return duel;
  const { hostKodHash: _hash, ...verejny } = duel;
  return verejny as Duel;
}

/** Jednotné 403 hostovských endpointů — špatný kód nesmí prozradit nic navíc. */
const CHYBA_ODKAZU = 'Neplatný odkaz na duel';

// ---------------------------------------------------------------------------
// DB pomocníci

function nactiBanku(db: DatabaseSync, predmetId: string): BankaOtazek | null {
  const radek = db.prepare('SELECT json FROM banky WHERE predmet_id = ?').get(predmetId) as
    | { json: string }
    | undefined;
  return radek ? (JSON.parse(radek.json) as BankaOtazek) : null;
}

function nactiDuel(db: DatabaseSync, id: string): Duel | null {
  const radek = db.prepare('SELECT json FROM duely WHERE id = ?').get(id) as
    | { json: string }
    | undefined;
  return radek ? (JSON.parse(radek.json) as Duel) : null;
}

/** Všechny duely, nejnovější první (rodinná škála — jednotky až desítky řádků). */
function nactiVsechnyDuely(db: DatabaseSync): Duel[] {
  const radky = db
    .prepare('SELECT json FROM duely ORDER BY vytvoreno DESC, id DESC')
    .all() as { json: string }[];
  return radky.map((r) => JSON.parse(r.json) as Duel);
}

function ulozDuel(db: DatabaseSync, duel: Duel): void {
  db.prepare(
    `INSERT INTO duely (id, json, stav, vytvoreno) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET json = excluded.json, stav = excluded.stav`,
  ).run(duel.id, JSON.stringify(duel), duel.stav, duel.vytvoreno);
}

/**
 * Jméno profilu pro záznam duelu: přednost má jméno z těla požadavku, pak
 * registr profilů, pak jméno u snapshotu progresu; nakonec samotné profilId
 * (profil, který server ještě neviděl).
 */
function jmenoProfilu(db: DatabaseSync, profilId: string, prednostni?: string): string {
  if (prednostni) return prednostni;
  const registr = db.prepare('SELECT json FROM profily WHERE profil_id = ?').get(profilId) as
    | { json: string }
    | undefined;
  if (registr) {
    const jmeno = (JSON.parse(registr.json) as { jmeno?: unknown }).jmeno;
    if (typeof jmeno === 'string' && jmeno.length > 0) return jmeno;
  }
  const progres = db
    .prepare('SELECT profil_jmeno FROM progres WHERE profil_id = ?')
    .get(profilId) as { profil_jmeno: string | null } | undefined;
  if (progres?.profil_jmeno) return progres.profil_jmeno;
  return profilId;
}

// ---------------------------------------------------------------------------
// Handicap ze snapshotů progresu

/** Zvládnutí oboru profilu ze snapshotu progresu v DB; null = snapshot chybí. */
function zvladnutiProfilu(db: DatabaseSync, banka: BankaOtazek, profilId: string): number | null {
  const radek = db.prepare('SELECT json FROM progres WHERE profil_id = ?').get(profilId) as
    | { json: string }
    | undefined;
  if (!radek) return null;
  const progres = JSON.parse(radek.json) as ProgresStudenta;
  return zvladnutiOboru(banka, progres.statistikyOtazek ?? {});
}

/**
 * Handicapové násobiče dvojice ze snapshotů progresu na serveru. Chybí-li
 * snapshot kteréhokoli z hráčů, srovnání nemá z čeho vyjít → oba 1.0.
 */
function spocitejHandicap(
  db: DatabaseSync,
  banka: BankaOtazek,
  profilIdA: string,
  profilIdB: string,
): Record<string, number> {
  const zvladnutiA = zvladnutiProfilu(db, banka, profilIdA);
  const zvladnutiB = zvladnutiProfilu(db, banka, profilIdB);
  if (zvladnutiA === null || zvladnutiB === null) {
    return { [profilIdA]: 1, [profilIdB]: 1 };
  }
  const nasobice = handicapNasobice(zvladnutiA, zvladnutiB);
  return { [profilIdA]: nasobice.a, [profilIdB]: nasobice.b };
}

// ---------------------------------------------------------------------------
// Líná expirace (při čtení i před zápisy)

/**
 * Duel po vyprsi bez obou výsledků přejde na 'vyprsely' (kontumace, sdílené
 * expirujDuel — stejný vzorec používá i klient) a změna se hned uloží.
 */
function zkontrolujVyprseni(db: DatabaseSync, duel: Duel, tedIso: string): Duel {
  const vysledek = expirujDuel(duel, tedIso);
  if (vysledek !== duel) ulozDuel(db, vysledek);
  return vysledek;
}

/**
 * ANTI-CHEAT: sada otázek se v seznamech ZATAJUJE (prázdné pole) tomu, kdo ji
 * ještě nemá znát — klient má lokálně celou banku včetně klíče správnosti,
 * takže by si hráč z otazkyIds uměl nachystat odpovědi předem. Plnou sadu
 * dostane adresát cílené výzvy až v odpovědi na přijetí; vyzyvatel ji má
 * z odpovědi na založení (potřebuje ji pro hru offline). Spolu se sadou se
 * zatajují i VÝSLEDKY: odpovědi vyzyvatele (odpovedi[].otazkaId) by adresátovi
 * prozradily celou sadu stejně dobře — stejný princip jako hostovský GET.
 */
function zatajOtazkyPredHrou(duel: Duel, profilId: string): Duel {
  const jeSouperPredPrijetim =
    duel.stav === 'cekajici' && duel.souper?.profilId === profilId && !duel.vysledky[profilId];
  return jeSouperPredPrijetim ? { ...duel, otazkyIds: [], vysledky: {} } : duel;
}

function jeUcastnik(duel: Duel, profilId: string): boolean {
  return duel.vyzyvatel.profilId === profilId || duel.souper?.profilId === profilId;
}

function jeDokonceny(stav: StavDuelu): boolean {
  return stav === 'hotovy' || stav === 'vyprsely';
}

/** Chybová hláška z prvních issues zodího parse (pro 400 s kontextem). */
function popisChybValidace(chyby: { path: (string | number)[]; message: string }[]): string {
  return chyby
    .slice(0, 5)
    .map((ch) => `${ch.path.join('.')}: ${ch.message}`)
    .join('; ');
}

// ---------------------------------------------------------------------------
// Routy

export interface MiddlewaryDuelu {
  student: MiddlewareHandler;
  admin: MiddlewareHandler;
  limitTela: MiddlewareHandler;
}

export function registrujDuely(app: Hono, db: DatabaseSync, mw: MiddlewaryDuelu): void {
  // Vytvoření duelu: server deterministicky vybere sadu otázek (seed = id
  // duelu, čistě rovnoměrně — žádné Leitnerovy váhy) a spočítá handicap ze
  // snapshotů progresu (u otevřené výzvy až při přijetí). S proOdkaz: true
  // vznikne duel odkazem pro hosta mimo rodinu — server vygeneruje jednorázový
  // hostovský kód a vrátí ho JEDNOU v odpovědi (dál drží jen hash).
  app.post('/api/duely', mw.student, mw.limitTela, async (c) => {
    const telo = novyDuelSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!telo.success) {
      return c.json(
        { chyba: 'Tělo musí být { predmetId, temataId?, pocetOtazek 5|10|20, vyzyvatelProfilId, souperProfilId? | proOdkaz? }' },
        400,
      );
    }
    const zadani = telo.data;
    if (zadani.souperProfilId === zadani.vyzyvatelProfilId) {
      return c.json({ chyba: 'Vyzyvatel nemůže duelovat sám se sebou' }, 400);
    }
    const banka = nactiBanku(db, zadani.predmetId);
    if (!banka) return c.json({ chyba: 'Banka pro tenhle předmět na serveru není' }, 404);
    if (zadani.temataId) {
      const znama = new Set(banka.temata.map((t) => t.id));
      const cizi = zadani.temataId.filter((t) => !znama.has(t));
      if (cizi.length > 0) {
        return c.json({ chyba: `Témata mimo banku: ${cizi.join(', ')}` }, 400);
      }
    }
    const id = crypto.randomUUID();
    const otazky = vyberOtazekDuelu(banka, zadani.temataId, zadani.pocetOtazek, nahodaProDuel(id));
    if (otazky.length === 0) {
      return c.json({ chyba: 'Pro zadaná témata nejsou v bance žádné otázky' }, 400);
    }
    const vytvoreno = new Date().toISOString();
    // Duel odkazem: žádný rodinný soupeř, žádná otevřená výzva — soupeřem se
    // stane host přijetím odkazu. Kód se ukládá JEN jako hash (sůl = id duelu).
    const kodHosta = zadani.proOdkaz ? vygenerujKodHosta() : undefined;
    const duel: Duel = {
      id,
      predmetId: zadani.predmetId,
      ...(zadani.temataId ? { temataId: zadani.temataId } : {}),
      pocetOtazek: zadani.pocetOtazek,
      otazkyIds: otazky.map((o) => o.id),
      verzeBanky: banka.verze,
      vyzyvatel: {
        profilId: zadani.vyzyvatelProfilId,
        jmeno: jmenoProfilu(db, zadani.vyzyvatelProfilId, zadani.vyzyvatelJmeno),
      },
      ...(zadani.souperProfilId
        ? {
            souper: {
              profilId: zadani.souperProfilId,
              jmeno: jmenoProfilu(db, zadani.souperProfilId, zadani.souperJmeno),
            },
          }
        : {}),
      otevrenyProRodinu: !zadani.souperProfilId && !zadani.proOdkaz,
      ...(kodHosta ? { proOdkaz: true, hostKodHash: hashKoduHosta(id, kodHosta) } : {}),
      handicap: zadani.souperProfilId
        ? spocitejHandicap(db, banka, zadani.vyzyvatelProfilId, zadani.souperProfilId)
        : { [zadani.vyzyvatelProfilId]: 1 },
      stav: 'cekajici',
      vysledky: {},
      vytvoreno,
      vyprsi: vyprsiDuelu(vytvoreno),
    };
    // Pojistka kontraktu: co server zakládá, musí projít sdíleným schématem.
    const kontrola = duelSchema.safeParse(duel);
    if (!kontrola.success) {
      console.error('Server sestavil nevalidní duel:', kontrola.error.issues);
      return c.json({ chyba: 'Duel se nepodařilo sestavit' }, 500);
    }
    ulozDuel(db, duel);
    // kodHosta jde ven JEDNORÁZOVĚ teď — server ho už nikdy nezopakuje.
    return c.json(kodHosta ? { ...bezHasheKodu(duel), kodHosta } : duel);
  });

  // Adminí přehled všech duelů (registrovaný před dynamickými cestami,
  // ať „prehled“ nikdy nespolkne parametr :id).
  app.get('/api/duely/prehled', mw.admin, (c) => {
    const ted = new Date().toISOString();
    const duely = nactiVsechnyDuely(db)
      .map((duel) => zkontrolujVyprseni(db, duel, ted))
      .slice(0, LIMIT_PREHLEDU_DUELU)
      .map(bezHasheKodu);
    return c.json(duely);
  });

  // Duely profilu: běžící (čekající na mě i rozehrané) + posledních 20
  // dokončených, a k tomu otevřené výzvy rodiny, které jdou přijmout.
  // Bez ?profilId= platí výchozí profil (stejně jako u výzev).
  app.get('/api/duely', mw.student, (c) => {
    const profilId = c.req.query('profilId') ?? VYCHOZI_PROFIL_ID;
    const ted = new Date().toISOString();
    const vsechny = nactiVsechnyDuely(db).map((duel) => zkontrolujVyprseni(db, duel, ted));
    // Duel odkazem vidí vyzyvatel jako každý jiný svůj duel (včetně stavu
    // hosta v poli host/souper); hash hostovského kódu ale v seznamu NIKDY není.
    const moje = vsechny
      .filter((duel) => jeUcastnik(duel, profilId))
      .map((duel) => bezHasheKodu(zatajOtazkyPredHrou(duel, profilId)));
    const bezici = moje.filter((duel) => !jeDokonceny(duel.stav));
    const dokoncene = moje.filter((duel) => jeDokonceny(duel.stav)).slice(0, LIMIT_HOTOVYCH_DUELU);
    // Otevřené výzvy rodiny jdou ven BEZ sady otázek (divák/zájemce ji nemá
    // co číst — dostane ji až v odpovědi na přijetí, viz zatajOtazkyPredHrou).
    const otevrene = vsechny
      .filter(
        (duel) =>
          duel.stav === 'cekajici' &&
          duel.otevrenyProRodinu &&
          !duel.souper &&
          duel.vyzyvatel.profilId !== profilId,
      )
      .map((duel) => bezHasheKodu({ ...duel, otazkyIds: [] as string[] }));
    return c.json({ moje: [...bezici, ...dokoncene], otevrene });
  });

  // Přijetí výzvy. Otevřená („kdokoli z rodiny“): first-wins — druhý zájemce
  // dostane 409; při přijetí se ze snapshotů progresu spočítá handicap obou.
  // Cílená: přijmout smí jen adresát (stav → prijaty, handicap už je z
  // vytvoření). Opakované přijetí týmž profilem je idempotentní (vrací duel).
  app.post('/api/duely/:id/prijmout', mw.student, mw.limitTela, async (c) => {
    const telo = prijmoutDuelSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!telo.success) {
      return c.json({ chyba: 'Tělo musí být { profilId, jmeno } (řetězce 1–64 znaků)' }, 400);
    }
    const nalezeny = nactiDuel(db, c.req.param('id') ?? '');
    if (!nalezeny) return c.json({ chyba: 'Duel neexistuje' }, 404);
    const ted = new Date().toISOString();
    const duel = zkontrolujVyprseni(db, nalezeny, ted);
    if (duel.stav === 'vyprsely') return c.json({ chyba: 'Duel už vypršel' }, 409);
    if (duel.stav === 'hotovy') return c.json({ chyba: 'Duel je už dohraný' }, 409);
    // Duel odkazem není rodinná výzva — přijmout ho smí JEN host s kódem přes
    // /api/hoste/duely/:id/prijmout (jinak by si ho rodinný profil ukradl).
    if (duel.proOdkaz) {
      return c.json({ chyba: 'Duel odkazem může přijmout jen host s odkazem' }, 409);
    }
    const { profilId, jmeno } = telo.data;
    if (duel.vyzyvatel.profilId === profilId) {
      return c.json({ chyba: 'Vlastní výzvu nejde přijmout' }, 409);
    }
    if (duel.souper) {
      if (duel.souper.profilId !== profilId) {
        return c.json(
          {
            chyba: duel.otevrenyProRodinu
              ? 'Výzvu už přijal někdo jiný'
              : 'Výzva je určená jinému profilu',
          },
          409,
        );
      }
      if (duel.stav !== 'cekajici') return c.json(duel); // idempotentní retry
      const prijaty: Duel = { ...duel, stav: 'prijaty' };
      ulozDuel(db, prijaty);
      return c.json(prijaty);
    }
    // Otevřená výzva bez soupeře — první, kdo přijme, hraje; TEĎ se zmrazí
    // handicap (snapshoty progresu obou v okamžiku přijetí).
    const banka = nactiBanku(db, duel.predmetId);
    const handicap = banka
      ? spocitejHandicap(db, banka, duel.vyzyvatel.profilId, profilId)
      : { [duel.vyzyvatel.profilId]: 1, [profilId]: 1 };
    const prijaty: Duel = { ...duel, souper: { profilId, jmeno }, handicap, stav: 'prijaty' };
    ulozDuel(db, prijaty);
    return c.json(prijaty);
  });

  // Odevzdání výsledku půlky duelu. PRVNÍ zápis za profil platí — opakovaný
  // pokus je 409 (anti-cheat: jeden pokus na hráče). Po obou výsledcích server
  // duel vyhodnotí sdílenou funkcí (body → čas → remíza) a uzavře jako hotový.
  app.post('/api/duely/:id/vysledek', mw.student, mw.limitTela, async (c) => {
    const telo = vysledekDueluTeloSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!telo.success) {
      return c.json(
        { chyba: `Tělo musí být { profilId, vysledek } — ${popisChybValidace(telo.error.issues)}` },
        400,
      );
    }
    const nalezeny = nactiDuel(db, c.req.param('id') ?? '');
    if (!nalezeny) return c.json({ chyba: 'Duel neexistuje' }, 404);
    const ted = new Date().toISOString();
    const duel = zkontrolujVyprseni(db, nalezeny, ted);
    if (duel.stav === 'vyprsely') {
      return c.json({ chyba: 'Duel vypršel — výsledek už nejde odevzdat' }, 409);
    }
    if (duel.stav === 'hotovy') return c.json({ chyba: 'Duel je už vyhodnocený' }, 409);
    const { profilId, vysledek } = telo.data;
    const jeSouper = duel.souper?.profilId === profilId;
    if (duel.vyzyvatel.profilId !== profilId && !jeSouper) {
      return c.json({ chyba: 'Profil v tomhle duelu nehraje' }, 400);
    }
    // Otevřenou výzvu musí nejdřív někdo přijmout — teprve přijetím se zmrazí
    // handicap a duel má definované podmínky pro oba hráče. Duel odkazem je
    // výjimka: handicap je fixně 1.0 od založení, takže vyzyvatel smí svou
    // půlku odehrát dřív, než host odkaz vůbec otevře.
    if (!duel.souper && !duel.proOdkaz) {
      return c.json({ chyba: 'Otevřenou výzvu musí nejdřív někdo přijmout' }, 409);
    }
    if (duel.vysledky[profilId]) {
      return c.json({ chyba: 'Výsledek za tenhle profil už je odevzdaný — platí první pokus' }, 409);
    }
    // ANTI-CHEAT: klientským hodnotám body/celkovyCasMs server NEVĚŘÍ —
    // výsledek se přepočítá ze syrových odpovědí proti bance duelu (limit
    // = casLimitProHrace × zmrazený handicap + zmrazení času, štít jen na
    // první špatnou). Odmítá se čas přes limit + rezervu, duplicitní otázka
    // a otázka mimo banku; podvržené body se tiše nahradí přepočtem.
    const banka = nactiBanku(db, duel.predmetId);
    if (!banka) {
      return c.json({ chyba: 'Banka duelu už na serveru není — výsledek nejde ověřit' }, 409);
    }
    const prepocet = prepoctiVysledekDuelu(duel, profilId, vysledek, banka);
    if (!prepocet.ok) {
      return c.json({ chyba: `Výsledek neprošel kontrolou — ${prepocet.chyba}` }, 400);
    }
    const vysledky = { ...duel.vysledky, [profilId]: prepocet.vysledek };
    let novy: Duel = {
      ...duel,
      // Výsledek od cíleného soupeře je zároveň přijetí výzvy.
      stav: duel.stav === 'cekajici' && jeSouper ? 'prijaty' : duel.stav,
      vysledky,
    };
    if (vysledky[novy.vyzyvatel.profilId] && novy.souper && vysledky[novy.souper.profilId]) {
      novy = { ...novy, stav: 'hotovy', vitezProfilId: vyhodnotDuel(novy) };
    }
    // Sdílené schéma ohlídá zbytek: odpovědi jen na otázky duelu, ne víc
    // odpovědí než otázek, každý power-up max 1× (žádná cizí id).
    const kontrola = duelSchema.safeParse(novy);
    if (!kontrola.success) {
      return c.json(
        { chyba: `Výsledek neprošel validací — ${popisChybValidace(kontrola.error.issues)}` },
        400,
      );
    }
    ulozDuel(db, novy);
    return c.json(bezHasheKodu(novy));
  });

  // --- Hostovské endpointy duelu odkazem (fáze 2) --------------------------
  // BEZ rodinného tokenu — jedinou vstupenkou je jednorázový hostovský kód
  // vázaný na JEDEN duel (v DB jen jako hash se solí = id duelu). IZOLACE:
  // kód neotevírá nic jiného (profily, progres ani jiné duely mají vlastní
  // auth); rate limit platí — cesty žijí pod /api/*. Špatný kód, cizí duel
  // i neexistující duel vrací JEDNOTNÉ 403 (žádná informace navíc).

  /** Načte duel pro hosta: null = neplatný odkaz (jednotné 403 u volajícího). */
  function nactiDuelProHosta(id: string, kod: string | undefined, tedIso: string): Duel | null {
    const duel = nactiDuel(db, id);
    if (!duel || !platiKodHosta(duel, kod)) return null;
    return zkontrolujVyprseni(db, duel, tedIso);
  }

  // Stav duelu pro hosta (i výsledek po dohrání obou). ANTI-CHEAT: dokud host
  // duel nepřijme, sada otázek se zatajuje — a s ní i výsledky (odpovědi
  // vyzyvatele by sadu prozradily; host má banku s klíčem bundlovanou).
  // Kód se čte PRIMÁRNĚ z hlavičky x-questor-host-kod: query string končí
  // v access logu proxy/Apache a popřel by smysl fragmentu # v odkazu.
  // ?kod= zůstává jen jako fallback pro starší klienty.
  app.get('/api/hoste/duely/:id', (c) => {
    const ted = new Date().toISOString();
    const kod = c.req.header('x-questor-host-kod') ?? c.req.query('kod');
    const duel = nactiDuelProHosta(c.req.param('id') ?? '', kod, ted);
    if (!duel) return c.json({ chyba: CHYBA_ODKAZU }, 403);
    const verejny = duel.host ? duel : { ...duel, otazkyIds: [] as string[], vysledky: {} };
    return c.json(bezHasheKodu(verejny));
  });

  // Přijetí duelu hostem: nastaví hosta (profilId host:<duelId>, zadané jméno)
  // a vrátí plný duel včetně sady otázek. First-wins — odkaz je jednorázový,
  // druhé přijetí (i se správným kódem) dostane 409.
  app.post('/api/hoste/duely/:id/prijmout', mw.limitTela, async (c) => {
    const telo = hostPrijmoutSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!telo.success) {
      return c.json(
        { chyba: 'Tělo musí být { kod, jmeno } — jméno 1–24 znaků bez řídicích znaků' },
        400,
      );
    }
    const ted = new Date().toISOString();
    const duel = nactiDuelProHosta(c.req.param('id') ?? '', telo.data.kod, ted);
    if (!duel) return c.json({ chyba: CHYBA_ODKAZU }, 403);
    if (duel.stav === 'vyprsely') return c.json({ chyba: 'Duel už vypršel' }, 409);
    if (duel.stav === 'hotovy') return c.json({ chyba: 'Duel je už dohraný' }, 409);
    if (duel.host) {
      // Odolnost proti ztracené odpovědi: opakované přijetí se SPRÁVNÝM kódem
      // a STEJNÝM jménem je idempotentní (kód je jediný credential — dva
      // držitele téhož kódu stejně nejde rozlišit). Jiné jméno = závod o odkaz
      // → first-wins 409.
      if (duel.host.jmeno === telo.data.jmeno) return c.json(bezHasheKodu(duel));
      return c.json({ chyba: 'Odkaz už někdo použil — hraje první' }, 409);
    }
    // Host nemá handicap: oba hráči dostávají násobič 1.0, zmrazený od teď.
    const hostId = hostProfilId(duel.id);
    const prijaty: Duel = {
      ...duel,
      souper: { profilId: hostId, jmeno: telo.data.jmeno },
      host: { jmeno: telo.data.jmeno },
      handicap: { [duel.vyzyvatel.profilId]: 1, [hostId]: 1 },
      stav: 'prijaty',
    };
    const kontrola = duelSchema.safeParse(prijaty);
    if (!kontrola.success) {
      console.error('Přijetí hosta sestavilo nevalidní duel:', kontrola.error.issues);
      return c.json({ chyba: 'Duel se nepodařilo přijmout' }, 500);
    }
    ulozDuel(db, prijaty);
    return c.json(bezHasheKodu(prijaty));
  });

  // Výsledek hosta: stejný anti-cheat přepočet jako u rodiny (server bodům
  // nevěří, přepočítá ze syrových odpovědí; handicap hosta 1.0), first-wins.
  // Host power-upy NEMÁ — jakýkoli pouzityPowerup je 400.
  app.post('/api/hoste/duely/:id/vysledek', mw.limitTela, async (c) => {
    const telo = hostVysledekSchema.safeParse(await c.req.json().catch(() => undefined));
    if (!telo.success) {
      return c.json(
        { chyba: `Tělo musí být { kod, vysledek } — ${popisChybValidace(telo.error.issues)}` },
        400,
      );
    }
    const ted = new Date().toISOString();
    const duel = nactiDuelProHosta(c.req.param('id') ?? '', telo.data.kod, ted);
    if (!duel) return c.json({ chyba: CHYBA_ODKAZU }, 403);
    if (duel.stav === 'vyprsely') {
      return c.json({ chyba: 'Duel vypršel — výsledek už nejde odevzdat' }, 409);
    }
    if (duel.stav === 'hotovy') return c.json({ chyba: 'Duel je už vyhodnocený' }, 409);
    if (!duel.host || !duel.souper) {
      return c.json({ chyba: 'Host musí duel nejdřív přijmout' }, 409);
    }
    const hostId = hostProfilId(duel.id);
    const { vysledek } = telo.data;
    if (vysledek.odpovedi.some((o) => o.pouzityPowerup !== undefined)) {
      return c.json({ chyba: 'Host nemá power-upy — výsledek je nesmí používat' }, 400);
    }
    // ANTI-CHEAT (jen host — cizí člověk s curl, žádná domácí důvěra):
    // výsledek musí pokrýt VŠECHNY otázky sady. Vynechané (špatné) odpovědi
    // by nesnížily body, ale snížily by celkovyCasMs, který rozhoduje
    // tie-break ve vyhodnotDuel. Poctivý klient odpovídá vždy na celou sadu
    // (timeout se počítá jako odpověď s časem = limit).
    if (vysledek.odpovedi.length !== duel.otazkyIds.length) {
      return c.json(
        {
          chyba: `Výsledek hosta musí pokrýt všechny otázky duelu (${vysledek.odpovedi.length}/${duel.otazkyIds.length})`,
        },
        400,
      );
    }
    if (duel.vysledky[hostId]) {
      return c.json({ chyba: 'Výsledek hosta už je odevzdaný — platí první pokus' }, 409);
    }
    const banka = nactiBanku(db, duel.predmetId);
    if (!banka) {
      return c.json({ chyba: 'Banka duelu už na serveru není — výsledek nejde ověřit' }, 409);
    }
    const prepocet = prepoctiVysledekDuelu(duel, hostId, vysledek, banka);
    if (!prepocet.ok) {
      return c.json({ chyba: `Výsledek neprošel kontrolou — ${prepocet.chyba}` }, 400);
    }
    const vysledky = { ...duel.vysledky, [hostId]: prepocet.vysledek };
    let novy: Duel = { ...duel, vysledky };
    if (vysledky[novy.vyzyvatel.profilId] && vysledky[hostId]) {
      novy = { ...novy, stav: 'hotovy', vitezProfilId: vyhodnotDuel(novy) };
    }
    const kontrola = duelSchema.safeParse(novy);
    if (!kontrola.success) {
      return c.json(
        { chyba: `Výsledek neprošel validací — ${popisChybValidace(kontrola.error.issues)}` },
        400,
      );
    }
    ulozDuel(db, novy);
    return c.json(bezHasheKodu(novy));
  });
}
