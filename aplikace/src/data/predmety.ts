// Registr predmetu aplikace.
//
// Dve vrstvy:
//  1. PREDMETY — rucne psana metadata VSECH ocekavanych predmetu (id, nazev,
//     ikona). Metadata jsou levna a bundluji se vzdy; urcuji nazvy, ikony
//     a poradi predmetu v UI.
//  2. Obsah (banky otazek a vyuky) — JSON soubory ve slozce ./predmety/,
//     nacitane LINE pres import.meta.glob (BEZ eager): kazdy soubor je
//     samostatny async chunk a do pocatecniho JS bundle se nedostane.
//
// Predmet se v UI ukaze, jen kdyz jeho banka REALNE existuje (bundlovana,
// z IndexedDB nebo ze serveru) — samotna polozka v metadatech nic nezobrazi.
// Soubory vznikaji paralelne s vyvojem aplikace: chybejici soubor je
// NORMALNI stav, vadny soubor se jen zaloguje a preskoci.
//
// Konvence nazvu souboru ve slozce ./predmety/:
//   <predmetId>.banka.json  → BankaOtazek (validuje validujBanku)
//   <predmetId>.vyuka.json  → VyukaPredmetu (validuje validujVyuku)
import { validujBanku, validujVyuku } from '@questor/sdilene';
import type { BankaOtazek, VyukaPredmetu } from '@questor/sdilene';

// ---------------------------------------------------------------------------
// Metadata predmetu (rucne udrzovany seznam — poradi = poradi v UI)

export interface PredmetMetadata {
  id: string;
  nazev: string;
  ikona: string;
}

export const PREDMETY: PredmetMetadata[] = [
  { id: 'ekonomika-podnikani', nazev: 'Ekonomika a podnikání', ikona: '💼' },
  { id: 'pisemna-komunikace', nazev: 'Písemná a elektronická komunikace', ikona: '⌨️' },
  { id: 'informatika', nazev: 'Informatika', ikona: '💻' },
  { id: 'cesky-jazyk', nazev: 'Český jazyk a literatura', ikona: '📚' },
  { id: 'anglicky-jazyk', nazev: 'Anglický jazyk', ikona: '🇬🇧' },
  { id: 'nemecky-jazyk', nazev: 'Německý jazyk', ikona: '🇩🇪' },
  { id: 'matematika', nazev: 'Matematika', ikona: '📐' },
  { id: 'dejepis', nazev: 'Dějepis', ikona: '🏛️' },
  { id: 'obcanska-nauka', nazev: 'Občanská nauka', ikona: '⚖️' },
  { id: 'fyzika', nazev: 'Fyzika', ikona: '🚀' },
  { id: 'chemie', nazev: 'Chemie', ikona: '⚗️' },
  { id: 'biologie-ekologie', nazev: 'Biologie a ekologie', ikona: '🌿' },
  { id: 'zbozinalstvi', nazev: 'Zbožíznalství', ikona: '📦' },
  { id: 'zaklady-vareni', nazev: 'Základy profesionálního vaření', ikona: '🍳' },
];

const METADATA_MAPA = new Map(PREDMETY.map((p) => [p.id, p]));

/** Metadata predmetu, nebo undefined pro neznamy id (napr. cizi banka ze serveru). */
export function metadataPredmetu(id: string): PredmetMetadata | undefined {
  return METADATA_MAPA.get(id);
}

/** Nazev predmetu z registru; pro neznamy id zaloha (typicky banka.nazev) nebo id. */
export function nazevPredmetu(id: string, zaloha?: string): string {
  return METADATA_MAPA.get(id)?.nazev ?? zaloha ?? id;
}

/** Ikona predmetu z registru; pro neznamy id obecna knizka. */
export function ikonaPredmetu(id: string): string {
  return METADATA_MAPA.get(id)?.ikona ?? '📘';
}

/**
 * Seradi id predmetu podle poradi v registru; neznama id (napr. predmet
 * nahrany jen na server) az na konec, abecedne.
 */
export function seradPredmety(ids: string[]): string[] {
  const poradi = new Map(PREDMETY.map((p, i) => [p.id, i]));
  return ids
    .slice()
    .sort(
      (a, b) =>
        (poradi.get(a) ?? Number.MAX_SAFE_INTEGER) - (poradi.get(b) ?? Number.MAX_SAFE_INTEGER) ||
        a.localeCompare(b, 'cs'),
    );
}

// ---------------------------------------------------------------------------
// Bundlovany obsah — LINE nacitani (kazdy JSON je vlastni async chunk)

type NacitacModulu = () => Promise<unknown>;

/** Cesta → lazy loader. Klice existuji uz pri buildu, obsah se stahuje az na vyzadani. */
const soubory = import.meta.glob('./predmety/*.json', {
  import: 'default',
}) as Record<string, NacitacModulu>;

/** Ma predmet bundlovanou banku otazek? (Rozhoduje jen existence souboru.) */
export function maBundlovanouBanku(predmetId: string): boolean {
  return `./predmety/${predmetId}.banka.json` in soubory;
}

/** Ma predmet bundlovanou vyuku? */
export function maBundlovanouVyuku(predmetId: string): boolean {
  return `./predmety/${predmetId}.vyuka.json` in soubory;
}

async function nactiSoubory<T>(
  pripona: string,
  validuj: (data: unknown) => T,
): Promise<T[]> {
  const vysledky: T[] = [];
  for (const [cesta, nacti] of Object.entries(soubory)) {
    const nazevSouboru = cesta.split('/').pop() ?? cesta;
    if (!nazevSouboru.endsWith(pripona)) {
      if (!nazevSouboru.endsWith('.banka.json') && !nazevSouboru.endsWith('.vyuka.json')) {
        console.warn(`Neznamy soubor predmetu „${nazevSouboru}“ — cekam *.banka.json nebo *.vyuka.json`);
      }
      continue;
    }
    try {
      vysledky.push(validuj(await nacti()));
    } catch (chyba) {
      // Vadny (nebo nenacitatelny) bundlovany soubor nesmi shodit aplikaci.
      console.error(`Bundlovany soubor „${nazevSouboru}“ neprosel validaci:`, chyba);
    }
  }
  return vysledky;
}

/** Nacte a zvaliduje vsechny bundlovane banky (vadne preskoci). */
export function nactiBundlovaneBanky(): Promise<BankaOtazek[]> {
  return nactiSoubory('.banka.json', validujBanku);
}

/** Nacte a zvaliduje vsechny bundlovane vyuky (vadne preskoci). */
export function nactiBundlovaneVyuky(): Promise<VyukaPredmetu[]> {
  return nactiSoubory('.vyuka.json', validujVyuku);
}
