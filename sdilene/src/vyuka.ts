// Výuková část QUESTORu — typy, zod schémata a sanitizace SVG.
// Kontrakt fáze 2 (docs/VYUKA.md): student se učivo nejdřív interaktivně naučí,
// pak ho testuje. Obsah je DATA (JSON), komponenty v aplikaci jsou OBECNÉ.

import { z } from 'zod';
import type { Otazka } from './typy';
import { otazkaSchema } from './schema';

// ---------------------------------------------------------------------------
// Widgety — id a TYPOVANÉ parametry (aplikace je importuje pro komponenty)

export type WidgetId =
  | 'tridicka'
  | 'pexeso'
  | 'prubeh-procesu'
  | 'popisovacka'
  | 'casova-osa'
  | 'srovnavac';

/** Drag & drop třídění položek do kategorií (oslava při úspěchu). */
export interface TridickaParametry {
  zadani: string;
  kategorie: { id: string; nazev: string }[];
  polozky: { text: string; kategorieId: string }[];
}

/** Hra pexeso: pojem ↔ definice/obrázek. */
export interface PexesoParametry {
  dvojice: { a: string; b: string }[];
}

/** Kroková animace procesu (krok za krokem, šipky, zvýraznění). */
export interface PrubehProcesuParametry {
  zadani: string;
  kroky: { nazev: string; popis: string; ikona?: string }[];
}

/** Obrázek (SVG) s hotspoty — klikni a zjisti, co je co; režim zkoušení. */
export interface PopisovackaParametry {
  svg: string;
  body: { x: number; y: number; nazev: string; popis: string }[];
}

/** Interaktivní časová osa (klik na událost → detail). */
export interface CasovaOsaParametry {
  udalosti: { rok: number; nazev: string; popis: string }[];
}

/** Srovnání 2–4 věcí vedle sebe (tabulka s přepínáním vlastností). */
export interface SrovnavacParametry {
  polozky: { nazev: string; vlastnosti: Record<string, string> }[];
}

/** Mapa widgetId → typ parametrů (pro generické komponenty a registry). */
export interface WidgetParametryMapa {
  tridicka: TridickaParametry;
  pexeso: PexesoParametry;
  'prubeh-procesu': PrubehProcesuParametry;
  popisovacka: PopisovackaParametry;
  'casova-osa': CasovaOsaParametry;
  srovnavac: SrovnavacParametry;
}

// ---------------------------------------------------------------------------
// Výukové bloky (diskriminovaná unie podle `typ`)

/** Odstavce, **tučné**, odrážky (mini-markdown). */
export interface VyukovyBlokText {
  typ: 'text';
  obsah: string;
}

export interface VyukovyBlokKlicovePojmy {
  typ: 'klicove-pojmy';
  polozky: { pojem: string; definice: string }[];
}

/** Inline SVG (generovatelné Claudem) — před vykreslením VŽDY prohnat sanitizujSvg. */
export interface VyukovyBlokObrazek {
  typ: 'obrazek';
  svg: string;
  popisek: string;
}

/** Rozklikávací řešení. */
export interface VyukovyBlokPriklad {
  typ: 'priklad';
  zadani: string;
  reseni: string;
}

/** Flashcards s otáčením. */
export interface VyukovyBlokKarticky {
  typ: 'karticky';
  polozky: { predni: string; zadni: string }[];
}

/** Inline kontrola pochopení. */
export interface VyukovyBlokMiniKviz {
  typ: 'mini-kviz';
  otazka: Otazka;
}

/**
 * Interaktivní komponenta. Typ je diskriminovaný i podle `widgetId`, takže po
 * zúžení (`blok.widgetId === 'tridicka'`) jsou `parametry` plně typované —
 * validaci proti schématu zajišťuje `validujVyuku`.
 */
export type VyukovyBlokWidget = {
  [K in WidgetId]: { typ: 'widget'; widgetId: K; parametry: WidgetParametryMapa[K] };
}[WidgetId];

