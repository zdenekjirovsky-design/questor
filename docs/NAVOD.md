# QUESTOR — provozní návod pro admina

Praktický postup „mám učební látku → student se ji naučí a testuje“, psaný
pro denní použití. Souvislosti: nasazení serveru a Windows aplikace řeší
`docs/NASAZENI.md`, technický kontrakt `docs/ARCHITEKTURA.md`, didaktické
zásady výukových lekcí `docs/VYUKA.md`.

Všechny příkazy spouštěj v Terminálu ve složce projektu:

```bash
cd /Users/zdenekjirovsky/Questor
```

## 1. Nové učivo → banka otázek

1. **Ulož učivo** do `data/uciva/` — podporované formáty `.md`, `.txt`,
   `.pdf`, `.docx`. Doporučený název souboru = id předmětu (kebab-case,
   jen a–z, 0–9, pomlčky), např. `data/uciva/ucetnictvi.md`.

2. **Vygeneruj banku.** Dvě rovnocenné varianty, liší se jen tím, čím se
   platí Claude:

   **Varianta A — API klíč** (placené API, model `claude-opus-5`):

   ```bash
   ANTHROPIC_API_KEY=sk-ant-… npm run generuj -- \
     --vstup "$PWD/data/uciva/<predmet>.md" \
     --predmet <predmet> --nazev "Lidský název předmětu"
   ```

   Klíč můžeš pro celé sezení terminálu nastavit jednou
   (`export ANTHROPIC_API_KEY=sk-ant-…`) a pak už jen spouštět
   `npm run generuj -- …`. Klíč NIKDY nepatří do kódu ani do commitů;
   soubor `.env` je v .gitignore, ale generátor ho sám nenačítá — slouží
   jen jako bezpečná odkládací schránka, do prostředí ho dostaneš exportem.
   Model jde přepnout `--model <model>`.

   **Varianta B — lokální `claude` CLI** (využije předplatné, bez klíče):

   ```bash
   npm run generuj -- \
     --vstup "$PWD/data/uciva/<predmet>.md" \
     --predmet <predmet> --nazev "Lidský název předmětu" \
     --poskytovatel claude-cli
   ```

   Vyžaduje binárku `claude` v PATH (spouští `claude -p … --output-format
   json`). Bez `--model` se použije výchozí model CLI.

   **Autodetekce:** bez `--poskytovatel` platí pořadí `ANTHROPIC_API_KEY`
   v prostředí → `api`; jinak binárka `claude` v PATH → `claude-cli`;
   jinak `mock` s varováním. `mock` generuje deterministické testovací
   otázky — JEN na zkoušení pipeline, na ostrý obsah nikdy.

   > **POZOR na cesty:** `npm run generuj` běží uvnitř workspace
   > `generator/`, takže RELATIVNÍ `--vstup`/`--vystup` se vyhodnocují od
   > `generator/`, ne od kořene. Proto v příkazech výše `"$PWD/…"` —
   > absolutní cesta funguje vždy. Výchozí výstup (bez `--vystup`) jde
   > správně do `data/banky/<predmet>.json` v kořeni a verze banky se sama
   > zvedne podle existujícího souboru.

3. **Zvaliduj a zkontroluj banku:**

   ```bash
   npx tsx scripts/validuj-banku.ts data/banky/<predmet>.json
   ```

   Vypíše tabulku otázek dle témat a obtížností. U PDF/DOCX navíc
   zkontroluj, že extrahovaný text dával smysl (generátor vypisuje počty
   kapitol a znaků), a namátkou ověř ~10 otázek věcně — Claude verifikuje
   sám sebe druhým průchodem, ale konečná kontrola je na tobě.

## 2. Nahrání banky na server

- **Rovnou při generování** — přidej ke `generuj` přepínače:

  ```bash
  … --server https://<server> --token <admin-token>
  ```

  (po vygenerování se banka sama nahraje přes `PUT /api/banky/<predmet>`).

- **Dodatečně přes admin web:** otevři `https://<server>/admin`, zadej
  admin token (uloží se do prohlížeče) a nahraj JSON soubor banky.

- **Dodatečně z terminálu** (např. po ruční opravě souboru):

  ```bash
  curl -X PUT "https://<server>/api/banky/<predmet>" \
    -H "content-type: application/json" \
    -H "x-questor-token: <admin-token>" \
    --data-binary @data/banky/<predmet>.json
  ```

Server přijme jen banku s verzí VYŠŠÍ, než kterou už má (jinak 409).
Aplikace si novou verzi stáhne sama při nejbližším syncu (start aplikace,
dokončený test nebo ruční sync v Nastavení) — žádný nový build ani
instalace se nedělá.

## 3. Přehled o studentovi a výzvy

Admin web `https://<server>/admin` (token = `QUESTOR_ADMIN_TOKEN`):

- **progres studenta** — level, XP, streak, sbírka (poslední snapshot,
  který aplikace poslala),
- **poslední výsledky testů** (nejnovější první; u testu z výzvy je vidět
  její id),
