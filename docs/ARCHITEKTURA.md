# QUESTOR — architektura

Závazný kontrakt systému. Kdo pracuje na kterékoli části, řídí se tímhle
dokumentem; změny kontraktu se dělají NEJDŘÍV tady, pak v kódu.

## Co QUESTOR je

Herní testovací systém pro studenta SŠ (primárně ekonomika a podnikání, ale
obecný pro libovolný obor): admin (Zdeněk) nahraje učivo → Claude z něj
vygeneruje banku testových otázek v obtížnostech 1–5 → aplikace na Windows 11
z banky staví testy a drží studenta psychologickými hooky (XP, streaky, questy,
truhly, sbírka, výzvy). Malý server zajišťuje distribuci bank, sběr progresu
a dogenerování otázek na vyžádání.

## Monorepo

```
questor/
├── sdilene/     @questor/sdilene — typy, zod schémata, gamifikační jádro (ČISTÉ funkce)
├── generator/   @questor/generator — ingest učiva → Claude → banka otázek (CLI + knihovna)
├── server/      @questor/server — Hono API + node:sqlite + admin mini-web
├── aplikace/    @questor/aplikace — React + Vite (desktop shell: Tauri 2, balí se v CI)
├── data/        demo učivo (uciva/) a banky (banky/)
└── docs/        ARCHITEKTURA.md, DESIGN.md, NAVOD.md, NASAZENI.md, VYUKA.md
```

### Konvence (platí všude)

- **Čeština**: UI, dokumentace, komentáře, identifikátory (bez diakritiky v kódu).
- **ESM + TypeScript strict**, žádný build krok mimo aplikaci — server i generátor
  běží přes `tsx`. Typecheck: `npm run typecheck` (root spustí všechny workspaces).
- **Žádné nativní závislosti** — DB je vestavěné `node:sqlite` (`DatabaseSync`), Node ≥ 26.
- **Zod v3** na všechna data překračující hranici procesu (soubor, HTTP, LLM výstup).
  Jediná výjimka: schémata pro structured output Claude
  (`generator/src/llm-schema.ts`) importují `zod/v4`, protože to vyžaduje
  helper `zodOutputFormat` z `@anthropic-ai/sdk` — zbytek systému zůstává na v3
  (ne „opravovat“ llm-schema.ts zpět na v3, rozbilo by to structured output).
- Sdílené typy VŽDY z `@questor/sdilene` — nikdy je neduplikovat.
- Testy: vitest (`test/` v každém workspace). Gamifikační jádro a testový engine
  mají mít slušné pokrytí; náhoda se injektuje (`() => number`), Date se předává.

## Datový kontrakt

Zdroj pravdy: `sdilene/src/typy.ts` + `sdilene/src/schema.ts`.

- **BankaOtazek** `{ predmetId, nazev, verze, vytvoreno, temata[], otazky[] }`
  — verze je inkrementální int; aplikace přijme banku jen s verzí > lokální.
- **Otazka** — diskriminovaná unie podle `typ`:
  `vyber` (1 správná z možností), `multi` (více správných), `anone` (ano/ne),
  `doplneni` (volná odpověď, normalizované porovnání), `prirazovani` (páry).
  Každá má `obtiznost` 1–5, `vysvetleni` (povinné — učí) a volitelný `zdroj`.
- **ProgresStudenta** — XP, streak, questy dne, sbírka, statistiky otázek
  (Leitnerův box 0–4), rekordy. Vlastní ho aplikace, server jen ukládá snapshoty.
- Validace: `validujBanku(json)` ze `sdilene` — používá generátor (výstup),
  server (upload) i aplikace (import demo banky).

## Server — API kontrakt

Hono na portu `QUESTOR_PORT` (default **8787**). DB: `node:sqlite`, soubor
`server/data/questor.db` (složka je v .gitignore). Vše JSON, česky.

**Auth**: hlavička `x-questor-token`. Dva tokeny z env:
`QUESTOR_ADMIN_TOKEN` (default `admin-dev`), `QUESTOR_STUDENT_TOKEN`
(default `student-dev`). Admin token smí všechno studentské. Chybný token → 401
`{ chyba: '…' }`.

