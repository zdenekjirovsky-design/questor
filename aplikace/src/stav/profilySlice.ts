// Slice lokalnich profilu — profily jako na streamovacich sluzbach:
// ZADNY e-mail, zadne sitove overovani, jen lokalni data na jednom pocitaci.
//
// Model: VESKERA osobni data (progres vc. avatara a vybavy, postup lekci,
// rozehrany test, posledni vysledek, odmenene questy, historie testu, truhly,
// vyzvy) ziji pro AKTIVNI profil primo v pracovnich slicech (hraSlice,
// testySlice, vyukaSlice) — cela aplikace tak funguje beze zmen. Neaktivni
// profily maji svuj snimek v `dataProfilu[id]`. Prepnuti profilu = ulozit
// pracovni sadu do snimku stareho profilu a nahrat snimek noveho.
// Obsah (banky, vyuky) je SDILENY — profilu se netyka.
//
// Fronta syncu je take per profil, ale zije mimo zustand (localStorage,
// viz ../sync/fronta.ts) — smazani profilu ji maze akci smazProfil.
import type { StateCreator } from 'zustand';
import type { ProgresStudenta, TestVysledek, TruhlaTyp, Vyzva } from '@questor/sdilene';
import { vychoziProgres } from '@questor/sdilene';
import type { TestStav } from '../testy/engine';
import type { PostupLekce } from './vyukaSlice';
import type { QUESTORStav } from './store';

// ---------------------------------------------------------------------------
// Typy

export interface Profil {
  /** Nahodne id (soli se jim PIN hash a seeduji questy dne). */
  id: string;
  jmeno: string;
  /** Barva profilu (ramecek karty, krouzek avataru v hlavicce). */
  barva: string;
  /** SHA-256 hex hash PINu se soli id profilu; undefined = profil bez PINu. */
  pinHash?: string;
}

/** Snimek VSECH osobnich dat profilu (pracovni sada aktivniho profilu). */
export interface DataProfilu {
  progres: ProgresStudenta;
  aktualniTest: TestStav | null;
  posledniVysledek: TestVysledek | null;
  questyOdmeneno: string[];
  historieTestu: TestVysledek[];
  cekajiciTruhly: TruhlaTyp[];
  vyzvy: Vyzva[];
  novaKarty: string[];
  denBonusoveTruhly: string | null;
  zmrazeniPouzitoDen: string | null;
  postupLekci: Record<string, PostupLekce>;
}

/** Paleta barev profilu (karty na vyberu, krouzek v hlavicce). */
export const BARVY_PROFILU = [
  '#8b5cf6', // fialova (akcent)
  '#f5b942', // zlata
  '#34d399', // zelena
  '#60a5fa', // modra
  '#f472b6', // ruzova
  '#fb923c', // oranzova
  '#2dd4bf', // tyrkysova
  '#a3e635', // limetkova
] as const;

export const MAX_DELKA_JMENA = 20;

// ---------------------------------------------------------------------------
// Pomucky (ciste funkce)

