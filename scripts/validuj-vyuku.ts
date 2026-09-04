// Validace souboru výuky: npx tsx scripts/validuj-vyuku.ts data/vyuka/<predmet>.json
import { readFileSync } from 'node:fs';
import { validujVyuku } from '@questor/sdilene';

const cesta = process.argv[2];
if (!cesta) {
  console.error('Použití: npx tsx scripts/validuj-vyuku.ts <cesta-k-json>');
  process.exit(1);
}

try {
  const vyuka = validujVyuku(JSON.parse(readFileSync(cesta, 'utf8')));
  console.log(`OK: ${vyuka.predmetId} verze ${vyuka.verze}, lekcí: ${vyuka.lekce.length}`);
  for (const lekce of vyuka.lekce) {
    const dleTypu = new Map<string, number>();
    for (const blok of lekce.bloky) dleTypu.set(blok.typ, (dleTypu.get(blok.typ) ?? 0) + 1);
    const rozpis = [...dleTypu.entries()].map(([t, n]) => `${t}:${n}`).join(', ');
    console.log(`  ${lekce.temaId} — ${lekce.bloky.length} bloků (${rozpis})`);
  }
} catch (chyba) {
  console.error(`CHYBA: ${chyba instanceof Error ? chyba.message : String(chyba)}`);
  process.exit(1);
}
