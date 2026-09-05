// Duelové jádro QUESTORu — čisté deterministické funkce + zod schémata Duelu.
// Duel = asynchronní výzva mezi profily JEDNÉ rodiny: oba hráči hrají
// IDENTICKOU sadu otázek (výběr i míchání ze seedu = id duelu) do 24 hodin,
// bez průběžné zpětné vazby, s viditelným odpočtem limitu na otázku.
// Náhoda se VŽDY injektuje jako funkce () => number v [0, 1).

import { z } from 'zod';
import type {
  BankaOtazek,
  BilanceDvojice,
  Duel,
  Obtiznost,
  Otazka,
  PowerupTyp,
  ProgresStudenta,
  StatistikaOtazky,
  TrofejeProfilu,
  VysledekDuelu,
} from './typy';
import {
  hashRetezce,
  POWERUP_TYPY,
  vazenyVyber,
  vychoziPowerupy,
  vychoziTrofeje,
  vytvorNahodu,
} from './gamifikace';

// ---------------------------------------------------------------------------
// Konstanty pravidel

/** Duel platí 24 hodin od vytvoření. */
export const DUEL_TRVANI_MS = 24 * 60 * 60 * 1000;

/** Body za správnou odpověď (k tomu časový bonus 0–MAX_BONUS_BODY). */
export const BODY_ZA_SPRAVNOU = 100;

/** Maximální časový bonus (při okamžité odpovědi). */
export const MAX_BONUS_BODY = 50;

/** Štít: první špatná odpověď se počítá za tolik bodů místo 0. */
export const BODY_STITU = 50;

/** Zmrazení času: o kolik ms power-up prodlouží limit aktuální otázky. */
export const ZMRAZENI_CASU_MS = 10_000;

/**
 * Tolerance serverového přepočtu nad casMs odpovědi (latence, zaokrouhlení).
 * Čas nad limit + rezervu server odmítá — klient čas ořezává na limit, takže
 * poctivý výsledek se do rezervy vždy vejde.
 */
export const REZERVA_CASU_DUELU_MS = 2_000;

/** Kolik výher v řadě dává titul (celkem i v jednom oboru). */
export const SERIE_PRO_TITUL = 3;

/** Po kolika dokončených duelech náleží titul „Duelant“. */
export const DUELY_PRO_TITUL_DUELANT = 10;

export const TITUL_VITEZNA_VLNA = 'Vítězná vlna';
export const TITUL_DUELANT = 'Duelant';

/** Titul za SERIE_PRO_TITUL výher v řadě v jednom oboru. */
export function titulPostrach(nazevOboru: string): string {
  return `Postrach: ${nazevOboru}`;
}

/** Názvy a popisy power-upů pro UI (odměna z truhly, výběr v duelu). */
export const POWERUP_INFO: Record<PowerupTyp, { nazev: string; popis: string }> = {
  'pade-na-pade': {
    nazev: '50 : 50',
    popis: 'Skryje dvě špatné možnosti u výběrové otázky.',
  },
  'zmrazeni-casu': {
    nazev: 'Zmrazení času',
    popis: 'Přidá 10 sekund na aktuální otázku.',
  },
  stit: {
    nazev: 'Štít',
    popis: 'První špatná odpověď se počítá za 50 bodů místo 0.',
  },
};

// ---------------------------------------------------------------------------
// Čas a bodování

/** Základní limit na otázku: (10 + 4×obtížnost) sekund, v ms. */
export function casLimitOtazky(obtiznost: Obtiznost): number {
  return (10 + 4 * obtiznost) * 1000;
}

/** Limit hráče po započtení handicapového násobiče (zaokrouhleno na ms). */
export function casLimitProHrace(obtiznost: Obtiznost, nasobicCasu: number): number {
  return Math.round(casLimitOtazky(obtiznost) * nasobicCasu);
}

/**
 * Body za jednu odpověď v duelu:
 * - správně: 100 + round(50 × zbývajícíČas/limit),
 * - špatně nebo timeout: 0 (se štítem 50 — štít smí aktivovat jen PRVNÍ
 *   špatnou odpověď, hlídá volající).
 */
export function bodyZaOdpoved(
  spravne: boolean,
  casMs: number,
  limitMs: number,
  stitAktivni = false,
): number {
  if (!spravne) return stitAktivni ? BODY_STITU : 0;
  if (limitMs <= 0) return BODY_ZA_SPRAVNOU;
  const zbyvajici = Math.min(limitMs, Math.max(0, limitMs - casMs));
  return BODY_ZA_SPRAVNOU + Math.round(MAX_BONUS_BODY * (zbyvajici / limitMs));
}

