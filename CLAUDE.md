# QUESTOR — herní testovací systém

Osobní projekt Zdeňka — samostatný, nepropojovat s jinými projekty uživatele
(žádné odkazy tam ani zpět).
Aplikace pro Windows 11 pro studenta SŠ: z nahraného učiva (primárně ekonomika
a podnikání, obecně jakýkoli obor) generuje pomocí Claude testové otázky
v obtížnostech 1–5 a drží studenta herními psychologickými hooky.

## Vstupní bod

1. **Před prací si přečti `docs/ARCHITEKTURA.md`** — závazný kontrakt
   (datové typy, API, pipeline generátoru, vlastnictví souborů).
2. **Před prací na UI si přečti `docs/DESIGN.md`** — závazný vizuální jazyk
   („Noční akademie“, herní juice). UX/UI je priorita č. 1 tohoto projektu.
3. Provozní postupy (nahrání učiva, nasazení, patchování): `docs/NAVOD.md`
   a `docs/NASAZENI.md`.

## Mapa

| Složka | Co to je |
|---|---|
| `sdilene/` | typy, zod schémata, gamifikační jádro (čisté funkce + testy) |
| `generator/` | učivo → Claude (`claude-opus-5`) → banka otázek; CLI `npm run generuj` |
| `server/` | Hono API :8787 + node:sqlite + admin mini-web `/admin` |
| `aplikace/` | React + Vite :5173; desktop = Tauri 2 (balí GitHub Actions) |
| `data/` | učivo (`uciva/`) a banky otázek (`banky/`) |

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

## Stav (2026-09-04 večer)

**Hotové a ověřené** (typecheck 4/4 workspaces, testy 146/146 — sdílené 46,
generátor 23, server 30, aplikace 47; build aplikace OK; E2E serveru 12/12):

- sdílené jádro: typy, zod schémata, gamifikace (čisté funkce) vč. testů;
- generátor: ingest `.md/.txt/.pdf/.docx` → témata → otázky → verifikační
  průchod → validovaná banka; poskytovatelé `api`/`claude-cli`/`mock`
  s autodetekcí, CLI vč. `--server` uploadu;
- server: kompletní API dle kontraktu (CORS, limity těla, idempotentní
  události, výzvy, admin mini-web `/admin`);
- aplikace: testový engine (5 režimů vč. adaptivního a zkoušky), gamifikace
  (XP/levely, streak se zmrazením, denní questy, truhly s ochranou proti
  farmení, sbírka karet, avatar, rekordy), offline-first sync s frontou;
- demo banka „Ekonomika a podnikání“ (verze 2, 9 témat, 72 otázek)
  bundlovaná v aplikaci = plný provoz bez serveru;
- opravná dávka z adversariálního review — 18 nálezů (commit `75c0994`).

**Připravené, ale neověřené:**

- Tauri/Windows build — staví se jen v GitHub Actions (na Macu se Rust část
  nekompiluje); první běh CI je nutné zkontrolovat; v `tauri.conf.json`
  zbývá doplnit updater pubkey a URL repa (postup `docs/NASAZENI.md`);
- dogenerování otázek — serverová půlka hotová (bez `ANTHROPIC_API_KEY`
  vrací 503 = „vypnuto“), proti skutečnému Claude API neověřeno; klientská
  část v aplikaci není (fáze 2);
- poskytovatelé `api` a `claude-cli` generátoru neověřeny ostrým během
  (testy jedou na `mock`).

**Známé nedostatky:**

- aplikace pracuje jen s první bankou — přepínač předmětů v UI chybí;
- `docs/VYUKA.md` je jen spec fáze 2 (výuková část), neimplementováno;
- ve zmrazeném `sdilene/src/gamifikace.ts` dvě nahlášené vady (z review,
  neopraveno kvůli zmrazení): `prahLevelu` ceil vs. `levelZXp` může dát
  záporné `xpVLevelu` na hranici levelu; při plné sbírce se pásmo karty
  v `otevriTruhlu` přelévá do zmrazení místo XP.

**Další krok:** založit GitHub repo, doplnit updater klíče a vydat první
release přes CI (`docs/NASAZENI.md`); pak ostré vygenerování banky přes
API nebo `claude-cli` a nasazení serveru.
