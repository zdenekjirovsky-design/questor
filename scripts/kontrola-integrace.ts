// Integrační kontrola obsahu napříč VŠEMI předměty:
//   npx tsx scripts/kontrola-integrace.ts [složka]
// Výchozí složka: aplikace/src/data/predmety (bundlované kopie).
//
// Kontroluje:
//  1. každý *.banka.json projde validujBanku, každý *.vyuka.json projde validujVyuku,
//  2. predmetId je unikátní a odpovídá názvu souboru,
//  3. temaId jsou unikátní napříč všemi předměty,
//  4. id otázek (banky + mini-kvízy výuk) jsou unikátní napříč všemi předměty,
//  5. každá lekce má temaId existující v bance svého předmětu,
//  6. každý widget má widgetId z povolené šestice,
//  7. výuka bez banky téhož předmětu = chyba.
// Při neshodě vypíše všechny nálezy a skončí s kódem 1.

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { validujBanku, validujVyuku } from '@questor/sdilene';
import type { BankaOtazek, VyukaPredmetu } from '@questor/sdilene';

const POVOLENE_WIDGETY = new Set([
  'tridicka',
  'pexeso',
  'prubeh-procesu',
  'popisovacka',
  'casova-osa',
  'srovnavac',
]);

const slozka = process.argv[2] ?? 'aplikace/src/data/predmety';
const soubory = readdirSync(slozka).filter((s) => s.endsWith('.json'));
const chyby: string[] = [];

const banky = new Map<string, BankaOtazek>();
const vyuky = new Map<string, VyukaPredmetu>();

for (const soubor of soubory.sort()) {
  const cesta = join(slozka, soubor);
  const nazev = basename(soubor);
  const jeBanka = nazev.endsWith('.banka.json');
  const jeVyuka = nazev.endsWith('.vyuka.json');
  if (!jeBanka && !jeVyuka) {
    chyby.push(`${nazev}: neočekávaný JSON (není *.banka.json ani *.vyuka.json)`);
    continue;
  }
  const idZeSouboru = nazev.replace(/\.(banka|vyuka)\.json$/, '');
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(cesta, 'utf8'));
  } catch (e) {
    chyby.push(`${nazev}: nejde načíst jako JSON (${e instanceof Error ? e.message : e})`);
    continue;
  }
  try {
    if (jeBanka) {
      const banka = validujBanku(data);
      if (banka.predmetId !== idZeSouboru) {
        chyby.push(`${nazev}: predmetId „${banka.predmetId}“ ≠ název souboru „${idZeSouboru}“`);
      }
      if (banky.has(banka.predmetId)) chyby.push(`${nazev}: duplicitní predmetId banky „${banka.predmetId}“`);
      banky.set(banka.predmetId, banka);
    } else {
      const vyuka = validujVyuku(data);
      if (vyuka.predmetId !== idZeSouboru) {
        chyby.push(`${nazev}: predmetId „${vyuka.predmetId}“ ≠ název souboru „${idZeSouboru}“`);
      }
      if (vyuky.has(vyuka.predmetId)) chyby.push(`${nazev}: duplicitní predmetId výuky „${vyuka.predmetId}“`);
      vyuky.set(vyuka.predmetId, vyuka);
    }
  } catch (e) {
    chyby.push(`${nazev}: ${e instanceof Error ? e.message : e}`);
  }
}

// temaId a id otázek unikátní napříč předměty
const videnaTemata = new Map<string, string>(); // temaId -> predmetId
const videnaIdOtazek = new Map<string, string>(); // id -> kde
let otazekBanky = 0;
let tematCelkem = 0;
for (const [pid, banka] of banky) {
  for (const t of banka.temata) {
    tematCelkem += 1;
    const drive = videnaTemata.get(t.id);
    if (drive) chyby.push(`temaId „${t.id}“ je v předmětech „${drive}“ i „${pid}“`);
    else videnaTemata.set(t.id, pid);
  }
  for (const o of banka.otazky) {
    otazekBanky += 1;
    const drive = videnaIdOtazek.get(o.id);
    if (drive) chyby.push(`id otázky „${o.id}“ (banka ${pid}) koliduje s: ${drive}`);
    else videnaIdOtazek.set(o.id, `banka ${pid}`);
  }
}

// výuky: vazba na banku, mini-kvízy, widgety
let lekciCelkem = 0;
let miniKvizu = 0;
let widgetu = 0;
for (const [pid, vyuka] of vyuky) {
  const banka = banky.get(pid);
  if (!banka) {
    chyby.push(`výuka „${pid}“ nemá banku téhož předmětu`);
    continue;
  }
  const temataBanky = new Set(banka.temata.map((t) => t.id));
  for (const lekce of vyuka.lekce) {
    lekciCelkem += 1;
    if (!temataBanky.has(lekce.temaId)) {
      chyby.push(`lekce „${lekce.temaId}“ (${pid}) nemá téma v bance předmětu`);
    }
    for (const blok of lekce.bloky) {
      if (blok.typ === 'mini-kviz') {
        miniKvizu += 1;
        const o = blok.otazka;
        const drive = videnaIdOtazek.get(o.id);
        if (drive) chyby.push(`id otázky „${o.id}“ (mini-kvíz ${pid}/${lekce.temaId}) koliduje s: ${drive}`);
        else videnaIdOtazek.set(o.id, `mini-kvíz ${pid}/${lekce.temaId}`);
      }
      if (blok.typ === 'widget') {
        widgetu += 1;
        if (!POVOLENE_WIDGETY.has(blok.widgetId)) {
          chyby.push(`widget „${blok.widgetId}“ (${pid}/${lekce.temaId}) není v povolené šestici`);
        }
      }
    }
  }
}

console.log(`Složka: ${slozka}`);
console.log(
  `Předměty: ${banky.size} bank, ${vyuky.size} výuk | témat ${tematCelkem}, otázek v bankách ${otazekBanky}, ` +
    `lekcí ${lekciCelkem}, mini-kvízů ${miniKvizu}, widgetů ${widgetu}`,
);
if (chyby.length) {
  console.error(`\nNALEZENO ${chyby.length} CHYB:`);
  for (const ch of chyby) console.error(`  – ${ch}`);
  process.exit(1);
}
console.log('VŠECHNY KONTROLY OK');
