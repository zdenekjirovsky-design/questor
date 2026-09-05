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

**Profily**: aplikaci sdílí víc lidí na jednom počítači se SPOLEČNÝM
studentským tokenem — bez účtů a e-mailů. Server rozlišuje jen dvojici
`profilId`/`profilJmeno`, kterou klient posílá jako volitelná pole v tělech
studentských POSTů (řetězce 1–64 znaků; chybí-li, platí výchozí profil
`vychozi` / `Student` — zpětná kompatibilita se staršími aplikacemi). Progres
se drží per profil, události nesou profil a výzva může mít cílový profil
(`cilovyProfilId` v JSON výzvy; bez něj je pro všechny).

**Registr profilů (sync mezi zařízeními)**: profil založený na telefonu je
vidět i na notebooku (a naopak), včetně PINu (jen `pinHash`, nikdy otevřený),
studijních bank a přes pull progresu i postupu (synchronizuje se celý
`ProgresStudenta` — XP, streak, sbírka, statistiky otázek, rekordy, avatar,
výbava, questy dne; per-profilová data MIMO něj — postup lekcí, historie
testů, čekající truhly, týdenní XP per banka — zatím zůstávají lokální per
zařízení). Záznam = `ProfilRegistrZaznam` ze `sdilene` (`{ profilId, jmeno,
barva, pinHash?, avatar?, predmety[], aktivniPredmetId, aktualizovano }`;
neznámá pole server při zápisu stripuje). Konflikt řeší **LWW** podle ISO
času `aktualizovano` (zápis projde jen s časem >= uloženému) — v rodině se
u profilu střídají zařízení, souběžná práce není cíl. `aktualizovano` musí
být ISO 8601 UTC (`…Z`, validuje server — LWW porovnává lexikograficky
a volný formát by šel „zamknout“ nesmyslem typu `zzzz`); čas z budoucnosti
(špatně nastavené hodiny zařízení) server ořezává na své „teď“ s tolerancí
5 minut, aby LWW nezamrzl. Stejné LWW + oříznutí platí pro `POST
/api/progres` (rozhodčí `progres.aktualizovano`).