// ---------------------------------------------------------------------------
// Handicap férovosti

/**
 * Zvládnutí oboru = podíl otázek banky v Leitnerově boxu ≥ 3 (0–1).
 * Počítá se ze snapshotu progresu na serveru při vytvoření/přijetí duelu.
 */
export function zvladnutiOboru(
  banka: BankaOtazek,
  statistiky: Record<string, StatistikaOtazky>,
): number {
  if (banka.otazky.length === 0) return 0;
  const zvladnuto = banka.otazky.filter((o) => (statistiky[o.id]?.box ?? 0) >= 3).length;
  return zvladnuto / banka.otazky.length;
}

/**
 * Násobič časového limitu jednoho hráče: 1 + 0.5×(zvládnutíSoupeře − zvládnutíMoje),
 * ořez do <1.0; 1.5> (silnější hráč má vždy 1.0). Zaokrouhleno na 3 desetinná
 * místa, aby hodnota byla stabilní přes serializaci a čitelná v UI.
 */
export function handicapNasobic(zvladnutiMoje: number, zvladnutiSoupere: number): number {
  const syrovy = 1 + 0.5 * (zvladnutiSoupere - zvladnutiMoje);
  const orezany = Math.min(1.5, Math.max(1, syrovy));
  return Math.round(orezany * 1000) / 1000;
}

/** Handicapové násobiče obou hráčů najednou (a je „hráč A“, b „hráč B“). */
export function handicapNasobice(
  zvladnutiA: number,
  zvladnutiB: number,
): { a: number; b: number } {
  return {
    a: handicapNasobic(zvladnutiA, zvladnutiB),
    b: handicapNasobic(zvladnutiB, zvladnutiA),
  };
}

// ---------------------------------------------------------------------------
// Výběr otázek a determinismus

/** Deterministická náhoda duelu — seed je id duelu (oba hráči táhnou totéž). */
export function nahodaProDuel(duelId: string): () => number {
  return vytvorNahodu(hashRetezce(`duel:${duelId}`));
}

/**
 * Vybere otázky duelu: filtr podle témat, jinak ČISTĚ náhodný výběr bez
 * opakování — ŽÁDNÉ Leitnerovy váhy (fér: sada nesmí zvýhodnit ani jednoho
 * hráče). Volá se s náhodou ze seedu = id duelu (nahodaProDuel), takže obě
 * strany dojdou ke stejné sadě ve stejném pořadí.
 */
export function vyberOtazekDuelu(
  banka: BankaOtazek,
  temataId: string[] | undefined,
  pocet: number,
  nahoda: () => number,
): Otazka[] {
  const kandidati = banka.otazky.filter((o) => !temataId || temataId.includes(o.temaId));
  return vazenyVyber(
    kandidati,
    kandidati.map(() => 1),
    Math.min(pocet, kandidati.length),
    nahoda,
  );
}

/** ISO čas vypršení duelu (vytvořeno + 24 h). */
export function vyprsiDuelu(vytvorenoIso: string): string {
  return new Date(Date.parse(vytvorenoIso) + DUEL_TRVANI_MS).toISOString();
}

// ---------------------------------------------------------------------------
// Vyhodnocení duelu

/**
 * Určí vítěze duelu: vyšší body vyhrávají, při shodě bodů nižší součet časů;
 * shoda obojího = remíza (null). Hráč bez odevzdaného výsledku se počítá jako
 * 0 bodů s nekonečným časem (kdo dohrál, poráží toho, kdo nedohrál). Duel bez
 * soupeře vítěze nemá (null). Volat po dokončení obou, nebo po vypršení.
 */
export function vyhodnotDuel(duel: Duel): string | null {
  if (!duel.souper) return null;
  const hraci = [duel.vyzyvatel.profilId, duel.souper.profilId].map((profilId) => {
    const v = duel.vysledky[profilId];
    return v
      ? { profilId, body: v.body, casMs: v.celkovyCasMs }
      : { profilId, body: 0, casMs: Number.POSITIVE_INFINITY };
  });
  const [a, b] = hraci;
  if (a.body !== b.body) return a.body > b.body ? a.profilId : b.profilId;
  if (a.casMs !== b.casMs) return a.casMs < b.casMs ? a.profilId : b.profilId;
  return null;
}

