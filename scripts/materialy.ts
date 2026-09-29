// Zpracovatel látky — pomocník naplánované úlohy Claude Code na Macu správce
// (postup: docs/ZPRACOVANI-LATKY.md). Mluví se serverem admin kódem, který
// NIKDY není v repu: env QUESTOR_ADMIN_TOKEN, jinak ~/.questor-keys/tokeny.txt
// (řádek ADMIN_TOKEN=…). Adresa: env QUESTOR_URL (výchozí produkce).
//
//   npx tsx scripts/materialy.ts fronta                  čekající látka (nejstarší první)
//   npx tsx scripts/materialy.ts stahni <id>             soubory do podklady/<id>/
//   npx tsx scripts/materialy.ts stav <id> <stav> [zpráva]
//   npx tsx scripts/materialy.ts verze <predmetId>       verze banky a výuky na serveru
//   npx tsx scripts/materialy.ts zverejni <id> --predmety a[,b] --temata t1[,t2] --zprava "…"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  BankaOtazek,
  FrontaMaterialu,
  Material,
  PublikaceMaterialu,
  StavMaterialu,
  VysledekMaterialu,
  VyukaPredmetu,
} from '@questor/sdilene';

export const VYCHOZI_URL = 'https://koordinator-server.cz/questor-api';
/** Zpracování, které visí déle (spadlá session), se bere znovu jako čekající. */
export const ZASEKNUTE_PO_MS = 3 * 3600_000;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface Api {
  url: string;
  kod: string;
  fetchFn: FetchFn;
}

