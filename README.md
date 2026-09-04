# QUESTOR

Herní výukový a testovací systém: nahraješ učivo, Claude z něj vygeneruje
banku otázek v pěti obtížnostech a volitelně interaktivní výukové lekce
(texty, SVG, hry, mini-kvízy). Aplikace (Windows 11 / web) studenta látku
nejdřív naučí („Učit se“) a pak z ní staví testy s XP, streaky, denními
questy, truhlami a sbírkou karet.

## Rychlý start (vývoj, macOS/Linux)

```bash
npm install
npm run dev:server     # API na http://localhost:8787
npm run dev:aplikace   # aplikace na http://localhost:5173
```

Aplikace funguje i bez serveru — kompletní 1. ročník SŠ (obor Ekonomika
a podnikání) je bundlovaný přímo v ní: 13 předmětů, každý s bankou otázek
i výukovými lekcemi.

## Předměty (1. ročník)

Ekonomika a podnikání, Písemná a elektronická komunikace, Informatika,
Český jazyk a literatura, Anglický jazyk, Německý jazyk, Matematika,
Dějepis, Občanská nauka, Fyzika, Chemie, Biologie a ekologie,
Zbožíznalství — celkem 77 témat, 708 otázek v bankách, 77 lekcí
(154 mini-kvízů, 81 widgetů).

Názvy, ikony a pořadí předmětů v UI drží registr
`aplikace/src/data/predmety.ts` (`PREDMETY`); obsah se bundluje jako JSON
v `aplikace/src/data/predmety/`. **Nový předmět nebo další ročník**
(= nový předmět s vlastním id, např. `matematika-2`): postup
v `docs/NAVOD.md`, kap. 5 — učivo → banka → výuka → registr → bundle.

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
