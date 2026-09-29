# Zpracování látky od studenta (naplánovaná úloha na Macu správce)

Student (jen profil povolený v přehledu rodiny — přepínač „📤 Smí posílat
látku") pošle z aplikace fotky zápisků nebo dokumenty (stránka `/latka`,
tlačítko v Učit se). Server je drží ve frontě. Tuhle frontu zpracovává
**naplánovaná úloha Claude Code na Macu správce pod jeho předplatným** — žádný
API klíč, přihlášení ke Claudovi nikdy neopustí Mac. Zveřejnění je
**automatické** po nezávislé kontrole; správce dostane upozornění a v přehledu
rodiny může změnu vrátit (`↩️ Vrátit změnu`).

Nástroj pro práci se serverem: `npx tsx scripts/materialy.ts …` (admin kód bere
z `~/.questor-keys/tokeny.txt` — nikdy ho nevypisuj ani nekopíruj do repa).

## Postup jednoho běhu

Pracuj v `~/Questor`. Nejvýš **2 zásilky za běh** (limity předplatného); zbytek
počká na další běh.

1. **Příprava**: `git pull --ff-only`, pak `npx tsx scripts/materialy.ts fronta`.
   Prázdná fronta → konec běhu, nic neoznamuj.
2. **Převzetí**: `npx tsx scripts/materialy.ts stav <id> zpracovava "Zpracovávám tvoji látku…"`
   a `npx tsx scripts/materialy.ts stahni <id>` → soubory v `podklady/<id>/`
   (gitignored — fotky sešitu jsou soukromé, NIKDY je necommituj).
3. **Přepis**: přečti všechny soubory (fotky nástrojem Read, PDF po stránkách,
   DOCX `textutil -convert txt -stdout <soubor>`), poznámku studenta ber jako
   kontext (co ho čeká, co chce procvičit). Přepis ulož do
   `podklady/<id>/prepis.md` ve stylu dřívějších přepisů: učitelovy
   formulace, výčty a pořadí přesně; nejistá čtení a prázdná místa označ
   `[…]`; kde je zápis věcně sporný, poznač to. **Nečitelné nebo nesmyslné
   podklady** (rozmazané fotky, cizí obsah, něco, co není školní látka) →
   `stav <id> chyba "<lidsky: co je špatně a co má poslat znovu>"`,
   upozorni správce a pokračuj další zásilkou.
4. **Kam to patří**: předmět podle volby studenta (`predmetId`), u „jiný /
   nevím" podle obsahu. Projdi existující `data/uciva/<predmet>.md`, banku
   a výuku: látka, která už v předmětu je, se DOPLNÍ do existujícího tématu;
   nová látka = nové téma (zařaď ho podle pořadí v sešitě — aktuálně
   probíraná látka patří k začátku předmětu, viz dřívější zařazení
   Potřeb a Statků v ekonomice). Úplně nový předmět (mimo registr
   `aplikace/src/data/predmety.ts`) → postup „Nový předmět" níže.
5. **Tvorba** (subagent — autor, prompt podle vzoru níže): učivo (`## `
   kapitoly), otázky v bance (≥ 10 na nové téma, u rozšíření přiměřeně),
   lekce podle ZÁVAZNÉ šablony `docs/DIDAKTIKA.md`. Verze banky i výuky
   **o 1 výš než na serveru** (`npx tsx scripts/materialy.ts verze <predmet>`),
   `vytvoreno` = dnešek. Validace: `npx tsx scripts/validuj-banku.ts …`,
   `npx tsx scripts/validuj-vyuku.ts …`, `npx tsx scripts/kontrola-integrace.ts`.
6. **Oponentura** (JINÝ subagent, jen čte — prompt podle vzoru níže): shoda
   s přepisem, fakta, klíče všech otázek, struktura DIDAKTIKA, data widgetů,
   SVG. Potvrzené nálezy oprav (kritické a střední vždy), validace znovu.
   Neprojde-li obsah ani po opravě → `stav <id> chyba "…"`, NIC nezveřejňuj.
