// Bleskovky — ČISTÁ logika rychlého drilu nad otázkami s krátkými možnostmi
// (hlavně pravopis: doplň i/y). Bez Reactu a bez stavu; náhoda se injektuje,
// den se předává. Průběh kola řídí testový engine (engine.ts:
// inicializujBlesk, odpovezVEnginu, vyhodnotTest) — tady jsou jen pravidla
// nad otázkami, bankami a výsledky.
//
// Ekonomika rychlých otázek platí i mimo bleskovky (ať se nedá obejít
// běžným testem nad bankou plnou doplňovaček):
//  - XP za bleskovou otázku se násobí KOEFICIENT_XP_BLESK v JAKÉMKOLI testu
//    (koeficientXpOtazky),
//  - běžný test, ve kterém je aspoň polovina otázek bleskových
//    (prevazujiBleskove), se pro truhlu a rekordy počítá jako bleskovky:
//    výsledek dostane id `blesk-test-…`, truhlu jen z denní dávky sdílené
//    s bleskovkami a rekordy nemění. Průběh i výsledková obrazovka zůstávají
//    běžné (jeKoloBleskovek je pro takový výsledek false).
//
// Konvence obsahu (docs/NAVOD.md, „Bleskové otázky“):
//  - blesková otázka = typ `vyber`, 2–3 možnosti, každá nejvýš 12 znaků,
//  - místo k doplnění se v zadání píše podtržítkem `_` (b_lina) — bere se
//    PRVNÍ podtržítko (souvislá řada `___` je jedna mezera),
//  - krátké možnosti (všechny nejvýš 3 znaky: i/y, í/ý, mě/mně, i/y/a) se
//    píšou v KANONICKÉM pořadí a zobrazují se v pořadí z dat — tlačítka tak
//    sedí pořád na stejném místě; delší možnosti se míchají jako v testu.
import { denZData, vahaOtazkyPodleBoxu, vazenyVyber } from '@questor/sdilene';
import type {
  BankaOtazek,
  OdpovedZaznam,
  Otazka,
  OtazkaVyber,
  StatistikaOtazky,
  TestVysledek,
} from '@questor/sdilene';
import { zamichaneIndexy } from './komponenty/michani';

// ---------------------------------------------------------------------------
// Konstanty

/** Blesková otázka má 2–3 možnosti… */
export const MIN_MOZNOSTI_BLESK = 2;
export const MAX_MOZNOSTI_BLESK = 3;
/** …a každá má (po oříznutí mezer) nejvýš tolik znaků. */
export const MAX_DELKA_MOZNOSTI_BLESK = 12;
/** Do kolika znaků je možnost „písmeno / skupina“ (drží pořadí z dat). */
export const MAX_DELKA_PISMEN_BLESK = 3;
/** Od kolika bleskových otázek má banka Bleskovky v nabídce. */
export const MIN_BLESKOVYCH = 10;
/** Od kolika bleskových otázek nabízí konec lekce „Procvič bleskovkami“. */
export const MIN_BLESKOVYCH_TEMATU = 5;
/**
 * Bleskové otázky jsou rychlé — XP za odpověď na ně se násobí tímhle
 * koeficientem (v bleskovkách i v běžném testu). 0,2 = kolo 20 otázek
 * vychází v XP za minutu zhruba jako běžný test.
 */
export const KOEFICIENT_XP_BLESK = 0.2;
/**
 * Od jakého podílu bleskových otázek se BĚŽNÝ test počítá pro truhlu
 * a rekordy jako bleskovky (prevazujiBleskove).
 */
export const PODIL_BLESKOVYCH_TESTU = 0.5;
/** Délky kola, které nabízí start bleskovek. */
export const POCTY_BLESK = [10, 20] as const;
export type PocetBlesk = (typeof POCTY_BLESK)[number];
/** Po správné odpovědi se za tuhle dobu samo přejde na další otázku. */
export const PRODLEVA_PO_SPRAVNE_MS = 600;
/**
 * Id výsledku, který se počítá do ekonomiky bleskovek, začíná `blesk-`:
 * kolo bleskovek `blesk-<čas>-…`, opravné kolo `blesk-oprava-…` a běžný test
 * s převahou bleskových otázek `blesk-test-…`.
 */
