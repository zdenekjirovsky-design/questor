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
import type { ProgresStudenta, QuestDenni, TestVysledek, TruhlaTyp, Vyzva } from '@questor/sdilene';
import { vychoziProgres } from '@questor/sdilene';
import type { TestStav } from '../testy/engine';
import type { PostupLekce } from './vyukaSlice';
import { PREDMETY } from '../data/predmety';
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
  /**
   * Studijni banky (id predmetu z registru ../data/predmety.ts), ktere si
   * profil vybral — vzdy aspon jedna. Poradi = poradi vyberu pri zalozeni
   * (prvni vybrana byla aktivni). Id, ktere uz v registru neni (banka
   * odebrana z aplikace), se pri cteni TISE ignoruje — cti pres
   * predmetyProfilu(), ne primo.
   */
  predmety: string[];
  /** Aktivni studijni banka — MUSI byt z predmety; cti pres aktivniPredmetProfilu(). */
  aktivniPredmetId: string;
}

/** Snimek dennich questu jedne (neaktivni) banky — viz questyPodleBank. */
export interface QuestyBanky {
  questy: QuestDenni[];
  questyOdmeneno: string[];
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
  /**
   * Denni questy NEAKTIVNICH bank profilu (questy aktivni banky ziji
   * v progres.questy + questyOdmeneno). Klic = predmetId. Diky snimku
   * prepinani bank tam a zpet NEgeneruje nove questy zadarmo.
   */
  questyPodleBank: Record<string, QuestyBanky>;
  /**
   * Tydenni XP z testu per banka (predmetId → pondeli tydne → soucet
   * ziskaneXp) — presny agregat pro graf ve Statistikach (vede ho
   * hraSlice.zapocitejTest).
   */
  tydenniXpTestuPodleBank: Record<string, Record<string, number>>;
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
    questyPodleBank: {},
    tydenniXpTestuPodleBank: {},
  };
}

/**
 * Doplni snimek profilu o pole, ktera starsi snimky (z drivejsich verzi
 * persistu) jeste nemela — nacteni snimku pres spread do pracovni sady by
 * jinak nechalo viset hodnoty predchoziho profilu (unik dat mezi profily).
 */
export function doplnDataProfilu(snimek: Partial<DataProfilu> | undefined): DataProfilu {
  return { ...vychoziDataProfilu(), ...snimek };
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
    questyPodleBank: stav.questyPodleBank,
    tydenniXpTestuPodleBank: stav.tydenniXpTestuPodleBank,
  };
}

function orizniJmeno(jmeno: string): string {
  return jmeno.trim().slice(0, MAX_DELKA_JMENA);
}

// ---------------------------------------------------------------------------
// Studijni banky profilu (ciste funkce — jedina cesta cteni predmetu profilu)

const REGISTR_ID = new Set(PREDMETY.map((p) => p.id));

/**
 * Vycisti seznam id bank: jen id existujici v registru (banka odebrana
 * z aplikace se TISE ignoruje, nic nepada), bez duplicit, v puvodnim poradi.
 * Prazdny vysledek (vsechno nezname / nic nevybrano) spadne na VSECHNY banky
 * registru — profil nikdy nesmi zustat bez jedine banky.
 */
export function vycistiPredmetyProfilu(ids: readonly string[] | undefined): string[] {
  const ciste: string[] = [];
  for (const id of ids ?? []) {
    if (REGISTR_ID.has(id) && !ciste.includes(id)) ciste.push(id);
  }
  return ciste.length > 0 ? ciste : PREDMETY.map((p) => p.id);
}

/** Studijni banky profilu (vycistene proti registru). null profil = vsechny banky. */
export function predmetyProfilu(profil: Pick<Profil, 'predmety'> | null | undefined): string[] {
  return vycistiPredmetyProfilu(profil?.predmety);
}

/**
 * Aktivni banka profilu: aktivniPredmetId, pokud je mezi (vycistenymi)
 * predmety profilu, jinak prvni z nich. null jen bez profilu.
 */
export function aktivniPredmetProfilu(
  profil: Pick<Profil, 'predmety' | 'aktivniPredmetId'> | null | undefined,
): string | null {
  if (!profil) return null;
  const predmety = predmetyProfilu(profil);
  return predmety.includes(profil.aktivniPredmetId) ? profil.aktivniPredmetId : (predmety[0] ?? null);
}

