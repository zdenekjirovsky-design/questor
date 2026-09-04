---
name: ucivo
description: Přidání nového učiva do QUESTORu a vygenerování/nahrání banky otázek. Použij při „přidej učivo", „vygeneruj otázky/banku", „nahraj banku na server", „nový předmět" nebo když uživatel dodá soubor s učební látkou (.md/.txt/.pdf/.docx).
---

# Přidání učiva a generování banky otázek

Postup pro převod učební látky na banku testových otázek. Detailní kontext:
`docs/ARCHITEKTURA.md` (sekce Generátor), provozní návod `docs/NAVOD.md`.

## 1. Ulož učivo

Zdrojový soubor (.md, .txt, .pdf, .docx) patří do `data/uciva/`, název
= id předmětu (kebab-case, jen a–z, 0–9, pomlčky), např.
`data/uciva/ucetnictvi.md`. U PDF/DOCX zkontroluj po ingestu, že extrahovaný
text dává smysl (generátor vypisuje počty kapitol a znaků).

## 2. Vygeneruj banku

```bash
npm run generuj -- --vstup data/uciva/<predmet>.md --predmet <predmet> --nazev "Lidský název předmětu"
```

- Poskytovatel se autodetekuje: `ANTHROPIC_API_KEY` v env → Claude API
  (model `claude-opus-5`, přepínatelný `--model`); jinak lokální `claude` CLI
  (předplatné); jinak `mock` (jen pro testy — na ostrý obsah NIKDY).
- Výstup: `data/banky/<predmet>.json`; verze se sama inkrementuje podle
  existujícího souboru.
- Generování má verifikační průchod (kontrola klíčů správnosti), přesto
  namátkou zkontroluj ~10 otázek věcně.

## 3. Zvaliduj

```bash
npx tsx scripts/validuj-banku.ts data/banky/<predmet>.json
```

Musí projít bez chyb (schéma, unikátní id, odkazy na témata, indexy odpovědí).

## 4. Dostaň banku ke studentovi

- **Přes server** (běžná cesta): buď rovnou při generování přepínači
  `--server https://<server> --token <admin-token>`, nebo dodatečně přes
  admin web `/admin` (upload JSON). Aplikace si novou verzi stáhne sama.
- **Bez serveru** (bundlovaná demo banka): jde-li o předmět
  `ekonomika-podnikani`, zkopíruj JSON 1:1 i do
  `aplikace/src/data/demo-banka.json`.

## 5. Uzavři

Commitni učivo + banku (a případnou změnu demo banky). Nový předmět zmiň
v `docs/NAVOD.md`, jen pokud vyžaduje něco nestandardního.
