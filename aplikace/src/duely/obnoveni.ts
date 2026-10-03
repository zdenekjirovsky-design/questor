// Lehka obnova seznamu duelu pri otevreni stranky Duely. Driv kazde otevreni
// spoustelo plny „rucni" sync (reset odkladu vsech front, profily, banky,
// vyuky, vyzvy, duely a nakonec pull postupu) — seznam se pak 0,3–2 s po
// zobrazeni preskladal pod prstem a v hlavicce poskocil HUD. Ted se stahnou
// JEN duely aktivniho profilu, nejvys jednou za INTERVAL_OBNOVY_DUELU_MS na
// profil. Plati pravidlo pullu osobnich dat ze sync.ts: prepne-li se behem
// cekani profil, vysledek se zahodi (a interval se pro profil neuplatni —
// zadna data nedostal). Ceka-li pri otevreni neco ve fronte syncu, pusti se
// misto lehke obnovy plny sync, ktery frontu odesle (obnovPriOtevreniDuelu).
import type { Duel } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { duelovyKlient } from './pomocne';

/** Minimalni odstup dvou obnov seznamu duelu jednoho profilu (ms). */
export const INTERVAL_OBNOVY_DUELU_MS = 45_000;

/**
 * Ma se seznam duelu obnovit? Cista funkce: poprve vzdy, pak az po
 * intervalu. Cas „z budoucnosti" (posunute hodiny) obnovu nezablokuje.
 */
export function maSeObnovitDuely(
  posledniMs: number | undefined,
  tedMs: number,
  intervalMs: number = INTERVAL_OBNOVY_DUELU_MS,
): boolean {
  if (posledniMs === undefined) return true;
  if (tedMs < posledniMs) return true;
  return tedMs - posledniMs >= intervalMs;
}

const posledniObnova = new Map<string, number>();

/** Pole duelu, ktera do store zapsala posledni obnova (rozpoznani v UI). */
let zapsanoObnovou: { duely: Duel[]; otevrene: Duel[] } | null = null;

/**
 * Prisel tenhle stav store (reference poli) z posledni lehke obnovy? Stranka
 * Duely podle toho pozna zmenu „ze site" od zmeny, kterou udelal sam
 * uzivatel (zalozeni duelu) — tu ukazuje vzdy hned.
 */
export function jeStavZObnovy(duely: Duel[], otevrene: Duel[]): boolean {
  return zapsanoObnovou !== null && zapsanoObnovou.duely === duely && zapsanoObnovou.otevrene === otevrene;
}

/**
 * Stahne duely aktivniho profilu a slouci je do store (prijmiDuely — stejne
 * jako sync). Vraci true, kdyz neco zapsala. Ticha: bez rodinneho kodu,
 * bez site nebo v intervalu jen vrati false. Interval plati i po chybe —
 * spatna sit se nema zkouset pri kazdem otevreni. Neplati po zahozeni
 * vysledku kvuli prepnuti profilu behem stahovani.
 */
export async function obnovDuely(tedMs: number = Date.now()): Promise<boolean> {
  const profilId = pouzijStav.getState().aktivniProfilId;
  if (!profilId) return false;
  if (!maSeObnovitDuely(posledniObnova.get(profilId), tedMs)) return false;
  const klient = duelovyKlient();
  if (!klient) return false;
  posledniObnova.set(profilId, tedMs);
  try {
    const { moje, otevrene } = await klient.stahniDuely(profilId);
    if (pouzijStav.getState().aktivniProfilId !== profilId) {
      // Vysledek zahozen — profil nic nedostal, po navratu na nej se smi
      // obnovit hned (ne az za 45 s).
      posledniObnova.delete(profilId);
      return false;
    }
    pouzijStav.getState().prijmiDuely(moje, otevrene);
    // Hned (synchronne, pred prekreslenim Reactu) si poznamenat, jaka pole
    // obnova zapsala.
    const stav = pouzijStav.getState();
    zapsanoObnovou = { duely: stav.duely, otevrene: stav.otevreneDuely };
    return true;
  } catch {
    return false;
  }
}

/**
 * Obnova pri otevreni stranky Duely. Ceka-li neco ve fronte syncu (vysledek
 * duelu, jehoz odeslani selhalo, nebo dohrany behem beziciho syncu), pusti
 * plny sync — vynuluje odklad a frontu odesle; jinak by vysledek na serveru
 * chybel a duel by po vyprseni propadl kontumaci. Plny sync jde pres zamek
 * probihajiciSync (sync.ts), soubeh s bezicim syncem tedy nehrozi. Jinak jen
 * lehka obnova seznamu (obnovDuely). Ticha, offline-first.
 */
export async function obnovPriOtevreniDuelu(): Promise<void> {
  try {
    const sync = await import('../sync/sync');
    if (sync.stavSynchronizace().veFronte > 0) await sync.synchronizuj('rucne');
    else await obnovDuely();
  } catch {
    // Tiche — offline-first.
  }
}

/** Jen pro testy — zapomene casy obnov. */
export function resetujObnovuDuelu(): void {
  posledniObnova.clear();
  zapsanoObnovou = null;
}