export type VyukovyBlok =
  | VyukovyBlokText
  | VyukovyBlokKlicovePojmy
  | VyukovyBlokObrazek
  | VyukovyBlokPriklad
  | VyukovyBlokKarticky
  | VyukovyBlokMiniKviz
  | VyukovyBlokWidget;

export interface Lekce {
  /** Váže se na téma banky otázek. */
  temaId: string;
  nazev: string;
  poradi: number;
  bloky: VyukovyBlok[];
}

export interface VyukaPredmetu {
  predmetId: string;
  /** Stejná logika jako banka — server přijme jen vyšší verzi. */
  verze: number;
  vytvoreno: string; // ISO datum
  lekce: Lekce[];
}

// ---------------------------------------------------------------------------
// Zod schémata parametrů widgetů

const svgRetezecSchema = z
  .string()
  .refine((s) => /^\s*<svg[\s>]/i.test(s), 'SVG musí začínat elementem <svg>');

export const tridickaParametrySchema = z
  .object({
    zadani: z.string().min(1),
    kategorie: z.array(z.object({ id: z.string().min(1), nazev: z.string().min(1) })).min(2),
    polozky: z.array(z.object({ text: z.string().min(1), kategorieId: z.string().min(1) })).min(2),
  })
  .superRefine((p, ctx) => {
    const ids = new Set(p.kategorie.map((k) => k.id));
    if (ids.size !== p.kategorie.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kategorie'], message: 'Duplicitní id kategorií' });
    }
    p.polozky.forEach((pol, i) => {
      if (!ids.has(pol.kategorieId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['polozky', i, 'kategorieId'],
          message: `Položka odkazuje na neexistující kategorii „${pol.kategorieId}“`,
        });
      }
    });
  });

export const pexesoParametrySchema = z.object({
  dvojice: z.array(z.object({ a: z.string().min(1), b: z.string().min(1) })).min(2).max(12),
});

export const prubehProcesuParametrySchema = z.object({
  zadani: z.string().min(1),
  kroky: z
    .array(
      z.object({
        nazev: z.string().min(1),
        popis: z.string().min(1),
        ikona: z.string().min(1).optional(),
      }),
    )
    .min(2),
});

export const popisovackaParametrySchema = z.object({
  svg: svgRetezecSchema,
  body: z
    .array(
      z.object({
        x: z.number().finite(),
        y: z.number().finite(),
        nazev: z.string().min(1),
        popis: z.string().min(1),
      }),
    )
    .min(1),
});

export const casovaOsaParametrySchema = z.object({
  udalosti: z
    .array(
      z.object({
        rok: z.number().int(),
        nazev: z.string().min(1),
        popis: z.string().min(1),
      }),
    )
    .min(2),
});

export const srovnavacParametrySchema = z.object({
  polozky: z
    .array(
      z.object({
        nazev: z.string().min(1),
        vlastnosti: z
          .record(z.string().min(1))
          .refine((v) => Object.keys(v).length > 0, 'Položka musí mít aspoň jednu vlastnost'),
      }),
    )
    .min(2)
    .max(4),
});

export const widgetIdSchema = z.enum([
  'tridicka',
  'pexeso',
  'prubeh-procesu',
  'popisovacka',
  'casova-osa',
  'srovnavac',
]);

/** Schéma parametrů pro každý widget — používá validace i případný editor obsahu. */
export const WIDGET_PARAMETRY_SCHEMATA: Record<WidgetId, z.ZodTypeAny> = {
  tridicka: tridickaParametrySchema,
  pexeso: pexesoParametrySchema,
  'prubeh-procesu': prubehProcesuParametrySchema,
  popisovacka: popisovackaParametrySchema,
  'casova-osa': casovaOsaParametrySchema,
  srovnavac: srovnavacParametrySchema,
};

