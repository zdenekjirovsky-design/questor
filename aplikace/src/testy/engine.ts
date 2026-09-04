// Testový engine QUESTORu — ČISTÁ logika průběhu testu, bez Reactu.
// Všechno je deterministické: náhoda i čas se injektují zvenku, stav je
// obyčejný serializovatelný objekt (drží ho testySlice v zustand persist).
//
// Životní cyklus:
//   inicializujTest() → stav
//   opakovaně: odpovezVEnginu() (vyhodnotí + XP + combo) → dalsiOtazkaVEnginu()
//   nakonec: vyhodnotTest() → TestVysledek
import {
  dalsiObtiznost,
  jeOdpovedSpravna,
  urciTruhlu,
  vyberOtazkyDoTestu,
  xpZaOdpoved,
} from '@questor/sdilene';
import type {
  BankaOtazek,
  Obtiznost,
  OdpovedZaznam,
  Otazka,
  StatistikaOtazky,
  TestKonfigurace,
  TestVysledek,
} from '@questor/sdilene';

// ---------------------------------------------------------------------------
// Typy odpovědí (hodnota, kterou UI posílá do enginu)

/** Dvojice indexů do `otazka.pary`: levy = index levé strany, pravy = index PŮVODNÍ pozice pravé strany. */
export interface ParovaniOdpoved {
  levy: number;
  pravy: number;
}

export type OdpovedHodnota =
  | { typ: 'vyber'; vybrana: number }
  | { typ: 'multi'; vybrane: number[] }
  | { typ: 'anone'; hodnota: boolean }
  | { typ: 'doplneni'; text: string }
  | { typ: 'prirazovani'; pary: ParovaniOdpoved[] };

// ---------------------------------------------------------------------------
// Stav testu (serializovatelný — žádné funkce, žádné třídy)

export interface TestStav {
  konfigurace: TestKonfigurace;
  /** ISO čas začátku testu. */
  zacatek: string;
  /** Vybrané otázky v pořadí; u adaptivního režimu se přidávají průběžně. */
  otazky: Otazka[];
  /** Nevyčerpaný pool pro adaptivní režim (vážená permutace kandidátů). */
  pool: Otazka[];
  /** Index aktuální otázky. Invariant: index === odpovedi.length (otázka čeká) nebo index + 1 === odpovedi.length (feedback). */
  index: number;
  odpovedi: OdpovedZaznam[];
  /** Aktuální série správných odpovědí. */
  combo: number;
  nejdelsiCombo: number;
  ziskaneXp: number;
  /** XP za poslední odpověď (pro plovoucí „+XP“ v UI). */
  posledniXp: number;
  /** Cílová obtížnost adaptivního režimu. */
  cilovaObtiznost: Obtiznost;
  /** Časový limit režimu zkouška (ms), jinak undefined. */
  casovyLimitMs?: number;
  /** Id výzvy, pokud test vznikl z výzvy od táty. */
  vyzvaId?: string;
  dokonceno: boolean;
}

export type FazeTestu = 'otazka' | 'feedback' | 'hotovo';

/** Výchozí cílová obtížnost adaptivního režimu — začíná se zlehka. */
export const VYCHOZI_CILOVA_OBTIZNOST: Obtiznost = 2;

/** Časový limit zkoušky na jednu otázku (90 s dle ARCHITEKTURA.md). */
export const LIMIT_ZKOUSKY_MS_NA_OTAZKU = 90_000;

// ---------------------------------------------------------------------------
// Inicializace

/** Z poolu vybere otázku s obtížností nejblíž cílové (při shodě dřívější v poolu). */
export function nejblizsiObtiznosti(pool: Otazka[], cil: Obtiznost): Otazka | null {
  let nejlepsi: Otazka | null = null;
  let nejmensiRozdil = Infinity;
  for (const o of pool) {
    const rozdil = Math.abs(o.obtiznost - cil);
    if (rozdil < nejmensiRozdil) {
      nejmensiRozdil = rozdil;
      nejlepsi = o;
    }
  }
  return nejlepsi;
}

