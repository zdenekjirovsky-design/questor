// Slice vyukove casti — VLASTNI agent APP-VYUKA-UI.
// Drzi obsah vyuky (bundlovany + ze serveru dle verze) a postup lekci
// (dokoncene bloky per lekce, datum dokonceni). Dokonceni lekce udeluje
// XP_ZA_LEKCI (jen 1x denne na lekci), pocita se jako aktivita pro streak
// a plni questy sablony `lekce` (aplikujLekciNaQuesty).
//
// Postup je klicovany temaId (lekce se vaze na tema banky otazek a routa
// /uceni/:temaId nese jen temaId) — temaId vzorovych predmetu jsou unikatni.
import type { StateCreator } from 'zustand';
import type { Lekce, VyukaPredmetu } from '@questor/sdilene';
import {
  aktualizujStreakPoAktivite,
  aplikujLekciNaQuesty,
  denZData,
  pondeliTydne,
  validujVyuku,
  XP_ZA_LEKCI,
} from '@questor/sdilene';
import { bundlovaneVyuky } from '../data/predmety';
import type { QUESTORStav } from './store';

// ---------------------------------------------------------------------------
// Typy stavu

export interface PostupLekce {
  /** Indexy dokoncenych bloku lekce (bez duplicit, v poradi dokonceni). */
  dokonceneBloky: number[];
  /** ISO cas PRVNIHO dokonceni cele lekce, null = jeste nedokoncena. */
  dokoncenoPoprve: string | null;
  /** Den (YYYY-MM-DD), kdy za lekci naposledy padlo XP — hlida 1x denne. */
  posledniXpDen: string | null;
  /** Kolikrat byla lekce dokoncena celkem. */
  pocetDokonceni: number;
}

export interface VysledekDokonceniLekce {
  /** Celkove pripsane XP (lekce + pripadne prave splnene questy). 0 = dnes uz bylo. */
  xp: number;
  /** true = prvni dokonceni teto lekce v dnesnim dni (XP se pripsalo). */
  poprveDnes: boolean;
}

export interface VyukaSlice {
  /** predmetId → obsah vyuky (bundlovany zaklad + novejsi verze ze serveru). */
  vyuky: Record<string, VyukaPredmetu>;
  /** temaId lekce → postup studenta. */
  postupLekci: Record<string, PostupLekce>;

  /** Merge vyuky (bundle/server) — prijme jen vyssi verzi. Vraci true, kdyz ji ulozil. */
  prijmiVyuku(vyuka: VyukaPredmetu): boolean;
  /** Oznaci blok lekce za dokonceny (idempotentni). */
  dokonciBlok(temaId: string, indexBloku: number): void;
  /**
   * Vynuluje dokoncene bloky lekce, aby sla projit znovu (dokoncenoPoprve,
   * posledniXpDen a pocetDokonceni zustavaji — XP 1x denne dal hlida
   * dokonciLekci). Bez teto akce by uz jednou dokoncena lekce nesla nikdy
   * dokoncit znovu (quest `lekce` i slibovane denni XP za opakovani).
   */
  zacniLekciZnovu(temaId: string): void;
  /**
   * Dokonceni cele lekce: XP_ZA_LEKCI (jen poprve v dany den), streak aktivita
   * a questy sablony `lekce`. `ted` se injektuje JEN v testech.
   */
  dokonciLekci(temaId: string, ted?: Date): VysledekDokonceniLekce;
}

export const VYCHOZI_POSTUP_LEKCE: PostupLekce = {
  dokonceneBloky: [],
  dokoncenoPoprve: null,
  posledniXpDen: null,
  pocetDokonceni: 0,
};

// ---------------------------------------------------------------------------
// Pomucky (ciste funkce)

/** Najde lekci podle temaId napric vsemi vyukami. */
export function najdiLekci(
  vyuky: Record<string, VyukaPredmetu>,
  temaId: string,
): { predmetId: string; lekce: Lekce } | null {
  for (const vyuka of Object.values(vyuky)) {
    const lekce = vyuka.lekce.find((l) => l.temaId === temaId);
    if (lekce) return { predmetId: vyuka.predmetId, lekce };
  }
  return null;
}

function pridejTydenniXp(
  tydenniXp: Record<string, number>,
  den: string,
  xp: number,
): Record<string, number> {
  if (xp <= 0) return tydenniXp;
  const klic = pondeliTydne(den);
  return { ...tydenniXp, [klic]: (tydenniXp[klic] ?? 0) + xp };
}

// ---------------------------------------------------------------------------
// Slice

