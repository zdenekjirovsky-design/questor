// Zod schémata pro těla požadavků, která NEJSOU pokrytá sdíleným balíkem
// (banka se validuje přes validujBanku ze @questor/sdilene). Schémata zrcadlí
// typy ze sdilene/src/typy.ts — kontrakt, ne novou pravdu.

import { z } from 'zod';
import type { ProfilMetadata, ProgresStudenta, TestVysledek, Vyzva } from '@questor/sdilene';
import {
  powerupyProgresuSchema,
  trofejeProfiluSchema,
  VYCHOZI_AVATAR,
  vysledekDueluSchema,
} from '@questor/sdilene';

const obtiznostSchema = z.number().int().min(1).max(5);
const podil01Schema = z.number().min(0).max(1);

/**
 * ISO 8601 UTC čas (výstup Date.toISOString(), zlomky sekund volitelné) pro
 * pole, která rozhodují LWW. Porovnává se lexikograficky — volný formát
 * (min(4)) by dovolil hodnotu typu 'zzzz', která navždy vyhraje nad každým
 * platným časem a zamkne záznam proti všem dalším zápisům.
 */
export const isoCasSchema = z
  .string()
  .max(35)
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/);

/** Tolerance hodin klienta vůči serveru — víc už je „čas z budoucnosti“. */
export const TOLERANCE_BUDOUCNOSTI_MS = 5 * 60_000;

/**
 * Ořízne čas z budoucnosti na serverové „teď“: LWW jinak zamrzne na špatně
 * nastavených hodinách zařízení (rok 2030 vyhraje nad každým platným zápisem
 * i poté, co se hodiny spraví). Čas v toleranci se vrací beze změny.
 */
export function orizniCasBudoucnosti(cas: string, ted: Date = new Date()): string {
  const strop = new Date(ted.getTime() + TOLERANCE_BUDOUCNOSTI_MS).toISOString();
  return cas > strop ? ted.toISOString() : cas;
}

export const testKonfiguraceSchema = z.object({
  predmetId: z.string().min(1),
  rezim: z.enum(['rozcvicka', 'standard', 'hardcore', 'adaptivni', 'zkouska']),
  pocetOtazek: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  temataId: z.array(z.string().min(1)).optional(),
});

const odpovedZaznamSchema = z.object({
  otazkaId: z.string().min(1),
  temaId: z.string().min(1),
  obtiznost: obtiznostSchema,
  spravne: z.boolean(),
  casMs: z.number().min(0),
});

export const testVysledekSchema = z.object({
  id: z.string().min(1),
  konfigurace: testKonfiguraceSchema,
  zacatek: z.string().min(4),
  konec: z.string().min(4),
  odpovedi: z.array(odpovedZaznamSchema),
  uspesnost: podil01Schema,
  ziskaneXp: z.number().int().min(0),
  nejdelsiCombo: z.number().int().min(0),
  truhla: z.enum(['bronzova', 'stribrna', 'zlata']).optional(),
  vyzvaId: z.string().min(1).optional(),
});

const streakSchema = z.object({
  aktualni: z.number().int().min(0),
  nejdelsi: z.number().int().min(0),
  posledniDen: z.string().nullable(),
  zmrazeni: z.number().int().min(0),
});

const questDenniSchema = z.object({
  id: z.string().min(1),
  sablona: z.string().min(1),
  popis: z.string().min(1),
  cil: z.number().int().min(1),
  postup: z.number().int().min(0),
  splneno: z.boolean(),
  odmenaXp: z.number().int().min(0),
  datum: z.string().min(4),
  parametry: z.record(z.union([z.string(), z.number()])).optional(),
});

const sbirkaSchema = z.object({
  karty: z.array(z.string().min(1)),
  truhelBezKarty: z.number().int().min(0),
});

