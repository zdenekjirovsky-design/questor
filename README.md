# QUESTOR

Herní výukový a testovací systém: nahraješ učivo, Claude z něj vygeneruje
banku otázek v pěti obtížnostech a volitelně interaktivní výukové lekce
(texty, SVG, hry, mini-kvízy). Aplikace (Windows 11 / web) studenta látku
nejdřív naučí („Učit se“) a pak z ní staví testy s XP, streaky, denními
questy, truhlami a sbírkou karet. Na jednom počítači se střídá víc lidí
přes profily (bez e-mailu, volitelný PIN); rodinný kód propojí zařízení
rodiny — profil i herní postup se přes malý server synchronizují mezi
telefonem a počítačem a členové rodiny se mohou vyzývat na duely
(stejné otázky, časový limit, power-upy, trofeje). UI je responzivní až
do šířky telefonu (hostovaná webová verze s PWA základem).

## Rychlý start (vývoj, macOS/Linux)

```bash
npm install
npm run dev:server     # API na http://localhost:8787
npm run dev:aplikace   # aplikace na http://localhost:5173
```

Aplikace funguje i bez serveru — kompletní obsah je bundlovaný přímo
v ní: 14 předmětů, každý s bankou otázek i výukovými lekcemi.

## Předměty (14)

**1. ročník SŠ, obor Ekonomika a podnikání (13):** Ekonomika
a podnikání, Písemná a elektronická komunikace, Informatika, Český jazyk
a literatura, Anglický jazyk, Německý jazyk, Matematika, Dějepis,
Občanská nauka, Fyzika, Chemie, Biologie a ekologie, Zbožíznalství.
**Mimo obor (1):** Základy profesionálního vaření (`zaklady-vareni`) —
QUESTOR je obecný, učí se v něm i dospělí členové rodiny.

Celkem 86 témat, 780 otázek v bankách, 86 lekcí (172 mini-kvízů,
92 widgetů).

Názvy, ikony a pořadí předmětů v UI drží registr
`aplikace/src/data/predmety.ts` (`PREDMETY`); obsah se bundluje jako JSON
v `aplikace/src/data/predmety/`. **Nový předmět nebo další ročník**
(= nový předmět s vlastním id, např. `matematika-2`): postup
v `docs/NAVOD.md`, kap. 7 — učivo → banka → výuka → registr → bundle.

## Profily

Profily jako na streamovacích službách — žádný e-mail, žádná
registrace. Každý profil má vlastní XP, level, streak, questy, truhly,
sbírku, avatara, postup lekcí i historii testů; obsah předmětů je
společný. Volitelný PIN (4–6 číslic) je měkký zámek soukromí; přepíná
se klikem na avatara v hlavičce.

**Rodinný sync:** zadáním rodinného kódu (= studentský token serveru,
jednou na zařízení) se profily synchronizují mezi zařízeními — profil
založený na telefonu se i s PINem, studijními bankami a kompletním
herním postupem (XP, streak, sbírka, statistiky, rekordy) objeví na
notebooku a naopak. Konflikty řeší „poslední zápis vyhrává“ podle času
změny; postup lekcí a historie testů zatím zůstávají per zařízení.
Bez kódu běží aplikace čistě lokálně (offline-first vždy).

Každý profil si navíc vybírá vlastní **studijní banky** (při založení
v kroku „Co budeš studovat?“ a kdykoli v Nastavení; aspoň jedna vždy).
**Aktivní banka** — přepínaná chipem vedle avataru v hlavičce — řídí
denní questy (generují se z jejích témat a plní je jen testy a lekce
z ní; každá banka má vlastní questy dne), doporučené lekce a předvýběr
předmětu testu; Statistiky mají přepínač bank. Level, XP, streak
a sbírka zůstávají společné za celý profil; postup v odebrané bance se
nemaže a s opětovným přidáním se vrací. Server profily
rozlišuje přes `profilId` posílaný při syncu (studentský token je
společný): admin web ukazuje progres všech profilů vedle sebe a výzvy
jde cílit na konkrétní profil. Postupy: `docs/NAVOD.md`, kap. 3 a 4.

## Duely

Asynchronní souboje mezi profily jedné rodiny: vyzyvatel zvolí obor
(banku), volitelně témata, počet otázek (5/10/20) a soupeře — konkrétní
profil, nebo otevřenou výzvu „kdokoli z rodiny“ (hraje první, kdo
přijme). Oba hrají do 24 hodin identickou sadu otázek s časovým limitem
na otázku a viditelným odpočtem, bez průběžné zpětné vazby; správně
= 100 bodů + bonus za rychlost. Slabší hráč v oboru dostává férový
bonus času (handicap ×1,0–1,5 zmrazený na celý duel), z truhel padají
power-upy použitelné jen v duelu (50:50, zmrazení času, štít) a výhry
se sbírají do trofejní vitríny (bilance dvojic, série, tituly). Server
výsledky přepočítává ze syrových odpovědí a sadu otázek vydává až při
přijetí — podvádět se nevyplácí. Postup: `docs/NAVOD.md`, kap. 5.

## Generování otázek a výuky z učiva

```bash
npm run generuj -- --vstup "$PWD/data/uciva/ekonomika-podnikani.md" \
  --predmet ekonomika-podnikani --nazev "Ekonomika a podnikání"
```

S přepínačem `--vyuka` vygeneruje místo banky výukové lekce
(`data/vyuka/<predmet>.json`); generuj je až po bance — lekce se na témata
banky vážou přes `temaId`.

Poskytovatel se volí automaticky (`ANTHROPIC_API_KEY` → API, jinak lokální
`claude` CLI, jinak mock). Podporované vstupy: `.md`, `.txt`, `.pdf`, `.docx`.
Pozor: příkaz běží uvnitř workspace `generator/`, takže `--vstup`/`--vystup`
zadávej absolutně (proto `"$PWD/…"`). Nápověda: `npm run generuj -- --napoveda`.

Validace hotového obsahu:

```bash
npx tsx scripts/validuj-banku.ts data/banky/ekonomika-podnikani.json
npx tsx scripts/validuj-vyuku.ts data/vyuka/ekonomika-podnikani.json
npx tsx scripts/kontrola-integrace.ts   # křížové kontroly napříč všemi bundlovanými předměty
```

## Kontrola před commitem

```bash
npm run typecheck && npm test && npm run build -w aplikace
```

## Dokumentace

- `CLAUDE.md` — vstupní bod, pravidla projektu a aktuální stav
- `docs/ARCHITEKTURA.md` — závazný kontrakt (typy, API, pipeline)
- `docs/DESIGN.md` — vizuální jazyk a herní „juice“
- `docs/NAVOD.md` — provozní návod pro admina (učivo → banka + výuka → student)
- `docs/NASAZENI.md` — server, Windows build (Tauri 2 + GitHub Actions), auto-update
- `docs/DIDAKTIKA.md` — ZÁVAZNÁ šablona lekcí a pravidla kvality otázek
  (psychologie učení)
- `docs/VYUKA.md` — didaktické zásady výukových lekcí (technický kontrakt
  výuky je v ARCHITEKTURA.md, sekce Výuka)
