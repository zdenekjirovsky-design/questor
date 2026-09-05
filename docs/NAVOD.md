# QUESTOR — provozní návod pro admina

Praktický postup „mám učební látku → student se ji naučí a testuje“, psaný
pro denní použití. Souvislosti: nasazení serveru a Windows aplikace řeší
`docs/NASAZENI.md`, technický kontrakt `docs/ARCHITEKTURA.md`, závaznou
šablonu obsahu `docs/DIDAKTIKA.md`, didaktické zásady výukových lekcí
`docs/VYUKA.md`.

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

## 3. Přehled o studentech a výzvy

Admin web `https://<server>/admin` (token = `QUESTOR_ADMIN_TOKEN`):

- **Profily** — karta pro každý profil rodiny (naposledy aktivní první):
  jméno, level, XP bar, streak, počet dokončených testů + údaje z registru
  profilů (studijní banky, aktivní banka, PIN ano/ne, čas poslední změny)
  a tlačítko Smazat profil. Studenta i mámu tak sleduješ vedle sebe
  (kap. 4).
- **Poslední testy** (nejnovější první) — sloupec Profil říká, kdo test
  dokončil; u testu z výzvy je vidět její id.
- **Poslat výzvu** — vzkaz + konfigurace testu (předmět, režim, počet
  otázek) + volitelný cíl úspěšnosti + výběr **Komu**: konkrétní profil,
  nebo „všem“. Adresátovi se ukáže na Domů jako „Výzva od táty“; po
  dokončení výzva ze seznamu zmizí a výsledek dorazí mezi poslední
  testy. Výzvu cílenou na jeden profil ostatní profily vůbec nedostanou.
  Pod formulářem je tabulka otevřených výzev (vč. sloupce Komu).

## 4. Profily — víc lidí na jednom počítači

Aplikaci může sdílet celá domácnost (třeba student a jeho máma — dospělá
studentka vaření). Profily fungují jako na streamovacích službách:
ŽÁDNÝ e-mail ani registrace. Bez rodinného kódu zůstává všechno lokálně
v zařízení; s rodinným kódem (viz „Rodinný sync“ níže) se profily
a herní postup synchronizují přes rodinný server na všechna zařízení.
Server profily rozlišuje podle id, které aplikace posílá při synchronizaci
(rodinný kód — studentský token — je pro všechny profily společný).

**Založení profilu (např. mámě):**

1. Na obrazovce „Kdo dnes hraje?“ klikni na kartu **+ Nový profil**.
   (Obrazovka se ukáže po startu aplikace; za běhu se na ni dostaneš
   přes klik na avatara v hlavičce → „Odhlásit profil“.)
2. Vyplň jméno (třeba „Máma“), vyber barvu profilu a volitelně zadej
   **PIN (4–6 číslic)**; tlačítko **Pokračovat →** vede na druhý krok.
3. V kroku **„Co budeš studovat?“** vyber studijní banky profilu —
   aspoň jednu, první vybraná bude aktivní (máma si vybere jen Základy
   profesionálního vaření, student předměty svého ročníku). Tlačítko
   **Hrát!** profil založí a rovnou na něj přepne.
4. Každý profil má VLASTNÍ postup: XP, level, streak, denní questy,
   truhly, sbírku, avatara, postup lekcí i historii testů — a vlastní
   výběr studijních bank. Společný je jen obsah předmětů (banky
   a výuka), takže si nikdo nic nepřepisuje.

**Přepínání:** klik na avatara v hlavičce → menu profilů. Profil bez
PINu se přepne na jeden klik; profil s PINem se přepíná přes odhlášení
a zadání PINu na obrazovce výběru.

**Studijní banky profilu:**

- Výběr z založení jde kdykoli změnit v **Nastavení → Profily →
  Studijní banky**: přidat banku ze zbytku nabídky, odebrat, aktivovat.
  Poslední banka odebrat nejde (aspoň jedna se studuje vždy); postup
  v odebrané bance — statistiky otázek, zvládnutí témat i rozdělané
  questy dne — zůstává uložený a s opětovným přidáním se vrátí.