// ---------------------------------------------------------------------------
// Zod schémata bloků, lekcí a celé výuky

const blokTextSchema = z.object({ typ: z.literal('text'), obsah: z.string().min(1) });

const blokKlicovePojmySchema = z.object({
  typ: z.literal('klicove-pojmy'),
  polozky: z.array(z.object({ pojem: z.string().min(1), definice: z.string().min(1) })).min(1),
});

const blokObrazekSchema = z.object({
  typ: z.literal('obrazek'),
  svg: svgRetezecSchema,
  popisek: z.string().min(1),
});

const blokPrikladSchema = z.object({
  typ: z.literal('priklad'),
  zadani: z.string().min(3),
  reseni: z.string().min(3),
});

const blokKartickySchema = z.object({
  typ: z.literal('karticky'),
  polozky: z.array(z.object({ predni: z.string().min(1), zadni: z.string().min(1) })).min(2),
});

const blokMiniKvizSchema = z.object({ typ: z.literal('mini-kviz'), otazka: otazkaSchema });

// Parametry se tady validují jen jako `unknown`; konkrétní schéma podle widgetId
// aplikuje superRefine na vyukaPredmetuSchema (zod v3 neumí ZodEffects jako
// větev diskriminované unie).
const blokWidgetSchema = z.object({
  typ: z.literal('widget'),
  widgetId: widgetIdSchema,
  parametry: z.unknown(),
});

export const vyukovyBlokSchema = z.discriminatedUnion('typ', [
  blokTextSchema,
  blokKlicovePojmySchema,
  blokObrazekSchema,
  blokPrikladSchema,
  blokKartickySchema,
  blokMiniKvizSchema,
  blokWidgetSchema,
]);

export const lekceSchema = z.object({
  // Stejny slug jako predmetId/tema banky — temaId je soucast routy
  // /uceni/:temaId (Link se nestara o escapovani, `/` ci `#` by routu rozbily).
  temaId: z.string().min(1).regex(/^[a-z0-9-]+$/, 'temaId smí obsahovat jen a–z, 0–9 a pomlčky'),
  nazev: z.string().min(1),
  poradi: z.number().int().min(0),
  bloky: z.array(vyukovyBlokSchema).min(1),
});

export const vyukaPredmetuSchema = z
  .object({
    predmetId: z.string().min(1).regex(/^[a-z0-9-]+$/, 'predmetId smí obsahovat jen a–z, 0–9 a pomlčky'),
    verze: z.number().int().min(1),
    vytvoreno: z.string().min(4),
    lekce: z.array(lekceSchema).min(1),
  })
  .superRefine((vyuka, ctx) => {
    const videnaTemata = new Set<string>();
    vyuka.lekce.forEach((lekce, i) => {
      if (videnaTemata.has(lekce.temaId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lekce', i, 'temaId'],
          message: `Duplicitní lekce pro téma „${lekce.temaId}“`,
        });
      }
      videnaTemata.add(lekce.temaId);

      lekce.bloky.forEach((blok, j) => {
        if (blok.typ === 'widget') {
          const schema = WIDGET_PARAMETRY_SCHEMATA[blok.widgetId];
          const vysledek = schema.safeParse(blok.parametry);
          if (!vysledek.success) {
            for (const issue of vysledek.error.issues.slice(0, 5)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['lekce', i, 'bloky', j, 'parametry', ...issue.path],
                message: `Widget „${blok.widgetId}“: ${issue.message}`,
              });
            }
          }
        }
        if (blok.typ === 'mini-kviz') {
          const o = blok.otazka;
          const cesta = ['lekce', i, 'bloky', j, 'otazka'];
          if (o.typ === 'vyber' && o.spravna >= o.moznosti.length) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [...cesta, 'spravna'],
              message: 'Index správné odpovědi ukazuje mimo možnosti',
            });
          }
          if (o.typ === 'multi') {
            if (o.spravne.some((s) => s >= o.moznosti.length)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [...cesta, 'spravne'],
                message: 'Index správné odpovědi ukazuje mimo možnosti',
              });
            }
            if (new Set(o.spravne).size !== o.spravne.length) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: [...cesta, 'spravne'],
                message: 'Duplicitní indexy správných odpovědí',
              });
            }
          }
        }
      });
    });
  });

