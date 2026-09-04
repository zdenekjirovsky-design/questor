// Zod schémata pro STRUKTUROVANÝ VÝSTUP výukové lekce z Claude (zod/v4 —
// vyžaduje ho helper zodOutputFormat z @anthropic-ai/sdk, viz llm-schema.ts).
// Generuje se po JEDNÉ lekci na volání (kvůli max_tokens 16000). Tvar je
// zjednodušený oproti @questor/sdilene: widgety jsou samostatné hodnoty `typ`
// (widget-tridicka, …), aby unie šla diskriminovat jedním polem; mini-kviz
// otázka je BEZ id a temaId (doplňuje pipeline); srovnávač má vlastnosti jako
// pole dvojic (structured output nemá rád záznamy s volnými klíči).
// Převod na doménový tvar VyukovyBlok dělá pipeline-vyuka.ts.

import { z } from 'zod/v4';
import { llmOtazkaSchema } from './llm-schema';

const svgPole = z
  .string()
  .min(10)
  .describe(
    'Inline SVG začínající „<svg“ s viewBox; jen jednoduché tvary, barvy VÝHRADNĚ currentColor nebo var(--…)',
  );

export const llmBlokSchema = z.discriminatedUnion('typ', [
  z.object({
    typ: z.literal('text'),
    obsah: z
      .string()
      .min(1)
      .describe('Krátký výkladový text: odstavce, **tučné**, odrážky řádky začínající „- “'),
  }),
  z.object({
    typ: z.literal('klicove-pojmy'),
    polozky: z
      .array(z.object({ pojem: z.string().min(1), definice: z.string().min(1) }))
      .min(1)
      .max(10)
      .describe('Klíčové pojmy lekce s krátkými definicemi'),
  }),
  z.object({
    typ: z.literal('obrazek'),
    svg: svgPole,
    popisek: z.string().min(1).describe('Popisek obrázku pod SVG'),
  }),
  z.object({
    typ: z.literal('priklad'),
    zadani: z.string().min(3).describe('Zadání příkladu z praxe'),
    reseni: z.string().min(3).describe('Řešení — zobrazí se po rozkliknutí'),
  }),
  z.object({
    typ: z.literal('karticky'),
    polozky: z
      .array(z.object({ predni: z.string().min(1), zadni: z.string().min(1) }))
      .min(2)
      .max(10)
      .describe('Flashcards: přední strana pojem/otázka, zadní odpověď'),
  }),
  z.object({
    typ: z.literal('mini-kviz'),
    otazka: llmOtazkaSchema.describe('Kontrolní otázka k právě probranému (bez id a temaId)'),
  }),
  z.object({
    typ: z.literal('widget-tridicka'),
    zadani: z.string().min(1),
    kategorie: z
      .array(z.object({ id: z.string().min(1), nazev: z.string().min(1) }))
      .min(2)
      .max(4)
      .describe('Kategorie třídění; id krátké bez diakritiky'),
    polozky: z
      .array(z.object({ text: z.string().min(1), kategorieId: z.string().min(1) }))
      .min(2)
      .max(12)
      .describe('Tříděné položky; kategorieId musí odpovídat některé kategorii'),
  }),
  z.object({
    typ: z.literal('widget-pexeso'),
    dvojice: z
      .array(z.object({ a: z.string().min(1), b: z.string().min(1) }))
      .min(2)
      .max(12)
      .describe('Dvojice pexesa: pojem ↔ definice (krátké texty)'),
  }),
  z.object({
    typ: z.literal('widget-prubeh-procesu'),
    zadani: z.string().min(1),
    kroky: z
      .array(
        z.object({
          nazev: z.string().min(1),
          popis: z.string().min(1),
          ikona: z.string().nullable().describe('Jeden emoji ke kroku, nebo null'),
        }),
      )
      .min(2)
      .max(8)
      .describe('Kroky procesu v pořadí'),
  }),
  z.object({
    typ: z.literal('widget-srovnavac'),
    polozky: z
      .array(
        z.object({
          nazev: z.string().min(1),
          vlastnosti: z
            .array(z.object({ nazev: z.string().min(1), hodnota: z.string().min(1) }))
            .min(1)
            .max(8)
            .describe('Vlastnosti položky; STEJNÉ názvy vlastností u všech položek'),
        }),
      )
      .min(2)
      .max(4)
      .describe('Srovnávané položky (2–4)'),
  }),
]);

export type LlmBlok = z.infer<typeof llmBlokSchema>;

export const llmLekceSchema = z.object({
  nazev: z.string().min(1).describe('Název lekce (krátký, česky)'),
  bloky: z
    .array(llmBlokSchema)
    .min(3)
    .max(14)
    .describe('Bloky lekce v pořadí, v jakém je student projde'),
});

export type LlmLekce = z.infer<typeof llmLekceSchema>;