- **Aktivní banka** se přepíná chipem vedle avataru v hlavičce (ikona
  + název, klik → menu bank) nebo v Nastavení. Řídí denní questy,
  doporučené lekce a předvýběr předmětu testu: questy dne se generují
  z témat aktivní banky a plní je JEN testy a lekce z ní — test nebo
  lekce z jiné banky dává normálně XP, streak i statistiky, jen questy
  nehýbe. Každá banka má vlastní questy dne; přepínání tam a zpět nic
  nezahazuje ani negeneruje znovu.
- Volba předmětu testu (modal „Nová výprava“ i rychlý start na /test)
  a přehled „Učit se“ nabízejí jen banky profilu (aktivní předvybraná,
  resp. první). Ve Statistikách je přepínač bank profilu (výchozí
  aktivní) — témata, graf týdenního XP z testů a poslední testy jsou
  za vybranou banku; level, XP, streak a sbírka zůstávají společné za
  celý profil.

**PIN — měkký zámek soukromí:**

- 4–6 číslic; po 3 špatných pokusech 30 s pauza. Je to ochrana soukromí
  v domácnosti, ne bezpečnostní opatření — data zůstávají v počítači.
- Nastavuje se při založení profilu, nebo kdykoli v **Nastavení →
  Profily** (změna po ověření současného PINu; tamtéž jde PIN zrušit).
- PIN potřebuje zabezpečený kontext (https, localhost nebo desktopová
  aplikace). Na nezabezpečeném připojení (výhled: hostovaná webová
  verze přes http na LAN) se PIN pole schovají s vysvětlením a profil
  je bez zámku — „zamčený“ profil bez funkčního zámku nikdy nevznikne.

**Správa (Nastavení → Profily):** přejmenování, studijní banky a PIN
u aktivního profilu; smazání kteréhokoli profilu kromě posledního
(dvojité potvrzení + opsání jména — smaže XP, sbírku, statistiky
i postup lekcí profilu, nejde vrátit).

**Rodinný sync — jeden profil na všech zařízeních:**

Profil založený na telefonu je vidět i na notebooku (a naopak) — stačí,
aby obě zařízení měla zadaný stejný **rodinný kód** (= studentský token
serveru, `QUESTOR_STUDENT_TOKEN`).

- **Připojení nového zařízení:** na obrazovce výběru profilů klikni na
  **🔗 Připojit rodinu** a zadej rodinný kód (adresa serveru je
  předvyplněná — desktop i web míří na rodinný server automaticky),
  nebo totéž v **Nastavení → Připojení**. Profily rodiny se hned
  stáhnou a objeví jako karty s ☁️; karta 💾 znamená profil jen
  v tomhle zařízení (na server se pushne při nejbližším syncu).
  Postup nasazení serveru a detail výchozích adres: `docs/NASAZENI.md`,
  kroky 5a a 6.
- **Co se synchronizuje:** profil se vším všudy — jméno, barva, PIN
  (přenáší se jen jeho hash, nikdy PIN samotný), avatar, studijní banky
  i aktivní banka — a KOMPLETNÍ herní postup (XP, level, streak, denní
  questy, sbírka karet, statistiky otázek/Leitner, rekordy, vlastněná
  výbava, počet dokončených testů). Na každém zařízení zvlášť zatím zůstávají:
  postup lekcí, historie testů, čekající neotevřené truhly a graf
  týdenního XP per banka.
- **Kdo vyhraje při rozdílu:** poslední zápis (novější čas změny) —
  v rodině se u profilu střídají zařízení, takže se prostě pokračuje
  tam, kde se naposledy skončilo. Při aktivaci profilu se postup ze
  serveru stáhne (HUD chvíli ukazuje „Načítám postup…“); hraní offline
  se pushne, až je zařízení zase online.