export const PREFIX_BLESK = 'blesk-';
export const PREFIX_BLESK_OPRAVA = 'blesk-oprava-';
export const PREFIX_BLESK_TEST = 'blesk-test-';
/** Kolik posledních výsledků drží historie testů (hraSlice.historieTestu). */
export const LIMIT_HISTORIE_TESTU = 10;

/** Konfigurace bleskového kola (start, „Další kolo“). */
export interface BleskKonfigurace {
  predmetId: string;
  pocetOtazek: PocetBlesk;
  /** undefined (nebo prázdné) = všechna témata — míchané kolo. */
  temataId?: string[];
}

// ---------------------------------------------------------------------------
// Bleskové otázky

/** Délka textu ve znacích (bez okrajových mezer; složené znaky jako jeden). */
function delka(text: string): number {
  return Array.from(text.trim().normalize('NFC')).length;
}

/** Je otázka blesková? Výběr z 2–3 možností, každá 1–12 znaků. */
export function jeBleskova(otazka: Otazka): otazka is OtazkaVyber {
  if (otazka.typ !== 'vyber') return false;
  const pocet = otazka.moznosti.length;
  if (pocet < MIN_MOZNOSTI_BLESK || pocet > MAX_MOZNOSTI_BLESK) return false;
  return otazka.moznosti.every((m) => {
    const d = delka(m);
    return d >= 1 && d <= MAX_DELKA_MOZNOSTI_BLESK;
  });
}

/** Bleskové otázky banky, volitelně jen z daných témat (prázdný výběr = všechna). */
export function bleskoveOtazky(
  banka: BankaOtazek | null | undefined,
  temataId?: readonly string[],
): OtazkaVyber[] {
  if (!banka) return [];
  const filtr = temataId && temataId.length > 0 ? new Set(temataId) : null;
  return banka.otazky.filter(
    (o): o is OtazkaVyber => jeBleskova(o) && (filtr === null || filtr.has(o.temaId)),
  );
}

/** Počet bleskových otázek banky (0 pro chybějící banku). */
export function pocetBleskovych(
  banka: BankaOtazek | null | undefined,
  temataId?: readonly string[],
): number {
  return bleskoveOtazky(banka, temataId).length;
}

/** Má banka Bleskovky v nabídce (aspoň MIN_BLESKOVYCH bleskových otázek)? */
export function maBleskovky(banka: BankaOtazek | null | undefined): boolean {
  return pocetBleskovych(banka) >= MIN_BLESKOVYCH;
}

/**
 * Je aspoň polovina otázek testu blesková? Takový BĚŽNÝ test se pro truhlu
 * a rekordy počítá jako bleskovky (engine.pocitaSeJakoBleskovky) — jinak by
 * pětiotázková rozcvička z doplňovaček dávala truhlu každých pár vteřin.
 * Prázdný test = ne.
 */
export function prevazujiBleskove(otazky: readonly Otazka[]): boolean {
  if (otazky.length === 0) return false;
  const bleskovych = otazky.filter((o) => jeBleskova(o)).length;
  return bleskovych >= otazky.length * PODIL_BLESKOVYCH_TESTU;
}

/** Jsou VŠECHNY možnosti doplňovaná písmena / skupiny (nejvýš 3 znaky)? */
export function maKratkeMoznosti(otazka: Pick<OtazkaVyber, 'moznosti'>): boolean {
  return otazka.moznosti.every((m) => delka(m) <= MAX_DELKA_PISMEN_BLESK);
}

