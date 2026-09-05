// Typy domény QUESTORu — sdílené mezi aplikací, serverem a generátorem.
// POZOR: tohle je kontrakt celého systému. Změny jen s rozmyslem a s bumpnutím
// verze banky (viz docs/ARCHITEKTURA.md).

export type Obtiznost = 1 | 2 | 3 | 4 | 5;

export interface Tema {
  id: string;
  nazev: string;
  poradi: number;
}

export interface OtazkaZaklad {
  id: string;
  temaId: string;
  obtiznost: Obtiznost;
  zadani: string;
  /** Vysvětlení správné odpovědi — zobrazuje se po zodpovězení, klíčové pro učení. */
  vysvetleni: string;
  /** Odkaz na místo v učivu (název kapitoly/sekce), odkud otázka vychází. */
  zdroj?: string;
}

export interface OtazkaVyber extends OtazkaZaklad {
  typ: 'vyber';
  moznosti: string[];
  /** Index správné možnosti. */
  spravna: number;
}

export interface OtazkaMulti extends OtazkaZaklad {
  typ: 'multi';
  moznosti: string[];
  /** Indexy všech správných možností (aspoň jedna). */
  spravne: number[];
}

export interface OtazkaAnoNe extends OtazkaZaklad {
  typ: 'anone';
  spravna: boolean;
}

export interface OtazkaDoplneni extends OtazkaZaklad {
  typ: 'doplneni';
  /** Všechny uznávané varianty odpovědi (porovnává se normalizovaně, viz normalizujOdpoved). */
  spravneOdpovedi: string[];
}

export interface OtazkaPrirazovani extends OtazkaZaklad {
  typ: 'prirazovani';
  /** Dvojice, které k sobě patří; aplikace pravou stranu zamíchá. */
  pary: { levy: string; pravy: string }[];
}

export type Otazka =
  | OtazkaVyber
  | OtazkaMulti
  | OtazkaAnoNe
  | OtazkaDoplneni
  | OtazkaPrirazovani;

export type TypOtazky = Otazka['typ'];

export interface BankaOtazek {
  predmetId: string;
  nazev: string;
  /** Inkrementální verze banky — aplikace stahuje jen novější verzi. */
  verze: number;
  vytvoreno: string; // ISO datum
  temata: Tema[];
  otazky: Otazka[];
}

// ---------------------------------------------------------------------------
// Testy

export type RezimTestu = 'rozcvicka' | 'standard' | 'hardcore' | 'adaptivni' | 'zkouska';

export interface TestKonfigurace {
  predmetId: string;
  rezim: RezimTestu;
  pocetOtazek: 5 | 10 | 20;
  /** undefined = všechna témata */
  temataId?: string[];
}

export interface OdpovedZaznam {
  otazkaId: string;
  temaId: string;
  obtiznost: Obtiznost;
  spravne: boolean;
  casMs: number;
}

export interface TestVysledek {
  id: string;
  konfigurace: TestKonfigurace;
  zacatek: string;
  konec: string;
  odpovedi: OdpovedZaznam[];
  /** 0–1 */
  uspesnost: number;
  ziskaneXp: number;
  nejdelsiCombo: number;
  truhla?: TruhlaTyp;
  /** Pokud test vznikl z výzvy (od táty), její id. */
  vyzvaId?: string;
}

// ---------------------------------------------------------------------------
// Gamifikace

export type TruhlaTyp = 'bronzova' | 'stribrna' | 'zlata';

export type OdmenaTyp = 'xp' | 'karta' | 'zmrazeni' | 'vybava';

export interface Odmena {
  typ: OdmenaTyp;
  xp?: number;
  kartaId?: string;
  /** Id položky výbavy z VYBAVA_KATALOG (jen pro typ 'vybava'). */
  vybavaId?: string;
}

export type Vzacnost = 'obycejna' | 'vzacna' | 'epicka' | 'legendarni';

export interface KartaDefinice {
  id: string;
  jmeno: string;
  titul: string;
  popis: string;
  vzacnost: Vzacnost;
}

export interface QuestDenni {
  id: string;
  sablona: string;
  popis: string;
  cil: number;
  postup: number;
  splneno: boolean;
  odmenaXp: number;
  datum: string; // YYYY-MM-DD
  parametry?: Record<string, string | number>;
}

