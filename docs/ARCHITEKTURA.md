# QUESTOR — architektura

Závazný kontrakt systému. Kdo pracuje na kterékoli části, řídí se tímhle
dokumentem; změny kontraktu se dělají NEJDŘÍV tady, pak v kódu.

## Co QUESTOR je

Herní testovací systém pro studenta SŠ (primárně ekonomika a podnikání, ale
obecný pro libovolný obor): admin (Zdeněk) nahraje učivo → Claude z něj
vygeneruje banku testových otázek v obtížnostech 1–5 → aplikace na Windows 11
z banky staví testy a drží studenta psychologickými hooky (XP, streaky, questy,
truhly, sbírka, výzvy). Fáze 2 přidala VÝUKU: interaktivní lekce po tématech
(texty, SVG, hry, mini-kvízy), kterými se student látku naučí, než ji testuje
(sekce Výuka níže). Malý server zajišťuje distribuci bank i výuky, sběr
progresu a dogenerování otázek na vyžádání.

## Monorepo

```
questor/
├── sdilene/     @questor/sdilene — typy, zod schémata, gamifikační jádro (ČISTÉ funkce)
├── generator/   @questor/generator — ingest učiva → Claude → banka otázek (CLI + knihovna)
├── server/      @questor/server — Hono API + node:sqlite + admin mini-web
├── aplikace/    @questor/aplikace — React + Vite (desktop shell: Tauri 2, balí se v CI)
├── data/        učivo (uciva/), banky (banky/) a výuka (vyuka/) — zdroj pravdy obsahu
├── scripts/     validuj-banku.ts, validuj-vyuku.ts, kontrola-integrace.ts (kontroly z kořene)
└── docs/        ARCHITEKTURA.md, DESIGN.md, DIDAKTIKA.md, NAVOD.md, NASAZENI.md, VYUKA.md
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
- **VyukaPredmetu** `{ predmetId, verze, vytvoreno, lekce[] }` (zdroj pravdy
  `sdilene/src/vyuka.ts`, detail v sekci Výuka níže) — lekce se váže na téma
  banky přes `temaId`, bloky jsou diskriminovaná unie (`text`, `klicove-pojmy`,
  `obrazek` s inline SVG, `priklad`, `karticky`, `mini-kviz`, `widget` se 6
  typy widgetů). SVG se VŽDY čistí přes `sanitizujSvg` a barví tokeny
  (currentColor / var(--…)); sanitizace navíc filtruje hodnoty paint atributů
  (fill/stroke/marker-* jen barva, var(--token) nebo `url(#…)`) a všechna
  interní id prefixuje `svg-`, aby obsah nemohl podvrhnout kotvy stránky.
  Verzování stejné jako u banky. `temaId` lekce i `id` tématu banky jsou slug
  (`^[a-z0-9-]+$`) — temaId je součást routy `/uceni/:temaId`.
- Validace: `validujBanku(json)` / `validujVyuku(json)` ze `sdilene` — používá
  generátor (výstup), server (upload) i aplikace (bundlovaný obsah).

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

**Limity těla requestu**: `PUT /api/banky/:predmetId` a `PUT
/api/vyuka/:predmetId` max 10 MB (content-upload s inline SVG), ostatní
zapisující endpointy max 2 MB; víc → 413 `{ chyba }` (ochrana proti OOM).

| Metoda a cesta | Role | Tělo / odpověď |
|---|---|---|
| `GET /` | veřejné | redirect na `/admin` |
| `GET /zdravi` | veřejné | `{ ok, verze }` |
| `GET /api/banky` | student | `[{ predmetId, nazev, verze }]` |
| `GET /api/banky/:predmetId` | student | celá `BankaOtazek`; 404 když není |
| `PUT /api/banky/:predmetId` | admin | tělo `BankaOtazek` (validovat! verze musí růst) → `{ ok, verze }` |
| `GET /api/vyuka` | student | `[{ predmetId, verze }]` |
| `GET /api/vyuka/:predmetId` | student | celá `VyukaPredmetu`; 404 když není |
| `PUT /api/vyuka/:predmetId` | admin | tělo `VyukaPredmetu` (`validujVyuku`; shoda predmetId URL vs. tělo, jinak 400; verze musí růst, jinak 409) → `{ ok, verze }` |
| `POST /api/progres` | student | tělo `ProgresStudenta` → `{ ok }` (uloží poslední snapshot) |
| `GET /api/progres` | admin | `{ progres, prijato, level }` nebo 404 (`level` = `stavLevelu(xp)` ze sdílené funkce, ať ho admin web neduplikuje) |
| `POST /api/udalosti` | student | tělo `TestVysledek` → `{ ok }` (append; idempotentní podle `vysledek.id` — duplicitní doručení z retry fronty se tiše ignoruje) |
| `GET /api/udalosti?limit=50` | admin | poslední výsledky testů (nejnovější první) |
| `GET /api/vyzvy` | student | `Vyzva[]` se stavem != `dokoncena` |
| `POST /api/vyzvy` | admin | `{ zprava, konfigurace, cilovaUspesnost? }` → `Vyzva` |
| `POST /api/vyzvy/:id/vysledek` | student | `{ uspesnost, xp }` → `{ ok }` (nastaví `dokoncena`) |
| `POST /api/generovani/dogenerovat` | student | `{ predmetId, temaId, obtiznost, pocet }` → `{ otazky }`; **503** když server nemá `ANTHROPIC_API_KEY` (aplikace to bere jako „funkce vypnutá“, žádná chyba uživateli). Kontext učiva server skládá ze zadání a vysvětlení existujících otázek tématu v bance (zdrojové učivo na serveru není). **Stav: klientská část v aplikaci zatím NENÍ implementovaná** — hotová je jen serverová půlka včetně 503. |
| `GET /admin` | admin (token zadá stránka) | mini admin web (viz níže) |

DB tabulky: `banky(predmet_id TEXT PK, verze INT, json TEXT)`,
`vyuka(predmet_id TEXT PK, verze INT, json TEXT)`,
`progres(id INT PK CHECK(id=1), json TEXT, prijato TEXT)`,
`udalosti(id INTEGER PK AUTOINCREMENT, cas TEXT, json TEXT)`,
`vyzvy(id TEXT PK, json TEXT)`.

**Admin mini-web** (`/admin`, jedna HTML stránka servírovaná Honem, styl viz
DESIGN.md): pole na token (uloží localStorage), upload banky a upload výuky
(JSON soubor, sekce Výuka s tabulkou předmět/verze), přehled progresu studenta
(level, XP, streak, poslední testy), formulář na výzvu. Bez frameworku —
vanilla JS + fetch.

Dogenerování volá stejnou knihovnu jako generátor (`@questor/generator`),
poskytovatel `api`.

## Generátor — pipeline

Knihovna + CLI (`npm run generuj -- --vstup <soubor> --predmet <id> --nazev "…" [--poskytovatel api|claude-cli|mock] [--vystup data/banky/<id>.json]`).
Pozor: root skript deleguje do workspace, takže CLI běží s cwd
`generator/` — relativní `--vstup`/`--vystup` se vyhodnocují odtud
(zadávat absolutně, viz docs/NAVOD.md); výchozí výstup bez `--vystup`
míří správně do kořenového `data/banky/`.

Režim `--vyuka`: místo banky vygeneruje `VyukaPredmetu` (po jedné lekci na
volání, structured output `llm-schema-vyuka.ts`, systémový prompt
`prompty-vyuka.ts`); SVG bloků prochází `sanitizujSvg`, mini-kvízy dostávají
id přes `vytvorIdOtazky` a validují se `otazkaSchema`, widgety
`WIDGET_PARAMETRY_SCHEMATA`; výstup default `data/vyuka/<predmet>.json`,
závěrečná validace `validujVyuku`, volitelný PUT na `/api/vyuka/<predmet>`.
Generátor navrhuje jen datové widgety (`tridicka`/`pexeso`/`prubeh-procesu`/
`srovnavac`).

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

React 19 + Vite, zustand (persist do localStorage, klíč `questor-stav`,
verze 2), react-router. Obsah předmětů (banky, výuky) se NEpersistuje
(kvóta localStorage ~5 MB) — drží ho nepersistovaný stav, persist
`partialize`/`migrate` řeší `stav/migrace.ts` (migrace v1→v2 zahazuje
banky/výuky ze starých snapshotů, progres a postup lekcí zachovává).
Struktura `aplikace/src/`:

```
stav/       store.ts (ZMRAZENÝ — skládá slices), testySlice.ts, hraSlice.ts, vyukaSlice.ts
testy/      engine testu (čistá logika) + komponenty typů otázek
hra/        gamifikační komponenty (XP, streak, questy, truhla, sbírka, avatar, rekordy)
vyuka/      Uceni (/uceni), LekceViewer (/uceni/:temaId), bloky/, widgety/, registr.ts
sync/       klient serveru + offline fronta + nastavení připojení
stranky/    Domu, Test, Vysledek, Sbirka, Statistiky, Nastaveni
komponenty/ HudHlavicka + sdílené vizuální prvky
styl/       tokeny.css, global.css (viz DESIGN.md)
data/       predmety.ts (registr předmětů) + nacteniObsahu.ts + predmety/*.json
```

Registr předmětů: `data/predmety.ts` drží ručně psaná metadata VŠECH
očekávaných předmětů (`PREDMETY`: id, nazev, ikona — určují názvy, ikony
a pořadí v UI) a lazy načítání obsahu ze souborů
`data/predmety/<predmetId>.banka.json` / `<predmetId>.vyuka.json` přes
`import.meta.glob` BEZ eager (každý JSON = samostatný async chunk, počáteční
bundle se obsahem nenafukuje; kopie z kořenového `data/`, konvence viz README
ve složce). Předmět se v UI ukáže, jen když jeho banka reálně existuje
(bundle/IndexedDB/server); chybějící soubor je normální stav, vadný se jen
zaloguje a přeskočí. Obsah do store nabízí při startu `data/nacteniObsahu.ts`
(bundle → IndexedDB, verze hlídají `prijmiBanku`/`prijmiVyuku`); obsah
stažený ze serveru cachuje `sync/uloziste.ts` (IndexedDB `questor-obsah`,
bez závislostí, fail-safe). Volba předmětu je první krok modalu „Nová
výprava“ na Domů i rychlého startu na /test; Učit se a sekce Témata ve
Statistikách jsou členěné per předmět. HUD a gamifikace zůstávají globální.
Výukové widgety (6 obecných komponent) žijí ve
`vyuka/widgety/`, UI je bere výhradně přes `vyuka/registr.ts`. Postup lekcí
drží `vyukaSlice` klíčovaný `temaId` — temaId proto NESMÍ kolidovat napříč
předměty a id mini-kvízů (`mk-…`) nesmí kolidovat s id otázek bank (`o-…`);
hlídá to test `aplikace/test/predmety.test.ts`.

Zobrazování možností: `VyberOtazka`, `MultiOtazka` i `PrirazovaniOtazka`
míchají pořadí možností deterministicky podle hashe id otázky
(`testy/komponenty/michani.ts`) — pořadí v datech tak nesmí a nemůže
prozradit klíč (generované banky mívají správnou odpověď na prvním místě);
odpovědi se enginu hlásí vždy v datových indexech. Dokončenou lekci lze
projít znovu (tlačítko „Projít znovu“ → akce `zacniLekciZnovu` vynuluje
dokončené bloky, XP 1× denně dál hlídá `dokonciLekci`); `resetujProgres`
maže i `postupLekci`. Obsah načtený z IndexedDB se při startu revaliduje
(`validujBanku`/`validujVyuku` v `nacteniObsahu.ts`) a nevalidní záznam
(např. z novější verze aplikace po rollbacku) se tiše přeskočí ve
prospěch bundlu.

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

Aplikace je plně funkční bez serveru (obsah všech předmětů bundlovaný
v `data/predmety/` jako lazy chunky, viz registr výše).
`sync/` drží: URL serveru + token (stránka Nastavení, default
`http://localhost:8787`), frontu neodeslaných událostí (localStorage),
při startu a po testu: push progres + události, pull banky i výuky (jen vyšší
verze; pull výuky má vlastní tichý try/catch kvůli starším serverům bez
/api/vyuka), pull výzvy. Selhání sítě = ticho, žádné chybové hlášky uprostřed hry (jen
nenápadný indikátor stavu připojení v Nastavení a na Domů). Fronta odesílá
at-least-once s exponenciálním odkladem; položku, kterou server trvale odmítá
(4xx mimo 408/429, např. výsledek smazané výzvy), zahodí, aby neblokovala
zbytek fronty. Banky a výuky stažené ze serveru (jen vyšší verze) se navíc
ukládají do IndexedDB (`sync/uloziste.ts`), takže přežijí restart aplikace
a při startu přeplácnou bundlovaný obsah, když mají vyšší verzi.

### Gamifikace — pravidla (implementace ve `sdilene`, UI v `hra/`)

- XP: `xpZaOdpoved(obtiznost, comboKrok)` — 10×obtížnost × combo (max 2×).
  Levely: `stavLevelu(xp)` (křivka 100·n^1.6).
- Streak: den se počítá při ≥ 1 dokončeném testu; `zmrazeni` zachrání 1 den.
- Questy: 3/den, deterministické z data (`vygenerujDenniQuesty`); odměna
  = XP + při splnění všech 3 bronzová truhla navíc.
- Truhly: po testu dle úspěšnosti (≥50 % bronz, ≥70 % stříbro, ≥90 % zlato),
  obsah `otevriTruhlu` (XP / zmrazení / karta / výbava avataru; pásma losu
  pKarta+pVybava dle typu truhly, pity timer karet 3; výbava se losuje jen
  z nevlastněných položek `VYBAVA_KATALOG`).
- Sbírka: 12 karet „Velikáni ekonomie“ (`KARTY_VELIKANI`) + mistrovské karty
  za témata (`idMistrovskeKarty`, bronz/stříbro/zlato podle zvládnutí tématu:
  podíl otázek tématu v boxu ≥ 3: 50 %/75 %/95 %).
- Rekordy + týdenní XP; výzvy od táty (server) se zobrazují jako speciální
  quest se vzkazem.
- Avatar: plně přizpůsobitelná SVG postavička — pohlaví, tvar obličeje,
  pleť, barva a střih vlasů (včetně krátkých) v `AvatarKonfigurace`;
  kosmetická výbava z truhel (`VYBAVA_KATALOG`, sloty hlava/oči/krk/pozadí),
  vlastněné kusy v `progres.vlastnenaVybava`, editor na stránce Nastavení
  ukládá akcí `zmenAvatara` — jediné místo zápisu konfigurace; při zápisu
  odfiltruje výbavu, kterou hráč nevlastní (invariant nasazené ⊆ vlastněné).

## Výuka — kontrakt (fáze 2)

Student se učivo nejdřív interaktivně naučí (lekce), pak ho testuje.
Tady je závazný technický kontrakt; DIDAKTICKÉ zásady obsahu lekcí drží
docs/VYUKA.md, provozní postup (vygenerovat → zvalidovat → nahrát)
docs/NAVOD.md. Serverová, generátorová a datová část kontraktu jsou
v příslušných sekcích výše (API `/api/vyuka`, tabulka `vyuka`, režim
`--vyuka`, schémata ve `sdilene/src/vyuka.ts`).

### Lekce a bloky

`Lekce { temaId, nazev, poradi, bloky[] }` — `temaId` je slug tématu banky
(lekce se přes něj váže na téma, `poradi` jde souvisle od 0).
`VyukovyBlok` je diskriminovaná unie:

| typ | obsah |
|---|---|
| `text` | mini-markdown: odstavce, `**tučné**`, odrážky |
| `klicove-pojmy` | `{ pojem, definice }[]` |
| `obrazek` | inline SVG + popisek (VŽDY přes `sanitizujSvg`, barvy tokeny) |
| `priklad` | zadání + rozklikávací řešení |
| `karticky` | flashcards `{ predni, zadni }[]` s otáčením |
| `mini-kviz` | plnohodnotná `Otazka` (id `mk-…`, nesmí kolidovat s bankami) |
| `widget` | `{ widgetId, parametry }` — viz registr níže |

### Widget registr

Komponenty žijí v `aplikace/src/vyuka/widgety/`, UI je bere VÝHRADNĚ přes
`vyuka/registr.ts`. Obsah je DATA (parametry v JSON), komponenty jsou
OBECNÉ — použitelné pro jakýkoli obor. Parametry typuje
`WidgetParametryMapa` a validují `WIDGET_PARAMETRY_SCHEMATA` (sdilene):

| widgetId | Co dělá |
|---|---|
| `tridicka` | drag & drop třídění položek do kategorií, oslava při úspěchu |
| `pexeso` | hra pexeso: pojem ↔ definice |
| `prubeh-procesu` | kroková animace procesu (krok za krokem, zvýraznění) |
| `popisovacka` | SVG s hotspoty — klikni a zjisti, co je co; režim zkoušení |
| `casova-osa` | interaktivní časová osa (klik na událost → detail) |
| `srovnavac` | srovnání 2–4 věcí vedle sebe (přepínání vlastností) |

Všechny widgety: klávesnice + myš, animace dle DESIGN.md
(transform/opacity), splnění hlásí callbackem — kvůli postupu lekce.

### Postup a gamifikace lekcí

- Blok se „odškrtne“ zobrazením/scrollem; mini-kvíz a widget vyžadují
  SPLNĚNÍ. Postup drží `vyukaSlice` (per lekce: dokončené bloky, klíčované
  `temaId`).
- Dokončená lekce: `XP_ZA_LEKCI` (40; jen poprvé v daný den — hlídá
  `dokonciLekci`), počítá se jako aktivita pro streak a plní questy
  (`aplikujLekciNaQuesty`). Quest šablona `lekce`: „Projdi dnes 1 lekci“,
  odměna 60 XP.
- Mistrovství tématu se NEmění — řídí ho výhradně testy. Výuka je cesta,
  test je důkaz.

### UI výuky

- Routy: `/uceni` (přehled lekcí s progresí a doporučením „pokračuj tady“)
  a `/uceni/:temaId` (LekceViewer — bloky pod sebou, plynulé odkrývání,
  lišta postupu; na konci oslava + „Otestuj se z tématu“ → standard,
  10 otázek, jen dané téma — funguje pro kterýkoli předmět + „Projít
  znovu“).
- Nav odkaz „Učit se“ v hlavičce, dlaždice na Domů; u témat v konfiguraci
  testu ikona 📖, když má téma lekci (v kterékoli výuce).

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
- **Obsah**: nová banka = `PUT /api/banky/:id`, nová výuka =
  `PUT /api/vyuka/:id` (admin web nebo CLI) — bez nového buildu aplikace.
  Kód aplikace (a bundlovaný obsah v `aplikace/src/data/`) = nový release,
  auto-update.
