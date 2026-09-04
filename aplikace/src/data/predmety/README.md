# Bundlovaný obsah předmětů

Sem patří JSON soubory předmětů, které se bundlují do aplikace
(offline-first základ). Načítá je `../predmety.ts` přes `import.meta.glob`
**bez eager** — každý soubor je samostatný async chunk (počáteční JS bundle
se obsahem nenafukuje), chybějící soubor build neshodí a vadný soubor se
při načtení jen zaloguje a přeskočí.

Metadata předmětů (id, název, ikona) drží ručně psaný registr
v `../predmety.ts` (`PREDMETY`). Předmět se v UI ukáže, jen když jeho
banka reálně existuje (tady, v IndexedDB, nebo na serveru); soubor bez
záznamu v registru dostane v UI název z banky a obecnou ikonu 📘.

Konvence názvů:

- `<predmetId>.banka.json` — `BankaOtazek` (musí projít `validujBanku`)
- `<predmetId>.vyuka.json` — `VyukaPredmetu` (musí projít `validujVyuku`)

Typicky kopie `data/banky/<id>.json` a `data/vyuka/<id>.json` z kořene
monorepa. `temaId` a id otázek (vč. mini-kvízů `mk-…`) nesmí kolidovat
napříč předměty — hlídá to `aplikace/test/predmety.test.ts`, který také
selže, když je kterýkoli přítomný soubor nevalidní.
