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
import type {
  ProfilRegistrZaznam,
  ProgresStudenta,
  QuestDenni,
  TestVysledek,
  TruhlaTyp,
  Vyzva,
} from '@questor/sdilene';
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
  /**
   * ISO cas posledni zmeny profilu (jmeno, barva, PIN, banky, aktivni banka,
   * avatar) — rozhodci LWW pri syncu registru profilu mezi zarizenimi.
   * Udrzuje se pri KAZDE zmene profilu (viz akce nize + hraSlice.zmenAvatara).
   */
  aktualizovano: string;
  /**
   * Profil uz byl videt na serveru (v registru profilu). Ridi propagaci
   * smazani: kdyz server profil s timhle priznakem uz NEZNA, byl smazany
   * na jinem zarizeni a maze se i lokalne. Profil BEZ priznaku se pri merge
   * NIKDY lokalne nemaze — jen se pushne na server.
   */
  naServeru?: boolean;
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

/**
 * Naplanuje push zmeneneho profilu do registru na serveru (PUT pres offline
 * frontu). Dynamicky import brani cyklu zavislosti; selhani je tiche —
 * offline-first, profil se pushne pri pristim syncu z fronty.
 */
function naplanujPushProfilu(profilId: string): void {
  void import('../sync/sync')
    .then((m) => m.zaznamenejZmenuProfilu(profilId))
    .catch(() => {});
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
  /**
   * Merge serveroveho registru profilu do lokalnich (LWW dle aktualizovano):
   * - server novejsi → prepise metadata lokalniho profilu (vc. zruseni PINu),
   * - lokal novejsi nebo server profil nezna → profil se vrati v `pushnout`,
   * - profil jen na serveru → PRIDA se lokalne (karta „ze serveru", ☁️),
   * - lokalni profil s priznakem naServeru, ktery server uz NEZNA → smaze se
   *   i lokalne (smazani na jinem zarizeni); profil bez priznaku se NEMAZE.
   * POJISTKA: kdyz by se takhle mely smazat VSECHNY lokalni profily, nebo
   * server vratil prazdny registr, smazani se neprovede a profily se misto
   * toho pushnou — prazdna/cizi odpoved registru (preinstalovany server,
   * ztracena DB, prepnuta adresa) nesmi vyvolat plosny vymaz lokalnich dat.
   * Vraci profily k pushnuti a id lokalne smazanych (volajici jim zapomene
   * fronty). Cista zmena stavu — zadna sit, vola ji sync po GET /api/profily.
   */
  aplikujRegistrProfilu(serverove: ProfilRegistrZaznam[]): {
    pushnout: Profil[];
    smazane: string[];
  };
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
      aktualizovano: new Date().toISOString(),
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
    naplanujPushProfilu(profil.id);
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
    // Aktivace profilu: pull kompletniho postupu ze serveru (LWW dle
    // progres.aktualizovano; bez zapnuteho syncu no-op). Tiche, neblokujici —
    // UI ukazuje jen nenapadny stav „Nacitam postup…". Sit jen v prohlizeci
    // (testy v Node volaji stahniPostupProfilu primo s mocknutym fetchem).
    if (typeof window !== 'undefined') {
      void import('../sync/sync')
        .then((m) => m.stahniPostupProfilu())
        .catch(() => {});
    }
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
        p.id === profil.id
          ? { ...p, aktivniPredmetId: predmetId, aktualizovano: new Date().toISOString() }
          : p,
      ),
      progres: { ...stav.progres, questy: ulozene?.questy ?? [] },
      questyOdmeneno: ulozene?.questyOdmeneno ?? [],
      questyPodleBank,
    });
    // Bez (dnesniho) snimku se questy nove banky rovnou vygeneruji; se
    // snimkem z dneska je akce no-op (zadne nove questy zadarmo).
    get().obnovDenniQuesty();
    naplanujPushProfilu(profil.id);
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
        p.id === profil.id
          ? { ...p, predmety: [...p.predmety, predmetId], aktualizovano: new Date().toISOString() }
          : p,
      ),
    });
    naplanujPushProfilu(profil.id);
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
        return { ...p, predmety: nove, aktualizovano: new Date().toISOString() };
      }),
    });
    // Snimek questu odebrane banky se NEmaze — postup „zustane ulozeny
    // a vrati se s ni" (stejne jako Leitner statistiky v progresu).
    naplanujPushProfilu(profil.id);
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
    set({
      profily: stav.profily.map((p) =>
        p.id === id ? { ...p, jmeno: cistne, aktualizovano: new Date().toISOString() } : p,
      ),
    });
    naplanujPushProfilu(id);
    return true;
  },

  nastavPinProfilu: (id, pinHash) => {
    const stav = get();
    if (!stav.profily.some((p) => p.id === id)) return false;
    set({
      profily: stav.profily.map((p) => {
        if (p.id !== id) return p;
        const { pinHash: _stary, ...bezPinu } = p;
        const zmeneny = { ...bezPinu, aktualizovano: new Date().toISOString() };
        return pinHash ? { ...zmeneny, pinHash } : zmeneny;
      }),
    });
    naplanujPushProfilu(id);
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
    // zpatky do localStorage) a smazat ulozeny klic. Navic se smazani zaradi
    // do fronty registru (DELETE /api/profily/:id), aby profil zmizel i na
    // ostatnich zarizenich — polozka zije MIMO frontu mazaneho profilu.
    void import('../sync/sync')
      .then((m) => m.zaznamenejSmazaniProfilu(id))
      .catch(() => {});
    return true;
  },

  aplikujRegistrProfilu: (serverove) => {
    const stav = get();
    const zeServeru = new Map(serverove.map((z) => [z.profilId, z]));
    const pushnout: Profil[] = [];
    const smazane: string[] = [];
    const vysledne: Profil[] = [];
    const dataProfilu = { ...stav.dataProfilu };
    let aktivniSmazan = false;
    let zmena = false;

    // POJISTKA proti plošnému výmazu: příznak naServeru není vázaný na
    // konkrétní server/DB, takže prázdný (přeinstalovaný server, ztracená
    // questor.db) nebo cizí registr (přepnutá adresa serveru se stejným
    // rodinným kódem) by „smazáním podle absence" vymazal VŠECHNY lokální
    // profily včetně postupu — a lokální data jsou přitom poslední záloha.
    // Když by merge měl smazat všechny lokální profily, nebo server vrátil
    // úplně prázdný registr, smazání se NEPROVEDE a profily se místo toho
    // pushnou (server se z lokálních dat znovu naplní). Běžné smazání
    // jednoho profilu z jiného zařízení tím netrpí: server tehdy pořád
    // vrací ostatní profily rodiny.
    const kandidatiSmazani = stav.profily.filter((p) => p.naServeru && !zeServeru.has(p.id));
    const smazaniPodezrele =
      kandidatiSmazani.length > 0 &&
      (serverove.length === 0 || kandidatiSmazani.length === stav.profily.length);

    for (const p of stav.profily) {
      const z = zeServeru.get(p.id);
      if (z) {
        zeServeru.delete(p.id);
        if (z.aktualizovano > p.aktualizovano) {
          // Server je novejsi → prevzit metadata (LWW). Zaznam BEZ pinHash
          // rusi i lokalni PIN (zruseni PINu na jinem zarizeni plati vsude).
          vysledne.push({
            id: p.id,
            jmeno: z.jmeno,
            barva: z.barva,
            predmety: [...z.predmety],
            aktivniPredmetId: z.aktivniPredmetId,
            aktualizovano: z.aktualizovano,
            naServeru: true,
            ...(z.pinHash ? { pinHash: z.pinHash } : {}),
          });
          zmena = true;
          // Avatar z registru jen do snimku NEAKTIVNIHO profilu (karta na
          // vyberu vypada spravne) — avatar aktivniho ridi pull progresu,
          // aby registr neprepsal novejsi lokalni postup.
          if (z.avatar && p.id !== stav.aktivniProfilId && dataProfilu[p.id]) {
            dataProfilu[p.id] = {
              ...dataProfilu[p.id],
              progres: { ...dataProfilu[p.id].progres, avatar: z.avatar },
            };
          }
        } else {
          const znamy = p.naServeru ? p : { ...p, naServeru: true };
          if (znamy !== p) zmena = true;
          vysledne.push(znamy);
          // Lokal je novejsi → server si ma vzit nas zapis.
          if (p.aktualizovano > z.aktualizovano) pushnout.push(znamy);
        }
      } else if (p.naServeru) {
        if (smazaniPodezrele) {
          // Podezrele hromadne mazani (viz pojistka vyse) — profil zustava
          // a pushne se, at se server z lokalnich dat znovu naplni.
          vysledne.push(p);
          pushnout.push(p);
        } else {
          // Server profil ZNAL a uz ho nezna → smazany na jinem zarizeni.
          smazane.push(p.id);
          delete dataProfilu[p.id];
          if (stav.aktivniProfilId === p.id) aktivniSmazan = true;
          zmena = true;
        }
      } else {
        // Profil, ktery na serveru nikdy nebyl, se NIKDY nemaze — pushne se.
        vysledne.push(p);
        pushnout.push(p);
      }
    }

    // Profily zname jen ze serveru → pridat lokalne (karta ☁️ „ze serveru").
    for (const z of zeServeru.values()) {
      vysledne.push({
        id: z.profilId,
        jmeno: z.jmeno,
        barva: z.barva,
        predmety: [...z.predmety],
        aktivniPredmetId: z.aktivniPredmetId,
        aktualizovano: z.aktualizovano,
        naServeru: true,
        ...(z.pinHash ? { pinHash: z.pinHash } : {}),
      });
      // Snimek s avatarem z registru, at karta profilu nema jen vychozi
      // postavicku; kompletni postup pribude pullem progresu pri aktivaci.
      // KLICOVE: progres.aktualizovano snimku je EPOCHA (ne „ted") — cerstvy
      // prazdny snimek nesmi v LWW pullu postupu porazit skutecny postup
      // profilu na serveru (jinak by nove zarizeni prepsalo serverovy postup
      // prazdnym progresem).
      const vychozi = vychoziDataProfilu('1970-01-01T00:00:00.000Z');
      dataProfilu[z.profilId] = z.avatar
        ? { ...vychozi, progres: { ...vychozi.progres, avatar: z.avatar } }
        : vychozi;
      zmena = true;
    }

    if (zmena) {
      set({
        profily: vysledne,
        dataProfilu,
        // Smazani AKTIVNIHO profilu na jinem zarizeni: pracovni sada se
        // zahazuje a aplikace se vraci na vyber profilu (jako smazProfil).
        ...(aktivniSmazan ? { aktivniProfilId: null, ...vychoziDataProfilu() } : {}),
      });
    }
    return { pushnout, smazane };
  },
});
