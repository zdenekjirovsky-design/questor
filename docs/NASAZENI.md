# QUESTOR — nasazení krok za krokem

Návod pro kompletní zprovoznění: z tohoto repozitáře až po nainstalovanou,
samo-aktualizující se aplikaci na studentově Windows 11 a běžící server.
Psáno tak, aby šel projít bez programátorských znalostí — příkazy kopíruj
přesně, spouštěj v Terminálu na Macu ve složce projektu, pokud není řečeno jinak.

> **Důležité (jednorázově):** Rust část aplikace (`aplikace/src-tauri/`) se
> na Macu vůbec nekompiluje — staví ji GitHub Actions na Windows runneru.
> **První build v CI je proto potřeba ověřit** (krok 3): otevři na GitHubu
> záložku Actions a zkontroluj, že workflow `windows-build` doběhl zeleně.
> Případné chyby oprav (nebo nech opravit Clauda) a tag vydej znovu.

---

## 1. Založení GitHub repozitáře a push

1. Přihlas se na https://github.com → vpravo nahoře **+** → **New repository**.
2. Vyplň:
   - **Repository name**: `questor`
   - **Visibility**: repo je **Public** (auto-update i nasazení serveru z něj
     stahují přímo). Ve veřejném repu proto NESMÍ být žádné tokeny ani klíče:
     tokeny žijí jen v env serveru, updater klíče v `~/.questor-keys/`;
     přístup rodiny k serveru řeší rodinný kód (krok 6).
   - Nic dalšího nezaškrtávej (žádné README, .gitignore ani licence — už je máme).
3. Klikni **Create repository**.
4. V Terminálu na Macu:

   ```bash
   cd /Users/zdenekjirovsky/Questor
   git remote add origin https://github.com/zdenekjirovsky-design/questor.git   # už vyplněno: zdenekjirovsky-design
   git push -u origin main
   ```

5. **Doplň skutečnou adresu do konfigurace updateru** — v souboru
   `aplikace/src-tauri/tauri.conf.json` je endpoint updateru zatím jako
   placeholder:

   ```
   https://github.com/zdenekjirovsky-design/questor/releases/latest/download/latest.json
   ```

   URL i pubkey jsou už vyplněné (klíče leží v `~/.questor-keys/` — NIKDY je nedávej do gitu; heslo v `~/.questor-keys/heslo.txt`).
   Adresa `…/releases/latest/download/latest.json` je stálá — vždy míří na
   nejnovější release, nic dalšího se v ní nemění.

   > Pozn.: repo je veřejné, takže release soubory (instalátor, `latest.json`)
   > jsou dostupné přímo — auto-update funguje bez tokenů. Instalátor
   > neobsahuje žádné klíče; podpis updateru zajišťuje, že studentova
   > aplikace přijme jen release podepsaný tvým privátním klíčem.

## 2. Updater klíče (podpis aktualizací)

Aktualizace jsou podepsané — studentova aplikace přijme jen update podepsaný
tvým privátním klíčem. Klíče vygeneruješ jednou a uložíš na dvě místa.

1. Vygenerování (v Terminálu ve složce projektu):

   ```bash
   cd /Users/zdenekjirovsky/Questor/aplikace
   npx tauri signer generate -w ~/.tauri/questor.key
   ```

   Zeptá se na heslo ke klíči — zvol si ho a **zapiš si ho** (bez něj klíč
   nepoužiješ). Příkaz vypíše:
   - **privátní klíč** — uložený v souboru `~/.tauri/questor.key` (NIKDY ho
     nedávej do gitu ani nikam neposílej),
   - **veřejný klíč (pubkey)** — dlouhý řetězec začínající zpravidla
     `dW50cnVzdGVk…`, vypíše se na obrazovku a uloží do `~/.tauri/questor.key.pub`.

2. **Veřejný klíč do konfigurace**: otevři
   `aplikace/src-tauri/tauri.conf.json` a v sekci `plugins.updater` nahraď
   hodnotu `pubkey` (placeholder `PLACEHOLDER-VEREJNY-KLIC-VLOZTE-PODLE-docs/NASAZENI.md`)
   celým obsahem souboru `~/.tauri/questor.key.pub` (jeden dlouhý řádek).
   Změnu commitni a pushni.

