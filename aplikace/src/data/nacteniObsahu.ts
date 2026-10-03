// Nacteni obsahu predmetu pri startu aplikace.
//
// Obsah (banky, vyuky) NENI persistovany v zustand persist — pri startu se
// sklada async ze dvou zdroju (poradi je jen optimalizace, verze rozhoduji
// akce prijmiBanku/prijmiVyuku, ktere prijmou jen vyssi verzi):
//  1. bundlovane JSON chunky (import.meta.glob v ./predmety.ts),
//  2. IndexedDB (obsah drive stazeny ze serveru — typicky vyssi verze,
//     proto se nabizi az PO bundlu a bundle preplacne).
// Treti zdroj (server samotny) resi bezny sync (../sync/sync.ts), ktery
// startuje nezavisle a stazeny obsah do IndexedDB uklada.
import { validujBanku, validujVyuku } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { nactiVsechenObsah } from '../sync/uloziste';
import { nactiBundlovaneBanky, nactiBundlovaneVyuky } from './predmety';

let nacitani: Promise<void> | null = null;

/**
 * Nacte bundlovany obsah + IndexedDB a nabidne ho do store. Idempotentni:
 * opakovane volani vraci TYZ promise, takze kdo potrebuje hotovy obsah
 * (napr. sync pred porovnanim verzi bank), muze na nej pockat.
 */
export function nactiObsahPriStartu(): Promise<void> {
  nacitani ??= nactiObsah();
  return nacitani;
}

async function nactiObsah(): Promise<void> {
  // 1) Bundlovane predmety (offline-first zaklad); chunky se stahuji soubezne.
  //    Banky jdou do store HNED po svem stazeni, nezavisle na vyukach (ty jsou
  //    asi 2/3 objemu) — na bance visi denni questy na Domu, na slabe siti
  //    by jinak cekaly i na vsechny lekce.
  const pBanky = nactiBundlovaneBanky().then((banky) => {
    for (const banka of banky) pouzijStav.getState().prijmiBanku(banka);
  });
  const pVyuky = nactiBundlovaneVyuky().then((vyuky) => {
    for (const vyuka of vyuky) pouzijStav.getState().prijmiVyuku(vyuka);
  });
  await Promise.all([pBanky, pVyuky]);

  // 2) Obsah drive stazeny ze serveru (IndexedDB). Muze pochazet z NOVEJSI
  //    verze aplikace (rollback buildu) — kazdy zaznam se proto revaliduje
  //    a nevalidni se tise preskoci (bundle uz je nabidnuty vyse).
  const [ulozeneBanky, ulozeneVyuky] = await Promise.all([
    nactiVsechenObsah('banky'),
    nactiVsechenObsah('vyuky'),
  ]);
  for (const surova of ulozeneBanky) {
    try {
      pouzijStav.getState().prijmiBanku(validujBanku(surova));
    } catch {
      // Nevalidni zaznam v ulozisti — preskocit, jede se z bundlu/serveru.
    }
  }
  for (const surova of ulozeneVyuky) {
    try {
      pouzijStav.getState().prijmiVyuku(validujVyuku(surova));
    } catch {
      // Nevalidni zaznam v ulozisti — preskocit.
    }
  }
}
