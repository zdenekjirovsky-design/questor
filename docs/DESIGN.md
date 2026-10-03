# QUESTOR — design manuál

Vizuální jazyk je součást produktu: aplikace má působit jako hra, ne jako
školní software. Cíl: student ji otevírá rád. Všechno níž je závazné.

## Téma: „Noční akademie“

Temný vesmírně-fialový svět s zlatými akcenty odměn. Panely jako karty ze hry,
jemné záře (glow), gradient pozadí, výrazný display font na nadpisy a čísla.
Žádný světlý režim — hra má jednu identitu.

## Tokeny (`aplikace/src/styl/tokeny.css` — ZMRAZENÝ soubor)

- Pozadí `--pozadi` #0f0d1a s radiálním gradientem; panely `--pozadi-panel`
  / `--pozadi-panel-2`, okraje `--okraj`.
- Akcent fialová `--akcent` (#8b5cf6) = akce a postup; zlatá `--zlata`
  (#f5b942) = XP, odměny, streak; `--uspech` zelená = správně; `--chyba`
  červená = špatně (nikdy nepoužívat na nic jiného!).
- Vzácnosti karet: obyčejná šedá, vzácná modrá `--info`, epická fialová
  `--akcent`, legendární zlatá `--zlata`.
- Fonty: `--pismo-display` (Chakra Petch) na nadpisy, čísla XP, levely,
  countdowny; `--pismo` (Inter) na běžný text. Fonty jsou bundlované
  (@fontsource) — žádné CDN.
- Radiusy 14/8, stíny `--stin`, záře `--zare-akcent` / `--zare-zlata`.

## Herní „juice“ (klíč k psychologickým hookům)

Odměna, která nezažhne obrazovku, jako by nebyla. Pravidla:

1. **Každé XP je vidět**: po odpovědi vyletí „+30 XP“ (float-up + fade),
   XP bar v HUD se dolije animovaně; při level-upu celoobrazovkový moment
   (pop levelu + záře). Combo se ukazuje jako narůstající násobič (×1.4…),
   při přerušení viditelně spadne.
2. **Truhla je EVENT**: na výsledkové stránce zavřená truhla (barva dle typu),
   klik → `zatreseni` → otevření → odměna vyskočí s `pop` + konfety
   (CSS částice, žádná knihovna). Nikdy neotevírat automaticky — klik je
   součást rituálu.
3. **Správně/špatně okamžitě**: zelené podsvícení + fajfka / červené
   + zatřesení odpovědi (0.3 s), pak vysvětlení. Rychlé, nepřerušující flow.
4. **Streak**: plamínek 🔥 s číslem v HUD; den bez aktivity = plamínek
   pohasíná (vizuální tah k návratu). Zmrazení = ledová varianta.
5. **Karty**: flip animace při zisku (rub → líc), vzácnost = barva rámu
   a intenzita záře; nezískané karty v sbírce jako tmavé siluety
   („co mi chybí“ táhne víc než „co mám“).
6. **Denní questy**: progress bar na každém, splnění = checkmark s `pop`
   + částicová mikrooslava na kartě questu.

Animace: jen `transform`/`opacity` (výkon), délky 200–400 ms, easing
`ease-out`; keyframes `pop`, `naskoceni`, `zatreseni`, `pulz-zare`,
`pulz-zare-zlata`, `vznaseni` jsou v global.css. `prefers-reduced-motion`
je respektováno globálně.

## Layout

- Max šířka 1080 px, velkorysé mezery, karty v mřížce (CSS grid).
- Domů = herní dashboard: nahoře HUD (avatar, level + XP bar, streak),
  velké „HRÁT“ (primární akce, zlaté tlačítko), pod tím denní questy
  a rychlé statistiky. Vše důležité bez scrollu (1080p).
- Test: jedna otázka na obrazovku, velké klikací možnosti (celá karta je
  tlačítko), nahoře tenký progress testu + combo, dole nic rušivého.
- Klávesnice: možnosti 1–4/A–D, Enter = potvrdit/další. Hráč nesmí
  potřebovat myš.

## Tón textů

Česky, kamarádsky, hráčsky, stručně. Chvála konkrétní („5 v řadě! Combo ×1.5“),
neúspěch bez moralizování („Tahle ti ještě uteče. Mrkni proč:“). Žádné
vykřičníkové přehánění na každém kroku — vzácnost dělá hodnotu.

## Avatar

Plně přizpůsobitelná SVG postavička (vrstvené SVG, viewBox 200×200),
srozumitelná komukoli: volba muž/žena (jemně odlišná silueta a rysy),
tři tvary obličeje, 5 barev pleti, 12 barev vlasů a 5 střihů — krátké,
polodlouhé, rozpuštěné, culík, vlnité. Libovolná kombinace pro obě pohlaví.

Kosmetická výbava padá z truhel (sloty hlava/oči/krk/pozadí, vzácnostní
barvy stejné jako u karet Velikánů). Vrstvy jsou kreslené tak, aby výbava
seděla na všech střizích: čepice kryje temeno, u dlouhých střihů vlasy
přirozeně koukají zpod ní zadní vrstvou. Výchozí pozadí je vesmír Noční
akademie; varianty (město v noci, hory, neonová zeď, stadion) jsou položky
výbavy.

Editor v Nastavení: velký živý náhled, výběry jako klikací karty s mini
náhledy, palety pleti a vlasů, výbava po slotech — vlastněné kusy se
nasazují/sundávají kliknutím, nevlastněné jsou tmavé siluety s vzácností
a textem „najdeš v truhle“ (stejný tah „co mi chybí“ jako u sbírky).
Změny se ukládají tlačítkem Uložit; vše je dostupné klávesnicí.

## Profily

Výběr profilu je celoobrazovková brána ve stylu streamovacích služeb:
logo QUESTOR, nadpis „Kdo dnes hraje?“, velké klikací karty (avatar
v kruhu s okrajem v barvě profilu, jméno, zámeček 🔒 u profilu s PINem)
+ tečkovaná karta „+ Nový profil“. Karty naskakují postupně (`naskoceni`
se zpožděním), hover = zvednutí + záře v barvě profilu. Paleta barev
profilů je v `stav/profilySlice.ts` (`BARVY_PROFILU`).

PIN dialog: velký vstup s prostrkanými tečkami, chyby červeně, po 3
špatných pokusech odpočet 30 s. Vše jde klávesnicí (formuláře odesílá
Enter). V hlavičce je avatar tlačítko s okrajem v barvě profilu — klik
otevře menu s profily (tečka barvy, jméno, zámeček, fajfka u aktivního)
a „Odhlásit profil“. Obrazovky profilů jsou responzivní (mobil: menší
karty, vše na šířku 375 px).

## Mobil (≤ 760 px)

Aplikace je použitelná na telefonu (~375×812) i tabletu; výhled je
hostovaná PWA verze (iOS Safari, Android Chrome, PWA na ploše). VŠECHNA
mobilní pravidla žijí za media query `(max-width: 760px)` (dotykové
výjimky za `(pointer: coarse)`, hover efekty za `(hover: hover)`) —
desktop/Tauri okno 1280×800 se jimi NESMÍ změnit. Závazné zásady:

1. **Hlavička a navigace**: nahoře zůstává jen logo + HUD (avatar, chip
   aktivní banky, level, XP bar bez čísla na nejužších displejích,
   plamínek). Chip banky se smršťuje přednostně (level + XP bar mají
   min-width a nikdy nekolabují); na ≤ 480 px chip ukazuje jen ikonu —
   název zůstává v title/aria-label. Na ≤ 400 px je HUD kompaktní
   (rozpočet ~201 px vedle loga, dotykové plochy dál 44 px), na ≤ 350 px
   zůstane z loga jen erb. Do řádku HUD nesmí vstoupit nic, co se objeví
   asynchronně — stav syncu je na mobilu jen odznak ☁️ na avataru (text
   jen pro čtečky). Flex limity patří na flex položku samotnou (obal), ne
   na tlačítko uvnitř. Menu v hlavičce jsou na mobilu `position: fixed`
   k viewportu (horní hrana z `--hud-menu-top`) — předci HUD proto nesmí
   dostat `transform`/`filter`/`backdrop-filter`; scrollují uvnitř, končí
   nad lištou a zavírají se Escapem nebo ťuknutím mimo. Překryv je
   ztmavený s `touch-action: none` (gesta přes stránku blokuje), proto se
   menu na mobilu scrollem stránky NEzavírá — scroll window tam bývá jen
   systémový/programový; nad 760 px (absolutní menu odjíždí se stránkou)
   se scrollem zavírá.
   Hlavní navigace je fixní spodní lišta s ikonami a mini popisky (styl
   mobilních her, z-index 30, položky s `-webkit-touch-callout: none`).
   App.tsx je zmrazený, ikony proto dodává CSS podle `href` odkazu
   (App.css); obsah stránky má spodní odsazení, aby ho lišta nepřekryla
   (+ `env(safe-area-inset-bottom)`).
2. **Mřížky do jednoho sloupce**: dashboard, lekce, klíčové pojmy, témata
   ve statistikách; sbírka drží 2 sloupce (karty 3:4). Mřížky se 3 a více
   sloupci (srovnávač) jsou na ≤ 560 px karty pod sebou. Mřížka s `1fr`
   a širokým/nowrap obsahem potřebuje `minmax(0, 1fr)` + `min-width: 0`
   na položkách, jinak vnitřní `overflow-x: auto` nikdy nezačne scrollovat.
3. **Modaly přes celou obrazovku** (`100dvh`, bez radiusu): volba výpravy,
   otevírání truhly, detail karty ve sbírce, výzva na duel. Pravidla:
   pozadí modalu `z-index ≥ 50` (nad lištou 30, menu HUD 40/41 i panelem
   třídičky 31); safe-area padding nahoře i dole (`calc(… + env(safe-area-
   inset-top/bottom))` — viewport-fit=cover); modal s třídou `.panel` se
   píše se DVĚMA třídami (`.panel.domu__modal`) včetně paddingu, nulového
   radiusu a bočních rámečků — jinak ho přebije `.panel` z global.css
   (radius, rámeček, na mobilu `padding: 14px`), který je v bundlu poslední;
   scrollující modal má `overscroll-behavior: contain` a stránku pod ním
   zamyká `pouzijZamekScrollu` (`komponenty/zamekScrollu.ts`, jen
   ≤ 760 px); hlavní akce dlouhého modalu sedí v přilepené patičce
   (`position: sticky`, neprůhledné pozadí, spodní safe-area uvnitř);
   sticky obdélník je zmenšený o padding scrollujícího modalu (Blink
   i WebKit), proto má patička záporný `bottom` = −spodní padding modalu
   (`calc(-14px - env(safe-area-inset-bottom))`), s `bottom: 0` by pod ní
   prosvítal obsah; obsah vyšší než obrazovka se v modalu s pevnou výškou
   vystřeďuje auto marginy, ne `justify-content: center` (horní část by
   odjela nad okraj scrollu). Každý mobilní přepis `top`/`padding`
   u sticky a fixed prvků musí zachovat `env(safe-area-inset-*)`.
   `position: fixed` uvnitř bloku lekce jde přes portál do `body`
   (`animace-naskoceni` drží transform).
4. **Dotyková plocha ≥ 44×44 px** pro všechny ovládací prvky (globálně
   `.tlacitko`, chipy témat, taby, pilulky procesů, štítky třídičky,
   hotspoty popisovačky přes `pointer: coarse`). Husté hotspoty se na
   dotyku vybírají podle nejbližšího bodu (`nejblizsiBod`).
5. **Inputy min. 16 px písma** (jinak iOS Safari zoomuje při fokusu).
   Pole odpovědi (doplňovací otázka v testu, duelu i mini-kvízu) se na
   dotyku samo nefokusuje (vyjela by klávesnice a posunula stránku); na
   desktopu autofocus s `preventScroll`, v lekci jen u aktivního bloku.
   Dialogy, kde je psaní jediná akce (PIN, rodinný kód), fokusují pole
   i na dotyku.
6. **Žádný horizontální scroll stránky** — široký obsah (tabulka historie,
   časová osa) scrolluje uvnitř vlastního kontejneru s `overflow-x: auto`
   (tabulka historie a zvětšené schéma navíc `overscroll-behavior-x:
   contain`, aby dojetí na konec nespustilo gesto zpět); pojistka
   `overflow-x: clip` na html/body platí jen na mobilu. Široká SVG schémata
   mají přepínač „🔍 Zvětšit“ s vodorovným scrollem uvnitř plátna — jen
   tam, kde zvětšení opravdu zvětšuje (úzká/svislá schémata ho nemají; kde
   se zvětšená šířka vejde do plátna — telefon na šířku, malý tablet — se
   lupa skryje, měří ResizeObserver); absolutní bubliny v malých scénách
   jsou na mobilu statický blok pod scénou.
7. **Dotyk místo drag & drop**: HTML5 DnD na dotyku nefunguje — Třídička
   na hrubém pointeru (`jeDotykoveZarizeni()`,
   `vyuka/widgety/dotyk.ts`) vypíná `draggable` a jede klik-klik; po
   výběru štítku vyjede panel košů přilepený nad lištou (z-index 31,
   `bottom: 66px + safe-area`).
8. **Hover jen pro myš**: KAŽDÉ pravidlo se `:hover` je uvnitř
   `@media (hover: hover) { … }` (i vnořeně v mobilním bloku) — na dotyku
   :hover „lepí“ na naposledy ťuknutém prvku (karta zůstane zvednutá,
   možnost vypadá vybraná). Kombinovaný selektor se rozdělí: část
   s `:focus-visible` zůstane venku, `:hover` jde dovnitř se stejnými
   deklaracemi na stejném místě souboru; `:active` a `:focus-visible` se
   neobalují. Na desktopu (myš) vypadá hover stejně jako dřív — obalení
   ho jen omezí na myš; kde by hover přebil aktivní/vybraný stav, má ten
   stav vlastní `:hover` selektor. Hover je vždy jen ozdoba — každá akce
   má klikový ekvivalent.
9. **Scroll řídí aplikace, ne náhoda**: reset při navigaci dělá globálně
   `komponenty/ResetScrollu.tsx` (nová stránka začíná nahoře, zpět/vpřed
   vrací pozici; za běhu `history.scrollRestoration = 'manual'`, při
   odchodu/skrytí stránky se vrací `'auto'`, takže po reloadu pozici
   obnoví prohlížeč) — stránky po změně routy samy `scrollTo(0, 0)`
   nevolají. Stránka se sama posouvá JEN po explicitní akci studenta
   („Pokračovat ↓“, „Dokončit lekci“, „Projít znovu“, odpověď, „Další“),
   nikdy po syncu ani načtení obsahu; na mobilu ani po splnění kvízu či
   widgetu (pod splněným blokem je nenápadné „Pokračovat ↓“), desktop po
   nich najede na další blok jako dřív. Posun jen podle potřeby
   (`nearest` / „jen když je nad okrajem“, `testy/posun.ts`); blok lekce
   na mobilu `block: 'start'` + `scroll-margin-top` = změřená výška sticky
   lišty + 16 px + safe-area (desktop střed, vysoký blok začátek —
   `zarovnaniBloku`), cíle u spodku `scroll-margin-bottom: calc(76px +
   env(safe-area-inset-bottom))`. Plynulý scroll z JS hlídá reduced motion
   sám (`chovaniPosunu`).
10. **Nic se nehýbe pod prstem**: prvek, který se objeví asynchronně, má
    rezervované místo; varianty proměnné výšky (strany kartičky, detaily
    procesu a časové osy) leží v jedné buňce mřížky jako neviditelné
    rezervy; seznam obnovovaný ze sítě nepřeskládá karty pod prstem
    (změna čeká za fixní lištou „Nové…“, prázdný seznam se nahradí hned).
    Duely při otevření stránky dělají jen lehkou obnovu seznamu (nejvýš
    1× za 45 s na profil, `duely/obnoveni.ts`); když ve frontě syncu něco
    čeká (např. neodeslaný výsledek duelu), pustí plný sync, který frontu
    odešle. Rychle se měnící čísla jsou `inline-block` s `min-width`
    v `ch` (+ `tabular-nums`).
11. **Gesta a viewport**: `html { touch-action: manipulation }` globálně
    (bez zoomu dvojklepem a 300ms čekání; pinch zůstává);
    `touch-action: none` jen na plochách s vlastním gestem nebo pod
    překryvy. Pull-to-refresh je na mobilu vypnutý
    `overscroll-behavior-y: contain` na html/body. Výška stránky
    `min-height: 100vh` a za ním `100svh` (html/body/#koren i brána
    profilů), fullscreen modaly `100dvh`. Pozadí kreslí na mobilu fixní
    `body::before` (100lvh) — `html` nesmí mít vlastní pozadí a `body`
    ne `background-attachment: fixed`.
12. **Ochrana proti dvojímu ťuknutí**: panel otázky (test, host duel)
    zahodí kliky myší/dotykem prvních 350 ms po zobrazení
    (`testy/ochranaKliku.ts`, fáze capture), u rodinného duelu celá sekce
    otázky vč. power-upů; klávesnice se neblokuje. Čas duelu se měří
    syrově od zobrazení otázky — prodleva ho neposouvá, server i starší
    klienti počítají stejně. Nápověda kláves („(Enter)“) je ve
    `span.napoveda-klavesy`, na `(pointer: coarse)` skrytá.
13. **Výkon a animace**: na mobilu žádný `backdrop-filter` pod
    neprůhlednými panely; trvale viditelné pulzy záře (dashboard Domů) jdou
    přes `opacity` pseudo-elementů, ne nekonečnou animací `box-shadow`
    (mřížka sbírky pulzuje jen 3 cykly a zůstane klidná záře) — nové
    nekonečné pulzy `box-shadow` na mobil nepřidávat; částice a konfety
    ve scrollujícím kontejneru bez `overflow: hidden` (modal) mají
    `animation-fill-mode: backwards` (ne `both` — koncový transform by
    rozšiřoval scrollovatelnou plochu; vzor truhla); absolutní prvek
    s `left: 50%` a zalamováním má `width: max-content`. Reduced motion
    nechá animaci proběhnout jednou — nekonečná animace proto nesmí končit
    neviditelným stavem (`both`/`forwards`).
14. **Načítání a soubory**: líné stránky vždy přes `lazySObnovou`
    (po nasazení se chybějící chunk jednou obnoví, jinak panel
    „Načíst znovu“), nikdy holé `React.lazy`. Obrázky ze souborů
    uživatele jen jako `data:` URL (CSP `img-src 'self' data:` blokuje
    `blob:`); fotky se dekódují po jedné (`poJedne`), `bitmap.close()`
    a plátno zmenšit na 0×0 (paměť iOS). Avatar v menším kontejneru
    řídí velikost CSS (`svg { width/height: 100% }`).