**Rate limit**: na celém `/api/*` jednoduchý in-memory limit per IP
(240 požadavků/min, fixní okno; nadlimit → 429 `{ chyba }` + `retry-after`)
jako brzda hrubé síly na tokeny na veřejném nasazení. IP se bere
z `X-Forwarded-For` POSLEDNÍ adresou, kterou tam přidala vlastní důvěryhodná
proxy (standardní reverzní proxy hodnotu APPENDUJE za hlavičku poslanou
klientem — první položku ovládá útočník a rotací smyšlených IP by limit
obešel); počet důvěryhodných proxy řídí env `QUESTOR_DUVERUJ_PROXY`
(default 1; 0 = hlavičku ignorovat úplně, server vystavený přímo). Bez
hlavičky platí adresa soketu. Implementace `server/src/limit.ts` —
injektované hodiny, testy neposouvají reálný čas.

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
| `GET /api/profily` | student | registr profilů `ProfilRegistrZaznam[]` (naposledy aktualizovaný první; prázdné pole když registr nic nezná) |
| `PUT /api/profily/:id` | student | tělo = záznam bez `profilId` (ten nese URL, 1–64 znaků). Upsert s LWW: `aktualizovano` >= uložené → zapíše a `{ ok, prijato: true }`; starší → nezapíše a `{ ok, prijato: false, aktualni: <uložený záznam> }` (klient si vezme novější) |
| `DELETE /api/profily/:id` | student | smaže profil z registru + jeho progres (události zůstávají — jsou to dějiny) → `{ ok }`; idempotentní |
| `POST /api/progres` | student | tělo `ProgresStudenta` + volitelné `profilId`/`profilJmeno`. LWW podle `progres.aktualizovano` (offline fronta může snapshot doručit dny po vzniku): novější nebo stejný čas → uloží snapshot a `{ ok, prijato: true }`; starší než uložený → nezapíše a `{ ok, prijato: false }` (novější postup si klient vezme pullem). Řádek v DB bez `aktualizovano` (před LWW) prohrává vždy. Neplatná profilová pole → 400 |
| `GET /api/progres` | admin | pole profilů `[{ profilId, jmeno, progres, prijato, level }]` — naposledy aktivní první, prázdné pole když nic nedorazilo (`level` = `stavLevelu(xp)` ze sdílené funkce, ať ho admin web neduplikuje) |
| `GET /api/progres/:profilId` | student | pull postupu: `{ progres, prijato }` posledního snapshotu profilu; 404 když server žádný nemá (progres starých klientů je pod `vychozi`) |
| `POST /api/udalosti` | student | tělo `TestVysledek` + volitelné `profilId`/`profilJmeno` → `{ ok }` (append; idempotentní podle `vysledek.id` — duplicitní doručení z retry fronty se tiše ignoruje) |
| `GET /api/udalosti?limit=50` | admin | poslední výsledky testů (nejnovější první) jako `{ cas, profilId, profilJmeno, vysledek }` — řádky z dob před profily se hlásí jako `vychozi`/`Student` |
| `GET /api/vyzvy` | student | `Vyzva[]` se stavem != `dokoncena`; volitelný `?profilId=` vrátí jen výzvy cílené na daný profil + společné. Bez query platí výchozí profil `vychozi` (starý klient bez profilů JE výchozí profil — stejně server atribuuje jeho progres a události): dostane společné výzvy + cílené na `vychozi`, cizí cílené výzvy NEdostane, aby je nemohl „spotřebovat“ (dokončit a globálně uzavřít) místo adresáta |
| `POST /api/vyzvy` | admin | `{ zprava, konfigurace, cilovaUspesnost?, cilovyProfilId? }` → `Vyzva` (s `cilovyProfilId` je výzva jen pro daný profil) |
| `POST /api/vyzvy/:id/vysledek` | student | `{ uspesnost, xp }` → `{ ok }` (nastaví `dokoncena`) |
| `POST /api/generovani/dogenerovat` | student | `{ predmetId, temaId, obtiznost, pocet }` → `{ otazky }`; **503** když server nemá `ANTHROPIC_API_KEY` (aplikace to bere jako „funkce vypnutá“, žádná chyba uživateli). Kontext učiva server skládá ze zadání a vysvětlení existujících otázek tématu v bance (zdrojové učivo na serveru není). **Stav: klientská část v aplikaci zatím NENÍ implementovaná** — hotová je jen serverová půlka včetně 503. |
| `GET /admin` | admin (token zadá stránka) | mini admin web (viz níže) |

DB tabulky: `banky(predmet_id TEXT PK, verze INT, json TEXT)`,
`vyuka(predmet_id TEXT PK, verze INT, json TEXT)`,
`progres(profil_id TEXT PK, profil_jmeno TEXT, json TEXT, prijato TEXT)`,
`udalosti(id INTEGER PK AUTOINCREMENT, cas TEXT, json TEXT, profil_id TEXT,
profil_jmeno TEXT — NULL u řádků z dob před profily)`,
`vyzvy(id TEXT PK, json TEXT)`,
`profily(profil_id TEXT PK, json TEXT, aktualizovano TEXT — json =
metadata profilu bez profilId, aktualizovano = rozhodčí LWW)`.
Migrace schématu dělá `otevriDb`
(`server/src/db.ts`) při startu: starý jednořádkový progres (`id=1`) se
přelije do profilu `vychozi`/`Student`, událostem se doplní profilové
sloupce — data přežijí beze změny.