**CORS**: aplikace běží na jiném originu (Vite `:5173`, Tauri
`http://tauri.localhost`) a vlastní hlavička tokenu vynucuje preflight —
server proto na všech cestách pouští CORS middleware
(`allowHeaders: content-type, x-questor-token`, origin `*`; autentizaci
nesou tokeny, ne origin).

**Limity těla requestu**: `PUT /api/banky/:predmetId` max 10 MB, ostatní
zapisující endpointy max 2 MB; víc → 413 `{ chyba }` (ochrana proti OOM).

| Metoda a cesta | Role | Tělo / odpověď |
|---|---|---|
| `GET /` | veřejné | redirect na `/admin` |
| `GET /zdravi` | veřejné | `{ ok, verze }` |
| `GET /api/banky` | student | `[{ predmetId, nazev, verze }]` |
| `GET /api/banky/:predmetId` | student | celá `BankaOtazek`; 404 když není |
| `PUT /api/banky/:predmetId` | admin | tělo `BankaOtazek` (validovat! verze musí růst) → `{ ok, verze }` |
| `POST /api/progres` | student | tělo `ProgresStudenta` → `{ ok }` (uloží poslední snapshot) |
| `GET /api/progres` | admin | `{ progres, prijato, level }` nebo 404 (`level` = `stavLevelu(xp)` ze sdílené funkce, ať ho admin web neduplikuje) |
| `POST /api/udalosti` | student | tělo `TestVysledek` → `{ ok }` (append; idempotentní podle `vysledek.id` — duplicitní doručení z retry fronty se tiše ignoruje) |
| `GET /api/udalosti?limit=50` | admin | poslední výsledky testů (nejnovější první) |
| `GET /api/vyzvy` | student | `Vyzva[]` se stavem != `dokoncena` |
| `POST /api/vyzvy` | admin | `{ zprava, konfigurace, cilovaUspesnost? }` → `Vyzva` |
| `POST /api/vyzvy/:id/vysledek` | student | `{ uspesnost, xp }` → `{ ok }` (nastaví `dokoncena`) |
| `POST /api/generovani/dogenerovat` | student | `{ predmetId, temaId, obtiznost, pocet }` → `{ otazky }`; **503** když server nemá `ANTHROPIC_API_KEY` (aplikace to bere jako „funkce vypnutá“, žádná chyba uživateli). Kontext učiva server skládá ze zadání a vysvětlení existujících otázek tématu v bance (zdrojové učivo na serveru není). **Stav: klientská část v aplikaci zatím NENÍ implementovaná (fáze 2)** — hotová je jen serverová půlka včetně 503. |
| `GET /admin` | admin (token zadá stránka) | mini admin web (viz níže) |

DB tabulky: `banky(predmet_id TEXT PK, verze INT, json TEXT)`,
`progres(id INT PK CHECK(id=1), json TEXT, prijato TEXT)`,
`udalosti(id INTEGER PK AUTOINCREMENT, cas TEXT, json TEXT)`,
`vyzvy(id TEXT PK, json TEXT)`.

**Admin mini-web** (`/admin`, jedna HTML stránka servírovaná Honem, styl viz
DESIGN.md): pole na token (uloží localStorage), upload banky (JSON soubor),
přehled progresu studenta (level, XP, streak, poslední testy), formulář na
výzvu. Bez frameworku — vanilla JS + fetch.

Dogenerování volá stejnou knihovnu jako generátor (`@questor/generator`),
poskytovatel `api`.

## Generátor — pipeline

Knihovna + CLI (`npm run generuj -- --vstup <soubor> --predmet <id> --nazev "…" [--poskytovatel api|claude-cli|mock] [--vystup data/banky/<id>.json]`).

1. **Ingest**: `.md`/`.txt` přímo, `.pdf` přes `unpdf` (`extractText`),
   `.docx` přes `mammoth.extractRawText`.
2. **Členění**: podle nadpisů (`#`/`##`) nebo odstavců na kapitoly ~≤ 3000 znaků.
3. **Témata**: 1 volání Claude — z osnovy textu vytvoř seznam `Tema[]`.
4. **Otázky**: pro každé téma × pásmo obtížnosti (1–2, 3, 4–5) dávka otázek
   (mix typů) — 1 volání na dávku, structured output.