async function pozadavek<T>(api: Api, metoda: string, cesta: string, telo?: unknown): Promise<T> {
  const odpoved = await api.fetchFn(`${api.url.replace(/\/+$/, '')}${cesta}`, {
    method: metoda,
    headers: {
      'x-questor-token': api.kod,
      ...(telo === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: telo === undefined ? undefined : JSON.stringify(telo),
  });
  if (!odpoved.ok) {
    let zprava = '';
    try {
      zprava = ((await odpoved.json()) as { chyba?: string }).chyba ?? '';
    } catch {
      // tělo není JSON
    }
    throw new Error(`${metoda} ${cesta} → ${odpoved.status}${zprava ? `: ${zprava}` : ''}`);
  }
  return (await odpoved.json()) as T;
}

/** Čekající látka (a zaseknuté zpracování) — nejstarší první. */
export async function nactiFrontu(api: Api, ted = new Date()): Promise<Material[]> {
  const fronta = await pozadavek<FrontaMaterialu>(api, 'GET', '/api/admin/materialy');
  return fronta.materialy
    .filter(
      (m) =>
        m.stav === 'ceka' ||
        (m.stav === 'zpracovava' && ted.getTime() - Date.parse(m.aktualizovano) > ZASEKNUTE_PO_MS),
    )
    .sort((a, b) => (a.vytvoreno < b.vytvoreno ? -1 : 1));
}

export async function nactiLatku(api: Api, id: string): Promise<Material> {
  const fronta = await pozadavek<FrontaMaterialu>(api, 'GET', '/api/admin/materialy');
  const material = fronta.materialy.find((m) => m.id === id);
  if (!material) throw new Error(`Látka ${id} na serveru není`);
  return material;
}

/** Stáhne soubory látky do `<koren>/podklady/<id>/` (+ latka.json s metadaty). */
export async function stahniLatku(api: Api, id: string, koren: string): Promise<string[]> {
  const material = await nactiLatku(api, id);
  const slozka = join(koren, 'podklady', id);
  mkdirSync(slozka, { recursive: true });
  writeFileSync(join(slozka, 'latka.json'), JSON.stringify(material, null, 2));
  const cesty: string[] = [];
  for (const s of material.soubory) {
    const odpoved = await api.fetchFn(
      `${api.url.replace(/\/+$/, '')}/api/admin/materialy/${encodeURIComponent(id)}/soubory/${encodeURIComponent(s.soubor)}`,
      { headers: { 'x-questor-token': api.kod } },
    );
    if (!odpoved.ok) throw new Error(`Stažení ${s.soubor} → ${odpoved.status}`);
    const cesta = join(slozka, s.soubor);
    writeFileSync(cesta, new Uint8Array(await odpoved.arrayBuffer()));
    cesty.push(cesta);
  }
  return cesty;
}

export async function nastavStav(
  api: Api,
  id: string,
  stav: StavMaterialu,
  zprava?: string,
  vysledek?: VysledekMaterialu,
): Promise<Material> {
  return pozadavek<Material>(api, 'PATCH', `/api/admin/materialy/${encodeURIComponent(id)}`, {
    stav,
    ...(zprava !== undefined ? { zprava } : {}),
    ...(vysledek ? { vysledek } : {}),
  });
}

export async function verzeNaServeru(
  api: Api,
  predmetId: string,
): Promise<{ banky: number | null; vyuka: number | null }> {
  const [banky, vyuky] = await Promise.all([
    pozadavek<{ predmetId: string; verze: number }[]>(api, 'GET', '/api/banky'),
    pozadavek<{ predmetId: string; verze: number }[]>(api, 'GET', '/api/vyuka'),
  ]);
  return {
    banky: banky.find((b) => b.predmetId === predmetId)?.verze ?? null,
    vyuka: vyuky.find((v) => v.predmetId === predmetId)?.verze ?? null,
  };
}

/**
 * Zveřejní místní banky/výuky předmětů (data/banky, data/vyuka), které mají
 * vyšší verzi než server, a uzavře látku jako hotovou s evidencí publikací
 * (pro „vrátit") a odkazy na lekce. Názvy lekcí se berou z místní výuky.
 */
export async function zverejniLatku(
  api: Api,
  volby: { id: string; predmety: string[]; temata: string[]; zprava: string; koren: string },
): Promise<Material> {
  const publikace: PublikaceMaterialu[] = [];
  const temata: VysledekMaterialu['temata'] = [];
  for (const predmetId of volby.predmety) {
    const naServeru = await verzeNaServeru(api, predmetId);
    const cestaBanky = join(volby.koren, 'data', 'banky', `${predmetId}.json`);
    const cestaVyuky = join(volby.koren, 'data', 'vyuka', `${predmetId}.json`);
    const banka = existsSync(cestaBanky)
      ? (JSON.parse(readFileSync(cestaBanky, 'utf8')) as BankaOtazek)
      : null;
    const vyuka = existsSync(cestaVyuky)
      ? (JSON.parse(readFileSync(cestaVyuky, 'utf8')) as VyukaPredmetu)
      : null;
    if (banka && (naServeru.banky === null || banka.verze > naServeru.banky)) {
      await pozadavek(api, 'PUT', `/api/banky/${encodeURIComponent(predmetId)}`, banka);
      publikace.push({ typ: 'banky', predmetId, zVerze: naServeru.banky, naVerzi: banka.verze });
    }
    if (vyuka && (naServeru.vyuka === null || vyuka.verze > naServeru.vyuka)) {
      await pozadavek(api, 'PUT', `/api/vyuka/${encodeURIComponent(predmetId)}`, vyuka);
      publikace.push({ typ: 'vyuka', predmetId, zVerze: naServeru.vyuka, naVerzi: vyuka.verze });
    }
    for (const temaId of volby.temata) {
      const lekce = vyuka?.lekce.find((l) => l.temaId === temaId);
      const tema = banka?.temata.find((t) => t.id === temaId);
      if (lekce || tema) {
        temata.push({ predmetId, temaId, nazev: lekce?.nazev ?? tema?.nazev ?? temaId });
      }
    }
  }
  if (publikace.length === 0) {
    throw new Error('Nic ke zveřejnění — místní verze nejsou vyšší než na serveru (zvyš verzi banky/výuky).');
  }
  return nastavStav(api, volby.id, 'hotovo', volby.zprava, { temata, publikace });
}

// ---------------------------------------------------------------------------
// CLI

function nactiKod(): string {
  if (process.env.QUESTOR_ADMIN_TOKEN) return process.env.QUESTOR_ADMIN_TOKEN;
  const soubor = join(homedir(), '.questor-keys', 'tokeny.txt');
  if (existsSync(soubor)) {
    const radek = readFileSync(soubor, 'utf8')
      .split('\n')
      .find((r) => r.startsWith('ADMIN_TOKEN='));
    if (radek) return radek.slice('ADMIN_TOKEN='.length).trim();
  }
  throw new Error('Chybí admin kód: nastav QUESTOR_ADMIN_TOKEN nebo ~/.questor-keys/tokeny.txt');
}

function volba(argumenty: string[], jmeno: string): string | undefined {
  const i = argumenty.indexOf(`--${jmeno}`);
  return i >= 0 ? argumenty[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [prikaz, ...argumenty] = process.argv.slice(2);
  const api: Api = {
    url: process.env.QUESTOR_URL ?? VYCHOZI_URL,
    kod: nactiKod(),
    fetchFn: (url, init) => globalThis.fetch(url, init),
  };
  const koren = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  switch (prikaz) {
    case 'fronta': {
      const fronta = await nactiFrontu(api);
      if (fronta.length === 0) {
        console.log('Fronta je prázdná.');
        return;
      }
      for (const m of fronta) {
        console.log(
          JSON.stringify({
            id: m.id,
            stav: m.stav,
            profil: m.profilJmeno,
            predmetId: m.predmetId,
            poznamka: m.poznamka,
            soubory: m.soubory.map((s) => `${s.soubor} (${s.nazev})`),
            vytvoreno: m.vytvoreno,
          }),
        );
      }
      return;
    }
    case 'stahni': {
      const id = argumenty[0];
      if (!id) throw new Error('Použití: stahni <id>');
      for (const cesta of await stahniLatku(api, id, koren)) console.log(cesta);
      return;
    }
    case 'stav': {
      const [id, stav, ...zprava] = argumenty;
      if (!id || !stav) throw new Error('Použití: stav <id> <ceka|zpracovava|hotovo|chyba> [zpráva]');
      const m = await nastavStav(api, id, stav as StavMaterialu, zprava.length ? zprava.join(' ') : undefined);
      console.log(`${m.id}: ${m.stav}${m.zprava ? ` — ${m.zprava}` : ''}`);
      return;
    }
    case 'verze': {
      const predmetId = argumenty[0];
      if (!predmetId) throw new Error('Použití: verze <predmetId>');
      console.log(JSON.stringify(await verzeNaServeru(api, predmetId)));
      return;
    }
    case 'zverejni': {
      const id = argumenty[0];
      const predmety = (volba(argumenty, 'predmety') ?? '').split(',').filter(Boolean);
      const temata = (volba(argumenty, 'temata') ?? '').split(',').filter(Boolean);
      const zprava = volba(argumenty, 'zprava') ?? '';
      if (!id || predmety.length === 0 || !zprava) {
        throw new Error('Použití: zverejni <id> --predmety a[,b] --temata t1[,t2] --zprava "…"');
      }
      const m = await zverejniLatku(api, { id, predmety, temata, zprava, koren });
      console.log(JSON.stringify({ id: m.id, stav: m.stav, vysledek: m.vysledek }, null, 2));
      return;
    }
    default:
      console.error('Příkazy: fronta | stahni <id> | stav <id> <stav> [zpráva] | verze <predmet> | zverejni <id> …');
      process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((chyba) => {
    console.error(chyba instanceof Error ? chyba.message : chyba);
    process.exit(1);
  });
}