export function vytvorIdProfilu(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // spadneme na zalozni generator
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function vychoziDataProfilu(ted: string = new Date().toISOString()): DataProfilu {
  return {
    progres: vychoziProgres(ted),
    aktualniTest: null,
    posledniVysledek: null,
    questyOdmeneno: [],
    historieTestu: [],
    cekajiciTruhly: [],
    vyzvy: [],
    novaKarty: [],
    denBonusoveTruhly: null,
    zmrazeniPouzitoDen: null,
    postupLekci: {},
  };
}

/** Sejme osobni data aktivniho profilu z pracovnich slices do snimku. */
export function sejmiDataProfilu(stav: QUESTORStav): DataProfilu {
  return {
    progres: stav.progres,
    aktualniTest: stav.aktualniTest,
    posledniVysledek: stav.posledniVysledek,
    questyOdmeneno: stav.questyOdmeneno,
    historieTestu: stav.historieTestu,
    cekajiciTruhly: stav.cekajiciTruhly,
    vyzvy: stav.vyzvy,
    novaKarty: stav.novaKarty,
    denBonusoveTruhly: stav.denBonusoveTruhly,
    zmrazeniPouzitoDen: stav.zmrazeniPouzitoDen,
    postupLekci: stav.postupLekci,
  };
}

function orizniJmeno(jmeno: string): string {
  return jmeno.trim().slice(0, MAX_DELKA_JMENA);
}

// ---------------------------------------------------------------------------
// Slice

export interface ProfilySlice {
  profily: Profil[];
  /** null = nikdo neni prihlaseny → App.tsx ukaze vyber profilu. */
  aktivniProfilId: string | null;
  /** Snimky osobnich dat NEAKTIVNICH profilu (aktivni zije v pracovnich slicech). */
  dataProfilu: Record<string, DataProfilu>;

  /**
   * Zalozi novy profil a rovnou na nej prepne (pracovni sadu dosavadniho
   * aktivniho profilu nejdriv ulozi). Vraci novy profil. Volitelne `id`
   * dovoluje UI vygenerovat id predem (vytvorIdProfilu) a spocitat PIN hash
   * (sul = id) JESTE PRED zalozenim — kdyz hash selze, profil nevznikne.
   */
  vytvorProfil(jmeno: string, barva: string, pinHash?: string, id?: string): Profil;
  /**
   * Prepne na profil (overeni PINu resi UI PRED volanim). Ulozi pracovni
   * sadu dosavadniho profilu a nahraje snimek noveho. Vraci false pro
   * neznamy id nebo prepnuti na sebe.
   */
  prepniProfil(id: string): boolean;
  /** Ulozi pracovni sadu a odhlasi profil (App.tsx pak ukaze vyber). */
  odhlasProfil(): void;
  prejmenujProfil(id: string, jmeno: string): boolean;
  /** Nastavi novy pinHash, undefined PIN rusi. Overeni stareho PINu resi UI. */
  nastavPinProfilu(id: string, pinHash: string | undefined): boolean;
  /**
   * Smaze profil a VSECHNA jeho data. Posledni profil smazat NEJDE (vraci
   * false). Dvojite potvrzeni + opsani jmena vyzaduje UI (SpravaProfilu).
   */
  smazProfil(id: string): boolean;
}

export const vytvorProfilySlice: StateCreator<QUESTORStav, [], [], ProfilySlice> = (set, get) => ({
  profily: [],
  aktivniProfilId: null,
  dataProfilu: {},

  vytvorProfil: (jmeno, barva, pinHash, id) => {
    const stav = get();
    const profil: Profil = {
      id: id ?? vytvorIdProfilu(),
      jmeno: orizniJmeno(jmeno) || 'Hrac',
      barva,
      ...(pinHash ? { pinHash } : {}),
    };
    const dataProfilu = { ...stav.dataProfilu };
    if (stav.aktivniProfilId) dataProfilu[stav.aktivniProfilId] = sejmiDataProfilu(stav);
    set({
      profily: [...stav.profily, profil],
      aktivniProfilId: profil.id,
      dataProfilu,
      ...vychoziDataProfilu(),
    });
    return profil;
  },

  prepniProfil: (id) => {
    const stav = get();
    if (id === stav.aktivniProfilId) return false;
    if (!stav.profily.some((p) => p.id === id)) return false;
    const dataProfilu = { ...stav.dataProfilu };
    if (stav.aktivniProfilId) dataProfilu[stav.aktivniProfilId] = sejmiDataProfilu(stav);
    // Snimek aktivniho profilu se ze slovniku odebira — jediny zdroj pravdy
    // jeho dat je ted pracovni sada (zadny zastaraly duplikat).
    const nova = dataProfilu[id] ?? vychoziDataProfilu();
    delete dataProfilu[id];
    set({ aktivniProfilId: id, dataProfilu, ...nova });
    return true;
  },

  odhlasProfil: () => {
    const stav = get();
    if (!stav.aktivniProfilId) return;
    const dataProfilu = {
      ...stav.dataProfilu,
      [stav.aktivniProfilId]: sejmiDataProfilu(stav),
    };
    // Pracovni sada se vynuluje, aby data odhlaseneho profilu nezustala
    // viset v pameti pod obrazovkou vyberu profilu.
    set({ aktivniProfilId: null, dataProfilu, ...vychoziDataProfilu() });
  },

  prejmenujProfil: (id, jmeno) => {
    const cistne = orizniJmeno(jmeno);
    if (!cistne) return false;
    const stav = get();
    if (!stav.profily.some((p) => p.id === id)) return false;
    set({ profily: stav.profily.map((p) => (p.id === id ? { ...p, jmeno: cistne } : p)) });
    return true;
  },

  nastavPinProfilu: (id, pinHash) => {
    const stav = get();
    if (!stav.profily.some((p) => p.id === id)) return false;
    set({
      profily: stav.profily.map((p) => {
        if (p.id !== id) return p;
        const { pinHash: _stary, ...bezPinu } = p;
        return pinHash ? { ...bezPinu, pinHash } : bezPinu;
      }),
    });
    return true;
  },

  smazProfil: (id) => {
    const stav = get();
    if (!stav.profily.some((p) => p.id === id)) return false;
    if (stav.profily.length <= 1) return false; // posledni profil nikdy
    const profily = stav.profily.filter((p) => p.id !== id);
    const dataProfilu = { ...stav.dataProfilu };
    delete dataProfilu[id];
    if (stav.aktivniProfilId === id) {
      // Smazani aktivniho profilu: jeho pracovni sada se zahazuje (nikam
      // se neuklada) a aplikace se vraci na vyber profilu.
      set({ profily, dataProfilu, aktivniProfilId: null, ...vychoziDataProfilu() });
    } else {
      set({ profily, dataProfilu });
    }
    // Fronta syncu profilu zije mimo zustand — zapomenout ji celou (fail-safe):
    // zrusit in-memory instanci (jinak by ji bezici sync po awaitu ulozil
    // zpatky do localStorage) a smazat ulozeny klic.
    void import('../sync/sync')
      .then((m) => m.zapomenFrontuProfilu(id))
      .catch(() => {});
    return true;
  },
});