5. **Verifikace**: druhý průchod Claudem nad každou dávkou — „zkontroluj klíč
   správnosti a vysvětlení, oprav nebo vyřaď“ (adversarial kontrola kvality).
6. **Sestavení**: id přes `vytvorIdOtazky`, dedup, `validujBanku`, zápis JSON.
   Verze = předchozí verze v cílovém souboru + 1 (jinak 1).

### Claude API (poskytovatel `api`) — ZÁVAZNÉ vzory

- SDK `@anthropic-ai/sdk`, klient `new Anthropic()` (klíč z env
  `ANTHROPIC_API_KEY`, nikde ho nelogovat).
- Model: **`claude-opus-5`** (default, přepínatelný `--model`). Thinking
  neposílat (běží adaptivně samo); `max_tokens: 16000` na dávku.
- Structured output: `client.messages.parse({ …, output_config: { format:
  zodOutputFormat(schema) } })`, helper `zodOutputFormat` z
  `@anthropic-ai/sdk/helpers/zod`; `response.parsed_output` může být null — guard.
- Chyby: typované třídy (`Anthropic.RateLimitError` → retry s pauzou,
  `Anthropic.APIError` → srozumitelná chyba), žádný string-matching.
- Zkontrolovat `stop_reason === 'refusal'` → dávku přeskočit s hláškou.
- **Žádný prefill** asistentovy zprávy (na Opus 5 vrací 400).
- Poskytovatel `claude-cli`: spustí lokální `claude -p <prompt> --output-format json`
  (využije předplatné, bez API klíče); parsovat `result` pole z JSON výstupu,
  a z něj vytěžit JSON blok otázek (instruovat model, ať vrátí ČISTÝ JSON).
- Poskytovatel `mock`: deterministické otázky pro testy pipeline (bez sítě).
- Výběr defaultu: `ANTHROPIC_API_KEY` v env → `api`; jinak existuje-li binárka
  `claude` → `claude-cli`; jinak `mock` + varování.

## Aplikace — architektura

React 19 + Vite, zustand (persist do localStorage, klíč `questor-stav`),
react-router. Struktura `aplikace/src/`:

```
stav/       store.ts (ZMRAZENÝ — skládá slices), testySlice.ts, hraSlice.ts
testy/      engine testu (čistá logika) + komponenty typů otázek
hra/        gamifikační komponenty (XP, streak, questy, truhla, sbírka, avatar, rekordy)
sync/       klient serveru + offline fronta + nastavení připojení
stranky/    Domu, Test, Vysledek, Sbirka, Statistiky, Nastaveni
komponenty/ HudHlavicka + sdílené vizuální prvky
styl/       tokeny.css, global.css (viz DESIGN.md)
data/       demo-banka.json (kopie data/banky/ekonomika-podnikani.json)
```

### Vlastnictví souborů (paralelní práce)

- **APP-TESTY**: `testy/`, `sync/`, `stav/testySlice.ts`, `stranky/Test.tsx`,
  `stranky/Vysledek.tsx`, `stranky/Nastaveni.tsx`.
- **APP-HRA**: `hra/`, `stav/hraSlice.ts`, `komponenty/`, `stranky/Domu.tsx`,
  `stranky/Sbirka.tsx`, `stranky/Statistiky.tsx`.
- ZMRAZENÉ (nikdo nemění bez dohody): `App.tsx`, `main.tsx`, `stav/store.ts`,
  `styl/tokeny.css`.

### Tok testu

1. Domů → volba režimu (`rozcvicka`/`standard`/`hardcore`/`adaptivni`/`zkouska`),
   počtu otázek (5/10/20) a témat → `/test`.
2. Engine vybere otázky `vyberOtazkyDoTestu` (Leitner váhy); adaptivní režim
   posouvá cílovou obtížnost `dalsiObtiznost` po každé odpovědi.