export function inicializujTest(
  banka: BankaOtazek,
  konfigurace: TestKonfigurace,
  statistiky: Record<string, StatistikaOtazky>,
  nahoda: () => number,
  zacatek: string,
  vyzvaId?: string,
): TestStav {
  let otazky: Otazka[];
  let pool: Otazka[];

  if (konfigurace.rezim === 'adaptivni') {
    // Vážená permutace VŠECH kandidátů (Leitner váhy), z ní se čerpá podle cílové obtížnosti.
    const permutace = vyberOtazkyDoTestu(
      banka,
      konfigurace.rezim,
      banka.otazky.length,
      konfigurace.temataId,
      statistiky,
      nahoda,
    );
    const prvni = nejblizsiObtiznosti(permutace, VYCHOZI_CILOVA_OBTIZNOST);
    otazky = prvni ? [prvni] : [];
    pool = prvni ? permutace.filter((o) => o.id !== prvni.id) : [];
  } else {
    otazky = vyberOtazkyDoTestu(
      banka,
      konfigurace.rezim,
      konfigurace.pocetOtazek,
      konfigurace.temataId,
      statistiky,
      nahoda,
    );
    pool = [];
  }

  return {
    konfigurace,
    zacatek,
    otazky,
    pool,
    index: 0,
    odpovedi: [],
    combo: 0,
    nejdelsiCombo: 0,
    ziskaneXp: 0,
    posledniXp: 0,
    cilovaObtiznost: VYCHOZI_CILOVA_OBTIZNOST,
    casovyLimitMs:
      konfigurace.rezim === 'zkouska' ? LIMIT_ZKOUSKY_MS_NA_OTAZKU * otazky.length : undefined,
    vyzvaId,
    dokonceno: false,
  };
}

// ---------------------------------------------------------------------------
// Dotazy na stav

export function fazeTestu(stav: TestStav): FazeTestu {
  if (stav.dokonceno) return 'hotovo';
  if (stav.odpovedi.length > stav.index) return 'feedback';
  return 'otazka';
}

export function aktualniOtazka(stav: TestStav): Otazka | null {
  return stav.otazky[stav.index] ?? null;
}

/** Kolik otázek test celkem plánuje (u adaptivního cíl konfigurace, jinak reálný výběr). */
export function planovanyPocetOtazek(stav: TestStav): number {
  if (stav.konfigurace.rezim === 'adaptivni') {
    // Pool nemusí stačit na plný počet.
    return Math.min(stav.konfigurace.pocetOtazek, stav.otazky.length + stav.pool.length);
  }
  return stav.otazky.length;
}

// ---------------------------------------------------------------------------
// Vyhodnocení jedné odpovědi (všech 5 typů)

export function vyhodnotOdpoved(otazka: Otazka, odpoved: OdpovedHodnota): boolean {
  if (otazka.typ !== odpoved.typ) return false;
  switch (otazka.typ) {
    case 'vyber':
      return odpoved.typ === 'vyber' && odpoved.vybrana === otazka.spravna;
    case 'multi': {
      if (odpoved.typ !== 'multi') return false;
      // Přesná shoda množin — nic navíc, nic nechybí.
      const spravne = new Set(otazka.spravne);
      const vybrane = new Set(odpoved.vybrane);
      if (spravne.size !== vybrane.size) return false;
      for (const i of spravne) if (!vybrane.has(i)) return false;
      return true;
    }
    case 'anone':
      return odpoved.typ === 'anone' && odpoved.hodnota === otazka.spravna;
    case 'doplneni':
      return odpoved.typ === 'doplneni' && jeOdpovedSpravna(odpoved.text, otazka.spravneOdpovedi);
    case 'prirazovani': {
      if (odpoved.typ !== 'prirazovani') return false;
      // Správně = všechny páry spárované a každý levý index s „vlastním“ pravým.
      if (odpoved.pary.length !== otazka.pary.length) return false;
      const videneLeve = new Set<number>();
      for (const p of odpoved.pary) {
        if (p.levy !== p.pravy) return false;
        if (videneLeve.has(p.levy)) return false;
        videneLeve.add(p.levy);
      }
      return true;
    }
  }
}

// ---------------------------------------------------------------------------
// Krokování

export interface VysledekOdpovedi {
  stav: TestStav;
  zaznam: OdpovedZaznam;
  spravne: boolean;
  /** XP za tuhle odpověď (0 při chybě). */
  ziskaneXp: number;
}