**Admin mini-web** (`/admin`, jedna HTML stránka servírovaná Honem, styl viz
DESIGN.md): pole na token (uloží localStorage), upload banky a upload výuky
(JSON soubor, sekce Výuka s tabulkou předmět/verze), sekce Profily — karty
VŠECH profilů (jméno, level, XP, streak, dokončené testy) doplněné o to, co
ví registr (studijní banky, aktivní banka, čas aktualizace, jestli má PIN;
profil známý jen z registru má kartu „zatím žádný progres“) a tlačítko
Smazat profil (potvrzení přes confirm; DELETE /api/profily/:id — progres
pryč, události zůstanou), poslední testy se jménem profilu, formulář na
výzvu s výběrem cílového profilu (nebo všem; nabídka je sjednocení profilů
s progresem a registru). Bez frameworku — vanilla JS + fetch. POZOR:
stránka volá API root-absolutními cestami (`/api/…`), takže za prefixovou
proxy (`/questor-api` na produkci) nefunguje — otevírá se přes SSH tunel
na port serveru (postup v docs/NASAZENI.md, krok 5a).

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
verze 7), react-router. Obsah předmětů (banky, výuky) se NEpersistuje
(kvóta localStorage ~5 MB) — drží ho nepersistovaný stav, persist
`partialize`/`migrate` řeší `stav/migrace.ts` (migrace v1→v2 zahazuje
banky/výuky ze starých snapshotů; v2→v3 převádí avatar; v3→v4 dělá
z existujících dat profil „Student“; v4→v5 dává profilům studijní banky
— aktivní se odvozuje z nejnovějšího testu v historii profilu; v5→v6
doplňuje týdenní XP z testů per banka, seed z historie testů; v6→v7 dává
profilům `aktualizovano` pro LWW sync mezi zařízeními — progres
a postup lekcí se NIKDY neztrácí). Struktura `aplikace/src/`:

```
stav/       store.ts (ZMRAZENÝ — skládá slices), testySlice.ts, hraSlice.ts,
            vyukaSlice.ts, profilySlice.ts
testy/      engine testu (čistá logika) + komponenty typů otázek
hra/        gamifikační komponenty (XP, streak, questy, truhla, sbírka, avatar, rekordy)
vyuka/      Uceni (/uceni), LekceViewer (/uceni/:temaId), bloky/, widgety/, registr.ts
profily/    VyberProfilu (brána aplikace), SpravaProfilu (Nastavení), pin.ts
sync/       klient serveru + offline fronta (per profil) + nastavení připojení
stranky/    Domu, Test, Vysledek, Sbirka, Statistiky, Nastaveni
komponenty/ HudHlavicka (+ menu profilů) + sdílené vizuální prvky
styl/       tokeny.css, global.css (viz DESIGN.md)
data/       predmety.ts (registr předmětů) + nacteniObsahu.ts + predmety/*.json
```

### Lokální profily (jako na streamovacích službách)

Aplikaci sdílí víc lidí na jednom počítači — ŽÁDNÝ e-mail ani síťové
ověřování. Kontrakt (`stav/profilySlice.ts`):

- `Profil { id (náhodné), jmeno, barva, pinHash?, predmety[], aktivniPredmetId }`
  v `profily[]`, `aktivniProfilId | null`. Bez aktivního profilu App.tsx
  místo aplikace ukáže `profily/VyberProfilu` (celoobrazovková brána — karty
  profilů, „+ Nový profil“ = dvoukrokový formulář: jméno/barva/PIN → krok
  „Co budeš studovat?“ — mřížka bank registru, multi-select, min. 1, první
  vybraná = aktivní); přepínání za běhu přes klik na avatara v hlavičce.
- VEŠKERÁ osobní data jsou per profil: progres (vč. avatara a výbavy),
  postup lekcí, aktualniTest, posledniVysledek, questyOdmeneno,
  historieTestu, čekající truhly, výzvy, questy neaktivních bank
  (`questyPodleBank`), týdenní XP z testů per banka
  (`tydenniXpTestuPodleBank`) i fronta syncu. AKTIVNÍ profil je
  drží přímo v pracovních slicech (aplikace funguje beze změn), neaktivní
  mají snímek v `dataProfilu[id]`; přepnutí = uložit + nahrát snímek.
  Obsah (banky, výuky) zůstává SDÍLENÝ.