- **formulář na výzvu** — vzkaz + konfigurace testu (režim, počet otázek,
  témata) + volitelný cíl úspěšnosti. Studentovi se ukáže na Domů jako
  „Výzva od táty“; po dokončení výzva ze studentova seznamu zmizí
  a výsledek dorazí mezi poslední testy.

## 4. Aplikace bez serveru (demo banka)

Aplikace je **offline-first** a plně funkční úplně bez serveru:

- Banka „Ekonomika a podnikání“ je zabalená přímo v aplikaci
  (`aplikace/src/data/demo-banka.json`, kopie
  `data/banky/ekonomika-podnikani.json` 1:1) — testy, XP, streak, questy,
  truhly i sbírka jedou lokálně, progres se ukládá v aplikaci.
- Stejně je bundlovaný vzorový předmět „Zbožíznalství“ — banka i výuka —
  jako `aplikace/src/data/predmety/zbozinalstvi.banka.json`
  a `….vyuka.json` (kopie souborů z `data/`; konvence názvů viz README
  v té složce). Lekce tedy fungují také úplně bez serveru.
- Když je server nastavený, ale zrovna nedostupný, nic se neděje: hraje se
  dál a neodeslaný progres čeká ve frontě, která se po obnovení spojení
  sama dosynchronizuje. Žádné chybové hlášky uprostřed hry — stav
  připojení je vidět nenápadně v Nastavení a na Domů.
- **Aktualizace demo banky** (pro instalace bez serveru): zkopíruj nový
  JSON 1:1 do `aplikace/src/data/demo-banka.json` a vydej novou verzi
  aplikace (`docs/NASAZENI.md`, krok 3). Novější verze banky se prosadí
  i proti persistovanému stavu existující instalace.

## 5. Přidání úplně nového předmětu

1. Ulož učivo: `data/uciva/<novy-predmet>.md` (nebo .txt/.pdf/.docx).
2. Vygeneruj banku s novým id (krok 1 výše):

   ```bash
   npm run generuj -- --vstup "$PWD/data/uciva/<novy-predmet>.md" \
     --predmet <novy-predmet> --nazev "Název nového předmětu"
   ```

3. Zvaliduj a nahraj na server (kroky 1.3 a 2). Aplikace si novou banku
   stáhne při nejbližším syncu — stahují se všechny banky ze serveru,
   i dosud neznámé.

> **Omezení (zatím):** konfigurace testu na Domů pracuje s PRVNÍ bankou,
> kterou aplikace má — přepínač předmětů v UI ještě není (viz Stav
> v CLAUDE.md). Lekce dalších předmětů ale student vidí na „Učit se“
> a otestovat se z nich může tlačítkem „Otestuj se z tématu“ na konci
> lekce (to funguje pro každý předmět).

## 6. Výuka — lekce k předmětu

Výuka jsou interaktivní lekce po tématech (texty, obrázky, hry, kartičky,
mini-kvízy); student je najde v aplikaci pod „Učit se“. Obsah je JSON
(`VyukaPredmetu`) a teče stejnou cestou jako banka: vygenerovat →
zvalidovat → nahrát na server (nebo bundlovat). Didaktická vodítka
k obsahu: `docs/VYUKA.md`.

### 6a. Vygenerování výuky

Ke `generuj` přidej přepínač `--vyuka` (ostatní volby vč. poskytovatelů
a cest platí stejně jako v kap. 1):

```bash
npm run generuj -- --vstup "$PWD/data/uciva/<predmet>.md" \
  --predmet <predmet> --nazev "Lidský název předmětu" --vyuka
```

- Výstup: `data/vyuka/<predmet>.json`; verze se sama zvedá podle
  existujícího souboru (server přijme jen vyšší).
- Generuje se ze STEJNÉHO souboru učiva jako banka a lekce se na témata
  banky vážou přes `temaId`. Generuj proto nejdřív banku, pak výuku,
  a zkontroluj, že `temaId` lekcí odpovídají id témat v bance — obě
  pipeline odvozují témata z téhož učiva, ale jde o výstup Clauda; při
  odchylce uprav `temaId` v JSONu ručně. U bundlovaných předmětů shodu
  hlídá test `aplikace/test/predmety.test.ts`.
- Widgety generátor navrhuje jen datové (`tridicka`, `pexeso`,
  `prubeh-procesu`, `srovnavac`); `popisovacka` a `casova-osa` se
  doplňují ručně, když pro ně látka má smysluplná data.

### 6b. Validace a kontrola

Generátor výstup validuje sám (`validujVyuku`). Po RUČNÍ editaci souboru
zvaliduj jednořádkovkou z kořene projektu:

```bash
npx tsx -e "import('@questor/sdilene').then(function(s){var fs=require('node:fs');s.validujVyuku(JSON.parse(fs.readFileSync('data/vyuka/<predmet>.json','utf8')));console.log('Výuka OK');}).catch(function(e){console.error(String(e));process.exit(1);})"
```