/** Zvaliduje neznámý JSON jako výuku předmětu. Vyhodí chybu se srozumitelným výpisem. */
export function validujVyuku(data: unknown): VyukaPredmetu {
  const vysledek = vyukaPredmetuSchema.safeParse(data);
  if (!vysledek.success) {
    const radky = vysledek.error.issues
      .slice(0, 20)
      .map((i) => `  – ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Výuka předmětu neprošla validací:\n${radky}`);
  }
  return vysledek.data as VyukaPredmetu;
}

// ---------------------------------------------------------------------------
// Sanitizace SVG — čistý řetězcový průchod, bez závislosti na DOM.
// Whitelist elementů a atributů; všechno nepovolené se ZAHAZUJE (nepovolený
// element včetně celého obsahu). Event handlery (on*) a odkazy mimo interní
// kotvy (#id) neprojdou nikdy.

const POVOLENE_ELEMENTY = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'marker', 'lineargradient', 'radialgradient', 'stop', 'title',
]);

const POVOLENE_ATRIBUTY = new Set([
  // identifikace a přístupnost
  'id', 'class', 'role', 'aria-label', 'aria-hidden', 'lang',
  // geometrie
  'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'width', 'height', 'viewbox', 'transform', 'preserveaspectratio', 'dx', 'dy', 'rotate',
  // vzhled (barvy přes currentColor / var(--token), viz DESIGN.md)
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap',
  'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'stroke-opacity', 'opacity', 'paint-order', 'vector-effect',
  // text
  'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing',
  // gradienty a markery
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform',
  'spreadmethod', 'marker-start', 'marker-mid', 'marker-end', 'markerwidth',
  'markerheight', 'refx', 'refy', 'orient', 'markerunits',
  // kořen dokumentu
  'xmlns', 'xmlns:xlink', 'version',
  // odkazy — POUZE interní kotvy #id (gradienty, markery), hlídá se zvlášť
  'href', 'xlink:href',
]);