- **Studijní banky per profil:** `predmety` (id z registru předmětů, pořadí
  = pořadí výběru) + `aktivniPredmetId`. Číst VÝHRADNĚ přes čisté funkce
  `predmetyProfilu()` / `aktivniPredmetProfilu()` (uvnitř
  `vycistiPredmetyProfilu`): id mimo registr se tiše ignoruje, prázdný
  výsledek spadne na všechny banky registru (min. 1 banka vždy platí)
  a aktivní banka mimo seznam spadne na první z něj. Zápisy zachovávají
  PŮVODNÍ uložené pole — id dočasně mimo registr se s návratem banky do
  aplikace samo obnoví. Aktivní banka řídí denní questy, chip v hlavičce
  (ikona + název vedle avataru, klik = menu bank profilu,
  `komponenty/HudHlavicka`), předvýběr předmětu testu, pořadí sekcí
  v Učit se a výchozí tab Statistik. `prepniAktivniPredmet` přehazuje
  questy dne přes snímky `questyPodleBank` (predmetId →
  `{ questy, questyOdmeneno }`, neaktivní banky; aktivní je drží
  v pracovní sadě) — přepínání tam a zpět NEgeneruje nové questy zadarmo.
  `pridejPredmetProfilu` / `odeberPredmetProfilu`: přidat jde jen banka
  z registru, odebrat všechny kromě poslední (odebrání aktivní nejdřív
  přepne na první zbylou); postup v odebrané bance (Leitnerovy statistiky,
  mistrovství, snímek questů dne) se NEmaže a s opětovným přidáním se vrací.
- PIN je jen MĚKKÁ ochrana soukromí: SHA-256 přes `crypto.subtle` se solí
  id profilu (`profily/pin.ts`), 3 špatné pokusy = 30 s pauza (in-memory).
  `crypto.subtle` existuje jen v zabezpečeném kontextu (https/localhost/
  Tauri) — `jePinPodporovan()` to hlídá: při nepodpoře (výhled: hostovaná
  verze přes `http://<ip>` na LAN) formuláře PIN pole schovají s hláškou
  a hash se počítá PŘED založením profilu (id předem přes
  `vytvorIdProfilu`), takže selhání hashe profil nezaloží — nikdy nesmí
  tiše vzniknout „zamčený“ profil bez zámku.
- Správa v Nastavení (`profily/SpravaProfilu`): přejmenovat, spravovat
  studijní banky (sekce Studijní banky — přidat ze zbytku registru,
  odebrat s potvrzením, aktivovat) a měnit/rušit PIN jde u aktivního
  profilu (změna PINu po ověření současného), smazat jde kterýkoli profil
  kromě posledního (dvojité potvrzení + opsání jména).
- Denní questy se generují per profil × aktivní banka:
  `vygenerujDenniQuesty(datum, ctx, seedPrisada?)` dostává seed
  `${profilId}:${predmetId}` (`seedQuestu` v hraSlice) a kontext (témata,
  nejslabší téma) se skládá JEN z aktivní banky — dva profily ani dvě
  banky téhož profilu nemají identické questy. `resetujProgres` maže jen
  aktivní profil.