// Nasazená kosmetická výbava — id položek katalogu (VYBAVA_KATALOG ve sdilene).
const vybavaAvataruSchema = z.object({
  hlava: z.string().min(1).optional(),
  oci: z.string().min(1).optional(),
  krk: z.string().min(1).optional(),
  pozadi: z.string().min(1).optional(),
});

// Defaulty drží zpětnou kompatibilitu: starší aplikace posílající jen barvaVlasu
// dostane doplněné výchozí hodnoty místo 400 (stará pole doplnek/pozadi se zahodí).
const avatarSchema = z.object({
  pohlavi: z.enum(['muz', 'zena']).default(VYCHOZI_AVATAR.pohlavi),
  tvarObliceje: z.enum(['ovalny', 'hranaty', 'kulaty']).default(VYCHOZI_AVATAR.tvarObliceje),
  barvaPleti: z.string().min(1).default(VYCHOZI_AVATAR.barvaPleti),
  barvaVlasu: z.string().min(1),
  stylVlasu: z
    .enum(['kratke', 'polodlouhe', 'rozpustene', 'culik', 'vlnite'])
    .default(VYCHOZI_AVATAR.stylVlasu),
  vybava: vybavaAvataruSchema.default({}),
});

const statistikaOtazkySchema = z.object({
  otazkaId: z.string().min(1),
  box: z.number().int().min(0).max(4),
  spravneCelkem: z.number().int().min(0),
  spatneCelkem: z.number().int().min(0),
  posledniOdpoved: z.string().min(4),
});

export const progresStudentaSchema = z.object({
  xp: z.number().int().min(0),
  streak: streakSchema,
  questy: z.array(questDenniSchema),
  sbirka: sbirkaSchema,
  avatar: avatarSchema,
  vlastnenaVybava: z.array(z.string().min(1)).default([]),
  statistikyOtazek: z.record(statistikaOtazkySchema),
  rekordy: z.object({
    nejlepsiUspesnost: podil01Schema,
    nejdelsiCombo: z.number().int().min(0),
    nejrychlejsiBezchybnyMs: z.number().min(0).nullable(),
    tydenniXp: z.record(z.number().min(0)),
  }),
  dokonceneTesty: z.number().int().min(0),
  /**
   * Duelová pole (volitelná — starší klienti je neposílají). MUSÍ tu být:
   * zod v defaultním režimu neznámé klíče STRIPUJE a uložený snapshot by
   * o zásobu power-upů a trofejní vitrínu přišel — pull na druhém zařízení
   * by je pak nenávratně smazal.
   */
  powerupy: powerupyProgresuSchema.optional(),
  trofeje: trofejeProfiluSchema.optional(),
  /** ISO čas poslední změny — LWW rozhodčí pullu/POSTu progresu. */
  aktualizovano: isoCasSchema,
});

/**
 * Volitelná identifikace profilu ve studentských POST tělech (rodina sdílí
 * jeden studentský token, profily nemají účty ani e-maily). Chybějící pole
 * = výchozí profil ('vychozi' / 'Student') — zpětná kompatibilita se
 * staršími aplikacemi, které profily neznají.
 */
export const profilTelaSchema = z.object({
  profilId: z.string().min(1).max(64).optional(),
  profilJmeno: z.string().min(1).max(64).optional(),
});

/**
 * Tělo PUT /api/profily/:id — záznam registru profilů (ProfilRegistrZaznam
 * bez profilId, ten nese URL). Neznámá pole zod stripne (default .strip()),
 * takže starší server v klidu přijme i budoucí rozšíření klienta.
 * `predmety` smí být prázdné — klient má vlastní fallback na celý registr.
 */
export const profilRegistrSchema = z.object({
  jmeno: z.string().min(1).max(64),
  barva: z.string().min(1).max(32),
  pinHash: z.string().min(1).max(256).optional(),
  avatar: avatarSchema.optional(),
  predmety: z.array(z.string().min(1).max(64)).max(64),
  aktivniPredmetId: z.string().min(1).max(64),
  /** ISO čas poslední změny — LWW rozhodčí (porovnává se lexikograficky). */
  aktualizovano: isoCasSchema,
});