/**
 * Zobrazovací pořadí možností: pozice → datový index. Krátké možnosti
 * (písmena / skupiny) jdou v pořadí z dat — autor je píše kanonicky a tlačítko
 * „i“ tak sedí pořád na stejném místě. Delší možnosti se míchají
 * deterministicky stejným klíčem jako VyberOtazka v testu (pořadí v datech
 * nesmí prozradit klíč). Odpovědi se enginu hlásí vždy v datových indexech.
 */
export function poradiBleskovychMoznosti(otazka: Pick<OtazkaVyber, 'id' | 'moznosti'>): number[] {
  if (maKratkeMoznosti(otazka)) return otazka.moznosti.map((_, i) => i);
  return zamichaneIndexy(`vyber:${otazka.id}`, otazka.moznosti.length);
}

// ---------------------------------------------------------------------------
// Zadání s místem k doplnění

export interface CastiZadani {
  /** Text před mezerou. */
  pred: string;
  /** Text za mezerou. */
  po: string;
}

/**
 * Rozdělí zadání podle PRVNÍHO podtržítka (souvislá řada podtržítek je jedna
 * mezera). Bez podtržítka vrací null — otázka se pak ukáže jako běžná volba.
 */
export function rozdelZadani(zadani: string): CastiZadani | null {
  const shoda = /_+/.exec(zadani);
  if (!shoda) return null;
  return {
    pred: zadani.slice(0, shoda.index),
    po: zadani.slice(shoda.index + shoda[0].length),
  };
}

/** Zadání s textem doplněným do mezery (bez mezery vrací zadání beze změny). */
export function doplnZadani(zadani: string, text: string): string {
  const casti = rozdelZadani(zadani);
  return casti ? `${casti.pred}${text}${casti.po}` : zadani;
}

// ---------------------------------------------------------------------------
// Výběr otázek do kola

/**
 * Vybere otázky do bleskového kola: jen bleskové otázky (volitelně z daných
 * témat), přes VŠECHNY obtížnosti, vážený výběr bez opakování podle
 * Leitnerova boxu — slabé a nové otázky chodí častěji. Když je kandidátů
 * míň než `pocet`, kolo je kratší.
 */
export function vyberBleskoveOtazky(
  banka: BankaOtazek,
  pocet: number,
  temataId: readonly string[] | undefined,
  statistiky: Record<string, StatistikaOtazky>,
  nahoda: () => number,
): OtazkaVyber[] {
  const kandidati = bleskoveOtazky(banka, temataId);
  return vazenyVyber(
    kandidati,
    kandidati.map((o) => vahaOtazkyPodleBoxu(statistiky[o.id])),
    Math.min(Math.max(0, pocet), kandidati.length),
    nahoda,
  );
}

/** Nejbližší povolený `pocetOtazek` konfigurace (5/10/20), který pojme `pocet` otázek. */
export function pocetOtazekProOpravu(pocet: number): 5 | 10 | 20 {
  if (pocet <= 5) return 5;
  if (pocet <= 10) return 10;
  return 20;
}

// ---------------------------------------------------------------------------
// XP

/**
 * Koeficient XP za odpověď na otázku: blesková otázka KOEFICIENT_XP_BLESK,
 * každá jiná 1. Platí v JAKÉMKOLI testu (bleskovky, rozcvička, zkouška…) —
 * rychlá doplňovačka nemá mít cenu plné testové otázky jen proto, že ji
 * student potkal v běžném testu.
 */
export function koeficientXpOtazky(otazka: Otazka | null | undefined): number {
  return otazka && jeBleskova(otazka) ? KOEFICIENT_XP_BLESK : 1;
}

/**
 * XP po uplatnění koeficientu: zaokrouhleně, za správnou odpověď (xp > 0)
 * nejméně 1. Koeficient 1 vrací XP beze změny. Volá ji engine (ziskaneXp
 * výsledku) i hraSlice (XP do progresu) — obě čísla proto sedí.
 */
export function xpSKoeficientem(xp: number, koeficient: number): number {
  if (!(xp > 0)) return 0;
  if (koeficient === 1) return xp;
  return Math.max(1, Math.round(xp * koeficient));
}