Registr předmětů: `data/predmety.ts` drží ručně psaná metadata VŠECH
očekávaných předmětů (`PREDMETY`: id, nazev, ikona — určují názvy, ikony
a pořadí v UI; aktuálně 14 předmětů — 13 z 1. ročníku oboru + Základy
profesionálního vaření `zaklady-vareni`, obecný předmět mimo obor) a lazy načítání obsahu ze souborů
`data/predmety/<predmetId>.banka.json` / `<predmetId>.vyuka.json` přes
`import.meta.glob` BEZ eager (každý JSON = samostatný async chunk, počáteční
bundle se obsahem nenafukuje; kopie z kořenového `data/`, konvence viz README
ve složce). Předmět se v UI ukáže, jen když jeho banka reálně existuje
(bundle/IndexedDB/server); chybějící soubor je normální stav, vadný se jen
zaloguje a přeskočí. Obsah do store nabízí při startu `data/nacteniObsahu.ts`
(bundle → IndexedDB, verze hlídají `prijmiBanku`/`prijmiVyuku`); obsah
stažený ze serveru cachuje `sync/uloziste.ts` (IndexedDB `questor-obsah`,
bez závislostí, fail-safe). Volba předmětu je první krok modalu „Nová
výprava“ na Domů i rychlého startu na /test — nabízejí se JEN studijní
banky profilu s reálně přítomnou bankou, předvybraná AKTIVNÍ (jediná
dostupná banka krok přeskočí). Učit se ukazuje jen banky profilu (aktivní
sekce první, doporučení „pokračuj tady“ míří nejdřív do ní) a dlaždice
Učit se na Domů shrnuje lekce aktivní banky. Statistiky mají nahoře
globální řádek (level, XP, streak, sbírka — identita hráče je JEDNA) a pod
ním přepínač bank profilu (výchozí aktivní; `stranky/statistikyVypocty.ts`),
který filtruje témata, graf týdenního XP z testů (z agregátu
`tydenniXpTestuPodleBank`) i poslední testy. HUD a gamifikace (XP, streak,
truhly, sbírka) zůstávají globální za profil.
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

### Mobil a PWA základ

Aplikace je responzivní až k šířce telefonu (~375 px): breakpoint
`(max-width: 760px)`, všechna mobilní pravidla VÝHRADNĚ za media query
(desktop/Tauri se nemění) — závazné zásady drží DESIGN.md, sekce Mobil.
Dotyková detekce pro widgety: `vyuka/widgety/dotyk.ts`
(`jeHrubyPointer(matchMedia)` čistá a testovaná, `jeDotykoveZarizeni()`
čte window; fail-safe → false = desktopové chování). PWA základ pro
budoucí hostovanou verzi: `aplikace/public/manifest.webmanifest`
(name QUESTOR, display standalone, theme_color `#0f0d1a`, lang cs)
+ ikony `aplikace/public/ikony/` (kopie PNG z `src-tauri/icons/`)
+ `<link rel="manifest">`, `<meta name="theme-color">` a apple-touch-icon
v `index.html`. Service worker ZÁMĚRNĚ žádný — bez hostingu nemá co
cachovat; doplní se až s nasazením webové verze.

### Vlastnictví souborů (paralelní práce)

- **APP-TESTY**: `testy/`, `sync/`, `stav/testySlice.ts`, `stranky/Test.tsx`,
  `stranky/Vysledek.tsx`, `stranky/Nastaveni.tsx`.
- **APP-HRA**: `hra/`, `stav/hraSlice.ts`, `komponenty/`, `stranky/Domu.tsx`,
  `stranky/Sbirka.tsx`, `stranky/Statistiky.tsx`.