3. **Privátní klíč do GitHub Secrets**: na GitHubu v repu →
   **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
     Value: celý obsah souboru `~/.tauri/questor.key`
     (vypíšeš si ho příkazem `cat ~/.tauri/questor.key` a zkopíruješ),
   - Name: `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
     Value: heslo z kroku 1.

## 3. Vydání verze

1. Zvyš číslo verze v `aplikace/src-tauri/tauri.conf.json` (pole `version`,
   např. `0.1.0` → `0.2.0`) — podle něj updater pozná, že existuje novější
   verze. Commitni a pushni.
2. Vytvoř a pushni tag (číslo v tagu = číslo verze s `v` na začátku):

   ```bash
   cd /Users/zdenekjirovsky/Questor
   git tag v0.1.0
   git push --tags
   ```

3. **Co se stane:** push tagu `v*` spustí workflow
   `.github/workflows/windows-build.yml` — GitHub na Windows stroji
   nainstaluje Node 26 a Rust, postaví frontend (`npm run build -w aplikace`),
   pak Tauri build (NSIS instalátor), artefakty updateru podepíše privátním
   klíčem ze Secrets a všechno nahraje do **GitHub Release** k tagu.
   Trvá to zhruba 10–20 minut. Průběh sleduješ na GitHubu v záložce **Actions**.
4. **Kde se vezme instalátor:** na GitHubu → **Releases** → release
   `QUESTOR v0.1.0` → sekce **Assets**:
   - `QUESTOR_0.1.0_x64-setup.exe` — instalátor pro studenta (pošli mu ho,
     nebo mu pošli odkaz na release),
   - `latest.json` + `*.sig` — soubory pro auto-update (nic s nimi neděláš,
     čte si je aplikace sama).

   Student spustí `…-setup.exe`, instalace je na pár kliknutí (instaluje se
   jen pro jeho uživatele, nepotřebuje práva správce).

## 4. Jak funguje auto-update u studenta

- Při každém spuštění se QUESTOR na pozadí podívá na
  `…/releases/latest/download/latest.json` (endpoint z kroku 1.5).
- Když je tam vyšší verze než nainstalovaná, stáhne ji, ověří podpis
  (veřejným klíčem zabudovaným v aplikaci), potichu nainstaluje
  a aplikace se sama restartuje do nové verze.
- Student nic nemačká a nic nestahuje. Bez internetu se prostě nic nestane —
  aplikace normálně běží dál a zkusí to zas příště.
- Tzn. **nová verze aplikace = zopakovat krok 3** (zvýšit verzi, tag, push).
  Nový obsah (banka otázek) žádný release nepotřebuje — nahrává se na server
  (viz `docs/NAVOD.md`).

## 5. Nasazení serveru

Server (`server/`) je malá Node aplikace: distribuce bank a výuky, registr
profilů rodiny (sync mezi zařízeními), sběr progresu, výzvy, volitelně
dogenerování otázek. Poběží kdekoli, kde běží Node 26+ nebo Docker — VPS,
Railway (https://railway.com), Fly.io (https://fly.io). **Produkce běží na
sdíleném hostingu — přesný postup je v kroku 5a níže.**

**Env proměnné (nastav u poskytovatele v sekci Variables/Secrets):**

| Proměnná | Význam |
|---|---|
| `QUESTOR_ADMIN_TOKEN` | tvůj admin token — dlouhý náhodný řetězec (vygeneruj např. `openssl rand -hex 24`) |
| `QUESTOR_STUDENT_TOKEN` | **rodinný kód** — jiný náhodný řetězec, zadává se jednou na každém zařízení rodiny (krok 6) |
| `ANTHROPIC_API_KEY` | volitelné — jen pokud má server umět dogenerovat otázky; bez něj funkce prostě není nabízena |
| `QUESTOR_PORT` | volitelné, default 8787 |
| `QUESTOR_DUVERUJ_PROXY` | volitelné, default 1 — kolik reverzních proxy stojí před serverem (rate limit bere IP klienta z `X-Forwarded-For` tolikátou adresou od konce); `0` = server vystavený přímo, hlavička se ignoruje a platí adresa soketu |

Defaultní tokeny `admin-dev`/`student-dev` jsou JEN pro vývoj — na internetu
vždy nastav vlastní.

**Railway/Fly (přes `server/Dockerfile`):** propoj GitHub repo, jako build
nastav Dockerfile `server/Dockerfile`, doplň env proměnné, deploy. Databáze
je soubor `server/data/questor.db` — u poskytovatele připoj **volume**
na složku `data`, jinak o progres přijdeš při každém redeployi.

**VPS (bez Dockeru):**

```bash
git clone https://github.com/zdenekjirovsky-design/questor.git && cd questor
npm ci
QUESTOR_ADMIN_TOKEN=… QUESTOR_STUDENT_TOKEN=… npm run start -w server
```

**Doporučení:** provozuj za reverse proxy s HTTPS (Caddy je nejjednodušší —
dvouřádkový `Caddyfile` a certifikáty řeší sám; alternativně nginx +
certbot). Railway/Fly dávají HTTPS automaticky. Tokeny chodí v hlavičce,
takže šifrované spojení je nutnost, ne kosmetika.

Ověření: otevři `https://tvuj-server/zdravi` — má vrátit `{ "ok": true, … }`.
Admin rozhraní: `https://tvuj-server/admin` (zadáš admin token).