3. Po každé odpovědi: okamžitá zpětná vazba + `vysvetleni`, XP `xpZaOdpoved`
   (combo počítá engine), aktualizace Leitner statistik a questů
   (`aplikujOdpovedNaQuesty`). Režim `zkouska`: bez průběžné zpětné vazby,
   vyhodnocení až na konci, časomíra.
4. Konec → `TestVysledek`, truhla `urciTruhlu` → `/vysledek` (otevírání truhly
   je EVENT — animace, viz DESIGN.md), streak `aktualizujStreakPoAktivite`,
   rekordy, týdenní XP (`pondeliTydne`), sync na server. Jediný zdroj pravdy
   pro odměny truhel je fronta `cekajiciTruhly` v hraSlice: `otevriTruhluAkce`
   bez čekající truhly daného typu vrací `null` a nic neuděluje (ochrana proti
   farmení odměn remountem stránky Výsledek).

### Sync (offline-first)

Aplikace je plně funkční bez serveru (demo banka bundlovaná v `data/`).
`sync/` drží: URL serveru + token (stránka Nastavení, default
`http://localhost:8787`), frontu neodeslaných událostí (localStorage),
při startu a po testu: push progres + události, pull banky (jen vyšší verze),
pull výzvy. Selhání sítě = ticho, žádné chybové hlášky uprostřed hry (jen
nenápadný indikátor stavu připojení v Nastavení a na Domů). Fronta odesílá
at-least-once s exponenciálním odkladem; položku, kterou server trvale odmítá
(4xx mimo 408/429, např. výsledek smazané výzvy), zahodí, aby neblokovala
zbytek fronty. Bundlovaná demo banka se po startu nabízí přes `prijmiBanku`
i proti persistovanému stavu (novější verze z aktualizace aplikace se tak
prosadí i bez serveru).

### Gamifikace — pravidla (implementace ve `sdilene`, UI v `hra/`)

- XP: `xpZaOdpoved(obtiznost, comboKrok)` — 10×obtížnost × combo (max 2×).
  Levely: `stavLevelu(xp)` (křivka 100·n^1.6).
- Streak: den se počítá při ≥ 1 dokončeném testu; `zmrazeni` zachrání 1 den.
- Questy: 3/den, deterministické z data (`vygenerujDenniQuesty`); odměna
  = XP + při splnění všech 3 bronzová truhla navíc.
- Truhly: po testu dle úspěšnosti (≥50 % bronz, ≥70 % stříbro, ≥90 % zlato),
  obsah `otevriTruhlu` (XP / zmrazení / karta, pity timer 3).
- Sbírka: 12 karet „Velikáni ekonomie“ (`KARTY_VELIKANI`) + mistrovské karty
  za témata (`idMistrovskeKarty`, bronz/stříbro/zlato podle zvládnutí tématu:
  podíl otázek tématu v boxu ≥ 3: 50 %/75 %/95 %).
- Rekordy + týdenní XP; výzvy od táty (server) se zobrazují jako speciální
  quest se vzkazem.
- Avatar: SVG s dlouhými vlasy — VÝCHOZÍ A NEODSTRANITELNÉ (mění se jen barva
  a doplňky z truhel). Tohle je záměr, ne bug.

## Ověření (před commitem)

```
npm run typecheck   # všechny workspaces
npm test            # vitest všude, kde jsou testy
npm run build -w aplikace
```

Server: `npm run dev:server` → `curl localhost:8787/zdravi`.
Aplikace: `npm run dev:aplikace` → http://localhost:5173.

## Nasazení a patchování (detail v docs/NASAZENI.md)

- **Server**: jakýkoli Node 26+ hosting / VPS (`npm ci && npm run start -w server`),
  Dockerfile v `server/`. Env: tokeny + volitelně `ANTHROPIC_API_KEY`.
- **Windows aplikace**: Tauri 2 shell (`aplikace/src-tauri/`), build v GitHub
  Actions (windows runner) → NSIS instalátor + updater artefakty; aplikace se
  aktualizuje sama z GitHub Releases. Vývoj na Macu = jen web (`npm run dev:aplikace`).
- **Obsah**: nová banka = `PUT /api/banky/:id` (admin web nebo CLI) — bez
  nového buildu aplikace. Kód aplikace = nový release, auto-update.
