# QUESTOR — didaktika (závazná šablona obsahu)

Obsah QUESTORu stojí na ověřených poznatcích psychologie učení. Tenhle
dokument je ZÁVAZNÝ pro každého, kdo tvoří učivo, banky otázek a lekce —
člověka i Clauda. Doplňuje `docs/VYUKA.md` (technika lekcí) o „proč a jak".

## Principy (a co z nich plyne)

1. **Testing effect / retrieval practice** — vybavování upevňuje paměť víc
   než opakované čtení. → Mini-kvízy hned po výkladu, testy jako hlavní
   nástroj učení, kartičky na vybavování (ne na koukání).
2. **Spacing** — rozložené opakování poráží šprtání na jeden zátah.
   → Leitnerovy boxy v testech (má aplikace), krátké lekce po jednom tématu,
   otázky se vracejí.
3. **Interleaving** — míchání témat zlepšuje rozlišování a transfer.
   → Režim standard míchá témata; banka má u každého tématu otázky, které
   se odkazují na sousední témata (srovnávací otázky).
4. **Dual coding / multimédia (Mayer)** — slovo + obraz > slovo samotné,
   ale obrázek musí NÉST OBSAH, ne zdobit. → Každá lekce ≥ 1 SVG diagram,
   který zachycuje strukturu/mechanismus látky; popisek vysvětluje, co vidím.
5. **Cognitive load (Sweller)** — pracovní paměť je malá. → Bloky lekce
   krátké (1 myšlenka na blok), postupné odkrývání, řešené příklady
   (worked examples) PŘED samostatným řešením, žádné stěny textu.
6. **Konkrétní příklady a elaborace** — abstrakce se drží na konkrétech.
   → POVINNÝ blok „K čemu ti to je" v každé lekci: skutečná situace ze
   života šestnáctiletého studenta (nákup, brigáda, hry, mobil, sport),
   kde látku reálně použije. Vysvětlení otázek vždy říkají PROČ.
7. **Generation effect** — co si vytvořím/roztřídím sám, to si pamatuju.
   → Widgety = aktivní zpracování (třídění, párování, popisování), ne
   pasivní prohlížení.
8. **Příběh a emoce** — narativ drží pozornost a paměť. → Lekce začíná
   mini-příběhem/hookem (2–4 věty, konkrétní situace, ideálně s napětím
   nebo humorem), ne definicí.
9. **Desirable difficulties** — přiměřená obtíž učení prospívá. → V bance
   preferovat doplňování a aplikaci před čistým rozpoznáváním; obtížnost
   5 = transfer do nové reálné situace (výpočet, rozhodnutí, diagnóza).
10. **Motivace (sebedeterminační teorie)** — autonomie (student si volí
    režim a témata), kompetence (obtížnost roste plynule, okamžitá zpětná
    vazba), vztahovost (výzvy od táty). Odměny nikdy netrestají — neúspěch
    jen neodměníme, nikdy nebereme.

## Povinná struktura lekce (pořadí bloků)

1. `text` — **hook**: mini-příběh ze života studenta (2–4 věty).
2. `text` — výklad 1. části (segmentovaně, tučné pojmy, odrážky).
3. `text` — **„K čemu ti to je"**: reálné použití látky (začni přesně
   nadpisem `**K čemu ti to je:**`).
4. `obrazek` — SVG diagram nesoucí strukturu látky.
5. `mini-kviz` — kontrola pochopení 1. části.
6. `text` — výklad 2. části.
7. `widget` — aktivní zpracování (třídička/pexeso/proces/popisovačka/osa/srovnávač
   — vyber podle povahy látky, viz VYUKA.md).
8. `mini-kviz` — kontrola 2. části.
9. `priklad` — řešený příklad z praxe (u jazyků vzorový minidialog).
10. `karticky` — 6–10 kartiček na vybavování (pojem → vysvětlení;
    u jazyků slovíčko → překlad).
11. `text` — shrnutí ve 3–5 odrážkách.

Pořadí lze mírně přizpůsobit látce, ale hook, „K čemu ti to je", SVG,
2× mini-kvíz, widget, kartičky a shrnutí jsou povinné vždy.

## Banka otázek — pravidla kvality

- ≥ 8 otázek na téma; rozložení obtížností ~1:2:2:2:1; mix typů
  ~45 % vyber, ~15 % multi, ~15 % anone, ~15 % doplneni, ~10 % prirazovani.
- Otázky pokrývají: vybavení pojmu → porozumění (proč) → aplikaci
  (spočítej/rozhodni/vyber v situaci). Obtížnost 4–5 vždy aplikační.
- Distraktory = typické žákovské chyby, ne nesmysly. Právě jedna správná
  u `vyber` (ověř, že distraktor není taky obhajitelný).
- `vysvetleni` (povinné): PROČ je správně správně + PROČ jsou lákavé
  distraktory špatně (1–3 věty). To je hlavní učební moment.
- `doplneni`: uveď všechny uznatelné varianty (s diakritikou i bez,
  synonyma, číslice/slovo).
- U jazyků: `doplneni` na tvary a překlady, `prirazovani` na páry
  CZ ↔ cizí jazyk, `vyber` na význam v kontextu (celá věta).

## Jazyk a tón

Česky, kamarádsky, přesně. Krátké věty. Humor střídmě (líp v hooku
a příkladech než ve výkladu). Nikdy neponižovat („to je přece jasné" ne).
Reálie aktuální k roku 2026 (ceny, sazby, technologie).