7. **Bundle a testy**: kopie 1:1 do `aplikace/src/data/predmety/<predmet>.banka.json`
   a `.vyuka.json` (`cmp`), `npx vitest run --root aplikace test/predmety.test.ts`
   a `npx vitest run --root sdilene test/schema.test.ts`.
8. **Zveřejnění**:
   `npx tsx scripts/materialy.ts zverejni <id> --predmety <predmet> --temata <temaId1,temaId2> --zprava "<pro studenta: co přibylo, např. Přibyla lekce Škody a ochrana zboží a 21 otázek.>"`
   — nahraje vyšší verze na server (aplikace si je stáhnou samy), uloží
   evidenci verzí pro „vrátit" a uzavře zásilku jako hotovou s odkazy na lekce.
9. **Commit**: jen výčtem cest (`data/uciva/…`, `data/banky/…`, `data/vyuka/…`,
   bundle kopie, případně `docs/VYUKA.md`), NIKDY `git add -A` ani `podklady/`;
   zpráva „Látka od <jméno>: <co přibylo>" + povinný podpis; `git push`.
10. **Upozornění správci** (PushNotification, je-li k dispozici): jedna věta
    — kdo poslal, co přibylo, případně co bylo nejisté.

Chyba kdykoli v průběhu (validace, server, limit předplatného) → zásilku vrať
do `ceka` (nebo `chyba` s lidskou zprávou, pokud jde o podklady), nic
nezveřejňuj napůl. Zaseknutou zásilku (`zpracovava` déle než 3 h) nabídne
příkaz `fronta` znovu.

## Nový předmět

Založ ho podle `docs/NAVOD.md` kap. 7 (registr `aplikace/src/data/predmety.ts`
+ bundle kopie), zveřejni obsah jako výš a nasaď web (`docs/NASAZENI.md` —
`VITE_ZAKLAD=/questor/ npm run build -w aplikace` + rsync bez `.htaccess`).
Desktop dostane předmět s příští vydanou verzí; do té doby ho student má ve
webové verzi. „Vrátit" nový předmět automaticky neumí — řeší ho správce.

## Vzor promptu pro autora (subagent)

> Pracuješ na projektu QUESTOR (~/Questor). NEJDŘÍV si přečti docs/DIDAKTIKA.md,
> docs/VYUKA.md, přepis `podklady/<id>/prepis.md` a soubory předmětu
> (učivo, banka, výuka — drž PŘESNĚ jejich JSON formát). ZDROJ PRAVDY =
> přepis zápisků: student bude zkoušen z učitelových formulací, výčtů
> a pořadí; nejistá čtení doplň věcně správně podle oboru a doplněné
> příklady podávej jako příklady, ne jako učitelův výčet. Tón pro 16letého
> (tenisky, mobil, brigáda…), žádné stěny textu. Úkol: <doplnit téma X /
> nové téma Y na pozici Z>. Dodávky: učivo, otázky (≥ 10 na nové téma,
> obtížnosti ~1:3:4:4:1, mix typů, aplikační situace, distraktory = typické
> záměny, vysvětlení říká PROČ), lekce podle povinné struktury (hook,
> K čemu ti to je, SVG nesoucí strukturu, 2 mini-kvízy, widget, řešený
> příklad, kartičky, shrnutí), verze o 1 výš než na serveru, validace.
> Stávající obsah neměň (jen pořadí). Výstup: změněné soubory, počty,
> co jsi doplnil nad rámec zápisků, nejistá místa.

## Vzor promptu pro oponenta (subagent, nic nemění)

> Jsi oponent — zkušený učitel předmětu. NIC NEMĚŇ. Zkontroluj nové části
> proti přepisu `podklady/<id>/prepis.md`: shoda se zápisky (pojmy, výčty,
> pořadí), fakta, klíče VŠECH otázek a mini-kvízů (právě jedna obhajitelně
> správná možnost, jednoznačné dvojice), struktura DIDAKTIKA, data widgetů,
> texty SVG, pořadí témat a verze. Výstup: JSON pole nálezů
> `{ soubor, misto, popis, zavaznost: kriticka|stredni|nizka, scenar, navrhOpravy }`,
> jen skutečné chyby.