export function zvalidujProfilRegistr(
  data: unknown,
): (ProfilMetadata & { aktualizovano: string }) | null {
  const v = profilRegistrSchema.safeParse(data);
  return v.success ? (v.data as ProfilMetadata & { aktualizovano: string }) : null;
}

/** Tělo POST /api/vyzvy (výzvu zakládá admin, zbytek doplní server). */
export const novaVyzvaSchema = z.object({
  zprava: z.string().min(1),
  konfigurace: testKonfiguraceSchema,
  cilovaUspesnost: podil01Schema.optional(),
  /** Cílový profil výzvy; bez něj je výzva pro všechny profily. */
  cilovyProfilId: z.string().min(1).max(64).optional(),
});

/** Tělo POST /api/vyzvy/:id/vysledek. */
export const vysledekVyzvySchema = z.object({
  uspesnost: podil01Schema,
  xp: z.number().int().min(0),
});

// --- Duely -----------------------------------------------------------------
// Samotný Duel a jeho výsledek validuje sdílené schéma (sdilene/src/duely.ts);
// tady jsou jen těla requestů, která Duel teprve zakládají nebo mění.

const duelProfilIdSchema = z.string().min(1).max(64);

/**
 * Tělo POST /api/duely. Sadu otázek, handicap i časy doplňuje server —
 * klient posílá jen zadání výzvy. Jména jsou volitelná: server si je jinak
 * dohledá v registru profilů / u snapshotu progresu.
 */
export const novyDuelSchema = z.object({
  predmetId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'predmetId smí obsahovat jen a–z, 0–9 a pomlčky'),
  temataId: z.array(z.string().min(1).max(64)).min(1).max(64).optional(),
  pocetOtazek: z.union([z.literal(5), z.literal(10), z.literal(20)]),
  vyzyvatelProfilId: duelProfilIdSchema,
  vyzyvatelJmeno: z.string().min(1).max(64).optional(),
  /** Bez soupeře je výzva otevřená pro rodinu (první, kdo přijme, hraje). */
  souperProfilId: duelProfilIdSchema.optional(),
  souperJmeno: z.string().min(1).max(64).optional(),
});

/** Tělo POST /api/duely/:id/prijmout. */
export const prijmoutDuelSchema = z.object({
  profilId: duelProfilIdSchema,
  jmeno: z.string().min(1).max(64),
});

/** Tělo POST /api/duely/:id/vysledek — výsledek půlky duelu jednoho hráče. */
export const vysledekDueluTeloSchema = z.object({
  profilId: duelProfilIdSchema,
  vysledek: vysledekDueluSchema,
});

/** Tělo POST /api/generovani/dogenerovat. */
export const dogenerovatSchema = z.object({
  predmetId: z.string().min(1),
  temaId: z.string().min(1),
  obtiznost: obtiznostSchema,
  pocet: z.number().int().min(1).max(20),
});

// Pomůcky s návratem sdíleného typu (stejný vzor jako validujBanku ve sdilene).

export function zvalidujProgres(data: unknown): ProgresStudenta | null {
  const v = progresStudentaSchema.safeParse(data);
  return v.success ? (v.data as ProgresStudenta) : null;
}

export function zvalidujTestVysledek(data: unknown): TestVysledek | null {
  const v = testVysledekSchema.safeParse(data);
  return v.success ? (v.data as TestVysledek) : null;
}

export type NovaVyzva = z.infer<typeof novaVyzvaSchema>;

/**
 * Výzva, jak ji ukládá server: sdílený typ Vyzva + volitelný cíl na profil
 * (serverové rozšíření — do sdíleného kontraktu se dostane s klientskou
 * podporou profilů; starší aplikace pole neznají a ignorují ho).
 */
export type VyzvaZaznam = Vyzva & { cilovyProfilId?: string };
