// Pipeline režimu --vyuka: témata (sdílená s pipeline banky) → po JEDNÉ lekci
// na volání poskytovatele → převod LLM tvaru na doménový VyukovyBlok (widgety
// z typů widget-*, mini-kviz dostane id + temaId, SVG projde sanitizujSvg) →
// validujVyuku. Verzi určuje volající (CLI ji čte z existujícího souboru).

import {
  otazkaSchema,
  sanitizujSvg,
  validujVyuku,
  vytvorIdOtazky,
  WIDGET_PARAMETRY_SCHEMATA,
  type Lekce,
  type Otazka,
  type Tema,
  type VyukaPredmetu,
  type VyukovyBlok,
  type WidgetId,
  type WidgetParametryMapa,
} from '@questor/sdilene';
import type { Kapitola } from './ingest';
import type { LlmBlok, LlmLekce } from './llm-schema-vyuka';
import { jeKonzistentni, sestavTemata, vyberKontextProTema } from './pipeline';
import type { Poskytovatel } from './poskytovatele/rozhrani';

export interface StatistikyVyuky {
  temat: number;
  lekci: number;
  lekciPreskoceno: number;
  bloku: number;
  blokuVyrazeno: number;
}

export interface VstupPipelineVyuky {
  kapitoly: Kapitola[];
  predmetId: string;
  nazev: string;
  poskytovatel: Poskytovatel;
  /** Verze výuky v cílovém souboru; výsledná verze = předchozí + 1 (jinak 1). */
  predchoziVerze?: number;
  /** Čas vytvoření — injektuje se v testech. */
  nyni?: Date;
  log?: (zprava: string) => void;
}

/** SVG projde sanitizací; použitelné je, jen když po ní pořád začíná <svg. */
function sanitizovanySvg(svg: string): string | null {
  const cisty = sanitizujSvg(svg);
  return /^\s*<svg[\s>]/i.test(cisty) ? cisty : null;
}

/**
 * Převede jeden blok z LLM tvaru na doménový VyukovyBlok. Vrací null, když je
 * blok nepoužitelný (SVG po sanitizaci není SVG, mini-kviz s nekonzistentním
 * klíčem, widget s parametry, které neprojdou schématem) — takový blok se
 * zahazuje, zbytek lekce žije dál.
 */
export function prevedBlok(blok: LlmBlok, tema: Tema): VyukovyBlok | null {
  switch (blok.typ) {
    case 'text':
    case 'klicove-pojmy':
    case 'priklad':
    case 'karticky':
      return blok;

    case 'obrazek': {
      const svg = sanitizovanySvg(blok.svg);
      return svg === null ? null : { typ: 'obrazek', svg, popisek: blok.popisek };
    }

    case 'mini-kviz': {
      const { zdroj, ...zbytek } = blok.otazka;
      const kandidat = {
        ...zbytek,
        ...(zdroj === null ? {} : { zdroj }),
        temaId: tema.id,
        id: vytvorIdOtazky(tema.id, blok.otazka.zadani, blok.otazka.typ),
      };
      const vysledek = otazkaSchema.safeParse(kandidat);
      if (!vysledek.success || !jeKonzistentni(vysledek.data as Otazka)) return null;
      return { typ: 'mini-kviz', otazka: vysledek.data as Otazka };
    }

    case 'widget-tridicka':
      return prevedWidget('tridicka', {
        zadani: blok.zadani,
        kategorie: blok.kategorie,
        polozky: blok.polozky,
      });

    case 'widget-pexeso':
      return prevedWidget('pexeso', { dvojice: blok.dvojice });

    case 'widget-prubeh-procesu':
      return prevedWidget('prubeh-procesu', {
        zadani: blok.zadani,
        kroky: blok.kroky.map(({ nazev, popis, ikona }) => ({
          nazev,
          popis,
          ...(ikona === null ? {} : { ikona }),
        })),
      });

    case 'widget-srovnavac':
      // LLM tvar má vlastnosti jako pole dvojic (structured output nemá rád
      // záznamy s volnými klíči) — doménový tvar chce Record.
      return prevedWidget('srovnavac', {
        polozky: blok.polozky.map((p) => ({
          nazev: p.nazev,
          vlastnosti: Object.fromEntries(p.vlastnosti.map((v) => [v.nazev, v.hodnota])),
        })),
      });
  }
}

