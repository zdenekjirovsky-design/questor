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

## Stav (2026-09-04 pozdě večer — po fázi 2)

**Hotové a ověřené** (typecheck 4/4 workspaces, testy 233/233 — sdílené 77,
generátor 32, server 38, aplikace 86; build aplikace OK; E2E serveru vč.
`/api/vyuka`):

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
  deterministické míchání možností odpovědí (pořadí v datech neprozradí
  klíč);
- dva vzorové předměty bundlované v aplikaci = plný provoz bez serveru:
  „Ekonomika a podnikání“ (banka v2, 9 témat, 72 otázek) a „Zbožíznalství“
  (banka v1, 5 témat, 65 otázek + výuka v2, 5 lekcí);
- opravná dávka z adversariálního review fáze 2: 17 nálezů, 16 opraveno
  (mj. míchání možností, věcné opravy obsahu, tvrdší sanitizace SVG,
  opakování lekce), 1 odložen (persist bez partialize — viz nedostatky).

**Připravené, ale neověřené:**

- Tauri/Windows build — staví se jen v GitHub Actions (na Macu se Rust část
  nekompiluje); první běh CI je nutné zkontrolovat; v `tauri.conf.json`
  zbývá doplnit updater pubkey a URL repa (postup `docs/NASAZENI.md`);
- dogenerování otázek — serverová půlka hotová (bez `ANTHROPIC_API_KEY`
  vrací 503 = „vypnuto“), proti skutečnému Claude API neověřeno; klientská
  část v aplikaci pořád chybí;
- poskytovatelé `api` a `claude-cli` generátoru neověřeny ostrým během
  (testy jedou na `mock`) — platí i pro režim `--vyuka`; bundlovaná výuka
  Zbožíznalství vznikla ručně jako vzor.

**Známé nedostatky:**

- přepínač předmětů v UI chybí — konfigurace testu na Domů pracuje jen
  s PRVNÍ bankou (ekonomika); lekce všech předmětů a „Otestuj se z tématu“
  z konce lekce ale fungují pro každý předmět;
- zustand persist ukládá celý stav bez `partialize` (do `questor-stav` se
  persistuje i obsah bank a výuky) — odloženo z review jako samostatný
  úkol (oddělený klíč obsahu + migrace persistu);
- Vite varování o velikosti JS chunku (~530 kB) trvá z fáze 1.

**Další krok:** založit GitHub repo, doplnit updater klíče a vydat první
release přes CI (`docs/NASAZENI.md`); pak ostré vygenerování banky a výuky
přes `api` nebo `claude-cli` a nasazení serveru.
