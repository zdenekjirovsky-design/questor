// Validace banky otázek: npx tsx scripts/validuj-banku.ts <cesta-k-bance.json>
// Projde-li validujBanku ze @questor/sdilene, vypíše OK + počty otázek
// dle témat a obtížností; jinak vypíše chyby a skončí s kódem 1.

import { readFileSync } from 'node:fs';
import { validujBanku } from '@questor/sdilene';

const cesta = process.argv[2];
if (!cesta) {
  console.error('Použití: npx tsx scripts/validuj-banku.ts <cesta-k-bance.json>');
  process.exit(1);
}

let data: unknown;
try {
  data = JSON.parse(readFileSync(cesta, 'utf8'));
} catch (chyba) {
  console.error(
    `CHYBA: soubor ${cesta} nejde načíst jako JSON: ${
      chyba instanceof Error ? chyba.message : String(chyba)
    }`,
  );
  process.exit(1);
}

try {
  const banka = validujBanku(data);

  console.log(`OK: banka „${banka.nazev}“ (${banka.predmetId}), verze ${banka.verze}, vytvořeno ${banka.vytvoreno}`);
  console.log(`Celkem: ${banka.temata.length} témat, ${banka.otazky.length} otázek`);
  console.log('');
  console.log('Otázky dle témat a obtížností (sloupce = obtížnost 1–5):');

  const sirka = Math.max(...banka.temata.map((t) => t.nazev.length), 6);
  console.log(`  ${'Téma'.padEnd(sirka)}  |   1   2   3   4   5 | celkem`);
  console.log(`  ${'-'.repeat(sirka)}--+---------------------+-------`);
  for (const tema of [...banka.temata].sort((a, b) => a.poradi - b.poradi)) {
    const dleObtiznosti = [1, 2, 3, 4, 5].map(
      (ob) => banka.otazky.filter((o) => o.temaId === tema.id && o.obtiznost === ob).length,
    );
    const celkem = dleObtiznosti.reduce((a, b) => a + b, 0);
    console.log(
      `  ${tema.nazev.padEnd(sirka)}  | ${dleObtiznosti
        .map((n) => String(n).padStart(3))
        .join(' ')} | ${String(celkem).padStart(6)}`,
    );
  }

  const dleTypu = new Map<string, number>();
  for (const o of banka.otazky) dleTypu.set(o.typ, (dleTypu.get(o.typ) ?? 0) + 1);
  console.log('');
  console.log(
    `Dle typu: ${[...dleTypu.entries()].map(([typ, n]) => `${typ}: ${n}`).join(', ')}`,
  );
} catch (chyba) {
  console.error(chyba instanceof Error ? chyba.message : String(chyba));
  process.exit(1);
}
