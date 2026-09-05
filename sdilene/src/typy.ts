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

export type OdmenaTyp = 'xp' | 'karta' | 'zmrazeni' | 'vybava' | 'powerup';

export interface Odmena {
  typ: OdmenaTyp;
  xp?: number;
  kartaId?: string;
  /** Id položky výbavy z VYBAVA_KATALOG (jen pro typ 'vybava'). */
  vybavaId?: string;
  /** Typ power-upu do duelů (jen pro typ 'powerup'). */
  powerupTyp?: PowerupTyp;
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

// ---------------------------------------------------------------------------
// Duely — asynchronní výzvy mezi profily jedné rodiny (stejný rodinný kód).
// Oba hráči hrají IDENTICKOU sadu otázek (stejné pořadí, míchání možností ze
// seedu = id duelu) do 24 hodin, bez průběžné zpětné vazby (jako režim zkouška).

/**
 * Power-upy do duelů — padají z truhel, hromadí se v progresu a použít je lze
 * JEN v duelu, každý typ max 1× za duel:
 * - 'pade-na-pade'  = 50:50, skryje 2 špatné možnosti u výběrové otázky,
 * - 'zmrazeni-casu' = +10 s na aktuální otázku,
 * - 'stit'          = první špatná odpověď se počítá za 50 bodů místo 0.
 */
export type PowerupTyp = 'pade-na-pade' | 'zmrazeni-casu' | 'stit';

export interface UcastnikDuelu {
  profilId: string;
  jmeno: string;
}

/**
 * Host duelu odkazem (fáze 2) — soupeř MIMO rodinu, bez profilu a rodinného
 * kódu. Jako účastník vystupuje pod profilId `host:<duelId>` (hostProfilId
 * v duely.ts) a jménem, které zadal při přijetí odkazu.
 */
export interface HostDuelu {
  jmeno: string;
}

export interface OdpovedDuelu {
  otazkaId: string;
  spravne: boolean;
  /** Čas strávený na otázce (timeout = čas limitu, spravne false). */
  casMs: number;
  /** Power-up použitý na této otázce (každý typ max 1× za duel). */
  pouzityPowerup?: PowerupTyp;
}

export interface VysledekDuelu {
  odpovedi: OdpovedDuelu[];
  /** Součet bodů dle bodyZaOdpoved (100 + časový bonus, štít 50 za první chybu). */
  body: number;
  /** Součet časů odpovědí — rozhoduje při shodě bodů (nižší vyhrává). */
  celkovyCasMs: number;
  /** ISO čas dokončení duelu hráčem. */
  dokonceno: string;
}

export type StavDuelu = 'cekajici' | 'prijaty' | 'hotovy' | 'vyprsely';

export interface Duel {
  id: string;
  /** Obor duelu = jedna banka otázek. */
  predmetId: string;
  /** Volitelné zúžení na témata banky; undefined = celá banka. */
  temataId?: string[];
  pocetOtazek: 5 | 10 | 20;
  /**
   * Identická sada otázek pro oba hráče (pořadí závazné, výběr ze seedu
   * = id duelu). POZOR: GET /api/duely sadu ZATAJUJE (prázdné pole) adresátovi
   * cílené výzvy před přijetím a u otevřených výzev rodiny — anti-cheat, aby
   * si hráč nemohl odpovědi nachystat předem; plná sada přijde s přijetím.
   */
  otazkyIds: string[];
  /**
   * Verze banky, proti které duel vznikl (server ji zapíše při založení).
   * Server proti ní přepočítává výsledek; volitelná kvůli starším duelům.
   */
  verzeBanky?: number;
  vyzyvatel: UcastnikDuelu;
  /** Vyzvaný soupeř; u výzvy „kdokoli z rodiny“ chybí, dokud ji někdo nepřijme. */
  souper?: UcastnikDuelu;
  /** true = výzvu smí přijmout kdokoli z rodiny (první, kdo přijme). */
  otevrenyProRodinu: boolean;
  /**
   * true = duel sdílený ODKAZEM pro hosta mimo rodinu (fáze 2). Nikdy není
   * otevrenyProRodinu; soupeřem se stává host přijetím odkazu (souper.profilId
   * = host:<duelId>). Rodinné přijetí je u něj zablokované.
   */
  proOdkaz?: boolean;
  /**
   * SHA-256 hash jednorázového hostovského kódu (sůl = id duelu). Otevřený
   * kód server NIKDY neukládá a hash se NIKDY neposílá v žádné odpovědi —
   * únik DB neprozradí platné odkazy.
   */
  hostKodHash?: string;
  /** Host (soupeř mimo rodinu) po přijetí odkazu; handicap má vždy 1.0. */
  host?: HostDuelu;
  /**
   * Handicap férovosti: profilId → násobič časového limitu na otázku
   * (1.0–1.5, slabší hráč dostává delší limity). Počítá se ze snapshotů
   * progresu na serveru při vytvoření/přijetí duelu a je NEMĚNNÝ po celý duel.
   */
  handicap: Record<string, number>;
  stav: StavDuelu;
  /** profilId → výsledek hráče (zapisuje se po dokončení jeho půlky duelu). */
  vysledky: Record<string, VysledekDuelu>;
  /** Vítěz duelu; null = remíza, undefined = ještě nevyhodnoceno. */
  vitezProfilId?: string | null;
  vytvoreno: string; // ISO
  /** ISO čas vypršení duelu (vytvořeno + 24 h). */
  vyprsi: string;
}

/** Head-to-head bilance vůči jednomu soupeři (klíč v TrofejeProfilu.dvojice). */
export interface BilanceDvojice {
  vyhry: number;
  prohry: number;
  remizy: number;
  /** Aktuální série výher proti tomuto soupeři (prohra i remíza ji nulují). */
  serieVyher: number;
}

/** Trofejní vitrína profilu — bilance dvojic, série a získané tituly. */
export interface TrofejeProfilu {
  /** souperProfilId → bilance vzájemných duelů. */
  dvojice: Record<string, BilanceDvojice>;
  /** Získané tituly (např. „Vítězná vlna“, „Postrach: <obor>“, „Duelant“). */
  tituly: string[];
  /** Aktuální série výher přes všechny duely (titul „Vítězná vlna“). */
  serieVyherCelkem: number;
  /** predmetId → aktuální série výher v daném oboru (titul „Postrach: <obor>“). */
  seriePodleOboru: Record<string, number>;
  /** Celkový počet dokončených duelů (titul „Duelant“). */
  duelyCelkem: number;
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
  /**
   * Zásoba power-upů do duelů (padají z truhel). VOLITELNÉ kvůli zpětné
   * kompatibilitě se staršími snapshoty — chybějící pole doplní
   * doplnDuelovyProgres (sdilene/src/duely.ts).
   */
  powerupy?: Record<PowerupTyp, number>;
  /**
   * Duelové trofeje a head-to-head bilance. VOLITELNÉ kvůli zpětné
   * kompatibilitě — chybějící pole doplní doplnDuelovyProgres.
   */
  trofeje?: TrofejeProfilu;
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