Pak si lekce projdi očima studenta: `npm run dev:aplikace` →
http://localhost:5173 → „Učit se“. Zkontroluj věcnou správnost textů
i SVG obrázků (v obou režimech vzhledu) a že mini-kvízy dávají smysl.

### 6c. Nahrání na server

- **Rovnou při generování**: přidej `--server https://<server> --token
  <admin-token>` (nahraje se přes `PUT /api/vyuka/<predmet>`).
- **Admin web**: `https://<server>/admin` → sekce **Výuka** (tabulka
  předmět/verze + upload JSON souboru).
- **Z terminálu**:

  ```bash
  curl -X PUT "https://<server>/api/vyuka/<predmet>" \
    -H "content-type: application/json" \
    -H "x-questor-token: <admin-token>" \
    --data-binary @data/vyuka/<predmet>.json
  ```

Chování stejné jako u banky: validace (400), verze musí růst (409),
limit 10 MB (413), špatný token (401). Aplikace si novou verzi výuky
stáhne sama při nejbližším syncu.

### 6d. Lekce pro úplně nový předmět

1. Učivo → banka → nahrání banky: kap. 5.
2. Výuka: `--vyuka` (kap. 6a) + kontrola (6b) + nahrání (6c).
3. Má-li předmět fungovat v aplikaci i BEZ serveru, zkopíruj JSONy 1:1 do
   `aplikace/src/data/predmety/<predmet>.banka.json`
   a `<predmet>.vyuka.json` (konvence viz README v té složce) a vydej
   novou verzi aplikace (`docs/NASAZENI.md`).

> Dokončená lekce dává XP jen poprvé v den; projít ji znovu jde kdykoli
> („Projít znovu“ na konci lekce). Tlačítko „Otestuj se z tématu“ na
> konci lekce funguje pro každý předmět — i ten, který zatím nejde
> vybrat v konfiguraci testu na Domů (kap. 5).

## 7. Dogenerování otázek (volitelné)

Server umí na vyžádání dogenerovat otázky k tématu
(`POST /api/generovani/dogenerovat`) — jen když má v prostředí
`ANTHROPIC_API_KEY`. Bez klíče vrací 503 a funkce se tváří jako vypnutá,
nic dalšího není potřeba. Klientská část v aplikaci zatím není
implementovaná — endpoint jde volat ručně/skriptem. Kontext pro
generování si server skládá ze zadání a vysvětlení existujících otázek
tématu (zdrojové učivo na serveru není).

## 8. Tokeny

- `QUESTOR_ADMIN_TOKEN` a `QUESTOR_STUDENT_TOKEN` se nastavují v env
  serveru; defaulty `admin-dev`/`student-dev` jsou JEN pro lokální vývoj.
- Admin token zadáváš v admin webu (a u `--server`/curl), studentský token
  student v aplikaci na stránce Nastavení. Admin token smí i všechno
  studentské.

## 9. Řešení potíží

**Validace banky selhala** (`validuj-banku.ts` skončí chybou, nebo upload
vrátí 400):

- Výpis říká přesně kde a co: `otazky.12.spravna: Index správné odpovědi
  ukazuje mimo možnosti`, duplicitní id otázky, otázka odkazuje na
  neexistující téma, moc krátké zadání/vysvětlení apod.
- Drobnosti oprav ručně v JSON a znovu zvaliduj; při větším rozsahu nech
  banku vygenerovat znovu (verze se zvedne sama).
- Po ruční opravě verzi neměň — musí být vyšší než ta na serveru až ve
  chvíli uploadu (generátor to řeší sám).

**Server neběží / není dosažitelný:**

- První krok vždy: `https://<server>/zdravi` musí vrátit
  `{ "ok": true, … }`. Lokálně: `npm run dev:server`
  → http://localhost:8787.
- 401 = špatný token (zkontroluj env serveru vs. co zadáváš).
- Na hostingu zkontroluj logy a env proměnné (`docs/NASAZENI.md`, krok 5);
  po redeployi bez volume je DB prázdná — banku i výuku nahraj znovu.
- Pro studenta to není havárie: aplikace jede dál offline (bod 4).

**Aplikace nesynchronizuje:**

1. V aplikaci Nastavení zkontroluj URL serveru (bez lomítka na konci)
   a studentský token; stav připojení je vidět tamtéž.
2. Ověř server přes `/zdravi` (viz výše). Sync se spouští při startu
   aplikace a po dokončeném testu; v Nastavení jde vyvolat i ručně.
3. Progres se neztrácí — neodeslané položky čekají ve frontě a odejdou po
   obnovení spojení. Položku, kterou server trvale odmítá (4xx, např.
   výsledek mezitím smazané výzvy), fronta zahodí, aby neblokovala zbytek.

**Upload banky nebo výuky vrací chybu:**

- 409 → nezvýšila se verze (server už stejnou nebo vyšší má),
- 400 → JSON neprošel validací (banka: `scripts/validuj-banku.ts`;
  výuka: jednořádkovka z kap. 6b — vypíše proč),
- 413 → soubor je přes limit 10 MB,
- 401 → špatný admin token.
