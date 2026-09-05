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
