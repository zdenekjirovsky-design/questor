// Prompty pro generování výukových lekcí — sdílené mezi poskytovateli 'api'
// a 'claude-cli'. Generuje se po JEDNÉ lekci na volání; tvar bloků popisuje
// llm-schema-vyuka.ts ('api' ho vynucuje structured outputem, 'claude-cli'
// dostává textový popis POPIS_TVARU_LEKCE).

import type { Tema } from '@questor/sdilene';
import { POKYN_CISTY_JSON, POPIS_TYPU } from './prompty';

export const SYSTEM_VYUKA =
  'Jsi zkušený středoškolský učitel a tvůrce interaktivních výukových materiálů. ' +
  'Tvoříš lekce v češtině přesně podle dodaného učiva — vizuální, hravé, bez stěn ' +
  'textu. Nikdy si nevymýšlíš fakta, která v učivu nejsou nebo z něj neplynou.';

/** Popis tvaru bloků lekce — do promptu pro oba poskytovatele. */
export const POPIS_BLOKU = `Typy bloků lekce a jejich pole (kromě společného pole "typ"):
- "text": { "obsah" } — krátký výklad: odstavce oddělené prázdným řádkem, **tučné** zvýraznění, odrážky řádky začínající "- ". Žádné stěny textu, max ~6 vět na blok.
- "klicove-pojmy": { "polozky": [{ "pojem", "definice" }] } — klíčové pojmy lekce s krátkými definicemi.
- "obrazek": { "svg", "popisek" } — jednoduchý ilustrační obrázek jako inline SVG.
- "priklad": { "zadani", "reseni" } — příklad z praxe, řešení se studentovi zobrazí po rozkliknutí.
- "karticky": { "polozky": [{ "predni", "zadni" }] } — flashcards: vpředu pojem/otázka, vzadu odpověď.
- "mini-kviz": { "otazka": { … } } — kontrolní otázka k právě probranému; tvar otázky viz popis typů níže, BEZ polí id a temaId.
- "widget-tridicka": { "zadani", "kategorie": [{ "id", "nazev" }], "polozky": [{ "text", "kategorieId" }] } — drag & drop třídění položek do 2–4 kategorií; id kategorií krátká, bez diakritiky; každá položka odkazuje na existující kategorii.
- "widget-pexeso": { "dvojice": [{ "a", "b" }] } — pexeso pojem ↔ definice, 2–12 dvojic, krátké texty.
- "widget-prubeh-procesu": { "zadani", "kroky": [{ "nazev", "popis", "ikona" }] } — kroková animace procesu (2–8 kroků v pořadí); "ikona" je jeden emoji, nebo null.
- "widget-srovnavac": { "polozky": [{ "nazev", "vlastnosti": [{ "nazev", "hodnota" }] }] } — srovnání 2–4 věcí; u všech položek uveď STEJNÉ názvy vlastností.

Pravidla pro SVG (pole "svg"):
- Začni "<svg", uveď viewBox (např. viewBox="0 0 320 180") a xmlns.
- Jen jednoduché tvary: rect, circle, ellipse, line, polyline, polygon, path, text, g.
- Barvy VÝHRADNĚ "currentColor" nebo CSS proměnné var(--…) — ŽÁDNÉ natvrdo hex/named barvy.
- Žádný <script>, <style>, <image>, <foreignObject>, žádné on* atributy, žádné externí odkazy (href jen interní "#id").
- Texty v SVG česky a čitelné (font-size aspoň 12).`;

export function promptLekce(vstup: {
  nazevPredmetu: string;
  tema: Tema;
  cisloLekce: number;
  celkemLekci: number;
  kontext: string;
}): string {
  const { nazevPredmetu, tema, cisloLekce, celkemLekci, kontext } = vstup;
  return `Vytvoř výukovou lekci ${cisloLekce}/${celkemLekci} „${tema.nazev}“ předmětu „${nazevPredmetu}“ pro studenta střední školy.

Cíl: student látku POCHOPÍ dřív, než ji půjde testovat — uč vizuálně a hravě, střídej krátký výklad s interakcí, žádné stěny textu.

Skladba lekce (bloky v poli "bloky" v pořadí, v jakém je student projde):
- Začni krátkým úvodním blokem "text" (proč téma stojí za pozornost, co se student naučí).
- Brzy zařaď "klicove-pojmy" s nejdůležitějšími pojmy lekce.
- Zařaď PRÁVĚ 2 bloky "mini-kviz" — každý až PO výkladu, který otázku zodpovídá.
- Zařaď 1 blok "karticky" (4–8 kartiček) a 1 blok "priklad" z praxe.
- Zařaď aspoň 1 blok "obrazek" s jednoduchým SVG, které látku skutečně ilustruje (schéma, vztah, rozdělení).
- Interaktivní widget (widget-tridicka / widget-pexeso / widget-prubeh-procesu / widget-srovnavac) přidej, JEN když k látce přirozeně sedí — třídění do kategorií, dvojice pojem–definice, proces s kroky, srovnání 2–4 věcí. Když sedí, dej aspoň jeden; nevymýšlej ho násilně.
- Celkem 6–12 bloků.

Obsah vychází VÝHRADNĚ z dodaného učiva. Vše česky.

${POPIS_BLOKU}

${POPIS_TYPU}

Učivo k tématu:
${kontext}`;
}

// ---------------------------------------------------------------------------
// Dodatek pro poskytovatele claude-cli (bez structured outputu)

export const POPIS_TVARU_LEKCE = `${POKYN_CISTY_JSON}
Tvar odpovědi: {"nazev": "Název lekce", "bloky": [{…blok…}, …]} — každý blok přesně s poli popsanými výše (pole "typ" + pole svého typu).`;