/**
 * Vítěz po vypršení duelu: kdo odehrál, vyhrává kontumačně; nikdo → bez
 * vítěze (null). U otevřené výzvy bez soupeře rozhoduje výsledek vyzyvatele.
 */
export function vitezPoVyprseni(duel: Duel): string | null {
  if (!duel.souper) {
    return duel.vysledky[duel.vyzyvatel.profilId] ? duel.vyzyvatel.profilId : null;
  }
  return vyhodnotDuel(duel);
}

/**
 * Líná expirace (čistá): běžící duel s vyprsi <= ted přejde na 'vyprsely'
 * s kontumačním vítězem; jinak se vrací TENTÝŽ objekt. ISO časy se
 * porovnávají lexikograficky (oba z toISOString). Server změnu ukládá,
 * klient ji používá i lokálně (offline nesmí jít hrát po termínu).
 */
export function expirujDuel(duel: Duel, tedIso: string): Duel {
  const bezi = duel.stav === 'cekajici' || duel.stav === 'prijaty';
  if (!bezi || duel.vyprsi > tedIso) return duel;
  return { ...duel, stav: 'vyprsely', vitezProfilId: vitezPoVyprseni(duel) };
}

// ---------------------------------------------------------------------------
// Serverový přepočet výsledku (anti-cheat)

export type PrepocetVysledkuDuelu =
  | { ok: true; vysledek: VysledekDuelu }
  | { ok: false; chyba: string };

/**
 * Přepočítá výsledek půlky duelu ze syrových odpovědí — server klientským
 * hodnotám `body` a `celkovyCasMs` NEVĚŘÍ a nahradí je vlastním výpočtem
 * (stejný vzorec jako klientský engine: bodyZaOdpoved, limit s handicapem,
 * zmrazení času jen na otázce s power-upem, štít jen na PRVNÍ špatnou
 * odpověď od aktivace). Odmítá duplicitní otázky, otázky mimo banku
 * a casMs > limit + REZERVA_CASU_DUELU_MS.
 */
export function prepoctiVysledekDuelu(
  duel: Duel,
  profilId: string,
  vysledek: VysledekDuelu,
  banka: BankaOtazek,
): PrepocetVysledkuDuelu {
  const nasobic = duel.handicap[profilId] ?? 1;
  const otazky = new Map(banka.otazky.map((o) => [o.id, o]));
  const videne = new Set<string>();
  let body = 0;
  let celkovyCasMs = 0;
  let stitAktivni = false;
  let stitSpotrebovan = false;
  for (const odpoved of vysledek.odpovedi) {
    if (videne.has(odpoved.otazkaId)) {
      return { ok: false, chyba: `otázka „${odpoved.otazkaId}“ je zodpovězená víckrát` };
    }
    videne.add(odpoved.otazkaId);
    const otazka = otazky.get(odpoved.otazkaId);
    if (!otazka) {
      return { ok: false, chyba: `otázka „${odpoved.otazkaId}“ není v bance duelu` };
    }
    const limit =
      casLimitProHrace(otazka.obtiznost, nasobic) +
      (odpoved.pouzityPowerup === 'zmrazeni-casu' ? ZMRAZENI_CASU_MS : 0);
    if (odpoved.casMs > limit + REZERVA_CASU_DUELU_MS) {
      return {
        ok: false,
        chyba: `čas ${odpoved.casMs} ms na otázku „${odpoved.otazkaId}“ přesahuje limit ${limit} ms`,
      };
    }
    if (odpoved.pouzityPowerup === 'stit') stitAktivni = true;
    const stitPouzit = !odpoved.spravne && stitAktivni && !stitSpotrebovan;
    body += bodyZaOdpoved(odpoved.spravne, Math.min(odpoved.casMs, limit), limit, stitPouzit);
    if (stitPouzit) {
      stitAktivni = false;
      stitSpotrebovan = true;
    }
    celkovyCasMs += odpoved.casMs;
  }
  return { ok: true, vysledek: { ...vysledek, body, celkovyCasMs } };
}

/** Výsledek duelu z pohledu jednoho hráče (z vitezProfilId; null = remíza). */
export type VysledekUcastnika = 'vyhra' | 'prohra' | 'remiza';

export function vysledekProHrace(
  vitezProfilId: string | null | undefined,
  profilId: string,
): VysledekUcastnika {
  if (vitezProfilId === null || vitezProfilId === undefined) return 'remiza';
  return vitezProfilId === profilId ? 'vyhra' : 'prohra';
}

// ---------------------------------------------------------------------------
// Trofeje a tituly

