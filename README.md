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
npm run generuj -- --vstup data/uciva/ekonomika-podnikani.md \
  --predmet ekonomika-podnikani --nazev "Ekonomika a podnikání"
```

Poskytovatel se volí automaticky (`ANTHROPIC_API_KEY` → API, jinak lokální
`claude` CLI, jinak mock). Podporované vstupy: `.md`, `.txt`, `.pdf`, `.docx`.

## Dokumentace

- `CLAUDE.md` — vstupní bod a pravidla projektu
- `docs/ARCHITEKTURA.md` — závazný kontrakt (typy, API, pipeline)
- `docs/DESIGN.md` — vizuální jazyk a herní „juice“
- `docs/NAVOD.md` — provozní návod pro admina
- `docs/NASAZENI.md` — server, Windows build (Tauri 2 + GitHub Actions), auto-update
