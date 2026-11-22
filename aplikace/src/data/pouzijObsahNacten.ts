// Hook: dobehlo uz startovni nacitani obsahu predmetu (bundle + IndexedDB)?
//
// Banky a vyuky chodi do store async po startu aplikace (./nacteniObsahu.ts).
// Stranka, ktera se pta „ma tahle banka …?“, proto do dobehnuti nesmi tvrdit
// „nema“ / „neexistuje“ — po studenem startu (reload, obnoveny tab, primy
// odkaz) by ukazala prazdny stav, ktery za okamzik neplati. Hook vraci false,
// dokud nacitani bezi, a true po jeho dobehnuti (i kdyz skoncilo chybou —
// pak uz se na obsah necekat nema smysl).
import { useEffect, useState } from 'react';

export function pouzijObsahNacten(): boolean {
  const [nacteno, setNacteno] = useState(false);
  useEffect(() => {
    let zruseno = false;
    // Dynamicky import drzi obsahovou cestu mimo pocatecni JS chunk (stejne
    // jako ve store a na Domu); nactiObsahPriStartu je idempotentni.
    void import('./nacteniObsahu')
      .then((m) => m.nactiObsahPriStartu())
      .catch(() => {})
      .then(() => {
        if (!zruseno) setNacteno(true);
      });
    return () => {
      zruseno = true;
    };
  }, []);
  return nacteno;
}
