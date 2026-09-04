# Bundlované vzorové předměty

Sem patří JSON soubory vzorových předmětů, které se bundlují do aplikace
(offline-first základ vedle `../demo-banka.json`). Načítá je `../predmety.ts`
přes `import.meta.glob` — chybějící soubor build neshodí, vadný soubor se
jen zaloguje a přeskočí.

Konvence názvů:

- `<predmetId>.banka.json` — `BankaOtazek` (musí projít `validujBanku`)
- `<predmetId>.vyuka.json` — `VyukaPredmetu` (musí projít `validujVyuku`)

Příklad (doplní integrace fáze 2): `zbozinalstvi.banka.json`,
`zbozinalstvi.vyuka.json` — kopie `data/banky/zbozinalstvi.json`
a `data/vyuka/zbozinalstvi.json` z kořene monorepa.
