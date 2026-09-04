# QUESTOR — výuková část (spec)

Rozšíření systému o VÝUKU: student se učivo nejdřív interaktivně naučí
(obrázky, animace, hry), pak ho testuje. Cíl: co nejsnazší pochopení látky —
vizuálně, hravě, bez stěn textu. Tenhle dokument je závazný kontrakt fáze 2;
po implementaci se klíčové body přenesou do ARCHITEKTURA.md.

## Datový model (sdilene)

```ts
interface VyukaPredmetu {
  predmetId: string;
  verze: number;          // stejná logika jako banka (server přijme jen vyšší)
  vytvoreno: string;
  lekce: Lekce[];
}

interface Lekce {
  temaId: string;         // váže se na téma banky otázek
  nazev: string;
  poradi: number;
  bloky: VyukovyBlok[];
}

type VyukovyBlok =
  | { typ: 'text'; obsah: string }                       // odstavce, **tučné**, odrážky (mini-markdown)
  | { typ: 'klicove-pojmy'; polozky: { pojem: string; definice: string }[] }
  | { typ: 'obrazek'; svg: string; popisek: string }      // inline SVG (generovatelné Claudem)
  | { typ: 'priklad'; zadani: string; reseni: string }    // rozklikávací řešení
  | { typ: 'karticky'; polozky: { predni: string; zadni: string }[] }   // flashcards s otáčením
  | { typ: 'mini-kviz'; otazka: Otazka }                  // inline kontrola pochopení
  | { typ: 'widget'; widgetId: WidgetId; parametry: unknown };  // interaktivní komponenta

type WidgetId = 'tridicka' | 'pexeso' | 'prubeh-procesu' | 'popisovacka' | 'casova-osa' | 'srovnavac';
```

Zod schémata vedle bankaOtazekSchema (`validujVyuku`). SVG bloky se
sanitizují (povolit jen bezpečné elementy — žádné <script>, <foreignObject>,
event handlery) a vykreslují v barvách tokenů (SVG používá currentColor
a CSS proměnné, ne natvrdo barvy).

## Widget registr (aplikace/src/vyuka/widgety/)

Obsah je DATA (parametry v JSON), komponenty jsou OBECNÉ — použitelné pro
jakýkoli obor:

| widgetId | Co dělá | Parametry |
|---|---|---|
| `tridicka` | drag & drop třídění položek do kategorií, oslava při úspěchu | `{ zadani, kategorie: [{id, nazev}], polozky: [{text, kategorieId}] }` |
| `pexeso` | hra pexeso: pojem ↔ definice/obrázek | `{ dvojice: [{a, b}] }` |
| `prubeh-procesu` | kroková animace procesu (krok za krokem, šipky, zvýraznění) | `{ zadani, kroky: [{nazev, popis, ikona?}] }` |
| `popisovacka` | obrázek (SVG) s hotspoty — klikni a zjisti, co je co; režim zkoušení | `{ svg, body: [{x, y, nazev, popis}] }` |
| `casova-osa` | interaktivní časová osa (klik na událost → detail) | `{ udalosti: [{rok, nazev, popis}] }` |
| `srovnavac` | srovnání 2–4 věcí vedle sebe (tabulka s přepínáním vlastností) | `{ polozky: [{nazev, vlastnosti: Record<string,string>}] }` |

Všechny widgety: klávesnice + myš, animace dle DESIGN.md (transform/opacity),
splnění widgetu hlásí callbackem (kvůli postupu lekce).

## Postup a gamifikace

- Lekce má postup: blok se „odškrtne" scrollem/interakcí; mini-kvízy a widgety
  vyžadují splnění. Dokončená lekce = +40 XP (jen poprvé v den), počítá se
  jako aktivita pro streak a plní questy.
- Nová quest šablona `lekce`: „Projdi dnes 1 lekci" (odměna 60 XP).
- Na Domů přibude dlaždice „Učit se" (vede na /uceni); u témat v konfiguraci
  testu se ukazuje, zda má téma lekci.
- Mistrovství tématu se NEmění (řídí ho testy) — výuka je cesta, test je důkaz.

