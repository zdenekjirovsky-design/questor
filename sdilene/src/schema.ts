// Zod schémata pro validaci banky otázek — používá generátor (výstup z Claude),
// server (upload banky) i aplikace (import demo banky).

import { z } from 'zod';
import type { BankaOtazek } from './typy';

const obtiznostSchema = z.number().int().min(1).max(5);

const otazkaZakladSchema = z.object({
  id: z.string().min(1),
  temaId: z.string().min(1),
  obtiznost: obtiznostSchema,
  zadani: z.string().min(3),
  vysvetleni: z.string().min(3),
  zdroj: z.string().optional(),
});

const otazkaVyberSchema = otazkaZakladSchema.extend({
  typ: z.literal('vyber'),
  moznosti: z.array(z.string().min(1)).min(2).max(6),
  spravna: z.number().int().min(0),
});

const otazkaMultiSchema = otazkaZakladSchema.extend({
  typ: z.literal('multi'),
  moznosti: z.array(z.string().min(1)).min(3).max(6),
  spravne: z.array(z.number().int().min(0)).min(1),
});

const otazkaAnoNeSchema = otazkaZakladSchema.extend({
  typ: z.literal('anone'),
  spravna: z.boolean(),
});

const otazkaDoplneniSchema = otazkaZakladSchema.extend({
  typ: z.literal('doplneni'),
  spravneOdpovedi: z.array(z.string().min(1)).min(1),
});

const otazkaPrirazovaniSchema = otazkaZakladSchema.extend({
  typ: z.literal('prirazovani'),
  pary: z.array(z.object({ levy: z.string().min(1), pravy: z.string().min(1) })).min(2).max(6),
});

export const otazkaSchema = z.discriminatedUnion('typ', [
  otazkaVyberSchema,
  otazkaMultiSchema,
  otazkaAnoNeSchema,
  otazkaDoplneniSchema,
  otazkaPrirazovaniSchema,
]);

export const temaSchema = z.object({
  // Slug — temaId se stava soucasti routy /uceni/:temaId, znaky jako `/`,
  // `?` ci `#` by URL rozbily (lekce by byla nedosazitelna).
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, 'id tématu smí obsahovat jen a–z, 0–9 a pomlčky'),
  nazev: z.string().min(1),
  poradi: z.number().int().min(0),
});

export const bankaOtazekSchema = z
  .object({
    predmetId: z.string().min(1).regex(/^[a-z0-9-]+$/, 'predmetId smí obsahovat jen a–z, 0–9 a pomlčky'),
    nazev: z.string().min(1),
    verze: z.number().int().min(1),
    vytvoreno: z.string().min(4),
    temata: z.array(temaSchema).min(1),
    otazky: z.array(otazkaSchema).min(1),
  })
  .superRefine((banka, ctx) => {
    const temataIds = new Set(banka.temata.map((t) => t.id));
    const videnaId = new Set<string>();
    banka.otazky.forEach((o, i) => {
      if (!temataIds.has(o.temaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['otazky', i, 'temaId'],
          message: `Otázka odkazuje na neexistující téma „${o.temaId}“`,
        });
      }
      if (videnaId.has(o.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['otazky', i, 'id'],
          message: `Duplicitní id otázky „${o.id}“`,
        });
      }
      videnaId.add(o.id);
      if (o.typ === 'vyber' && o.spravna >= o.moznosti.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['otazky', i, 'spravna'],
          message: 'Index správné odpovědi ukazuje mimo možnosti',
        });
      }
      if (o.typ === 'multi') {
        if (o.spravne.some((s) => s >= o.moznosti.length)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['otazky', i, 'spravne'],
            message: 'Index správné odpovědi ukazuje mimo možnosti',
          });
        }
        if (new Set(o.spravne).size !== o.spravne.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['otazky', i, 'spravne'],
            message: 'Duplicitní indexy správných odpovědí',
          });
        }
      }
    });
  });

/** Zvaliduje neznámý JSON jako banku otázek. Vyhodí chybu se srozumitelným výpisem. */
export function validujBanku(data: unknown): BankaOtazek {
  const vysledek = bankaOtazekSchema.safeParse(data);
  if (!vysledek.success) {
    const radky = vysledek.error.issues
      .slice(0, 20)
      .map((i) => `  – ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Banka otázek neprošla validací:\n${radky}`);
  }
  return vysledek.data as BankaOtazek;
}

/** Stabilní id otázky odvozené z obsahu (djb2). */
export function vytvorIdOtazky(temaId: string, zadani: string, typ: string): string {
  let h = 5381;
  const s = `${temaId}|${typ}|${zadani}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return `o-${h.toString(36)}`;
}