export const vytvorVyukaSlice: StateCreator<QUESTORStav, [], [], VyukaSlice> = (set, get) => {
  const bundlovane: Record<string, VyukaPredmetu> = {};
  for (const vyuka of bundlovaneVyuky()) bundlovane[vyuka.predmetId] = vyuka;

  // Persist pri rehydrataci prepise `vyuky` starym snapshotem — novejsi
  // bundlovana vyuka z aktualizace aplikace se proto po startu nabidne pres
  // prijmiVyuku (prijme jen vyssi verzi, idempotentni). Stejny vzor jako banky.
  // Persistovany snapshot navic muze pochazet z NOVEJSI verze aplikace
  // (rollback buildu) nebo z rucniho zasahu do localStorage — vyuka s widgetem
  // neznamym aktualnimu buildu by lekci trvale zasekla (frontier bez obsahu
  // i tlacitka). Proto se kazda rehydratovana vyuka revaliduje a nevalidni
  // se zahodi; bundlovana verze se nabidne hned vzapeti.
  setTimeout(() => {
    const rehydratovane = get().vyuky;
    const platne: Record<string, VyukaPredmetu> = {};
    let zahozena = false;
    for (const [predmetId, vyuka] of Object.entries(rehydratovane)) {
      try {
        platne[predmetId] = validujVyuku(vyuka);
      } catch {
        zahozena = true;
      }
    }
    if (zahozena) set({ vyuky: platne });
    for (const vyuka of Object.values(bundlovane)) get().prijmiVyuku(vyuka);
  }, 0);

  return {
    vyuky: bundlovane,
    postupLekci: {},

    prijmiVyuku: (vyuka) => {
      const lokalni = get().vyuky[vyuka.predmetId];
      if (lokalni && vyuka.verze <= lokalni.verze) return false;
      set({ vyuky: { ...get().vyuky, [vyuka.predmetId]: vyuka } });
      return true;
    },

    dokonciBlok: (temaId, indexBloku) => {
      const stav = get();
      const postup = stav.postupLekci[temaId] ?? VYCHOZI_POSTUP_LEKCE;
      if (postup.dokonceneBloky.includes(indexBloku)) return;
      set({
        postupLekci: {
          ...stav.postupLekci,
          [temaId]: { ...postup, dokonceneBloky: [...postup.dokonceneBloky, indexBloku] },
        },
      });
    },

    zacniLekciZnovu: (temaId) => {
      const stav = get();
      const postup = stav.postupLekci[temaId];
      if (!postup || postup.dokonceneBloky.length === 0) return;
      set({
        postupLekci: {
          ...stav.postupLekci,
          [temaId]: { ...postup, dokonceneBloky: [] },
        },
      });
    },

    dokonciLekci: (temaId, ted = new Date()) => {
      const dnes = denZData(ted);

      // Questy dne musi existovat drive, nez se do nich zapocita lekce
      // (obnova je pro stejny den idempotentni — bezpecne volat vzdy).
      get().obnovDenniQuesty();

      const stav = get();
      const postup = stav.postupLekci[temaId] ?? VYCHOZI_POSTUP_LEKCE;
      const poprveDnes = postup.posledniXpDen !== dnes;

      if (!poprveDnes) {
        // Dnes uz XP za tuhle lekci padlo — jen pocitadlo, zadna odmena.
        set({
          postupLekci: {
            ...stav.postupLekci,
            [temaId]: { ...postup, pocetDokonceni: postup.pocetDokonceni + 1 },
          },
        });
        return { xp: 0, poprveDnes: false };
      }

      const progres = stav.progres;

      // Questy sablony `lekce` + XP za prave splnene (dosud neodmenene) questy.
      const questy = aplikujLekciNaQuesty(progres.questy, temaId);
      const kOdmene = questy.filter((q) => q.splneno && !stav.questyOdmeneno.includes(q.id));
      const xpZaQuesty = kOdmene.reduce((s, q) => s + q.odmenaXp, 0);
      const celkoveXp = XP_ZA_LEKCI + xpZaQuesty;

      // Streak: dokoncena lekce je aktivita dne (stejne jako dokonceny test).
      const streak = aktualizujStreakPoAktivite(progres.streak, dnes);
      const zmrazeniPouzito = streak.zmrazeni < progres.streak.zmrazeni;

      set({
        progres: {
          ...progres,
          xp: progres.xp + celkoveXp,
          streak,
          questy,
          rekordy: {
            ...progres.rekordy,
            tydenniXp: pridejTydenniXp(progres.rekordy.tydenniXp, dnes, celkoveXp),
          },
          aktualizovano: ted.toISOString(),
        },
        questyOdmeneno:
          kOdmene.length > 0
            ? [
                ...stav.questyOdmeneno.filter((id) => id.startsWith(dnes)),
                ...kOdmene.map((q) => q.id),
              ]
            : stav.questyOdmeneno,
        zmrazeniPouzitoDen: zmrazeniPouzito ? dnes : stav.zmrazeniPouzitoDen,
        postupLekci: {
          ...stav.postupLekci,
          [temaId]: {
            ...postup,
            dokoncenoPoprve: postup.dokoncenoPoprve ?? ted.toISOString(),
            posledniXpDen: dnes,
            pocetDokonceni: postup.pocetDokonceni + 1,
          },
        },
      });

      return { xp: celkoveXp, poprveDnes: true };
    },
  };
};