/**
 * Zapíše dokončený duel do trofejní vitríny (imutabilně): bilance dvojice,
 * série výher (prohra i remíza sérii nulují; série v oboru žije nezávisle na
 * ostatních oborech) a nové tituly:
 * - „Vítězná vlna“ — 3 výhry v řadě přes všechny duely,
 * - „Postrach: <nazevOboru>“ — 3 výhry v řadě v jednom oboru,
 * - „Duelant“ — 10 dokončených duelů.
 * Titul se uděluje jen jednou (žádné duplicity).
 */
export function aktualizujTrofeje(
  trofeje: TrofejeProfilu,
  souperProfilId: string,
  vysledek: VysledekUcastnika,
  obor: { predmetId: string; nazev: string },
): TrofejeProfilu {
  const stara: BilanceDvojice = trofeje.dvojice[souperProfilId] ?? {
    vyhry: 0,
    prohry: 0,
    remizy: 0,
    serieVyher: 0,
  };
  const vyhra = vysledek === 'vyhra';
  const novaBilance: BilanceDvojice = {
    vyhry: stara.vyhry + (vyhra ? 1 : 0),
    prohry: stara.prohry + (vysledek === 'prohra' ? 1 : 0),
    remizy: stara.remizy + (vysledek === 'remiza' ? 1 : 0),
    serieVyher: vyhra ? stara.serieVyher + 1 : 0,
  };
  const duelyCelkem = trofeje.duelyCelkem + 1;
  const serieVyherCelkem = vyhra ? trofeje.serieVyherCelkem + 1 : 0;
  const serieOboru = vyhra ? (trofeje.seriePodleOboru[obor.predmetId] ?? 0) + 1 : 0;

  const tituly = [...trofeje.tituly];
  const pridejTitul = (titul: string) => {
    if (!tituly.includes(titul)) tituly.push(titul);
  };
  if (serieVyherCelkem >= SERIE_PRO_TITUL) pridejTitul(TITUL_VITEZNA_VLNA);
  if (serieOboru >= SERIE_PRO_TITUL) pridejTitul(titulPostrach(obor.nazev));
  if (duelyCelkem >= DUELY_PRO_TITUL_DUELANT) pridejTitul(TITUL_DUELANT);

  return {
    dvojice: { ...trofeje.dvojice, [souperProfilId]: novaBilance },
    tituly,
    serieVyherCelkem,
    seriePodleOboru: { ...trofeje.seriePodleOboru, [obor.predmetId]: serieOboru },
    duelyCelkem,
  };
}

/**
 * Sloučí dvě trofejní vitríny (LWW pull progresu mezi zařízeními): počítadla
 * po dvojicích i celková se berou po MAXIMU, tituly se sjednotí. Chrání
 * trofej započtenou na jednom zařízení před přepsáním novějším snapshotem
 * progresu z druhého zařízení, který ji ještě nemá (duelyZapocitane blokuje
 * přepočet). Série po maximu jsou konzervativní aproximace — přesnou hodnotu
 * by dal jen přepočet z historie duelů, ztráta trofeje je ale horší chyba.
 */
export function sloucTrofeje(a: TrofejeProfilu, b: TrofejeProfilu): TrofejeProfilu {
  const dvojice: Record<string, BilanceDvojice> = {};
  for (const klic of new Set([...Object.keys(a.dvojice), ...Object.keys(b.dvojice)])) {
    const x = a.dvojice[klic];
    const y = b.dvojice[klic];
    if (!x || !y) {
      dvojice[klic] = (x ?? y) as BilanceDvojice;
      continue;
    }
    dvojice[klic] = {
      vyhry: Math.max(x.vyhry, y.vyhry),
      prohry: Math.max(x.prohry, y.prohry),
      remizy: Math.max(x.remizy, y.remizy),
      serieVyher: Math.max(x.serieVyher, y.serieVyher),
    };
  }
  const tituly = [...a.tituly];
  for (const titul of b.tituly) {
    if (!tituly.includes(titul)) tituly.push(titul);
  }
  const seriePodleOboru: Record<string, number> = { ...a.seriePodleOboru };
  for (const [obor, serie] of Object.entries(b.seriePodleOboru)) {
    seriePodleOboru[obor] = Math.max(seriePodleOboru[obor] ?? 0, serie);
  }
  return {
    dvojice,
    tituly,
    serieVyherCelkem: Math.max(a.serieVyherCelkem, b.serieVyherCelkem),
    seriePodleOboru,
    duelyCelkem: Math.max(a.duelyCelkem, b.duelyCelkem),
  };
}