function prevedWidget<K extends WidgetId>(
  widgetId: K,
  parametry: WidgetParametryMapa[K],
): VyukovyBlok | null {
  // Schéma jen hlídá platnost (kategorieId, počty, …); tvar drží WidgetParametryMapa.
  const vysledek = WIDGET_PARAMETRY_SCHEMATA[widgetId].safeParse(parametry);
  if (!vysledek.success) return null;
  return { typ: 'widget', widgetId, parametry } as VyukovyBlok;
}

/**
 * Z LLM lekce sestaví doménovou Lekce: převede bloky (nepoužitelné zahodí)
 * a naváže lekci na téma. Vrací lekce: null, když nezbyl žádný blok.
 */
export function sestavLekci(
  llm: LlmLekce,
  tema: Tema,
  poradi: number,
): { lekce: Lekce | null; vyrazeno: number } {
  const bloky: VyukovyBlok[] = [];
  let vyrazeno = 0;
  for (const blok of llm.bloky) {
    const preveden = prevedBlok(blok, tema);
    if (preveden === null) {
      vyrazeno += 1;
    } else {
      bloky.push(preveden);
    }
  }
  if (bloky.length === 0) return { lekce: null, vyrazeno };
  return {
    lekce: { temaId: tema.id, nazev: llm.nazev.trim() || tema.nazev, poradi, bloky },
    vyrazeno,
  };
}

/** Kompletní běh režimu --vyuka nad načtenými kapitolami — vrátí zvalidovanou výuku. */
export async function vygenerujVyuku(
  vstup: VstupPipelineVyuky,
): Promise<{ vyuka: VyukaPredmetu; statistiky: StatistikyVyuky }> {
  const log = vstup.log ?? (() => {});
  const { poskytovatel, kapitoly } = vstup;

  log(`Krok 1/3: extrakce témat (${kapitoly.length} kapitol)…`);
  const nazvyTemat = await poskytovatel.extrahujTemata({
    nazevPredmetu: vstup.nazev,
    kapitoly,
  });
  const temata = sestavTemata(nazvyTemat);
  log(`Témata (${temata.length}): ${temata.map((t) => t.nazev).join(', ')}`);

  const statistiky: StatistikyVyuky = {
    temat: temata.length,
    lekci: 0,
    lekciPreskoceno: 0,
    bloku: 0,
    blokuVyrazeno: 0,
  };

  log(`Krok 2/3: generování lekcí (po jedné na volání, ${temata.length} celkem)…`);
  const lekce: Lekce[] = [];
  for (const [index, tema] of temata.entries()) {
    const oznaceni = `[${index + 1}/${temata.length}] ${tema.nazev}`;
    const kontext = vyberKontextProTema(kapitoly, tema.nazev);
    const surova = await poskytovatel.vygenerujLekci({
      nazevPredmetu: vstup.nazev,
      tema,
      cisloLekce: index + 1,
      celkemLekci: temata.length,
      kontext,
    });
    if (surova === null) {
      statistiky.lekciPreskoceno += 1;
      log(`${oznaceni}: lekce přeskočena.`);
      continue;
    }
    const { lekce: hotova, vyrazeno } = sestavLekci(surova, tema, lekce.length);
    statistiky.blokuVyrazeno += vyrazeno;
    if (hotova === null) {
      statistiky.lekciPreskoceno += 1;
      log(`${oznaceni}: žádný použitelný blok — lekce přeskočena.`);
      continue;
    }
    lekce.push(hotova);
    statistiky.lekci += 1;
    statistiky.bloku += hotova.bloky.length;
    log(
      `${oznaceni}: ${hotova.bloky.length} bloků přijato` +
        (vyrazeno > 0 ? `, ${vyrazeno} vyřazeno` : ''),
    );
  }

  if (lekce.length === 0) {
    throw new Error('Nevznikla žádná použitelná lekce — výuku nelze sestavit.');
  }

  log('Krok 3/3: sestavení a validace výuky…');
  const vyuka = validujVyuku({
    predmetId: vstup.predmetId,
    verze: (vstup.predchoziVerze ?? 0) + 1,
    vytvoreno: (vstup.nyni ?? new Date()).toISOString(),
    lekce,
  });
  return { vyuka, statistiky };
}
