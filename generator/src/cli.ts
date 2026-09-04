// CLI generátoru: učivo → Claude → banka otázek.
// Spuštění: npm run generuj -- --vstup <soubor> --predmet <id> --nazev "…"
//           [--poskytovatel api|claude-cli|mock] [--model …] [--vystup cesta]
//           [--server http://…:8787 --token …]

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { BankaOtazek, Otazka } from '@questor/sdilene';
import { nactiText, rozdelNaKapitoly } from './ingest';
import { vygenerujBanku, type StatistikyGenerovani } from './pipeline';
import { vyberPoskytovatele } from './poskytovatele/vyber';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const NAPOVEDA = `Generátor banky otázek QUESTOR

Použití:
  npm run generuj -- --vstup <soubor> --predmet <id> --nazev "Název předmětu" [volby]

Povinné:
  --vstup <soubor>        učivo: .md, .txt, .pdf nebo .docx
  --predmet <id>          id předmětu (jen a–z, 0–9 a pomlčky), např. ekonomika-podnikani
  --nazev "…"             lidský název předmětu

Volby:
  --poskytovatel <p>      api | claude-cli | mock (výchozí: autodetekce)
  --model <model>         model Claude (výchozí claude-opus-5)
  --vystup <cesta>        kam zapsat JSON (výchozí data/banky/<predmet>.json)
  --server <url>          po vygenerování banku nahrát PUT /api/banky/<predmet>
  --token <token>         admin token pro --server
  -h, --napoveda          tahle nápověda`;

function selhani(zprava: string): never {
  console.error(`CHYBA: ${zprava}`);
  console.error('Nápověda: npm run generuj -- --napoveda');
  process.exit(1);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      vstup: { type: 'string' },
      predmet: { type: 'string' },
      nazev: { type: 'string' },
      poskytovatel: { type: 'string' },
      model: { type: 'string' },
      vystup: { type: 'string' },
      server: { type: 'string' },
      token: { type: 'string' },
      napoveda: { type: 'boolean', short: 'h' },
    },
  });

  if (values.napoveda) {
    console.log(NAPOVEDA);
    return;
  }
  if (!values.vstup) selhani('chybí --vstup (soubor s učivem).');
  if (!values.predmet) selhani('chybí --predmet (id předmětu).');
  if (!values.nazev) selhani('chybí --nazev (název předmětu).');
  if (!/^[a-z0-9-]+$/.test(values.predmet)) {
    selhani(`--predmet „${values.predmet}“ smí obsahovat jen a–z, 0–9 a pomlčky.`);
  }
  if (values.server && !values.token) {
    selhani('--server vyžaduje i --token (admin token).');
  }

  const cestaVstup = path.resolve(process.cwd(), values.vstup);
  const cestaVystup = values.vystup
    ? path.resolve(process.cwd(), values.vystup)
    : path.join(KOREN, 'data', 'banky', `${values.predmet}.json`);

  console.log(`Vstup:  ${cestaVstup}`);
  console.log(`Výstup: ${cestaVystup}`);

  const { poskytovatel, varovani } = vyberPoskytovatele({
    pozadovany: values.poskytovatel,
    model: values.model,
    log: (z) => console.log(`  ${z}`),
  });
  if (varovani) console.warn(varovani);
  console.log(`Poskytovatel: ${poskytovatel.nazev}${values.model ? `, model ${values.model}` : ''}`);

  const text = await nactiText(cestaVstup);
  const kapitoly = rozdelNaKapitoly(text);
  if (kapitoly.length === 0) selhani('učivo je prázdné — není z čeho generovat.');
  console.log(`Učivo: ${text.length} znaků, ${kapitoly.length} kapitol.`);

  const predchoziVerze = await nactiPredchoziVerzi(cestaVystup);
  if (predchoziVerze !== undefined) {
    console.log(`Existující banka má verzi ${predchoziVerze} — nová bude ${predchoziVerze + 1}.`);
  }

  const { banka, statistiky } = await vygenerujBanku({
    kapitoly,
    predmetId: values.predmet,
    nazev: values.nazev,
    poskytovatel,
    predchoziVerze,
    log: (z) => console.log(`  ${z}`),
  });

  await fs.mkdir(path.dirname(cestaVystup), { recursive: true });
  await fs.writeFile(cestaVystup, `${JSON.stringify(banka, null, 2)}\n`, 'utf8');

  vypisShrnuti(banka, statistiky, cestaVystup);

  if (values.server) {
    await nahrajNaServer(values.server, values.token!, banka);
  }
}

async function nactiPredchoziVerzi(cesta: string): Promise<number | undefined> {
  let obsah: string;
  try {
    obsah = await fs.readFile(cesta, 'utf8');
  } catch {
    return undefined;
  }
  try {
    const data = JSON.parse(obsah) as { verze?: unknown };
    return typeof data.verze === 'number' && Number.isInteger(data.verze) ? data.verze : undefined;
  } catch {
    console.warn(`POZOR: existující soubor ${cesta} není platný JSON — verze začne od 1.`);
    return undefined;
  }
}

function vypisShrnuti(banka: BankaOtazek, s: StatistikyGenerovani, cesta: string): void {
  const dleObtiznosti = new Map<number, number>();
  const dleTypu = new Map<string, number>();
  for (const o of banka.otazky as Otazka[]) {
    dleObtiznosti.set(o.obtiznost, (dleObtiznosti.get(o.obtiznost) ?? 0) + 1);
    dleTypu.set(o.typ, (dleTypu.get(o.typ) ?? 0) + 1);
  }
  console.log('');
  console.log(`HOTOVO: banka „${banka.nazev}“ (${banka.predmetId}), verze ${banka.verze}`);
  console.log(`  Soubor: ${cesta}`);
  console.log(`  Témata: ${banka.temata.length}, otázek: ${banka.otazky.length}`);
  console.log(
    `  Dle obtížnosti: ${[1, 2, 3, 4, 5]
      .map((ob) => `${ob}: ${dleObtiznosti.get(ob) ?? 0}`)
      .join(', ')}`,
  );
  console.log(
    `  Dle typu: ${[...dleTypu.entries()].map(([typ, n]) => `${typ}: ${n}`).join(', ')}`,
  );
  console.log(
    `  Průběh: ${s.davekCelkem} dávek (${s.davekPreskoceno} přeskočeno), ` +
      `${s.vygenerovano} otázek vygenerováno, ${s.poOvereni} po ověření, ` +
      `${s.vyrazenoValidaci} vyřazeno validací, ${s.duplicit} duplicit odstraněno.`,
  );
}

async function nahrajNaServer(server: string, token: string, banka: BankaOtazek): Promise<void> {
  const url = `${server.replace(/\/+$/, '')}/api/banky/${banka.predmetId}`;
  console.log('');
  console.log(`Nahrávám banku na server: PUT ${url}`);
  let odpoved: Response;
  try {
    odpoved = await fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'x-questor-token': token,
      },
      body: JSON.stringify(banka),
    });
  } catch (chyba) {
    selhani(
      `server ${server} není dosažitelný: ${chyba instanceof Error ? chyba.message : String(chyba)}`,
    );
  }
  const telo = await odpoved.text();
  if (!odpoved.ok) {
    selhani(`server odmítl banku (HTTP ${odpoved.status}): ${telo.slice(0, 300)}`);
  }
  console.log(`Server přijal banku: ${telo.trim()}`);
}

main().catch((chyba: unknown) => {
  console.error(`CHYBA: ${chyba instanceof Error ? chyba.message : String(chyba)}`);
  process.exit(1);
});