## 5a. Server na sdíleném hostingu (produkce)

Produkční server běží na stejném hostingu jako webová verze aplikace:
veřejná adresa **https://koordinator-server.cz/questor-api** (stejný origin
jako web `/questor` — projde CSP `connect-src 'self'`, HTTPS řeší hosting).
Uvnitř hostingu běží Node proces přes **pm2** na portu **10121** a Apache
`.htaccess` proxy překládá `/questor-api/*` → `127.0.0.1:10121/*`.

**Předpoklady:** SSH přístup (alias `skull-exon`), Node ≥ 26 na hostingu
(`node --version` — `node:sqlite` nižší verzi nemá), `pm2` v PATH
(jinak jednorázově `npm install -g pm2`).

**1) Jednorázová instalace (na hostingu):**

```bash
ssh skull-exon
git clone https://github.com/zdenekjirovsky-design/questor.git ~/questor-server
cd ~/questor-server
npm ci
```

**2) Tokeny a start přes pm2** — vygeneruj si dva náhodné řetězce a ZAPIŠ
si je (admin token pro sebe, studentský token = rodinný kód pro zařízení
rodiny; kratší, ať se dá opsat na telefonu):

```bash
openssl rand -hex 24   # → QUESTOR_ADMIN_TOKEN
openssl rand -hex 8    # → QUESTOR_STUDENT_TOKEN (rodinný kód)

cd ~/questor-server
QUESTOR_PORT=10121 \
QUESTOR_ADMIN_TOKEN=<admin-token> \
QUESTOR_STUDENT_TOKEN=<rodinny-kod> \
pm2 start npm --name questor-api -- run start -w server

pm2 save    # uloží seznam procesů pro pm2 resurrect
```

Env proměnné si pm2 pamatuje z prvního startu; při změně tokenů proces
spusť znovu s novými hodnotami: `pm2 delete questor-api` a zopakuj
`pm2 start … && pm2 save`. Bez práv na `pm2 startup` (sdílený hosting)
zajistí start po rebootu stroje cron: `crontab -e` a řádek
`@reboot ~/.npm-global/bin/pm2 resurrect` (cestu k pm2 ověř `which pm2`).

**3) Proxy v `.htaccess`** — do `.htaccess` v docrootu webu
(`koordinator-web/.htaccess`, tentýž soubor, který drží zabezpečení webu —
NEPŘEPISOVAT, jen doplnit) přidej NAD SPA fallback:

```apache
RewriteEngine On
RewriteRule ^questor-api/(.*)$ http://127.0.0.1:10121/$1 [P,L]
```

Vyžaduje `mod_proxy` (na hostingu zapnutý). Rate limit serveru bere IP
klienta z `X-Forwarded-For`, kterou Apache proxy doplňuje — výchozí
`QUESTOR_DUVERUJ_PROXY=1` je tady správně, nic nenastavuj.

**4) Ověření:**

```bash
curl https://koordinator-server.cz/questor-api/zdravi
# → {"ok":true,"verze":"…"}
```

**Admin web přes SSH tunel:** stránka `/admin` volá API root-absolutními
cestami (`/api/…`), takže přes prefixovou proxy `/questor-api` nefunguje —
otevírej ji tunelem:

```bash
ssh -L 10121:127.0.0.1:10121 skull-exon
# pak v prohlížeči: http://localhost:10121/admin
```

Uploady bank/výuky z terminálu fungují i přes veřejnou adresu — v návodech
(`docs/NAVOD.md`) dosaď za `https://<server>` plnou bázi
`https://koordinator-server.cz/questor-api`.

**Aktualizace serveru (po každé změně kódu serveru/sdílené vrstvy):**

```bash
ssh skull-exon "cd ~/questor-server && git pull && npm ci && pm2 restart questor-api"
```

**Databáze:** soubor `~/questor-server/server/data/questor.db` (složka
`data/` je v .gitignore, `git pull` ji nechává být). Obsahuje progres,
registr profilů, události a výzvy — občas zazálohuj:

```bash
scp skull-exon:questor-server/server/data/questor.db ~/zalohy/questor-$(date +%F).db
```

## 6. Připojení aplikace na server (rodinný kód)