// ---------------------------------------------------------------------------
// Výsledky

/**
 * Počítá se výsledek do EKONOMIKY bleskovek (denní truhla, rekordy)? Kolo
 * bleskovek, opravné kolo i běžný test s převahou bleskových otázek.
 * Pro rozhodování v UI (výsledková obrazovka, název ve Statistikách) slouží
 * užší jeKoloBleskovek.
 */
export function jeBleskVysledek(vysledek: Pick<TestVysledek, 'id'>): boolean {
  return vysledek.id.startsWith(PREFIX_BLESK);
}

/** Je výsledek z OPRAVNÉHO kola bleskovek? */
export function jeOpravaBlesku(vysledek: Pick<TestVysledek, 'id'>): boolean {
  return vysledek.id.startsWith(PREFIX_BLESK_OPRAVA);
}

/**
 * Je to výsledek BĚŽNÉHO testu, který se počítá jako bleskovky (aspoň
 * polovina otázek blesková)? Hrál se běžným průběhem v běžném režimu —
 * do bleskovek patří jen truhlou a rekordy.
 */
export function jeBleskovyTest(vysledek: Pick<TestVysledek, 'id'>): boolean {
  return vysledek.id.startsWith(PREFIX_BLESK_TEST);
}

/** Je výsledek ze skutečného KOLA bleskovek (běžného i opravného)? */
export function jeKoloBleskovek(vysledek: Pick<TestVysledek, 'id'>): boolean {
  return jeBleskVysledek(vysledek) && !jeBleskovyTest(vysledek);
}

/**
 * Tempo: počet odpovědí za minutu čistého času nad otázkami (součet casMs,
 * bez čtení vysvětlení). Zaokrouhleno; null bez odpovědí nebo s nulovým časem.
 */
export function tempoZaMinutu(odpovedi: readonly Pick<OdpovedZaznam, 'casMs'>[]): number | null {
  const soucetMs = odpovedi.reduce((s, o) => s + Math.max(0, o.casMs), 0);
  if (odpovedi.length === 0 || soucetMs <= 0) return null;
  return Math.round(odpovedi.length / (soucetMs / 60_000));
}

/**
 * Padla už dnes truhla z bleskovek? Denní dávka: truhlu dává jen první kolo
 * dne, které na ni dosáhne — pozná se podle historie testů (dnešní bleskový
 * výsledek s truhlou). Dávku sdílí bleskovky s běžnými testy, které se jako
 * bleskovky počítají (jeBleskVysledek). `dnes` = lokální den YYYY-MM-DD.
 */
export function bylaDnesTruhlaZBlesku(
  historie: readonly Pick<TestVysledek, 'id' | 'konec' | 'truhla'>[],
  dnes: string,
): boolean {
  return historie.some((v) => jeDnesniTruhlaZBlesku(v, dnes));
}

/** Je výsledek dnešní bleskové kolo s truhlou (= značka vybrané denní dávky)? */
function jeDnesniTruhlaZBlesku(
  vysledek: Pick<TestVysledek, 'id' | 'konec' | 'truhla'>,
  dnes: string,
): boolean {
  return (
    jeBleskVysledek(vysledek) &&
    vysledek.truhla !== undefined &&
    denZData(new Date(vysledek.konec)) === dnes
  );
}

/**
 * Ořízne historii testů (nejnovější první) na `limit` výsledků. Dnešní
 * bleskový výsledek s truhlou v ní ale ZŮSTÁVÁ, i kdyby už z limitu vypadl —
 * je to jediná značka, že denní truhla z bleskovek dnes padla. Bez toho by
 * ji pár krátkých kol (hlavně opravných) z historie vytlačilo a truhla by
 * šla získat znovu. Historie tak může mít nejvýš `limit + 1` položek; druhý
 * den už značka nic nedrží a běžně se ořízne.
 */