- **Smazání profilu** na jednom zařízení ho smaže i na ostatních
  (a s ním jeho progres na serveru; historie testů v admin webu
  zůstává). Profil, který na serveru nikdy nebyl, se z jiného zařízení
  smazat nemůže — a když server vrátí prázdný či cizí registr (např.
  po přeinstalaci), aplikace lokální profily NEsmaže, naopak jimi
  server znovu naplní.
- **Bez rodinného kódu** aplikace běží čistě lokálně jako dřív — sync
  jde kdykoli zapnout dodatečně.

**Profily v admin webu:** každý profil se serverem synchronizuje
zvlášť, takže v sekci Profily vidíš karty všech vedle sebe (doplněné
o studijní banky a stav PINu z registru; profil známý jen z registru má
kartu „zatím žádný progres“) a u posledních testů, kdo je dokončil
(kap. 3). Výzvy jde cílit na konkrétní profil („Komu“). Tlačítkem
**Smazat profil** jde profil odstranit i ze serveru — při dalším syncu
zmizí i ze zařízení rodiny.

**Mobil:** aplikace je responzivní až k šířce telefonu (~375 px) — na
mobilu má spodní navigační lištu, dotykové ovládání widgetů (místo
drag & drop klik-klik) a základ PWA (manifest + ikony) pro výhledovou
hostovanou webovou verzi do telefonu. Desktopové okno se nemění.

## 5. Aplikace bez serveru (bundlovaný obsah)

Aplikace je **offline-first** a plně funkční úplně bez serveru:

- Kompletní obsah — 14 předmětů (1. ročník + Základy profesionálního
  vaření), každý s bankou otázek i výukou —
  je zabalený přímo v aplikaci ve složce `aplikace/src/data/predmety/`
  (kopie souborů z `data/banky/` a `data/vyuka/` 1:1; konvence názvů
  `<predmetId>.banka.json` / `<predmetId>.vyuka.json`, viz README v té
  složce). Testy, lekce, XP, streak, questy, truhly i sbírka jedou
  lokálně, progres se ukládá v aplikaci. Každý JSON je samostatný async
  chunk — obsah nezpomaluje start aplikace, načítá se na pozadí.
- Názvy, ikony a pořadí předmětů v UI určuje ručně psaný registr
  `aplikace/src/data/predmety.ts` (`PREDMETY`). Předmět se v UI ukáže,
  jen když jeho banka reálně existuje (bundle, IndexedDB nebo server).
- Když je server nastavený, ale zrovna nedostupný, nic se neděje: hraje se
  dál a neodeslaný progres čeká ve frontě, která se po obnovení spojení
  sama dosynchronizuje. Žádné chybové hlášky uprostřed hry — stav
  připojení je vidět nenápadně v Nastavení a na Domů.
- Obsah stažený ze serveru (jen vyšší verze než lokální) se ukládá do
  IndexedDB a přežije restart aplikace; instalace bez serveru jede čistě
  z bundlu.
- **Aktualizace bundlovaného obsahu** (pro instalace bez serveru):
  zkopíruj nový JSON 1:1 do `aplikace/src/data/predmety/`, spusť
  `npx tsx scripts/kontrola-integrace.ts` a vydej novou verzi aplikace
  (`docs/NASAZENI.md`, krok 3). Novější verze obsahu se prosadí i proti
  obsahu uloženému v existující instalaci.

## 6. Předměty a přidání nového (i dalšího ročníku)

