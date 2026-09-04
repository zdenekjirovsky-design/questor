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

## 1. Založení PRIVÁTNÍHO GitHub repozitáře a push

1. Přihlas se na https://github.com → vpravo nahoře **+** → **New repository**.
2. Vyplň:
   - **Repository name**: `questor`
   - **Visibility**: **Private** (nutné — v repu jsou učební materiály a konfigurace)
   - Nic dalšího nezaškrtávej (žádné README, .gitignore ani licence — už je máme).
3. Klikni **Create repository**.
4. V Terminálu na Macu:

   ```bash
   cd /Users/zdenekjirovsky/Questor
   git remote add origin https://github.com/VYPLNIT/questor.git   # VYPLNIT = tvůj GitHub účet
   git push -u origin main
   ```

5. **Doplň skutečnou adresu do konfigurace updateru** — v souboru
   `aplikace/src-tauri/tauri.conf.json` je endpoint updateru zatím jako
   placeholder:

   ```
   https://github.com/VYPLNIT/questor/releases/latest/download/latest.json
   ```

   Nahraď `VYPLNIT` svým GitHub uživatelským jménem (stejně jako v kroku 4).
   Adresa `…/releases/latest/download/latest.json` je stálá — vždy míří na
   nejnovější release, nic dalšího se v ní nemění.

   > Pozn.: u privátního repa jsou i release soubory privátní. Buď nastav
   > repo jako Private a **releases stahuj ručně** (auto-update pak nefunguje
   > bez tokenu), nebo — doporučeno — nech repo Private a vytvoř **druhé,
   > veřejné repo jen na releases** (např. `questor-releases`, bez kódu)
   > a endpoint nasměruj tam; workflow pak publikuje release do něj (v
   > `windows-build.yml` by se doplnil parametr `owner`/`repo` u tauri-action
   > a token s právy k tomu repu). Nejjednodušší start: **repo s kódem klidně
   > Private, releases repo Public** — instalátor neobsahuje učivo ani klíče.

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

Server (`server/`) je malá Node aplikace: distribuce bank, sběr progresu,
výzvy, volitelně dogenerování otázek. Poběží kdekoli, kde běží Node 26+
nebo Docker — VPS, Railway (https://railway.com), Fly.io (https://fly.io).

**Env proměnné (nastav u poskytovatele v sekci Variables/Secrets):**

| Proměnná | Význam |
|---|---|
| `QUESTOR_ADMIN_TOKEN` | tvůj admin token — dlouhý náhodný řetězec (vygeneruj např. `openssl rand -hex 24`) |
| `QUESTOR_STUDENT_TOKEN` | token studenta — jiný náhodný řetězec, zadá se do aplikace (krok 6) |
| `ANTHROPIC_API_KEY` | volitelné — jen pokud má server umět dogenerovat otázky; bez něj funkce prostě není nabízena |
| `QUESTOR_PORT` | volitelné, default 8787 |

Defaultní tokeny `admin-dev`/`student-dev` jsou JEN pro vývoj — na internetu
vždy nastav vlastní.

**Railway/Fly (přes `server/Dockerfile`):** propoj GitHub repo, jako build
nastav Dockerfile `server/Dockerfile`, doplň env proměnné, deploy. Databáze
je soubor `server/data/questor.db` — u poskytovatele připoj **volume**
na složku `data`, jinak o progres přijdeš při každém redeployi.

**VPS (bez Dockeru):**

```bash
git clone https://github.com/VYPLNIT/questor.git && cd questor
npm ci
QUESTOR_ADMIN_TOKEN=… QUESTOR_STUDENT_TOKEN=… npm run start -w server
```

**Doporučení:** provozuj za reverse proxy s HTTPS (Caddy je nejjednodušší —
dvouřádkový `Caddyfile` a certifikáty řeší sám; alternativně nginx +
certbot). Railway/Fly dávají HTTPS automaticky. Tokeny chodí v hlavičce,
takže šifrované spojení je nutnost, ne kosmetika.

Ověření: otevři `https://tvuj-server/zdravi` — má vrátit `{ "ok": true, … }`.
Admin rozhraní: `https://tvuj-server/admin` (zadáš admin token).

## 6. Přesměrování studentovy aplikace na server

1. V aplikaci QUESTOR otevři stránku **Nastavení**.
2. Do pole **URL serveru** zadej adresu z kroku 5 (např.
   `https://questor.example.com` — bez lomítka na konci),
   do pole **token** zadej hodnotu `QUESTOR_STUDENT_TOKEN`.
3. Ulož — aplikace si stáhne aktuální banku otázek a začne posílat progres.
   Stav připojení je vidět v Nastavení a nenápadně na Domů.

Aplikace je offline-first: bez serveru funguje dál (vestavěná demo banka,
progres lokálně) a po obnovení spojení se sama dosynchronizuje.

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
| nahrát nové učivo/banku | `docs/NAVOD.md` (admin web `/admin` nebo generátor CLI) |
| změnit tokeny | env na serveru + student v Nastavení |
| zkontrolovat build | GitHub → Actions → `windows-build` |
| najít instalátor | GitHub → Releases → Assets → `…-setup.exe` |
