# QUESTOR — herní testovací systém

Osobní projekt Zdeňka (NENÍ součást firmy Sined — žádné odkazy tam ani zpět).
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

## Stav (2026-09-04)

Zakládací den: monorepo, sdílené jádro, spec, design manuál; zbytek staví
workflow (server, generátor, testový engine, gamifikační UI, demo banka
Ekonomika a podnikání, Tauri + CI, návody).