export function orizniHistoriiTestu<T extends Pick<TestVysledek, 'id' | 'konec' | 'truhla'>>(
  historie: readonly T[],
  dnes: string,
  limit: number = LIMIT_HISTORIE_TESTU,
): T[] {
  const drzene = historie.slice(0, limit);
  if (historie.length <= limit || bylaDnesTruhlaZBlesku(drzene, dnes)) return drzene;
  const znacka = historie.slice(limit).find((v) => jeDnesniTruhlaZBlesku(v, dnes));
  return znacka ? [...drzene, znacka] : drzene;
}

/**
 * Proč výsledek, který se počítá jako bleskovky, nedostal truhlu:
 *  - 'oprava'  — opravné kolo truhlu nedává nikdy,
 *  - 'uz-byla' — dnešní truhlu už dalo jiné kolo / test z rychlých otázek,
 *  - 'malo'    — úspěšnost na truhlu nestačila (dnešní dávka pořád čeká).
 * null = truhlu dostal, nejde o bleskový výsledek, nebo už není dnešní
 * (na starý výsledek se dnešní historie nevztahuje).
 */
export type DuvodBezTruhly = 'oprava' | 'uz-byla' | 'malo';

export function duvodBezTruhly(
  vysledek: Pick<TestVysledek, 'id' | 'konec' | 'truhla'>,
  historie: readonly Pick<TestVysledek, 'id' | 'konec' | 'truhla'>[],
  dnes: string,
): DuvodBezTruhly | null {
  if (vysledek.truhla !== undefined || !jeBleskVysledek(vysledek)) return null;
  if (jeOpravaBlesku(vysledek)) return 'oprava';
  if (denZData(new Date(vysledek.konec)) !== dnes) return null;
  const jinaTruhlaDnes = bylaDnesTruhlaZBlesku(
    historie.filter((v) => v.id !== vysledek.id),
    dnes,
  );
  return jinaTruhlaDnes ? 'uz-byla' : 'malo';
}

/** Chyba kola pro výpis na výsledku (otázka dohledaná v bance; null = už v ní není). */
export interface ChybaBlesku {
  otazkaId: string;
  temaId: string;
  otazka: OtazkaVyber | null;
}

/**
 * Chybné odpovědi výsledku v pořadí, jak padly — každá otázka nejvýš jednou,
 * texty dohledané v bance podle otazkaId.
 */
export function chybyBlesku(
  vysledek: Pick<TestVysledek, 'odpovedi'>,
  banka: BankaOtazek | null | undefined,
): ChybaBlesku[] {
  const podleId = new Map(bleskoveOtazky(banka).map((o) => [o.id, o]));
  const videne = new Set<string>();
  const chyby: ChybaBlesku[] = [];
  for (const zaznam of vysledek.odpovedi) {
    if (zaznam.spravne || videne.has(zaznam.otazkaId)) continue;
    videne.add(zaznam.otazkaId);
    chyby.push({
      otazkaId: zaznam.otazkaId,
      temaId: zaznam.temaId,
      otazka: podleId.get(zaznam.otazkaId) ?? null,
    });
  }
  return chyby;
}

/**
 * Konfigurace „Dalšího kola“ po výsledku: stejná banka, témata i délka.
 * Po OPRAVNÉM kole se bere konfigurace kola, ze kterého oprava vznikla —
 * nejnovější běžné bleskové kolo téže banky v `historie` (nejnovější první);
 * oprava sama mívá jinou délku (5) a původní si nepamatuje. Když v historii
 * není, zůstanou témata opravy a délka 10.
 */
export function konfiguraceDalsihoKola(
  vysledek: Pick<TestVysledek, 'id' | 'konfigurace'>,
  historie: readonly Pick<TestVysledek, 'id' | 'konfigurace'>[] = [],
): BleskKonfigurace {
  const puvodni = jeOpravaBlesku(vysledek)
    ? historie.find(
        (v) =>
          jeKoloBleskovek(v) &&
          !jeOpravaBlesku(v) &&
          v.konfigurace.predmetId === vysledek.konfigurace.predmetId,
      )
    : undefined;
  const { predmetId, pocetOtazek, temataId } = (puvodni ?? vysledek).konfigurace;
  return {
    predmetId,
    pocetOtazek: pocetOtazek === 20 ? 20 : 10,
    ...(temataId && temataId.length > 0 ? { temataId: [...temataId] } : {}),
  };
}

