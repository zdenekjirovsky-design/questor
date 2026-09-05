// Persist konfigurace store — verze, migrace a partialize (co se uklada).
//
// Od verze 2 se obsah predmetu (banky, vyuky) NEpersistuje: localStorage ma
// kvotu ~5 MB a obsah 14 predmetu by ji pretekl. Obsah zije v nepersistovanem
// stavu (nacita se async pri startu z bundlu — ../data/nacteniObsahu.ts —
// a obsah ze serveru cachuje IndexedDB pres ../sync/uloziste.ts).
// Progres studenta, postup lekci a dalsi herni stav se persistuje dal.
//
// Verze 3: avatar je plne prizpusobitelny (pohlavi, tvar obliceje, plet,
// barva a strih vlasu, vybava po slotech) a progres nese vlastnenaVybava.
// Stary avatar { barvaVlasu, doplnek?, pozadi? } se prevede na novy tvar —
// barva vlasu se zachova, zbytek dostane vychozi hodnoty.
//
// Verze 4: lokalni profily (viz ./profilySlice.ts). Existujici data se stanou
// profilem „Student" (prejmenovatelnym v Nastaveni) — VSECHNA osobni data
// (progres, postup lekci, rozehrany test, historie, truhly…) zustavaji beze
// zmeny v pracovni sade a profil Student se rovnou aktivuje, takze update
// nic neprerusi a NIC se neztrati. Obsah (banky, vyuky) zustava sdileny.
import { VYCHOZI_AVATAR } from '@questor/sdilene';
import { BARVY_PROFILU, vytvorIdProfilu } from './profilySlice';
import type { QUESTORStav } from './store';

export const VERZE_PERSISTU = 4;

/** Klice stavu, ktere se NEpersistuji (obsah predmetu — viz hlavicka souboru). */
const NEPERSISTOVANE_KLICE = ['banky', 'vyuky'] as const;

export type PersistovanyStav = Omit<QUESTORStav, (typeof NEPERSISTOVANE_KLICE)[number]>;

/** Partialize pro zustand persist: vynecha obsah predmetu, zbytek necha. */
export function partializujStav(stav: QUESTORStav): PersistovanyStav {
  const { banky: _banky, vyuky: _vyuky, ...zbytek } = stav;
  return zbytek;
}

/**
 * Migrace persistovaneho snapshotu na aktualni verzi. Nikdy nemutuje vstup.
 * v1 → v2: banky a vyuky se ze snapshotu zahodi (obsah uz neni persistovany).
 * v2 → v3: avatar se prevede na novy tvar (barvaVlasu se zachova, pohlavi/
 * tvar obliceje/plet/strih dostanou vychozi hodnoty, stara pole doplnek
 * a pozadi se zahodi) a progres dostane vlastnenaVybava: []. XP, streak,
 * questy, sbirka, statistiky, rekordy atd. se ZACHOVAVAJI beze zmeny.
 * v3 → v4: vsechna dosavadni data se stanou profilem „Student" — vznikne
 * profily: [Student], aktivniProfilId: Student.id a dataProfilu: {};
 * osobni data ZUSTAVAJI v pracovni sade (aktivni profil je drzi tam),
 * takze se doslova nic nepresouva a nic nemuze ztratit.
 */
export function migrujPersistovanyStav(stav: unknown, verzeSnapshotu: number): PersistovanyStav {
  if (stav === null || typeof stav !== 'object' || verzeSnapshotu >= VERZE_PERSISTU) {
    return stav as PersistovanyStav;
  }

  const kopie = { ...(stav as Record<string, unknown>) };

  if (verzeSnapshotu < 2) {
    for (const klic of NEPERSISTOVANE_KLICE) delete kopie[klic];
  }

  if (verzeSnapshotu < 3 && kopie.progres !== null && typeof kopie.progres === 'object') {
    const progres = kopie.progres as Record<string, unknown>;
    const staryAvatar =
      progres.avatar !== null && typeof progres.avatar === 'object'
        ? (progres.avatar as Record<string, unknown>)
        : {};
    const barvaVlasu =
      typeof staryAvatar.barvaVlasu === 'string'
        ? staryAvatar.barvaVlasu
        : VYCHOZI_AVATAR.barvaVlasu;
    kopie.progres = {
      ...progres,
      avatar: { ...VYCHOZI_AVATAR, barvaVlasu, vybava: {} },
      vlastnenaVybava: Array.isArray(progres.vlastnenaVybava) ? progres.vlastnenaVybava : [],
    };
  }

  if (verzeSnapshotu < 4) {
    // Existujici data → profil „Student" (prejmenovatelny), rovnou aktivni.
    // Pracovni sada (progres, postup lekci, …) se NEDOTYKA — aktivni profil
    // ji drzi primo v pracovnich slicech, dataProfilu nese jen neaktivni.
    const idStudenta = vytvorIdProfilu();
    kopie.profily = [{ id: idStudenta, jmeno: 'Student', barva: BARVY_PROFILU[0] }];
    kopie.aktivniProfilId = idStudenta;
    kopie.dataProfilu = {};
  }

  return kopie as PersistovanyStav;
}
