# QUESTOR — provozní návod pro admina

Praktický postup „mám učební látku → student na ní testuje“. Souvislosti:
nasazení serveru a Windows aplikace řeší `docs/NASAZENI.md`, technický
kontrakt `docs/ARCHITEKTURA.md`, výukovou logiku `docs/VYUKA.md`.

## 1. Nahrání nového učiva a vygenerování banky otázek

1. **Ulož učivo** do `data/uciva/` — podporované formáty `.md`, `.txt`,
   `.pdf`, `.docx`. Název souboru = id předmětu (kebab-case, jen a–z, 0–9,
   pomlčky), např. `data/uciva/ucetnictvi.md`.
2. **Vygeneruj banku:**

   ```bash
   npm run generuj -- --vstup data/uciva/<predmet>.md --predmet <predmet> --nazev "Lidský název předmětu"
   ```

   - Poskytovatel Claude se autodetekuje: `ANTHROPIC_API_KEY` v prostředí
     → Claude API (model `claude-opus-5`, jde přepnout `--model`); bez klíče
     lokální `claude` CLI (předplatné); jinak `mock` — ten je JEN pro testy,
     na ostrý obsah nikdy.
   - Klíč nastavíš na jeden běh třeba
     `ANTHROPIC_API_KEY=sk-ant-… npm run generuj -- …`, trvale patří do
     `.env` (je v .gitignore) — nikdy do kódu ani do commitů.
   - Výstup: `data/banky/<predmet>.json`. Verze banky se sama inkrementuje
     podle existujícího souboru.
   - U PDF/DOCX zkontroluj, že extrahovaný text dával smysl (generátor
     vypisuje počty kapitol a znaků), a namátkou ověř ~10 otázek věcně.
3. **Zvaliduj banku:**

   ```bash
   npx tsx scripts/validuj-banku.ts data/banky/<predmet>.json
   ```

## 2. Dostání banky ke studentovi

- **Přes server (běžná cesta):**
  - buď rovnou při generování přepínači `--server https://<server>
    --token <admin-token>`,
  - nebo dodatečně přes admin web `https://<server>/admin` → zadat admin
    token → upload JSON souboru banky.

  Aplikace si novou verzi stáhne sama při nejbližším syncu (start aplikace
  nebo dokončený test). Server přijme jen verzi vyšší než tu, kterou už má.
- **Bez serveru (offline instalace):** jde-li o bundlovaný předmět
  `ekonomika-podnikani`, zkopíruj JSON 1:1 do
  `aplikace/src/data/demo-banka.json` a vydej novou verzi aplikace
  (`docs/NASAZENI.md`, krok 3). Aplikace nabídne novější demo banku
  i existující instalaci (persistovaný stav ji nezastíní).

## 3. Přehled o studentovi

Admin web `https://<server>/admin` (token = `QUESTOR_ADMIN_TOKEN`):

- progres studenta — level, XP, streak, sbírka,
- poslední výsledky testů (nejnovější první),
- formulář na **výzvu** (vzkaz + konfigurace testu + volitelný cíl
  úspěšnosti) — studentovi se ukáže na Domů jako „Výzva od táty“.

## 4. Dogenerování otázek (volitelné)

Server umí na vyžádání dogenerovat otázky k tématu
(`POST /api/generovani/dogenerovat`) — jen když má v prostředí
`ANTHROPIC_API_KEY`. Bez klíče vrací 503 a funkce se tváří jako vypnutá,
nic dalšího není potřeba. Klientská část v aplikaci zatím není
implementovaná (fáze 2) — endpoint jde volat ručně/skriptem.

## 5. Tokeny a řešení potíží

- Tokeny (`QUESTOR_ADMIN_TOKEN`, `QUESTOR_STUDENT_TOKEN`) se nastavují v env
  serveru; defaulty `admin-dev`/`student-dev` jsou jen pro lokální vývoj.
  Studentský token se zadává v aplikaci na stránce Nastavení.
- `https://<server>/zdravi` musí vracet `{ "ok": true, … }` — první krok
  při jakémkoli problému se spojením.
- Aplikace je offline-first: když server neběží, hraje se dál z lokální
  banky a progres se dosynchronizuje po obnovení spojení (stav připojení
  je vidět v Nastavení).
- Upload banky vrací 409 → nezvýšila se verze; 400 → JSON neprošel
  validací (spusť lokálně `scripts/validuj-banku.ts`, vypíše proč);
  413 → soubor je přes limit 10 MB.
