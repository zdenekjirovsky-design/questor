# QUESTOR — herní testovací systém

Osobní projekt Zdeňka — samostatný, nepropojovat s jinými projekty uživatele
(žádné odkazy tam ani zpět).
Aplikace pro Windows 11 pro studenta SŠ: z nahraného učiva (primárně ekonomika
a podnikání, obecně jakýkoli obor) generuje pomocí Claude testové otázky
v obtížnostech 1–5 a interaktivní výukové lekce a drží studenta herními
psychologickými hooky.

## Vstupní bod

1. **Před prací si přečti `docs/ARCHITEKTURA.md`** — závazný kontrakt
   (datové typy, API, pipeline generátoru, vlastnictví souborů).
2. **Před prací na UI si přečti `docs/DESIGN.md`** — závazný vizuální jazyk
   („Noční akademie“, herní juice). UX/UI je priorita č. 1 tohoto projektu.
3. Provozní postupy (nahrání učiva, nasazení, patchování): `docs/NAVOD.md`
   a `docs/NASAZENI.md`. Před tvorbou/úpravou výukového OBSAHU (lekcí)
   navíc `docs/VYUKA.md` — didaktické zásady.

## Mapa

| Složka | Co to je |
|---|---|
| `sdilene/` | typy, zod schémata, gamifikační jádro (čisté funkce + testy) |
| `generator/` | učivo → Claude (`claude-opus-5`) → banka otázek / výuka (`--vyuka`); CLI `npm run generuj` |
| `server/` | Hono API :8787 + node:sqlite + admin mini-web `/admin` |
| `aplikace/` | React + Vite :5173; desktop = Tauri 2 (balí GitHub Actions) |
| `data/` | učivo (`uciva/`), banky otázek (`banky/`) a výuka (`vyuka/`) |

## Pravidla práce

1. Čeština všude (kód bez diakritiky, UI a docs s diakritikou).
2. Dokumentace je součást úkolu — po změně kontraktu aktualizovat
   ARCHITEKTURA.md, po změně vzhledu DESIGN.md. Po úkolu commit.
3. Žádné nativní závislosti (DB = `node:sqlite`); server a generátor běží
   přes `tsx` bez build kroku — kvůli snadnému patchování.
4. Gamifikační logika jen jako čisté funkce ve `sdilene` s testy; náhoda
   a čas se vždy injektují.
5. Ověření před commitem: `npm run typecheck && npm test`
   + `npm run build -w aplikace`.
6. Dev servery: `.claude/launch.json` (questor-aplikace :5173,
   questor-server :8787).
7. API klíče a tokeny jen v env / `.env` (v .gitignore), nikdy v kódu.

## Stav (2026-09-04 — po fázi 3: obsah 1. ročníku + přepínač předmětů)

**Hotové a ověřené** (typecheck 4/4 workspaces, testy 248/248 — sdílené 77,
generátor 32, server 38, aplikace 101; build aplikace OK;
`npx tsx scripts/kontrola-integrace.ts` → 0 chyb):

- fáze 1: sdílené jádro (typy, zod schémata, gamifikace jako čisté funkce),
  generátor bank (ingest `.md/.txt/.pdf/.docx` → témata → otázky →
  verifikační průchod; poskytovatelé `api`/`claude-cli`/`mock`
  s autodetekcí, `--server` upload), server dle kontraktu (CORS, limity,
  idempotentní události, výzvy, admin `/admin`), aplikace (testový engine
  s 5 režimy, XP/levely, streak, questy, truhly, sbírka, avatar, rekordy,
  offline-first sync); vady gamifikace z review opraveny (`18d7e9c`);
- fáze 2 — VÝUKOVÁ ČÁST: typy + schémata + sanitizace SVG
  (`sdilene/src/vyuka.ts`), generátor `--vyuka` (lekce po tématech),
  server `GET/PUT /api/vyuka` + admin sekce Výuka, aplikace `/uceni`
  a `/uceni/:temaId` (LekceViewer, 7 typů bloků, 6 obecných widgetů),
  gamifikace lekcí (XP 40 jen 1× denně, quest „lekce“, streak aktivita),
  deterministické míchání možností odpovědí; opravná dávka
  z adversariálního review (17 nálezů, 16 opraveno);
- fáze 3 — OBSAH 1. ROČNÍKU (obor Ekonomika a podnikání): **13 předmětů**
  bundlovaných v aplikaci, každý s bankou otázek I výukou — celkem
  77 témat, 708 otázek v bankách, 77 lekcí (1 : 1 k tématům),
  154 mini-kvízů, 81 widgetů; obsah podle závazné šablony
  `docs/DIDAKTIKA.md`; křížové kontroly (unikátní `temaId` a id otázek
  napříč předměty, vazby lekcí na témata banky, povolené widgety) drží
  `scripts/kontrola-integrace.ts` + `aplikace/test/predmety.test.ts`;
- přepínač předmětů (`f17fb66`): registr metadat
  `aplikace/src/data/predmety.ts` (id, název, ikona, pořadí), volba
  předmětu jako první krok modalu „Nová výprava“ na Domů i rychlého
  startu na /test; „Učit se“ a Témata ve Statistikách per předmět;
  obsah předmětů MIMO localStorage — lazy async chunky
  (`import.meta.glob` bez eager) + IndexedDB `questor-obsah` pro obsah
  ze serveru (`sync/uloziste.ts`), persist s `partialize` a migrací
  v1→v2 (`stav/migrace.ts`). Počáteční JS chunk 414 kB (gzip 125)
  BEZ obsahu předmětů, obsah = 26 async chunků — dřívější nedostatky
  „přepínač chybí“, „persist bez partialize“ i varování o velikosti
  chunku jsou tím vyřešené.

**Připravené, ale neověřené:**

- Tauri/Windows build — staví se jen v GitHub Actions (na Macu se Rust
  část nekompiluje); repo `zdenekjirovsky-design/questor` a tag `v0.1.0`
  existují, updater pubkey a URL doplněny (`e9ee2a2`) — běh workflow
  `windows-build` a instalaci na Windows je nutné ověřit na GitHubu
  (postup `docs/NASAZENI.md`);
- dogenerování otázek — serverová půlka hotová (bez `ANTHROPIC_API_KEY`
  vrací 503 = „vypnuto“), proti skutečnému Claude API neověřeno;
  klientská část v aplikaci pořád chybí;
- poskytovatelé `api` a `claude-cli` generátoru neověřeny ostrým během
  (testy jedou na `mock`) — platí i pro režim `--vyuka`.

**Další krok:** commit + push obsahové vlny fáze 3, ověřit CI release
(`docs/NASAZENI.md`, krok 3) a nasadit server + nahrát na něj obsah;
poté ostré vygenerování dalšího předmětu přes `api` nebo `claude-cli`.