## Aplikace

- Nové routy: `/uceni` (přehled lekcí s progresí a doporučením „pokračuj tady")
  a `/uceni/:temaId` (LekceViewer — bloky pod sebou, plynulé odkrývání,
  lišta postupu, na konci oslava + tlačítko „Otestuj se z tématu" → předvyplněný
  test na dané téma).
- Nav odkaz „Učit se" v hlavičce (App.tsx).
- vyukaSlice: obsah výuky (bundlovaný + ze serveru dle verze), postup lekcí
  (per lekce: dokončené bloky, dokončeno kdy).
- Bundluje se výuka i banka pro VŠECHNY vzorové předměty
  (aplikace/src/data/ — mapa predmetId → {banka, vyuka?}).

## Server

- `GET /api/vyuka` (student) → `[{ predmetId, verze }]`
- `GET /api/vyuka/:predmetId` (student) → VyukaPredmetu, 404 když není
- `PUT /api/vyuka/:predmetId` (admin) → validace + verze musí růst
- DB tabulka `vyuka(predmet_id TEXT PK, verze INT, json TEXT)`; admin web
  dostane upload výuky vedle uploadu banky.

## Generátor

- Nový režim `--vyuka`: z učiva vygeneruje VyukaPredmetu (structured output,
  stejní poskytovatelé). Bloky text/klicove-pojmy/karticky/priklad/mini-kviz
  + jednoduché SVG obrazky; widgety generátor navrhuje jen jako `tridicka`/
  `pexeso`/`prubeh-procesu`/`srovnavac` (datové), `popisovacka`/`casova-osa`
  jen když má smysluplná data. Výstup validovat `validujVyuku`.

## Vzorová sada č. 1: ZBOŽÍZNALSTVÍ (z fotky 4. 9. 2026)

Předmět `zbozinalstvi` („Zbožíznalství"), 5 témat dle dodané osnovy:

1. **Základy zbožíznalství** — jakost a řízení jakosti; systém řízení jakosti;
   historie a úloha jakosti; nástroje a metody řízení jakosti; perspektivy
   v řízení jakosti; škody a ochrana zboží; vlivy působící na zboží; rizika
   v oběhu zboží; ochrana zboží, obaly, obalová technika; zásady správného
   skladování.
2. **Potravinářské zboží** — charakteristika a rozdělení potravinářského
   zboží; složení potravin; zásady racionální výživy; charakteristika potravin
   živočišného, rostlinného a nerostného původu; průmyslová úprava potravin;
   skladování, ošetřování a inovace sortimentu.
3. **Drobné zboží** — charakteristika a rozdělení sortimentu dle účelu
   a materiálu; papírnické zboží; psací a rýsovací potřeby; hračky; sportovní
   potřeby; skladování, ošetřování a inovace sortimentu.
4. **Obuv a kožená galanterie** — charakteristika a rozdělení sortimentu dle
   účelu a materiálu; druhy obuvi; velikosti a číslování obuvi; hodnocení
   obuvi, vady; kožená galanterie; skladování a ošetřování kožedělných
   výrobků, inovace sortimentu.
5. **Textil a odívání** — charakteristika textilního a oděvního zboží;
   základní textilní suroviny a jejich vlastnosti; výroba přízí a nití;
   výroba tkanin, pletenin a netkaných textilií; základní sortiment textilního
   a oděvního zboží; kožešiny.

Dodávky vzorové sady: `data/uciva/zbozinalstvi.md` (plné učivo dle osnovy),
`data/banky/zbozinalstvi.json` (min. 60 otázek, rozložení jako u ekonomiky),
`data/vyuka/zbozinalstvi.json` (5 lekcí; každá: úvodní text, klíčové pojmy,
aspoň 1 SVG obrázek, aspoň 1 interaktivní widget, kartičky, 2 mini-kvízy,
příklad z praxe obchodu). Ukázkové widgety: třídička potravin dle původu,
proces výroby textilu (vlákno → příze → tkanina → oděv), popisovačka částí
boty, pexeso pojmů jakosti, srovnávač druhů obalů, časová osa vývoje řízení
jakosti.
