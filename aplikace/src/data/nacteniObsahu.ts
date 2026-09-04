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

let probehlo = false;

/** Nacte bundlovany obsah + IndexedDB a nabidne ho do store. Idempotentni. */
export async function nactiObsahPriStartu(): Promise<void> {
  if (probehlo) return;
  probehlo = true;

  // 1) Bundlovane predmety (offline-first zaklad).
  const [banky, vyuky] = await Promise.all([nactiBundlovaneBanky(), nactiBundlovaneVyuky()]);
  for (const banka of banky) pouzijStav.getState().prijmiBanku(banka);
  for (const vyuka of vyuky) pouzijStav.getState().prijmiVyuku(vyuka);

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
