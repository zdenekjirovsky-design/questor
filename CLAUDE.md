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

## Stav (2026-09-05 — po vlně 4: lokální profily, mobil, Základy vaření)

Vydané verze: tagy `v0.1.0`–`v0.3.1` (v0.3.0 = avatar 2.0, v0.3.1 = CI
macOS build). Vlna 4 níže je hotová v pracovní kopii, zatím NEcommitnutá.

**Hotové a ověřené** (typecheck 4/4 workspaces, testy 307/307 — sdílené 86,
generátor 32, server 46, aplikace 143; build aplikace OK ~1 s;
`npx tsx scripts/kontrola-integrace.ts` → 14 bank, 14 výuk | 86 témat,
780 otázek, 86 lekcí, 172 mini-kvízů, 92 widgetů — VŠECHNY KONTROLY OK):

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
- fáze 3 — OBSAH 1. ROČNÍKU (obor Ekonomika a podnikání): 13 předmětů,
  každý s bankou otázek I výukou, podle závazné šablony
  `docs/DIDAKTIKA.md`; křížové kontroly (unikátní `temaId` a id otázek
  napříč předměty, vazby lekcí na témata banky, povolené widgety) drží
  `scripts/kontrola-integrace.ts` + `aplikace/test/predmety.test.ts`;
- přepínač předmětů (`f17fb66`): registr metadat
  `aplikace/src/data/predmety.ts` (id, název, ikona, pořadí), volba
  předmětu jako první krok modalu „Nová výprava“ na Domů i rychlého
  startu na /test; „Učit se“ a Témata ve Statistikách per předmět;
  obsah předmětů MIMO localStorage — lazy async chunky
  (`import.meta.glob` bez eager) + IndexedDB `questor-obsah` pro obsah
  ze serveru (`sync/uloziste.ts`), persist s `partialize` a migracemi
  (`stav/migrace.ts`, aktuálně v1→…→v4). Počáteční JS chunk 457 kB
  (gzip 137) BEZ obsahu předmětů, obsah = 28 async chunků;
- avatar 2.0 (`4c60665`, v0.3.0): muž/žena, tvary obličeje, pleť, střihy
  vlasů; kosmetická výbava ze 4 slotů jako odměna z truhel, editor
  v Nastavení;
- vlna 4 — LOKÁLNÍ PROFILY (bez e-mailu, jako na streamovacích službách):
  `stav/profilySlice.ts` + brána `profily/VyberProfilu` („Kdo dnes
  hraje?“), správa v Nastavení (`profily/SpravaProfilu` — přejmenování,
  PIN, mazání s dvojitým potvrzením), PIN 4–6 číslic jako měkký zámek
  (SHA-256 se solí id, 3 pokusy → 30 s pauza, `jePinPodporovan()` pro
  nezabezpečený kontext), přepínání přes avatara v hlavičce; VEŠKERÁ
  osobní data per profil (snímky v `dataProfilu`, migrace v3→v4 udělá
  z existujících dat profil „Student“), sync fronta per profil; server:
  `profilId`/`profilJmeno` u progresu a událostí, progres per profil,
  admin web s kartami všech profilů a výběrem „Komu“ u výzvy
  (`cilovyProfilId`), migrace DB při startu (`otevriDb`); oprava
  kontraktu: `stahniVyzvy(profilId)` posílá `?profilId=`, takže cizí
  cílené výzvy nechodí všem (`aplikace/test/klient.test.ts`);
- vlna 4 — MOBIL: responzivita k ~375 px za `(max-width: 760px)` (spodní
  navigační lišta, modaly přes celou obrazovku, dotykové plochy
  ≥ 44 px), dotyková Třídička klik-klik (`vyuka/widgety/dotyk.ts`),
  PWA základ (`public/manifest.webmanifest` + ikony) BEZ service
  workeru — zásady v DESIGN.md, sekce Mobil;
- vlna 4 — OBSAH: 14. předmět Základy profesionálního vaření
  (`zaklady-vareni`, mimo obor — učí se i dospělí členové rodiny):
  učivo + banka + výuka, bundle byte-shodný s `data/`.

**Připravené, ale neověřené:**

- Tauri build — staví se jen v GitHub Actions (na Macu se Rust část
  nekompiluje); po commitu vlny 4 je potřeba na GitHubu ověřit běh
  workflow a auto-update nové verze na Windows (postup
  `docs/NASAZENI.md`);
- dogenerování otázek — serverová půlka hotová (bez `ANTHROPIC_API_KEY`
  vrací 503 = „vypnuto“), proti skutečnému Claude API neověřeno;
  klientská část v aplikaci pořád chybí;
- poskytovatelé `api` a `claude-cli` generátoru neověřeny ostrým během
  (testy jedou na `mock`) — platí i pro režim `--vyuka`.

**Další krok:** commit + push vlny 4 a release nové verze přes CI
(ověřit auto-update na Windows); nasadit/aktualizovat server (migrace DB
proběhne sama při startu) a nahrát na něj banku i výuku vaření; poté
ostré vygenerování dalšího předmětu přes `api` nebo `claude-cli`.