/**
 * Má vitrína `mistni` něco navíc proti `srovnavane`? (Titul, vyšší počítadlo,
 * vyšší série.) Řídí, jestli má LWW pull progresu trofeje mergovat a merge
 * pushnout zpět — bez semantického srovnání by se zařízení přetlačovala
 * donekonečna kvůli pořadí klíčů.
 */
export function prinasiTrofejeNavic(mistni: TrofejeProfilu, srovnavane: TrofejeProfilu): boolean {
  if (mistni.duelyCelkem > srovnavane.duelyCelkem) return true;
  if (mistni.serieVyherCelkem > srovnavane.serieVyherCelkem) return true;
  if (mistni.tituly.some((t) => !srovnavane.tituly.includes(t))) return true;
  for (const [obor, serie] of Object.entries(mistni.seriePodleOboru)) {
    if (serie > (srovnavane.seriePodleOboru[obor] ?? 0)) return true;
  }
  for (const [souper, b] of Object.entries(mistni.dvojice)) {
    const s = srovnavane.dvojice[souper];
    if (!s) return true;
    if (b.vyhry > s.vyhry || b.prohry > s.prohry || b.remizy > s.remizy) return true;
    if (b.serieVyher > s.serieVyher) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Zpětná kompatibilita progresu

/**
 * Doplní do progresu chybějící duelová pole (powerupy, trofeje) — starší
 * snapshoty je nemají. Když nic nechybí, vrací TENTÝŽ objekt (žádná zbytečná
 * nová reference); jinak imutabilně doplněnou kopii (existující hodnoty
 * zůstávají, chybějící klíče dostanou výchozí nuly).
 */
export function doplnDuelovyProgres(progres: ProgresStudenta): ProgresStudenta {
  const p = progres.powerupy;
  const t = progres.trofeje;
  const chybiPowerupy = !p || POWERUP_TYPY.some((typ) => typeof p[typ] !== 'number');
  const chybiTrofeje =
    !t ||
    t.dvojice === undefined ||
    t.tituly === undefined ||
    typeof t.serieVyherCelkem !== 'number' ||
    t.seriePodleOboru === undefined ||
    typeof t.duelyCelkem !== 'number';
  if (!chybiPowerupy && !chybiTrofeje) return progres;
  return {
    ...progres,
    powerupy: { ...vychoziPowerupy(), ...(p ?? {}) },
    trofeje: { ...vychoziTrofeje(), ...(t ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Zod schémata (server duel validuje na hranici procesu)

const profilIdSchema = z.string().min(1).max(64);

export const powerupTypSchema = z.enum(['pade-na-pade', 'zmrazeni-casu', 'stit']);

export const ucastnikDueluSchema = z.object({
  profilId: profilIdSchema,
  jmeno: z.string().min(1).max(64),
});

export const odpovedDueluSchema = z.object({
  otazkaId: z.string().min(1),
  spravne: z.boolean(),
  casMs: z.number().int().min(0),
  pouzityPowerup: powerupTypSchema.optional(),
});

export const vysledekDueluSchema = z
  .object({
    odpovedi: z.array(odpovedDueluSchema).max(20),
    body: z.number().int().min(0),
    celkovyCasMs: z.number().int().min(0),
    dokonceno: z.string().min(4),
  })
  .superRefine((vysledek, ctx) => {
    // Každý power-up smí hráč použít max 1× za duel.
    const pouzite = vysledek.odpovedi
      .map((o) => o.pouzityPowerup)
      .filter((typ): typ is PowerupTyp => typ !== undefined);
    if (new Set(pouzite).size !== pouzite.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odpovedi'],
        message: 'Stejný power-up je použitý víckrát než jednou za duel',
      });
    }
    // Každá otázka smí být zodpovězená jen jednou (anti-cheat: duplicitní
    // otazkaId by jinak prošla — schéma duelu hlídá jen sadu otazkyIds).
    const otazky = vysledek.odpovedi.map((o) => o.otazkaId);
    if (new Set(otazky).size !== otazky.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['odpovedi'],
        message: 'Stejná otázka je zodpovězená víckrát',
      });
    }
  });

export const stavDueluSchema = z.enum(['cekajici', 'prijaty', 'hotovy', 'vyprsely']);

export const duelSchema = z
  .object({
    id: z.string().min(1),
    predmetId: z.string().min(1).regex(/^[a-z0-9-]+$/, 'predmetId smí obsahovat jen a–z, 0–9 a pomlčky'),
    temataId: z.array(z.string().min(1)).min(1).optional(),
    pocetOtazek: z.union([z.literal(5), z.literal(10), z.literal(20)]),
    otazkyIds: z.array(z.string().min(1)).min(1).max(20),
    /** Verze banky při založení duelu (starší duely ji nemají). */
    verzeBanky: z.number().int().min(1).optional(),
    vyzyvatel: ucastnikDueluSchema,
    souper: ucastnikDueluSchema.optional(),
    otevrenyProRodinu: z.boolean(),
    handicap: z.record(z.number().min(1).max(1.5)),
    stav: stavDueluSchema,
    vysledky: z.record(vysledekDueluSchema),
    vitezProfilId: z.string().min(1).nullable().optional(),
    vytvoreno: z.string().min(4),
    vyprsi: z.string().min(4),
  })
  .superRefine((duel, ctx) => {
    if (new Set(duel.otazkyIds).size !== duel.otazkyIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['otazkyIds'],
        message: 'Duplicitní id otázek v sadě duelu',
      });
    }
    if (duel.otazkyIds.length > duel.pocetOtazek) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['otazkyIds'],
        message: 'Sada otázek je delší než pocetOtazek',
      });
    }
    if (duel.souper && duel.souper.profilId === duel.vyzyvatel.profilId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['souper', 'profilId'],
        message: 'Vyzyvatel nemůže duelovat sám se sebou',
      });
    }
    if ((duel.stav === 'prijaty' || duel.stav === 'hotovy') && !duel.souper) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['souper'],
        message: `Duel ve stavu „${duel.stav}“ musí mít soupeře`,
      });
    }
    const ucastnici = new Set(
      [duel.vyzyvatel.profilId, duel.souper?.profilId].filter((id): id is string => !!id),
    );
    for (const klic of Object.keys(duel.handicap)) {
      if (!ucastnici.has(klic)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['handicap', klic],
          message: 'Handicap patří profilu, který v duelu nehraje',
        });
      }
    }
    const sadaOtazek = new Set(duel.otazkyIds);
    for (const [profilId, vysledek] of Object.entries(duel.vysledky)) {
      if (!ucastnici.has(profilId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vysledky', profilId],
          message: 'Výsledek patří profilu, který v duelu nehraje',
        });
        continue;
      }
      if (vysledek.odpovedi.length > duel.otazkyIds.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['vysledky', profilId, 'odpovedi'],
          message: 'Víc odpovědí než otázek duelu',
        });
      }
      vysledek.odpovedi.forEach((odpoved, i) => {
        if (!sadaOtazek.has(odpoved.otazkaId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['vysledky', profilId, 'odpovedi', i, 'otazkaId'],
            message: `Odpověď na otázku „${odpoved.otazkaId}“, která v duelu není`,
          });
        }
      });
    }
    if (
      duel.vitezProfilId !== undefined &&
      duel.vitezProfilId !== null &&
      !ucastnici.has(duel.vitezProfilId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vitezProfilId'],
        message: 'Vítěz není účastníkem duelu',
      });
    }
  });

