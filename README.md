# QUESTOR

Herní testovací systém: nahraješ učivo, Claude z něj vygeneruje banku otázek
v pěti obtížnostech a aplikace (Windows 11 / web) z ní staví testy s XP,
streaky, denními questy, truhlami a sbírkou karet.

## Rychlý start (vývoj, macOS/Linux)

```bash
npm install
npm run dev:server     # API na http://localhost:8787
npm run dev:aplikace   # aplikace na http://localhost:5173
```

Aplikace funguje i bez serveru (bundlovaná demo banka „Ekonomika a podnikání“).

## Generování otázek z učiva

```bash
npm run generuj -- --vstup "$PWD/data/uciva/ekonomika-podnikani.md" \
  --predmet ekonomika-podnikani --nazev "Ekonomika a podnikání"
```

Poskytovatel se volí automaticky (`ANTHROPIC_API_KEY` → API, jinak lokální
`claude` CLI, jinak mock). Podporované vstupy: `.md`, `.txt`, `.pdf`, `.docx`.
Pozor: příkaz běží uvnitř workspace `generator/`, takže `--vstup`/`--vystup`
zadávej absolutně (proto `"$PWD/…"`). Nápověda: `npm run generuj -- --napoveda`.

Validace hotové banky:

```bash
npx tsx scripts/validuj-banku.ts data/banky/ekonomika-podnikani.json
```

## Kontrola před commitem

```bash
npm run typecheck && npm test && npm run build -w aplikace
```

## Dokumentace

- `CLAUDE.md` — vstupní bod, pravidla projektu a aktuální stav
- `docs/ARCHITEKTURA.md` — závazný kontrakt (typy, API, pipeline)
- `docs/DESIGN.md` — vizuální jazyk a herní „juice“
- `docs/NAVOD.md` — provozní návod pro admina (učivo → banka → student)
- `docs/NASAZENI.md` — server, Windows build (Tauri 2 + GitHub Actions), auto-update
- `docs/VYUKA.md` — spec výukové fáze 2 (zatím neimplementováno)