export interface Vyzva {
  id: string;
  zprava: string;
  konfigurace: TestKonfigurace;
  vytvoreno: string;
  stav: 'nova' | 'prijata' | 'dokoncena';
  cilovaUspesnost?: number; // 0–1
  vysledek?: { uspesnost: number; xp: number; dokonceno: string };
}

export interface StatistikaOtazky {
  otazkaId: string;
  /** Leitnerův box: 0 = neumí, 4 = zvládnuto. Nové otázky nemají záznam. */
  box: 0 | 1 | 2 | 3 | 4;
  spravneCelkem: number;
  spatneCelkem: number;
  posledniOdpoved: string; // ISO
}

export interface Sbirka {
  karty: string[];
  /** Počítadlo pity timeru: kolik truhel po sobě nedalo kartu. */
  truhelBezKarty: number;
}

export interface AvatarKonfigurace {
  pohlavi: 'muz' | 'zena';
  tvarObliceje: 'ovalny' | 'hranaty' | 'kulaty';
  barvaPleti: string;
  /** Barva a střih vlasů jsou plně volitelné — libovolná kombinace pro obě pohlaví, včetně krátkých střihů. */
  barvaVlasu: string;
  stylVlasu: 'kratke' | 'polodlouhe' | 'rozpustene' | 'culik' | 'vlnite';
  /** Nasazená kosmetická výbava — hodnoty jsou id položek katalogu (VYBAVA_KATALOG). */
  vybava: { hlava?: string; oci?: string; krk?: string; pozadi?: string };
}

export interface Streak {
  aktualni: number;
  nejdelsi: number;
  posledniDen: string | null; // YYYY-MM-DD
  /** Počet dostupných zmrazení (záchrana vynechaného dne). */
  zmrazeni: number;
}

export interface ProgresStudenta {
  xp: number;
  streak: Streak;
  questy: QuestDenni[];
  sbirka: Sbirka;
  avatar: AvatarKonfigurace;
  /** Id vlastněných položek výbavy avataru (padají z truhel, viz VYBAVA_KATALOG). */
  vlastnenaVybava: string[];
  statistikyOtazek: Record<string, StatistikaOtazky>;
  rekordy: {
    nejlepsiUspesnost: number;
    nejdelsiCombo: number;
    nejrychlejsiBezchybnyMs: number | null;
    /** Klíč = pondělí týdne (YYYY-MM-DD), hodnota = XP získané v tom týdnu. */
    tydenniXp: Record<string, number>;
  };
  dokonceneTesty: number;
  aktualizovano: string; // ISO
}

// ---------------------------------------------------------------------------
// Registr profilů (sync profilů mezi zařízeními rodiny)

/**
 * Metadata profilu v serverovém registru — to, co se synchronizuje mezi
 * zařízeními (profil založený na telefonu se objeví i na notebooku).
 * PIN cestuje jako hash (pinHash z profily/pin.ts), nikdy v otevřené podobě;
 * chybějící pinHash = profil bez PINu.
 */
export interface ProfilMetadata {
  jmeno: string;
  barva: string;
  pinHash?: string;
  avatar?: AvatarKonfigurace;
  /** Studijní banky profilu (id z registru předmětů, v pořadí výběru). */
  predmety: string[];
  aktivniPredmetId: string;
}

/**
 * Záznam registru profilů, jak ho vrací server (GET /api/profily) a přijímá
 * PUT /api/profily/:id. Konflikt řeší LWW: zápis projde, jen když je
 * `aktualizovano` >= uloženému (ISO čas — porovnává se lexikograficky).
 */
export interface ProfilRegistrZaznam extends ProfilMetadata {
  profilId: string;
  /** ISO čas poslední změny profilu na zdrojovém zařízení. */
  aktualizovano: string;
}

// ---------------------------------------------------------------------------
// Generování

export type StavUlohy = 'ceka' | 'bezi' | 'hotovo' | 'chyba';

export interface GeneratorUloha {
  id: string;
  predmetId: string;
  stav: StavUlohy;
  detail?: string;
  vytvoreno: string;
}
