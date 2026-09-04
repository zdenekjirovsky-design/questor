---
name: ucivo
description: Přidání nového učiva do QUESTORu a vygenerování/nahrání banky otázek a výuky (lekcí). Použij při „přidej učivo", „vygeneruj otázky/banku", „vygeneruj výuku/lekce", „nahraj banku/výuku na server", „nový předmět" nebo když uživatel dodá soubor s učební látkou (.md/.txt/.pdf/.docx).
---

# Přidání učiva a generování banky otázek a výuky

Postup pro převod učební látky na banku testových otázek a volitelně na
výukové lekce. Detailní kontext: `docs/ARCHITEKTURA.md` (sekce Generátor
a Výuka), provozní návod `docs/NAVOD.md` (výuka: kap. 6), didaktické
zásady lekcí `docs/VYUKA.md`.

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
- **Bez serveru** (bundlovaný obsah): předmět `ekonomika-podnikani` má
  kopii v `aplikace/src/data/demo-banka.json`; ostatní vzorové předměty
  se bundlují jako `aplikace/src/data/predmety/<predmet>.banka.json`
  (kopie 1:1, konvence viz README v té složce). Změna bundlu = nová verze
  aplikace.

## 5. Výuka — lekce (volitelně)

Chce-li uživatel k předmětu i výuku, vygeneruj ji ze STEJNÉHO učiva
přepínačem `--vyuka` (až PO vygenerování banky — lekce se na témata banky
vážou přes `temaId`):

```bash
npm run generuj -- --vstup data/uciva/<predmet>.md --predmet <predmet> --nazev "Lidský název předmětu" --vyuka
```

- Výstup: `data/vyuka/<predmet>.json` (verze se sama inkrementuje);
  generátor výstup validuje `validujVyuku`.
- ZKONTROLUJ, že `temaId` lekcí odpovídají id témat v bance (obě pipeline
  odvozují témata z téhož učiva, ale jde o výstup Clauda) — při odchylce
  uprav `temaId` ručně. Věcně projdi texty, SVG i mini-kvízy.
- Nahrání: stejně jako banka — `--server`/`--token` při generování, admin
  web `/admin` sekce Výuka, nebo `curl -X PUT …/api/vyuka/<predmet>`
  (detail `docs/NAVOD.md`, kap. 6).
- Bez serveru: kopie 1:1 do
  `aplikace/src/data/predmety/<predmet>.vyuka.json`.

## 6. Uzavři

Commitni učivo + banku (+ výuku a případnou změnu bundlovaných kopií).
Nový předmět zmiň v `docs/NAVOD.md`, jen pokud vyžaduje něco
nestandardního.
