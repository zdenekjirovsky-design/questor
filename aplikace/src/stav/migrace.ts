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
//
// Verze 5: studijni banky per profil. Profil dostava `predmety` (vybrane
// banky) a `aktivniPredmetId`; existujici profily dostanou VSECHNY banky
// registru (v4 zadny vyber nemel — nabidka se zachovava). Aktivni banka
// ridi denni questy, doporucene lekce i HUD, proto se odvozuje z POUZIVANI:
// banka nejnovejsiho testu v historii profilu (fallback prvni banka
// registru). Snimky dataProfilu i pracovni sada dostanou prazdne
// `questyPodleBank` (questy dne neaktivnich bank). NIC se nemeni ani neztraci.
//
// Verze 6: tydenni XP z testu per banka (`tydenniXpTestuPodleBank`) — presny
// prubezny agregat pro graf ve Statistikach (drive se odvozoval z okna
// poslednich 10 testu a starsi tydny ukazoval nulove). Startovni hodnoty se
// seedou z historie testu pracovni sady i snimku, aby graf nezacinal prazdny.
import { denZData, pondeliTydne, VYCHOZI_AVATAR } from '@questor/sdilene';
import { BARVY_PROFILU, vytvorIdProfilu } from './profilySlice';
import { PREDMETY } from '../data/predmety';
import type { QUESTORStav } from './store';

export const VERZE_PERSISTU = 6;

/** Klice stavu, ktere se NEpersistuji (obsah predmetu — viz hlavicka souboru). */
const NEPERSISTOVANE_KLICE = ['banky', 'vyuky'] as const;

export type PersistovanyStav = Omit<QUESTORStav, (typeof NEPERSISTOVANE_KLICE)[number]>;

/** Partialize pro zustand persist: vynecha obsah predmetu, zbytek necha. */
export function partializujStav(stav: QUESTORStav): PersistovanyStav {
  const { banky: _banky, vyuky: _vyuky, ...zbytek } = stav;
  return zbytek;
}

/**
 * Nejnovejsi pouzita banka z historie testu (historie je razena od
 * nejnovejsiho — hraSlice.zapocitejTest predrazuje). Id mimo registr se
 * preskakuje; null = zadny pouzitelny zaznam.
 */
function predmetZHistorie(historie: unknown, registr: ReadonlySet<string>): string | null {
  if (!Array.isArray(historie)) return null;
  for (const zaznam of historie) {
    if (zaznam === null || typeof zaznam !== 'object') continue;
    const konfigurace = (zaznam as Record<string, unknown>).konfigurace;
    if (konfigurace === null || typeof konfigurace !== 'object') continue;
    const predmetId = (konfigurace as Record<string, unknown>).predmetId;
    if (typeof predmetId === 'string' && registr.has(predmetId)) return predmetId;
  }
  return null;
}

/**
 * Seed agregatu tydenniho XP per banka z historie testu (migrace v6).
 * Defenzivni nad nedoverovanymi daty snapshotu — vadny zaznam se preskoci.
 */
function tydenniXpZHistorieTestu(historie: unknown): Record<string, Record<string, number>> {
  const agregat: Record<string, Record<string, number>> = {};
  if (!Array.isArray(historie)) return agregat;
  for (const zaznam of historie) {
    if (zaznam === null || typeof zaznam !== 'object') continue;
    const v = zaznam as Record<string, unknown>;
    const konfigurace = v.konfigurace;
    if (konfigurace === null || typeof konfigurace !== 'object') continue;
    const predmetId = (konfigurace as Record<string, unknown>).predmetId;
    if (typeof predmetId !== 'string') continue;
    if (typeof v.ziskaneXp !== 'number' || !(v.ziskaneXp > 0)) continue;
    if (typeof v.konec !== 'string') continue;
    const konec = new Date(v.konec);
    if (Number.isNaN(konec.getTime())) continue;
    const klic = pondeliTydne(denZData(konec));
    const banka = (agregat[predmetId] ??= {});
    banka[klic] = (banka[klic] ?? 0) + v.ziskaneXp;
  }
  return agregat;
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

  if (verzeSnapshotu < 5) {
    // Studijni banky per profil: existujici profily studuji VSECHNY banky
    // registru (v4 zadny vyber nemel). Aktivni banka ridi denni questy,
    // doporucene lekce i HUD — odvozuje se proto z POUZIVANI: banka
    // nejnovejsiho testu v historii profilu (aktivni profil ma historii
    // v pracovni sade, neaktivni ve svem snimku), fallback prvni banka
    // registru. Snimky profilu a pracovni sada dostanou prazdne questyPodleBank.
    const vsechny = PREDMETY.map((p) => p.id);
    const registr = new Set(vsechny);
    const snimky =
      kopie.dataProfilu !== null && typeof kopie.dataProfilu === 'object'
        ? (kopie.dataProfilu as Record<string, unknown>)
        : {};
    if (Array.isArray(kopie.profily)) {
      kopie.profily = kopie.profily.map((p) => {
        if (p === null || typeof p !== 'object') return p;
        const profil = p as Record<string, unknown>;
        const snimek =
          profil.id !== undefined && profil.id === kopie.aktivniProfilId
            ? kopie
            : snimky[String(profil.id)];
        const historie =
          snimek !== null && typeof snimek === 'object'
            ? (snimek as Record<string, unknown>).historieTestu
            : undefined;
        return {
          ...profil,
          predmety: vsechny,
          aktivniPredmetId: predmetZHistorie(historie, registr) ?? vsechny[0],
        };
      });
    }
    if (kopie.dataProfilu !== null && typeof kopie.dataProfilu === 'object') {
      const nove: Record<string, unknown> = {};
      for (const [id, snimek] of Object.entries(kopie.dataProfilu as Record<string, unknown>)) {
        nove[id] =
          snimek !== null && typeof snimek === 'object'
            ? { questyPodleBank: {}, ...(snimek as Record<string, unknown>) }
            : snimek;
      }
      kopie.dataProfilu = nove;
    }
    kopie.questyPodleBank = {};
  }

  if (verzeSnapshotu < 6) {
    // Tydenni XP z testu per banka — presny agregat vede zapocitejTest;
    // startovni hodnoty se seedou z historie testu (poslednich 10), aby graf
    // ve Statistikach po updatu nezacinal prazdny. Pracovni sada i snimky.
    kopie.tydenniXpTestuPodleBank = tydenniXpZHistorieTestu(kopie.historieTestu);
    if (kopie.dataProfilu !== null && typeof kopie.dataProfilu === 'object') {
      const nove: Record<string, unknown> = {};
      for (const [id, snimek] of Object.entries(kopie.dataProfilu as Record<string, unknown>)) {
        nove[id] =
          snimek !== null && typeof snimek === 'object'
            ? {
                tydenniXpTestuPodleBank: tydenniXpZHistorieTestu(
                  (snimek as Record<string, unknown>).historieTestu,
                ),
                ...(snimek as Record<string, unknown>),
              }
            : snimek;
      }
      kopie.dataProfilu = nove;
    }
  }

  return kopie as PersistovanyStav;
}