/** Zvaliduje neznámý JSON jako Duel. Vyhodí chybu se srozumitelným výpisem. */
export function validujDuel(data: unknown): Duel {
  const vysledek = duelSchema.safeParse(data);
  if (!vysledek.success) {
    const radky = vysledek.error.issues
      .slice(0, 20)
      .map((i) => `  – ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Duel neprošel validací:\n${radky}`);
  }
  return vysledek.data as Duel;
}

// Schémata duelových polí progresu — server je může přibrat do validace
// progresu (pole jsou volitelná, starší klienti je neposílají).

export const powerupyProgresuSchema = z.object({
  'pade-na-pade': z.number().int().min(0).default(0),
  'zmrazeni-casu': z.number().int().min(0).default(0),
  stit: z.number().int().min(0).default(0),
});

const bilanceDvojiceSchema = z.object({
  vyhry: z.number().int().min(0),
  prohry: z.number().int().min(0),
  remizy: z.number().int().min(0),
  serieVyher: z.number().int().min(0),
});

export const trofejeProfiluSchema = z.object({
  dvojice: z.record(bilanceDvojiceSchema).default({}),
  tituly: z.array(z.string().min(1)).default([]),
  serieVyherCelkem: z.number().int().min(0).default(0),
  seriePodleOboru: z.record(z.number().int().min(0)).default({}),
  duelyCelkem: z.number().int().min(0).default(0),
});