// ---------------------------------------------------------------------------
// Zvládnutí (start bleskovek — čipy témat)

/** Podíl otázek v Leitnerově boxu ≥ 3 (0–1; prázdný seznam = 0). */
export function zvladnutiOtazek(
  otazky: readonly Pick<Otazka, 'id'>[],
  statistiky: Record<string, StatistikaOtazky>,
): number {
  if (otazky.length === 0) return 0;
  return otazky.filter((o) => (statistiky[o.id]?.box ?? 0) >= 3).length / otazky.length;
}

export interface TemaBlesku {
  id: string;
  nazev: string;
  /** Počet bleskových otázek tématu. */
  pocet: number;
  /** Podíl bleskových otázek tématu v Leitnerově boxu ≥ 3 (0–1). */
  zvladnuti: number;
}

/** Témata banky, která mají aspoň jednu bleskovou otázku (v pořadí banky). */
export function temataBlesku(
  banka: BankaOtazek | null | undefined,
  statistiky: Record<string, StatistikaOtazky>,
): TemaBlesku[] {
  if (!banka) return [];
  const podleTematu = new Map<string, OtazkaVyber[]>();
  for (const otazka of bleskoveOtazky(banka)) {
    const seznam = podleTematu.get(otazka.temaId) ?? [];
    seznam.push(otazka);
    podleTematu.set(otazka.temaId, seznam);
  }
  return banka.temata
    .slice()
    .sort((a, b) => a.poradi - b.poradi)
    .flatMap((tema) => {
      const otazky = podleTematu.get(tema.id);
      if (!otazky) return [];
      return [
        {
          id: tema.id,
          nazev: tema.nazev,
          pocet: otazky.length,
          zvladnuti: zvladnutiOtazek(otazky, statistiky),
        },
      ];
    });
}

// ---------------------------------------------------------------------------
// Klávesnice

/** Základní písmeno znaku — bez diakritiky, malé; null když to není písmeno. */
function zakladPismena(znak: string): string | null {
  const zaklad = znak
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /^\p{L}$/u.test(zaklad) ? zaklad : null;
}

/**
 * Možnost, jejíž první písmeno odpovídá klávese — jen když se první písmena
 * VŠECH možností liší i bez diakritiky. Klávesa bez diakritiky (i, y) sedí
 * i na možnost s diakritikou (í, ý); klávesa s diakritikou (česká horní
 * řada: ě š č ř ž ý á í é) jen na možnost, která jí začíná PŘESNĚ — jinak by
 * zbloudilá „7“ (píše ý) odpověděla na otázku i/y.
 */
function moznostZPismene(
  klavesa: string,
  moznosti: readonly string[],
  poradi: readonly number[],
): number | null {
  // Pojmenované klávesy (Enter, Shift, Dead…) nejsou jeden znak.
  if (Array.from(klavesa).length !== 1) return null;
  const zaklad = zakladPismena(klavesa);
  if (zaklad === null) return null;
  const presne = klavesa.normalize('NFC').toLowerCase();
  const prvni = poradi.map((index) => {
    const znak = Array.from((moznosti[index] ?? '').trim())[0];
    const zakladMoznosti = znak === undefined ? null : zakladPismena(znak);
    return zakladMoznosti === null || znak === undefined
      ? null
      : { presne: znak.normalize('NFC').toLowerCase(), zaklad: zakladMoznosti };
  });
  const zaklady = prvni.map((p) => p?.zaklad ?? null);
  if (zaklady.some((z) => z === null) || new Set(zaklady).size !== zaklady.length) return null;
  let pozice = prvni.findIndex((p) => p?.presne === presne);
  if (pozice < 0 && presne === zaklad) pozice = zaklady.indexOf(zaklad);
  return pozice < 0 ? null : (poradi[pozice] ?? null);
}