Sync zapíná **rodinný kód** (= hodnota `QUESTOR_STUDENT_TOKEN`), zadaný
JEDNOU na každém zařízení. Adresu serveru aplikace předvyplní sama podle
prostředí (`urciVychoziNastaveni` v `aplikace/src/sync/klient.ts`):

- desktopová aplikace (Tauri) → `https://koordinator-server.cz/questor-api`,
- webová verze přes https → stejný origin + `/questor-api`,
- vývoj (http + localhost) → `http://localhost:8787` s kódem `student-dev`
  (jediné prostředí s předvyplněným kódem),
- jinde (http přes LAN) → prázdná adresa, sync vypnutý.

Postup na novém zařízení:

1. Buď na obrazovce výběru profilů klikni na **🔗 Připojit rodinu** a zadej
   rodinný kód (adresa zůstává předvyplněná), nebo v **Nastavení →
   Připojení** vyplň pole Rodinný kód (a případně jinou adresu serveru —
   bez lomítka na konci) a Ulož.
2. Aplikace hned stáhne registr profilů rodiny — profily založené na jiných
   zařízeních se objeví jako karty s ☁️ (včetně PINu a studijních bank);
   aktivace profilu stáhne i jeho herní postup. Dál si aplikace stahuje
   banky/výuku ze serveru a posílá progres. Stav připojení je vidět
   v Nastavení a nenápadně na Domů.

**Bez rodinného kódu je sync vypnutý** a aplikace běží čistě lokálně
(bundlovaný obsah, progres jen v zařízení). Aplikace je offline-first:
při výpadku serveru funguje dál a po obnovení spojení se sama
dosynchronizuje. Detaily rodinného provozu: `docs/NAVOD.md`, kap. 4.

## 7. Vývoj na Macu

- Na Macu se vyvíjí **jen webová část**: `npm run dev:aplikace`
  → http://localhost:5173 (plus `npm run dev:server` pro server).
- Rust/Tauri se lokálně nestaví — Windows instalátor vzniká výhradně
  v CI (krok 3). Není potřeba instalovat Rust ani nic z Tauri předpokladů.
- Před commitem: `npm run typecheck && npm test && npm run build -w aplikace`.
- Ikony aplikace jsou zatím placeholder (zlaté „Q“) vygenerované skriptem;
  finální ikonu stačí uložit jako PNG 512×512 a přegenerovat sadu příkazem
  `npx tauri icon cesta/k/ikone.png` spuštěným v `aplikace/`
  (vytvoří soubory v `aplikace/src-tauri/icons/`), commit, push.

---

## Rychlá referenční tabulka

| Chci… | Udělám… |
|---|---|
| vydat novou verzi aplikace | zvýšit `version` v `tauri.conf.json`, commit, `git tag vX.Y.Z && git push --tags` |
| nahrát nové učivo/banku/výuku | `docs/NAVOD.md` (admin web `/admin` nebo generátor CLI) |
| aktualizovat produkční server | `ssh skull-exon "cd ~/questor-server && git pull && npm ci && pm2 restart questor-api"` |
| připojit nové zařízení rodiny | „🔗 Připojit rodinu“ na výběru profilů → rodinný kód (krok 6) |
| změnit tokeny | pm2 delete + start s novými env (krok 5a) + nový rodinný kód do zařízení |
| otevřít admin web produkce | `ssh -L 10121:127.0.0.1:10121 skull-exon` → http://localhost:10121/admin |
| zkontrolovat build | GitHub → Actions → `windows-build` |
| najít instalátor | GitHub → Releases → Assets → `…-setup.exe` |

## Webová verze (PWA) na sdíleném hostingu

Hostovaná verze běží na **https://koordinator-server.cz/questor** — čistě
statické soubory (žádný serverový kód, v docrootu vypnuté PHP, bezpečnostní
hlavičky + CSP v `.htaccess`). Adresa serveru je předvyplněná na stejný
origin (`/questor-api`, viz krok 5a — projde CSP `connect-src 'self'`);
sync se zapíná zadáním rodinného kódu (krok 6).

Aktualizace webu (po každé změně aplikace):

```bash
VITE_ZAKLAD=/questor/ npm run build -w aplikace
rsync -az --delete --exclude='.htaccess' aplikace/dist/ skull-exon:koordinator-web/questor/
```

`.htaccess` v `koordinator-web/` a `koordinator-web/questor/` se NEPŘEPISUJÍ
(drží zabezpečení a SPA fallback). „Přidat na plochu": Android/Chrome nabídne
tlačítko v Nastavení → Aplikace v telefonu; iPhone: Safari → Sdílet → Přidat
na plochu.