/**
 * Zpracuje odpověď na aktuální otázku: vyhodnotí, spočítá combo a XP,
 * u adaptivního režimu posune cílovou obtížnost a přibere další otázku z poolu.
 * Vrací null, když žádná otázka nečeká na odpověď (dvojité odeslání apod.).
 */
export function odpovezVEnginu(
  stav: TestStav,
  hodnota: OdpovedHodnota,
  casMs: number,
): VysledekOdpovedi | null {
  if (fazeTestu(stav) !== 'otazka') return null;
  const otazka = aktualniOtazka(stav);
  if (!otazka) return null;

  const spravne = vyhodnotOdpoved(otazka, hodnota);
  // comboKrok = kolikátá správná v řadě (od 0) → aktuální combo PŘED odpovědí.
  const xp = spravne ? xpZaOdpoved(otazka.obtiznost, stav.combo) : 0;
  const novyCombo = spravne ? stav.combo + 1 : 0;

  const zaznam: OdpovedZaznam = {
    otazkaId: otazka.id,
    temaId: otazka.temaId,
    obtiznost: otazka.obtiznost,
    spravne,
    casMs: Math.max(0, Math.round(casMs)),
  };

  let novyStav: TestStav = {
    ...stav,
    odpovedi: [...stav.odpovedi, zaznam],
    combo: novyCombo,
    nejdelsiCombo: Math.max(stav.nejdelsiCombo, novyCombo),
    ziskaneXp: stav.ziskaneXp + xp,
    posledniXp: xp,
  };

  if (stav.konfigurace.rezim === 'adaptivni') {
    const cil = dalsiObtiznost(stav.cilovaObtiznost, spravne);
    novyStav = { ...novyStav, cilovaObtiznost: cil };
    if (novyStav.otazky.length < novyStav.konfigurace.pocetOtazek && novyStav.pool.length > 0) {
      const dalsi = nejblizsiObtiznosti(novyStav.pool, cil);
      if (dalsi) {
        novyStav = {
          ...novyStav,
          otazky: [...novyStav.otazky, dalsi],
          pool: novyStav.pool.filter((o) => o.id !== dalsi.id),
        };
      }
    }
  }

  return { stav: novyStav, zaznam, spravne, ziskaneXp: xp };
}

/** Posun na další otázku (po feedbacku); po poslední otázce označí test za dokončený. */
export function dalsiOtazkaVEnginu(stav: TestStav): TestStav {
  if (fazeTestu(stav) !== 'feedback') return stav;
  if (stav.index + 1 < stav.otazky.length) {
    return { ...stav, index: stav.index + 1, posledniXp: 0 };
  }
  return { ...stav, dokonceno: true, posledniXp: 0 };
}

// ---------------------------------------------------------------------------
// Vyhodnocení celého testu

/**
 * Sestaví TestVysledek. U režimu zkouška se úspěšnost počítá z PLÁNOVANÉHO
 * počtu otázek (nezodpovězené po vypršení limitu = špatně), jinak ze
 * zodpovězených.
 */
export function vyhodnotTest(stav: TestStav, konec: string, nahoda: () => number): TestVysledek {
  const spravnych = stav.odpovedi.filter((o) => o.spravne).length;
  const jmenovatel =
    stav.konfigurace.rezim === 'zkouska' ? stav.otazky.length : stav.odpovedi.length;
  const uspesnost = jmenovatel > 0 ? spravnych / jmenovatel : 0;
  const truhla = urciTruhlu(uspesnost);

  return {
    id: `vysledek-${Date.parse(konec) || 0}-${Math.floor(nahoda() * 1e9).toString(36)}`,
    konfigurace: stav.konfigurace,
    zacatek: stav.zacatek,
    konec,
    odpovedi: stav.odpovedi,
    uspesnost,
    ziskaneXp: stav.ziskaneXp,
    nejdelsiCombo: stav.nejdelsiCombo,
    ...(truhla ? { truhla } : {}),
    ...(stav.vyzvaId ? { vyzvaId: stav.vyzvaId } : {}),
  };
}

/** Zbývající čas zkoušky v ms (null mimo režim zkouška). `ted` = aktuální čas v ms. */
export function zbyvajiciCasMs(stav: TestStav, ted: number): number | null {
  if (stav.casovyLimitMs === undefined) return null;
  const start = Date.parse(stav.zacatek);
  return Math.max(0, stav.casovyLimitMs - (ted - start));
}
