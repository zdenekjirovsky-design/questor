// Mapa vzorovych predmetu bundlovanych v aplikaci (offline-first zaklad).
// Kazdy predmet muze mit banku otazek a/nebo vyuku. Soubory se nacitaji
// pres import.meta.glob, takze build NESPADNE, kdyz nejaky soubor jeste
// neexistuje — integrace je pak jen prida do slozky ./predmety/.
//
// Konvence nazvu souboru ve slozce ./predmety/:
//   <predmetId>.banka.json  → BankaOtazek (validuje validujBanku)
//   <predmetId>.vyuka.json  → VyukaPredmetu (validuje validujVyuku)
// Vadny soubor se jen zaloguje a preskoci — nikdy neshodi aplikaci.
import { validujBanku, validujVyuku } from '@questor/sdilene';
import type { BankaOtazek, VyukaPredmetu } from '@questor/sdilene';
import demoBankaJson from './demo-banka.json';

export interface VzorovyPredmet {
  banka?: BankaOtazek;
  vyuka?: VyukaPredmetu;
}

/** Soubory predmetu — glob je vyhodnoceny pri buildu, chybejici slozka = prazdna mapa. */
const soubory = import.meta.glob('./predmety/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

function sestavMapu(): Record<string, VzorovyPredmet> {
  const mapa: Record<string, VzorovyPredmet> = {};

  // Demo banka ekonomiky (faze 1) — bundluje se napevno.
  try {
    const banka = validujBanku(demoBankaJson);
    mapa[banka.predmetId] = { banka };
  } catch (chyba) {
    console.error('Bundlovana demo banka neprosla validaci:', chyba);
  }

  // Dalsi vzorove predmety ze slozky ./predmety/ (napr. zbozinalstvi).
  for (const [cesta, obsah] of Object.entries(soubory)) {
    const nazevSouboru = cesta.split('/').pop() ?? cesta;
    try {
      if (nazevSouboru.endsWith('.banka.json')) {
        const banka = validujBanku(obsah);
        mapa[banka.predmetId] = { ...mapa[banka.predmetId], banka };
      } else if (nazevSouboru.endsWith('.vyuka.json')) {
        const vyuka = validujVyuku(obsah);
        mapa[vyuka.predmetId] = { ...mapa[vyuka.predmetId], vyuka };
      } else {
        console.warn(`Neznamy soubor predmetu „${nazevSouboru}“ — cekam *.banka.json nebo *.vyuka.json`);
      }
    } catch (chyba) {
      // Vadny bundlovany soubor nesmi shodit aplikaci — jen se nenabidne.
      console.error(`Bundlovany soubor „${nazevSouboru}“ neprosel validaci:`, chyba);
    }
  }

  return mapa;
}

/** predmetId → { banka?, vyuka? } vsech vzorovych predmetu bundlovanych v aplikaci. */
export const VZOROVE_PREDMETY: Record<string, VzorovyPredmet> = sestavMapu();

/** Vsechny bundlovane banky (uz zvalidovane). */
export function bundlovaneBanky(): BankaOtazek[] {
  return Object.values(VZOROVE_PREDMETY)
    .map((p) => p.banka)
    .filter((b): b is BankaOtazek => b !== undefined);
}

/** Vsechny bundlovane vyuky (uz zvalidovane). */
export function bundlovaneVyuky(): VyukaPredmetu[] {
  return Object.values(VZOROVE_PREDMETY)
    .map((p) => p.vyuka)
    .filter((v): v is VyukaPredmetu => v !== undefined);
}