// Atributová část je líná, aby nespolkla ukončovací lomítko samouzavíracích tagů.
const TAG_RE = /<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:_-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>/g;
const ATRIBUT_RE = /([a-zA-Z_][a-zA-Z0-9_:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'<>]+))?/g;

// Atributy nesoucí „paint" hodnotu — smí obsahovat jen bezpečný vzor (barva,
// token, interní url(#…)); url(javascript:…) ani url(https://…) neprojde.
const PAINT_ATRIBUTY = new Set(['fill', 'stroke', 'stop-color', 'marker-start', 'marker-mid', 'marker-end']);
const BEZPECNY_PAINT_RE = /^(?:currentColor|none|transparent|inherit|var\(--[\w-]+\)|#[0-9a-fA-F]{3,8}|url\(#[\w.-]+\)|[a-zA-Z]+)$/;

// Prefix interních id — SVG z obsahu nesmí podvrhnout kotvy stránky
// (např. `lekce-zaver`, na kterou cílí scroll LekceVieweru).
const PREFIX_ID = 'svg-';

function zneskodniText(text: string): string {
  // Osamocené `<` v textu (nezparsované jako tag) nesmí projít do výstupu syrové.
  return text.replace(/</g, '&lt;');
}

function zneskodniHodnotu(hodnota: string): string {
  return hodnota.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function sanitizujAtributy(surove: string): string {
  let vystup = '';
  for (const m of surove.matchAll(ATRIBUT_RE)) {
    const nazev = m[1];
    const hodnota = m[2]; // vč. případných uvozovek, nebo undefined
    const maly = nazev.toLowerCase();
    if (maly.startsWith('on')) continue; // event handlery nikdy
    if (!POVOLENE_ATRIBUTY.has(maly)) continue;
    const cista = (hodnota ?? '').replace(/^["']|["']$/g, '').trim();
    if (maly === 'href' || maly === 'xlink:href') {
      if (!cista.startsWith('#')) continue; // jen interní kotvy — žádné javascript:, data:, http:
      vystup += ` ${nazev}="#${PREFIX_ID}${zneskodniHodnotu(cista.slice(1))}"`;
      continue;
    }
    if (maly === 'id') {
      vystup += ` ${nazev}="${PREFIX_ID}${zneskodniHodnotu(cista)}"`;
      continue;
    }
    if (PAINT_ATRIBUTY.has(maly)) {
      if (!BEZPECNY_PAINT_RE.test(cista)) continue; // nebezpečná/exotická hodnota → atribut pryč
      vystup += ` ${nazev}="${cista.replace(/^url\(#/, `url(#${PREFIX_ID}`)}"`;
      continue;
    }
    vystup += hodnota === undefined ? ` ${nazev}` : ` ${nazev}=${hodnota}`;
  }
  return vystup;
}

/**
 * Sanitizuje SVG řetězec: ponechá jen whitelistované elementy a atributy.
 * Nepovolený element se zahodí VČETNĚ obsahu (script, foreignObject, style, …),
 * on* atributy a href mimo interní kotvy `#id` se zahodí vždy. Paint atributy
 * (fill, stroke, stop-color, marker-*) projdou jen s bezpečnou hodnotou
 * (barva, var(--token), url(#id)) a všechna interní id se prefixují `svg-`,
 * aby obsah nemohl podvrhnout kotvy stránky. Čistý regexový průchod —
 * funguje v Node i v prohlížeči bez DOM.
 */
export function sanitizujSvg(svg: string): string {
  // Komentáře, CDATA, DOCTYPE a procesní instrukce pryč (i neuzavřené).
  const bezMetaznaku = svg
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?(?:\]\]>|$)/g, '')
    .replace(/<![^>]*>/g, '')
    .replace(/<\?[\s\S]*?(?:\?>|$)/g, '');

  let vysledek = '';
  let posledni = 0;
  let zahazovanyElement: string | null = null; // uvnitř nepovoleného podstromu
  let hloubkaZahazovani = 0;

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(bezMetaznaku)) !== null) {
    if (!zahazovanyElement) {
      vysledek += zneskodniText(bezMetaznaku.slice(posledni, m.index));
    }
    posledni = TAG_RE.lastIndex;

    const zaviraci = m[1] === '/';
    const nazev = m[2];
    const maly = nazev.toLowerCase();
    const atributy = m[3];
    const samouzaviraci = m[4] === '/';

    if (zahazovanyElement) {
      // Uvnitř zahazovaného podstromu jen počítáme hloubku stejnojmenných tagů.
      if (maly === zahazovanyElement) {
        if (zaviraci) {
          hloubkaZahazovani -= 1;
          if (hloubkaZahazovani === 0) zahazovanyElement = null;
        } else if (!samouzaviraci) {
          hloubkaZahazovani += 1;
        }
      }
      continue;
    }

    if (!POVOLENE_ELEMENTY.has(maly)) {
      if (!zaviraci && !samouzaviraci) {
        zahazovanyElement = maly;
        hloubkaZahazovani = 1;
      }
      continue; // samotný tag se zahazuje vždy
    }

    if (zaviraci) {
      vysledek += `</${nazev}>`;
    } else {
      vysledek += `<${nazev}${sanitizujAtributy(atributy)}${samouzaviraci ? ' /' : ''}>`;
    }
  }

  if (!zahazovanyElement) {
    vysledek += zneskodniText(bezMetaznaku.slice(posledni));
  }
  return vysledek;
}