- **APP-PROFILY**: `profily/`, `stav/profilySlice.ts`, `stav/migrace.ts`.
- ZMRAZENÉ (nikdo nemění bez dohody): `App.tsx`, `main.tsx`, `stav/store.ts`,
  `styl/tokeny.css`. (Profilová brána v App.tsx a složení profilySlice ve
  store.ts vznikly dohodou při zavedení profilů — dál platí zmrazení.)

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
`sync/` drží: URL serveru + **rodinný kód** (= studentský token; stránka
Nastavení → Připojení, nebo odkaz „🔗 Připojit rodinu" na výběru profilů).
**Bez rodinného kódu je sync vypnutý** a aplikace běží čistě lokálně.
Výchozí adresy podle prostředí (`urciVychoziNastaveni` v `sync/klient.ts`,
čistá funkce): Tauri desktop → `https://koordinator-server.cz/questor-api`
(detekce `jeTauriProstredi`: interní globály + protokol `tauri:` +
hostname `tauri.localhost`); web přes https → `${origin}/questor-api`
(stejný origin, projde CSP connect-src 'self'); dev (http + localhost) →
`http://localhost:8787` s kódem `student-dev` (jediné prostředí s výchozím
kódem); jinde (http přes LAN) → prázdná adresa. Dále `sync/` drží
fronty neodeslaných událostí per PROFIL
(localStorage, klíč `questor-sync-fronta:<profilId>`; starou společnou
frontu adoptuje první fronta bez vlastních dat — po migraci profil
Student) + frontu REGISTRU (`questor-sync-fronta:registr` — smazání
profilů na serveru; žije mimo fronty profilů, aby nezmizela s frontou
mazaného profilu), při startu a po testu: push progres + události, pull banky
i výuky (jen vyšší verze; pull výuky má vlastní tichý try/catch kvůli
starším serverům bez /api/vyuka), pull výzvy (jen s aktivním profilem;
posílá se `?profilId=<aktivní profil>`, takže server vrací jen výzvy
cílené na tenhle profil + společné). PRAVIDLO pro každý pull osobních
dat: mezi čtením aktivního profilu a zápisem výsledku leží await — po
návratu se profil znovu porovná a při neshodě (přepnutí během letícího
požadavku) se výsledek ZAHODÍ, jinak by osobní data jednoho profilu
přistála v pracovní sadě jiného; správný profil si je stáhne příštím
syncem. Smazání profilu volá `zapomenFrontuProfilu` (sync.ts): zruší
in-memory frontu (příznak, po kterém už nikdy nezapisuje — ani z letícího
`odesli()`) a smaže její klíč v localStorage.
Události (`POST /api/udalosti`) i progres (`POST /api/progres`) nesou
NAVÍC top-level pole `profilId` a `profilJmeno` vedle stávajících dat —
zpětně kompatibilní (starý server neznámá pole ignoruje); označení se
přidává už při zařazení do fronty, takže přepnutí profilu před odesláním
atribuci nezmění. Progres nese NAVÍC `predmety` a `aktivniPredmetId`
profilu (`oznacProgres` v sync.ts) — server je při zod validaci
odstripuje, POST projde beze změny (serverová část se neměnila). Odesílají se fronty všech profilů, ne jen aktivního. Selhání sítě = ticho, žádné chybové hlášky uprostřed hry (jen
nenápadný indikátor stavu připojení v Nastavení a na Domů). Fronta odesílá
at-least-once s exponenciálním odkladem; položku, kterou server trvale odmítá
(4xx mimo 408/429, např. výsledek smazané výzvy), zahodí, aby neblokovala
zbytek fronty. Banky a výuky stažené ze serveru (jen vyšší verze) se navíc
ukládají do IndexedDB (`sync/uloziste.ts`), takže přežijí restart aplikace
a při startu přeplácnou bundlovaný obsah, když mají vyšší verzi.

**Sync profilů mezi zařízeními (klientská půlka registru profilů):** Profil
má `aktualizovano` (ISO čas, bumpne ho KAŽDÁ změna profilu — jméno, PIN,
banky, aktivní banka, avatar; migrace persistu v6→v7 doplní současný čas)
a příznak `naServeru` (profil už byl vidět v serverovém registru). Každá
změna profilu zařadí PUT záznamu registru do fronty profilu (položka
`profil`, drží se jen nejnovější), smazání profilu zařadí položku
`smazani-profilu` do fronty registru. Při každém syncu (start, otevření
výběru profilů, připojení rodiny…) odejdou nejdřív fronty, pak se stáhne
`GET /api/profily` a provede merge (`aplikujRegistrProfilu` v profilySlice,
LWW dle `aktualizovano`): server novější → převezmou se metadata (včetně
zrušení PINu záznamem bez `pinHash`); lokál novější nebo serveru neznámý →
PUT na server; profil jen na serveru → PŘIDÁ se lokálně (karta s ☁️,
avatar z registru do snímku); lokální profil s příznakem `naServeru`,
který server už nezná → smaže se i lokálně (smazání na jiném zařízení;
byl-li aktivní, aplikace se vrátí na výběr profilu). Profil, který na
serveru NIKDY nebyl, se lokálně nikdy nemaže. POJISTKA proti plošnému
výmazu: když by merge měl smazat VŠECHNY lokální profily, nebo server
vrátil úplně prázdný registr, smazání se neprovede a profily se místo toho
pushnou — prázdná/cizí odpověď registru (přeinstalovaný server, ztracená
DB, přepnutá adresa serveru) nesmí smazat lokální data, která jsou v tu
chvíli poslední zálohou. **Postup přes zařízení:**
při aktivaci profilu (`prepniProfil` → `stahniPostupProfilu`), při startu
a při ručním syncu se stáhne `GET /api/progres/:id` a porovná
`progres.aktualizovano` (LWW): server novější → nahradí se CELÝ lokální
`ProgresStudenta`, obnoví odvozené (questy dne) a splněné questy snapshotu
se označí jako odměněné (`questyOdmeneno` se serverem necestuje a splněný
quest UŽ odměněný je — bez toho by první odpověď odměnila podruhé); lokál
novější nebo 404 → push. Synchronizuje se jen `ProgresStudenta` — postup
lekcí, historie testů, čekající truhly a týdenní XP per banka zatím žijí
lokálně per zařízení (viz Registr profilů výše). Během pullu ukazuje HUD neblokující stav „Načítám postup…"
(`nacitamPostup` ve `StavSynchronizace`); platí pravidlo pullu osobních
dat (přepnutí profilu během letu = zahodit). Aby byl server čerstvý,
pushuje se snapshot progresu i po dokončení lekce a po otevření truhly
(`zaznamenejZmenuProgresu`).

### Gamifikace — pravidla (implementace ve `sdilene`, UI v `hra/`)

- XP: `xpZaOdpoved(obtiznost, comboKrok)` — 10×obtížnost × combo (max 2×).
  Levely: `stavLevelu(xp)` (křivka 100·n^1.6).
- Streak: den se počítá při ≥ 1 dokončeném testu; `zmrazeni` zachrání 1 den.
- Questy: 3/den, deterministické z data + id aktivního profilu
  (`vygenerujDenniQuesty(datum, ctx, seedPrisada?)`); odměna
  = XP + při splnění všech 3 bronzová truhla navíc. Questy dne patří
  AKTIVNÍ bance profilu — odpověď/test/lekce z JINÉ banky je NEPLNÍ
  (filtr v `zapocitejOdpoved`/`zapocitejTest`/`dokonciLekci` podle
  predmetId testu resp. lekce; XP, Leitner, streak a statistiky běží dál).
- Týdenní XP z testů per banka: `tydenniXpTestuPodleBank` (hraSlice,
  predmetId → pondělí týdne → součet ziskaneXp) — přesný průběžný agregát
  pro graf ve Statistikách (historieTestu drží jen posledních 10 testů).
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

- **Server**: produkce na sdíleném hostingu — pm2 proces na portu 10121,
  `.htaccess` proxy `https://koordinator-server.cz/questor-api` →
  `127.0.0.1:10121` (stejný origin jako web `/questor`); obecně jakýkoli
  Node 26+ hosting / VPS (`npm ci && npm run start -w server`), Dockerfile
  v `server/`. Env: tokeny (`QUESTOR_STUDENT_TOKEN` = rodinný kód),
  volitelně `ANTHROPIC_API_KEY`, `QUESTOR_PORT`, `QUESTOR_DUVERUJ_PROXY`.
- **Windows aplikace**: Tauri 2 shell (`aplikace/src-tauri/`), build v GitHub
  Actions (windows runner) → NSIS instalátor + updater artefakty; aplikace se
  aktualizuje sama z GitHub Releases. Vývoj na Macu = jen web (`npm run dev:aplikace`).
- **Obsah**: nová banka = `PUT /api/banky/:id`, nová výuka =
  `PUT /api/vyuka/:id` (admin web nebo CLI) — bez nového buildu aplikace.
  Kód aplikace (a bundlovaný obsah v `aplikace/src/data/`) = nový release,
  auto-update.