Aktuálně bundlovaných 14 předmětů — 13 z 1. ročníku (obor Ekonomika
a podnikání): Ekonomika a podnikání, Písemná a elektronická komunikace,
Informatika, Český jazyk a literatura, Anglický jazyk, Německý jazyk,
Matematika, Dějepis, Občanská nauka, Fyzika, Chemie, Biologie a ekologie,
Zbožíznalství — plus Základy profesionálního vaření (`zaklady-vareni`,
předmět mimo obor: QUESTOR je obecný, učí se v něm i dospělí členové
rodiny). Volba předmětu je první krok při konfiguraci testu
(modal „Nová výprava“ na Domů i rychlý start na /test); „Učit se“
a Témata ve Statistikách jsou členěné per předmět. Nabízejí se přitom
jen studijní banky daného profilu (kap. 4).

Přidání nového předmětu — **další ročník = nový předmět s vlastním id**
(např. `matematika-2` pro matematiku 2. ročníku; id je kebab-case slug):

1. Ulož učivo: `data/uciva/<novy-predmet>.md` (nebo .txt/.pdf/.docx).
   Piš ho podle šablony `docs/DIDAKTIKA.md` (závazná struktura a kvalita).
2. Vygeneruj banku s novým id (krok 1 výše):

   ```bash
   npm run generuj -- --vstup "$PWD/data/uciva/<novy-predmet>.md" \
     --predmet <novy-predmet> --nazev "Název nového předmětu"
   ```

   Pozor: `temaId` a id otázek musí být unikátní napříč VŠEMI předměty
   (temaId je routa `/uceni/:temaId` a klíč postupu lekcí) — hlídá to
   `npx tsx scripts/kontrola-integrace.ts`
   a `aplikace/test/predmety.test.ts`.
3. Zvaliduj a nahraj na server (kroky 1.3 a 2). Aplikace si novou banku
   stáhne při nejbližším syncu — stahují se všechny banky ze serveru,
   i dosud neznámé.
4. Přidej předmět do registru `aplikace/src/data/predmety.ts`
   (`PREDMETY`: id, název, ikona — pořadí v poli = pořadí v UI). Bez
   záznamu předmět funguje taky, jen s názvem z banky a obecnou ikonou 📘.
5. Má-li předmět fungovat i BEZ serveru, zkopíruj JSONy do
   `aplikace/src/data/predmety/` a vydej novou verzi aplikace (kap. 5,
   poslední bod).

## 7. Výuka — lekce k předmětu

Výuka jsou interaktivní lekce po tématech (texty, obrázky, hry, kartičky,
mini-kvízy); student je najde v aplikaci pod „Učit se“. Obsah je JSON
(`VyukaPredmetu`) a teče stejnou cestou jako banka: vygenerovat →
zvalidovat → nahrát na server (nebo bundlovat). Didaktická vodítka
k obsahu: `docs/VYUKA.md`.

### 7a. Vygenerování výuky

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

### 7b. Validace a kontrola

Generátor výstup validuje sám (`validujVyuku`). Po RUČNÍ editaci souboru
zvaliduj z kořene projektu:

```bash
npx tsx scripts/validuj-vyuku.ts data/vyuka/<predmet>.json
```

Vypíše lekce a rozpis bloků. Křížové kontroly proti bance (vazba lekcí
na témata, kolize id) navíc udělá `npx tsx scripts/kontrola-integrace.ts`
(běží nad bundlovanou složkou `aplikace/src/data/predmety/`).

Pak si lekce projdi očima studenta: `npm run dev:aplikace` →
http://localhost:5173 → „Učit se“. Zkontroluj věcnou správnost textů
i SVG obrázků (v obou režimech vzhledu) a že mini-kvízy dávají smysl.

### 7c. Nahrání na server

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

### 7d. Lekce pro úplně nový předmět

1. Učivo → banka → nahrání banky: kap. 6.
2. Výuka: `--vyuka` (kap. 7a) + kontrola (7b) + nahrání (7c).
3. Má-li předmět fungovat v aplikaci i BEZ serveru, zkopíruj JSONy 1:1 do
   `aplikace/src/data/predmety/<predmet>.banka.json`
   a `<predmet>.vyuka.json` (konvence viz README v té složce) a vydej
   novou verzi aplikace (`docs/NASAZENI.md`).

