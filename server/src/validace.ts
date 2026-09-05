// Zod schémata pro těla požadavků, která NEJSOU pokrytá sdíleným balíkem
// (banka se validuje přes validujBanku ze @questor/sdilene). Schémata zrcadlí
// typy ze sdilene/src/typy.ts — kontrakt, ne novou pravdu.

import { z } from 'zod';
import type { ProgresStudenta, TestVysledek, Vyzva } from '@questor/sdilene';
import { VYCHOZI_AVATAR } from '@questor/sdilene';

const obtiznostSchema = z.number().int().min(1).max(5);
const podil01Schema = z.number().min(0).max(1);

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
  aktualizovano: z.string().min(4),
});

/** Tělo POST /api/vyzvy (výzvu zakládá admin, zbytek doplní server). */
export const novaVyzvaSchema = z.object({
  zprava: z.string().min(1),
  konfigurace: testKonfiguraceSchema,
  cilovaUspesnost: podil01Schema.optional(),
});

/** Tělo POST /api/vyzvy/:id/vysledek. */
export const vysledekVyzvySchema = z.object({
  uspesnost: podil01Schema,
  xp: z.number().int().min(0),
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
export type VyzvaZaznam = Vyzva;
