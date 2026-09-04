// Zod schémata pro STRUKTUROVANÝ VÝSTUP z Claude (zod/v4 — vyžaduje ho helper
// zodOutputFormat z @anthropic-ai/sdk). Otázky tu jsou BEZ id a temaId — obojí
// doplňuje pipeline (id přes vytvorIdOtazky ze sdilene). Finální validace
// probíhá schématy z @questor/sdilene, tohle je jen tvar odpovědi modelu.

import { z } from 'zod/v4';

const zakladPole = {
  obtiznost: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe('Obtížnost otázky 1 (nejlehčí) až 5 (nejtěžší)'),
  zadani: z.string().min(3).describe('Text zadání otázky'),
  vysvetleni: z
    .string()
    .min(3)
    .describe('Vysvětlení správné odpovědi — zobrazuje se studentovi, musí učit'),
  zdroj: z
    .string()
    .nullable()
    .describe('Název kapitoly učiva, ze které otázka vychází; null pokud nelze určit'),
};

export const llmOtazkaSchema = z.discriminatedUnion('typ', [
  z.object({
    typ: z.literal('vyber'),
    ...zakladPole,
    moznosti: z.array(z.string().min(1)).min(2).max(6).describe('Nabízené možnosti (2–6)'),
    spravna: z.number().int().min(0).describe('Index jediné správné možnosti (od 0)'),
  }),
  z.object({
    typ: z.literal('multi'),
    ...zakladPole,
    moznosti: z.array(z.string().min(1)).min(3).max(6).describe('Nabízené možnosti (3–6)'),
    spravne: z
      .array(z.number().int().min(0))
      .min(1)
      .describe('Indexy VŠECH správných možností (od 0, bez duplicit)'),
  }),
  z.object({
    typ: z.literal('anone'),
    ...zakladPole,
    spravna: z.boolean().describe('true = tvrzení platí, false = neplatí'),
  }),
  z.object({
    typ: z.literal('doplneni'),
    ...zakladPole,
    spravneOdpovedi: z
      .array(z.string().min(1))
      .min(1)
      .describe('Všechny uznávané varianty odpovědi (krátké, porovnává se bez diakritiky)'),
  }),
  z.object({
    typ: z.literal('prirazovani'),
    ...zakladPole,
    pary: z
      .array(z.object({ levy: z.string().min(1), pravy: z.string().min(1) }))
      .min(2)
      .max(6)
      .describe('Dvojice, které k sobě patří (2–6 párů)'),
  }),
]);

export type LlmOtazka = z.infer<typeof llmOtazkaSchema>;

export const davkaOtazekSchema = z.object({
  otazky: z.array(llmOtazkaSchema).describe('Vygenerované otázky'),
});

export const seznamTematSchema = z.object({
  temata: z
    .array(z.string().min(1))
    .min(1)
    .max(12)
    .describe('Názvy témat učiva v pořadí, v jakém na sebe navazují'),
});