> Dokončená lekce dává XP jen poprvé v den; projít ji znovu jde kdykoli
> („Projít znovu“ na konci lekce). Tlačítko „Otestuj se z tématu“ na
> konci lekce funguje pro každý předmět.

## 8. Dogenerování otázek (volitelné)

Server umí na vyžádání dogenerovat otázky k tématu
(`POST /api/generovani/dogenerovat`) — jen když má v prostředí
`ANTHROPIC_API_KEY`. Bez klíče vrací 503 a funkce se tváří jako vypnutá,
nic dalšího není potřeba. Klientská část v aplikaci zatím není
implementovaná — endpoint jde volat ručně/skriptem. Kontext pro
generování si server skládá ze zadání a vysvětlení existujících otázek
tématu (zdrojové učivo na serveru není).

## 9. Tokeny

- `QUESTOR_ADMIN_TOKEN` a `QUESTOR_STUDENT_TOKEN` se nastavují v env
  serveru; defaulty `admin-dev`/`student-dev` jsou JEN pro lokální vývoj.
- Admin token zadáváš v admin webu (a u `--server`/curl). Studentský
  token je **rodinný kód**: zadává se JEDNOU na každém zařízení
  („🔗 Připojit rodinu“ na výběru profilů, nebo Nastavení → Připojení)
  a je SPOLEČNÝ pro všechny profily i zařízení rodiny — kdo je kdo,
  rozlišuje aplikace sama (`profilId` posílaný se synchronizací, kap. 4).
  Admin token smí i všechno studentské.
- Repo je veřejné — tokeny NIKDY nepatří do kódu ani do commitů, žijí
  jen v env serveru (a rodinný kód v zařízeních rodiny).
- Server má na `/api/*` rate limit 240 požadavků/min na IP (brzda hrubé
  síly na tokeny na veřejné adrese) — běžný provoz rodiny se ho nedotkne.

## 10. Řešení potíží

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
- Pro hráče to není havárie: aplikace jede dál offline (kap. 5).

**Aplikace nesynchronizuje:**

1. V aplikaci Nastavení zkontroluj URL serveru (bez lomítka na konci)
   a rodinný kód; stav připojení je vidět tamtéž. 401 = špatný rodinný
   kód; bez kódu je sync schválně vypnutý a aplikace jede jen lokálně.
2. Ověř server přes `/zdravi` (viz výše). Sync se spouští při startu
   aplikace, po dokončeném testu a při otevření výběru profilů;
   v Nastavení jde vyvolat i ručně.
3. Progres se neztrácí — neodeslané položky čekají ve frontě a odejdou po
   obnovení spojení. Položku, kterou server trvale odmítá (4xx, např.
   výsledek mezitím smazané výzvy), fronta zahodí, aby neblokovala zbytek.

**Na druhém zařízení nevidím profil / postup:**

1. Obě zařízení musí mít STEJNÝ rodinný kód a adresu téhož serveru
   (kap. 4, Rodinný sync). Na výběru profilů má dole svítit
   „☁️ Rodina připojena“.
2. Profil se přenáší při syncu — otevři výběr profilů nebo dej
   v Nastavení „Synchronizovat teď“ na OBOU zařízeních (nejdřív na tom,
   kde profil vznikl).
3. Herní postup se stahuje při aktivaci profilu (LWW — vyhrává novější
   změna). Postup lekcí a historie testů se zatím nepřenášejí — to není
   chyba.

**Upload banky nebo výuky vrací chybu:**

- 409 → nezvýšila se verze (server už stejnou nebo vyšší má),
- 400 → JSON neprošel validací (banka: `scripts/validuj-banku.ts`;
  výuka: `scripts/validuj-vyuku.ts` — vypíše proč),
- 413 → soubor je přes limit 10 MB,
- 401 → špatný admin token.
