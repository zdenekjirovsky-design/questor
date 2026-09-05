# QUESTOR — výuka: didaktické zásady

Výuková část (fáze 2) je IMPLEMENTOVANÁ. Technický kontrakt (datový model,
widget registr, API, generátor `--vyuka`, gamifikace lekcí) je závazně
v `docs/ARCHITEKTURA.md` (sekce Výuka + Datový kontrakt, Server, Generátor);
provozní postup „vygenerovat → zvalidovat → nahrát“ v `docs/NAVOD.md`
(kap. 8). Tenhle dokument drží jen DIDAKTICKÉ zásady — čím se řídí obsah
lekcí, ať ho generuje Claude, nebo vzniká ručně.

## Zásady obsahu lekcí

- Cíl: co nejsnazší pochopení látky — vizuálně, hravě, bez stěn textu.
  Student se učivo nejdřív naučí (lekce), pak ho testuje; výuka je cesta,
  test je důkaz (mistrovství témat řídí výhradně testy).
- Obsah je DATA (JSON), komponenty jsou OBECNÉ — žádný blok ani widget se
  nepíše pro konkrétní obor.
- Struktura dobré lekce: úvodní text → klíčové pojmy → aspoň 1 SVG obrázek
  → aspoň 1 interaktivní widget → kartičky na zapamatování → 2 mini-kvízy
  (kontrola pochopení hned po výkladu) → příklad z praxe.
- Text: mini-markdown (krátké odstavce, **tučné** pojmy, odrážky) — žádné
  stěny textu.
- SVG: generovatelné Claudem; barvy VÝHRADNĚ přes `currentColor` a CSS
  proměnné tokenů (nikdy natvrdo), aby obrázek fungoval v obou režimech
  vzhledu. Věcnou správnost obrázku kontrolovat stejně přísně jako text.
- Widget volit podle povahy látky: třídění do kategorií (`tridicka`),
  párování pojmů (`pexeso`), postupy a procesy (`prubeh-procesu`), stavba
  věci (`popisovacka`), vývoj v čase (`casova-osa`), porovnání sortimentu
  (`srovnavac`). `popisovacka`/`casova-osa` jen když pro ně existují
  smysluplná data — generátor je sám nenavrhuje.
- Mini-kvíz je plnohodnotná `Otazka` — `vysvetleni` je povinné a učí
  i při špatné odpovědi.

## Vzorové předměty

- `ekonomika-podnikani` — banka otázek z fáze 1 (9 témat, 72 otázek),
  bez výuky.
- `zbozinalstvi` („Zbožíznalství“) — kompletní vzor fáze 2: učivo
  `data/uciva/zbozinalstvi.md`, banka `data/banky/zbozinalstvi.json`
  (5 témat, 65 otázek), výuka `data/vyuka/zbozinalstvi.json` (5 lekcí:
  základy zbožíznalství, potravinářské zboží, drobné zboží, obuv a kožená
  galanterie, textil a odívání; každá lekce drží strukturu výše). Banka
  i výuka jsou bundlované v aplikaci (`aplikace/src/data/predmety/`).
