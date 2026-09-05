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
hostovaná PWA verze. VŠECHNA mobilní pravidla žijí za media query
`(max-width: 760px)` (dotykové výjimky za `(pointer: coarse)`) —
desktop/Tauri okno 1280×800 se jimi NESMÍ změnit. Závazné zásady:

1. **Hlavička a navigace**: nahoře zůstává jen logo + HUD (avatar, chip
   aktivní banky, level, XP bar bez čísla na nejužších displejích,
   plamínek). Chip banky se smršťuje přednostně (level + XP bar mají
   min-width a nikdy nekolabují); na ≤ 480 px chip ukazuje jen ikonu —
   název zůstává v title/aria-label. Hlavní navigace je
   fixní spodní lišta s ikonami a mini popisky (styl mobilních her).
   App.tsx je zmrazený, ikony proto dodává CSS podle `href` odkazu
   (App.css); obsah stránky má spodní odsazení, aby ho lišta nepřekryla
   (+ `env(safe-area-inset-bottom)`).
2. **Mřížky do jednoho sloupce**: dashboard, lekce, klíčové pojmy, témata
   ve statistikách; sbírka drží 2 sloupce (karty 3:4).
3. **Modaly přes celou obrazovku** (`100dvh`, bez radiusu): volba výpravy,
   otevírání truhly, detail karty ve sbírce, výzva na duel. Fullscreen modal
   si MUSÍ sám přidat safe-area padding (`calc(… + env(safe-area-inset-top/
   bottom))` — viewport-fit=cover, jinak hlavička zajede pod výřez iPhonu
   a spodní tlačítko pod home indikátor; vzor `.duely__modal` v Duely.css).
4. **Dotyková plocha ≥ 44×44 px** pro všechny ovládací prvky (globálně
   `.tlacitko`, chipy témat, taby, pilulky procesů, štítky třídičky,
   hotspoty popisovačky přes `pointer: coarse`).
5. **Inputy min. 16 px písma** (jinak iOS Safari zoomuje při fokusu).
6. **Žádný horizontální scroll stránky** — široký obsah (tabulka historie,
   časová osa) scrolluje uvnitř vlastního kontejneru s `overflow-x: auto`;
   pojistka `overflow-x: clip` na html/body platí jen na mobilu.
7. **Dotyk místo drag & drop**: HTML5 DnD na dotyku nefunguje — Třídička
   na hrubém pointeru (`jeDotykoveZarizeni()`,
   `vyuka/widgety/dotyk.ts`) vypíná `draggable` a jede klik-klik (nápověda
   koše se přizpůsobí). Hover stavy jsou všude jen ozdoba — každá akce má
   klikový ekvivalent.