/** Aktivni profil ze stavu (pomucka pro slices i UI selektory). */
export function najdiAktivniProfil(stav: {
  profily: Profil[];
  aktivniProfilId: string | null;
}): Profil | null {
  return stav.profily.find((p) => p.id === stav.aktivniProfilId) ?? null;
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
   * `predmety` = studijni banky vybrane pri zalozeni (prvni = aktivni);
   * prazdne/chybejici → vsechny banky registru (fail-safe, min. 1 vzdy plati).
   */
  vytvorProfil(jmeno: string, barva: string, pinHash?: string, id?: string, predmety?: string[]): Profil;
  /**
   * Prepne aktivni studijni banku AKTIVNIHO profilu. Questy dne stare banky
   * ulozi do questyPodleBank a nahraje (nebo vygeneruje) questy nove banky —
   * prepinani tam a zpet tak NEgeneruje nove questy zadarmo. Vraci false pro
   * banku mimo predmety profilu nebo prepnuti na uz aktivni.
   */
  prepniAktivniPredmet(predmetId: string): boolean;
  /** Prida studijni banku (z registru) aktivnimu profilu. */
  pridejPredmetProfilu(predmetId: string): boolean;
  /**
   * Odebere studijni banku aktivniho profilu. Posledni banka odebrat NEJDE
   * (min. 1). Odebrani aktivni banky prepne na prvni zbylou. Postup v bance
   * (Leitner, mistrovstvi) zustava ulozeny a vrati se s pripadnym pridanim.
   */
  odeberPredmetProfilu(predmetId: string): boolean;
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

  vytvorProfil: (jmeno, barva, pinHash, id, predmety) => {
    const stav = get();
    const vybrane = vycistiPredmetyProfilu(predmety);
    const profil: Profil = {
      id: id ?? vytvorIdProfilu(),
      jmeno: orizniJmeno(jmeno) || 'Hrac',
      barva,
      predmety: vybrane,
      aktivniPredmetId: vybrane[0],
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
    // jeho dat je ted pracovni sada (zadny zastaraly duplikat). Starsi snimek
    // (z drivejsi verze persistu) se doplni o chybejici pole.
    const nova = doplnDataProfilu(dataProfilu[id]);
    delete dataProfilu[id];
    set({ aktivniProfilId: id, dataProfilu, ...nova });
    return true;
  },

  prepniAktivniPredmet: (predmetId) => {
    const stav = get();
    const profil = najdiAktivniProfil(stav);
    if (!profil) return false;
    if (!predmetyProfilu(profil).includes(predmetId)) return false;
    const stary = aktivniPredmetProfilu(profil);
    if (predmetId === stary) return false;

    // Questy dne stare banky do snimku, questy nove banky ze snimku ven —
    // jediny zdroj pravdy questu aktivni banky je pracovni sada.
    const questyPodleBank = { ...stav.questyPodleBank };
    if (stary) {
      questyPodleBank[stary] = { questy: stav.progres.questy, questyOdmeneno: stav.questyOdmeneno };
    }
    const ulozene = questyPodleBank[predmetId];
    delete questyPodleBank[predmetId];

    set({
      profily: stav.profily.map((p) =>
        p.id === profil.id ? { ...p, aktivniPredmetId: predmetId } : p,
      ),
      progres: { ...stav.progres, questy: ulozene?.questy ?? [] },
      questyOdmeneno: ulozene?.questyOdmeneno ?? [],
      questyPodleBank,
    });
    // Bez (dnesniho) snimku se questy nove banky rovnou vygeneruji; se
    // snimkem z dneska je akce no-op (zadne nove questy zadarmo).
    get().obnovDenniQuesty();
    return true;
  },

  pridejPredmetProfilu: (predmetId) => {
    const stav = get();
    const profil = najdiAktivniProfil(stav);
    if (!profil) return false;
    if (!PREDMETY.some((p) => p.id === predmetId)) return false;
    if (predmetyProfilu(profil).includes(predmetId)) return false;
    // Zapis zachovava PUVODNI ulozene pole (id docasne mimo registr se jen
    // tise ignoruje pri cteni a s navratem banky do aplikace se obnovi) —
    // cisteni patri vyhradne na cteci cestu (predmetyProfilu).
    set({
      profily: stav.profily.map((p) =>
        p.id === profil.id ? { ...p, predmety: [...p.predmety, predmetId] } : p,
      ),
    });
    return true;
  },

  odeberPredmetProfilu: (predmetId) => {
    const stav = get();
    const profil = najdiAktivniProfil(stav);
    if (!profil) return false;
    const predmety = predmetyProfilu(profil);
    if (!predmety.includes(predmetId)) return false;
    if (predmety.length <= 1) return false; // min. 1 banka vzdy zustava

    // Odebrani aktivni banky nejdriv prepne na prvni zbylou (vcetne
    // prehozeni questu dne), pak se banka odebere ze seznamu.
    if (aktivniPredmetProfilu(profil) === predmetId) {
      const zbyla = predmety.find((id) => id !== predmetId);
      if (!zbyla || !get().prepniAktivniPredmet(zbyla)) return false;
    }
    const po = get();
    set({
      profily: po.profily.map((p) => {
        if (p.id !== profil.id) return p;
        // Zapis zachovava PUVODNI ulozene pole (nezname id se jen tise
        // ignoruje pri cteni) — odebira se JEN konkretni id. Vyjimka: kdyz
        // cteni spadlo na fallback „vsechny banky" (v poli neni zadne zname
        // id), musi se zbyle banky materializovat, jinak by odebrani nemelo
        // zadny efekt; nezname id se i tak zachovaji.
        const nove = p.predmety.includes(predmetId)
          ? p.predmety.filter((id) => id !== predmetId)
          : [...p.predmety, ...predmetyProfilu(p).filter((id) => id !== predmetId)];
        return { ...p, predmety: nove };
      }),
    });
    // Snimek questu odebrane banky se NEmaze — postup „zustane ulozeny
    // a vrati se s ni" (stejne jako Leitner statistiky v progresu).
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