/**
 * Převede klávesu na DATOVÝ index možnosti (null = klávesa sem nepatří):
 *  1. číslice 1–9 (`klavesa` = KeyboardEvent.key) = pozice na obrazovce,
 *  2. fyzická klávesa horní řady (`kod` = KeyboardEvent.code, Digit1–Digit9)
 *     = pozice na obrazovce, pokud taková pozice existuje. Česká klávesnice
 *     píše v horní řadě bez Shiftu „+ěščřžýáíé“, takže podle `key` by tam
 *     1/2/3 nefungovaly. Pozice má přednost před písmenem — klávesa „2“
 *     (píše ě) musí u možností ě / je zvolit druhou, jak říká nápověda
 *     na tlačítku,
 *  3. písmeno = možnost, která jím začíná — jen když se první písmena VŠECH
 *     možností liší (i/y, í/ý → klávesy i, y; mě/mně ne). Bez ohledu na
 *     velikost písmen; klávesy i, y platí i pro í, ý. Klávesa s diakritikou
 *     (česká „7“ píše ý, „9“ píše í) platí jen pro možnost, která tak přesně
 *     začíná.
 */
export function moznostZKlavesy(
  klavesa: string,
  moznosti: readonly string[],
  poradi: readonly number[],
  kod?: string,
): number | null {
  if (/^[1-9]$/.test(klavesa)) {
    const index = poradi[Number(klavesa) - 1];
    return index === undefined ? null : index;
  }
  const horniRada = /^Digit([1-9])$/.exec(kod ?? '');
  if (horniRada) {
    const index = poradi[Number(horniRada[1]) - 1];
    if (index !== undefined) return index;
  }
  return moznostZPismene(klavesa, moznosti, poradi);
}

// ---------------------------------------------------------------------------
// Kontrola konvencí obsahu

/**
 * Porušení konvencí bleskových otázek v bance — prázdné pole = v pořádku.
 * Hlídá to, na co aplikace spoléhá a co validace banky nepozná:
 *  - krátké možnosti (do 3 znaků) mají v CELÉ bance stejné vzájemné pořadí
 *    (zobrazují se v pořadí z dat; [i, y] v jedné otázce a [y, i] v jiné by
 *    prohodilo tlačítka pod prstem),
 *  - zadání má nejvýš jedno místo k doplnění (do políčka se doplňuje jen
 *    první podtržítko, další by zůstalo viset v textu).
 * Volá ji test nad bankami v repu; hodí se i při přípravě obsahu.
 */
export function poruseniKonvenciBlesku(banka: BankaOtazek): string[] {
  const poruseni: string[] = [];
  const videno = new Map<string, string>(); // „a|b“ → id otázky, kde je a před b
  for (const otazka of bleskoveOtazky(banka)) {
    const mezer = otazka.zadani.match(/_+/g)?.length ?? 0;
    if (mezer > 1) {
      poruseni.push(`${otazka.id}: zadání má ${mezer} místa k doplnění (smí být nejvýš jedno)`);
    }
    if (!maKratkeMoznosti(otazka)) continue;
    const moznosti = otazka.moznosti.map((m) => m.trim());
    for (let i = 0; i < moznosti.length; i++) {
      for (let j = i + 1; j < moznosti.length; j++) {
        const obracene = videno.get(`${moznosti[j]}|${moznosti[i]}`);
        if (obracene !== undefined) {
          poruseni.push(
            `${otazka.id}: „${moznosti[i]}“ je před „${moznosti[j]}“, ale v otázce ${obracene} naopak`,
          );
        }
        videno.set(`${moznosti[i]}|${moznosti[j]}`, otazka.id);
      }
    }
  }
  return poruseni;
}
