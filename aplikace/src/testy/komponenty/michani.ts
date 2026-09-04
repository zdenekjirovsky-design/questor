// Deterministicke michani poradi moznosti podle klice (id otazky).
// Bez michani by poradi z dat prozrazovalo klic — generovane banky mivaji
// spravnou odpoved systematicky na prvnim miste, takze by test sel projit
// bez znalosti ("spravne je vzdy A"). Odpovedi se VZDY hlasi v DATOVYCH
// indexech (permutace je jen zobrazovaci), engine se nemeni.
import { hashRetezce, vytvorNahodu } from '@questor/sdilene';

/** Vrati deterministickou permutaci indexu 0..pocet-1 (Fisher-Yates dle klice). */
export function zamichaneIndexy(klic: string, pocet: number): number[] {
  const nahoda = vytvorNahodu(hashRetezce(klic));
  const indexy = Array.from({ length: pocet }, (_, i) => i);
  for (let i = indexy.length - 1; i > 0; i--) {
    const j = Math.floor(nahoda() * (i + 1));
    [indexy[i], indexy[j]] = [indexy[j], indexy[i]];
  }
  return indexy;
}
