// Klientsky engine duelu — CISTA logika prubehu duelu, bez Reactu.
// Duel se hraje jako rezim zkouska: zadny prubezny feedback, casovy limit
// NA OTAZKU (limit × handicapovy nasobic hrace), power-upy (kazdy typ max
// 1× za duel, max 1 power-up na otazku — OdpovedDuelu nese jen jeden),
// timeout = 0 bodu a dalsi otazka. Vsechno je deterministicke: cas i nahoda
// se injektuji, stav je serializovatelny objekt (drzi ho hraSlice v persistu).
//
// Bodovani a limity pochazeji ze sdileneho jadra (@questor/sdilene —
// bodyZaOdpoved, casLimitProHrace, ZMRAZENI_CASU_MS); tady je jen krokovani.
import {
  bodyZaOdpoved,
  casLimitProHrace,
  expirujDuel,
  vyhodnotDuel,
  ZMRAZENI_CASU_MS,
} from '@questor/sdilene';
import type {
  BankaOtazek,
  Duel,
  OdpovedDuelu,
  Otazka,
  PowerupTyp,
  VysledekDuelu,
} from '@questor/sdilene';

// ---------------------------------------------------------------------------
// Stav prubehu duelu (serializovatelny — zadne funkce, zadne tridy)

export interface DuelPrubeh {
  duelId: string;
  /** Profil, ktery tenhle prubeh hraje (vysledek se odevzdava za nej). */
  profilId: string;
  /** Muj handicapovy nasobic casu (1.0–1.5, nemenny po cely duel). */
  nasobicCasu: number;
  /** Pocet otazek duelu (delka duel.otazkyIds). */
  pocetOtazek: number;
  /** Index aktualni otazky (0..pocetOtazek-1). */
  index: number;
  odpovedi: OdpovedDuelu[];
  /** Prubezne skore (jen moje — souperovo se ukaze az na konci). */
  body: number;
  /** Body za posledni odpoved (plovouci „+body" v UI). */
  posledniBody: number;
  /** Bonus casu aktualni otazky ze Zmrazeni casu (ms). */
  bonusCasuMs: number;
  /** Typy power-upu uz pouzite v tomhle duelu (kazdy max 1×). */
  pouzitePowerupy: PowerupTyp[];
  /** Power-up aktivovany na aktualni otazce (max 1 na otazku). */
  powerupAktualniOtazky: PowerupTyp | null;
  /** Stit je zapnuty a ceka na prvni spatnou odpoved. */
  stitAktivni: boolean;
  /** Stit uz byl spotrebovan (prvni spatna odpoved za 50 bodu). */
  stitSpotrebovan: boolean;
  /** Datove indexy moznosti skryte 50:50 na aktualni otazce (jen typ vyber). */
  skryteMoznosti: number[];
  /** Hrac odklikl intro a bezi cas prvni otazky. */
  zahajeno: boolean;
  /** Epoch ms zacatku aktualni otazky (persistuje se — reload cas nevraci). */
  zacatekOtazkyMs: number;
  /** ISO cas zahajeni hrani. */
  zacatek: string;
  dokonceno: boolean;
}

/** Zalozeni prubehu (pred introm — cas jeste nebezi). */
export function vytvorDuelPrubeh(duel: Duel, profilId: string, zacatekIso: string): DuelPrubeh {
  return {
    duelId: duel.id,
    profilId,
    nasobicCasu: duel.handicap[profilId] ?? 1,
    pocetOtazek: duel.otazkyIds.length,
    index: 0,
    odpovedi: [],
    body: 0,
    posledniBody: 0,
    bonusCasuMs: 0,
    pouzitePowerupy: [],
    powerupAktualniOtazky: null,
    stitAktivni: false,
    stitSpotrebovan: false,
    skryteMoznosti: [],
    zahajeno: false,
    zacatekOtazkyMs: 0,
    zacatek: zacatekIso,
    dokonceno: false,
  };
}

/** Odstartovani po intru: rozbehne cas prvni otazky. */
export function odstartujPrubeh(prubeh: DuelPrubeh, tedMs: number): DuelPrubeh {
  if (prubeh.zahajeno) return prubeh;
  return { ...prubeh, zahajeno: true, zacatekOtazkyMs: tedMs };
}

// ---------------------------------------------------------------------------
// Cas

/** Limit aktualni otazky v ms: (10 + 4×obtiznost) s × muj nasobic + zmrazeni. */
export function limitOtazkyPrubehu(prubeh: DuelPrubeh, otazka: Otazka): number {
  return casLimitProHrace(otazka.obtiznost, prubeh.nasobicCasu) + prubeh.bonusCasuMs;
}

/** Zbyvajici cas aktualni otazky v ms (0 = timeout). */
export function zbyvaMsVPrubehu(prubeh: DuelPrubeh, otazka: Otazka, tedMs: number): number {
  if (!prubeh.zahajeno) return limitOtazkyPrubehu(prubeh, otazka);
  return Math.max(0, limitOtazkyPrubehu(prubeh, otazka) - (tedMs - prubeh.zacatekOtazkyMs));
}

// ---------------------------------------------------------------------------
// Power-upy

/**
 * Smi hrac ted pouzit power-up? (Duvod odmitnuti pro UI: disabled stav.)
 * Pravidla: kazdy typ max 1× za duel, max 1 power-up na otazku, 50:50 jen
 * u vyberove otazky, stit nejde zapnout znovu po spotrebovani.
 */
export function muzePouzitPowerup(
  prubeh: DuelPrubeh,
  typ: PowerupTyp,
  otazka: Otazka | null,
): boolean {
  if (!prubeh.zahajeno || prubeh.dokonceno || !otazka) return false;
  if (prubeh.pouzitePowerupy.includes(typ)) return false;
  if (prubeh.powerupAktualniOtazky !== null) return false;
  if (typ === 'pade-na-pade' && otazka.typ !== 'vyber') return false;
  if (typ === 'stit' && (prubeh.stitAktivni || prubeh.stitSpotrebovan)) return false;
  return true;
}

/**
 * Aplikuje power-up na aktualni otazku (imutabilne). Vraci null, kdyz pouzit
 * nejde (muzePouzitPowerup). Nahoda ridi jen los skryvanych moznosti u 50:50.
 */
export function pouzijPowerupVPrubehu(
  prubeh: DuelPrubeh,
  typ: PowerupTyp,
  otazka: Otazka,
  nahoda: () => number,
): DuelPrubeh | null {
  if (!muzePouzitPowerup(prubeh, typ, otazka)) return null;
  let novy: DuelPrubeh = {
    ...prubeh,
    pouzitePowerupy: [...prubeh.pouzitePowerupy, typ],
    powerupAktualniOtazky: typ,
  };
  if (typ === 'pade-na-pade' && otazka.typ === 'vyber') {
    // Skryji se 2 spatne moznosti (u kratsich otazek tolik, kolik jich je).
    const spatne = otazka.moznosti.map((_, i) => i).filter((i) => i !== otazka.spravna);
    for (let i = spatne.length - 1; i > 0; i--) {
      const j = Math.floor(nahoda() * (i + 1));
      [spatne[i], spatne[j]] = [spatne[j], spatne[i]];
    }
    novy = { ...novy, skryteMoznosti: spatne.slice(0, Math.min(2, spatne.length)) };
  } else if (typ === 'zmrazeni-casu') {
    novy = { ...novy, bonusCasuMs: prubeh.bonusCasuMs + ZMRAZENI_CASU_MS };
  } else if (typ === 'stit') {
    novy = { ...novy, stitAktivni: true };
  }
  return novy;
}

// ---------------------------------------------------------------------------
// Krokovani

/**
 * Zapocita odpoved na aktualni otazku a posune na dalsi (imutabilne).
 * Cas se orezava do <0; limit>; stit promeni PRVNI spatnou odpoved na 50 bodu.
 * `tedMs` je epoch ms — start casu dalsi otazky.
 */
export function odpovezVPrubehu(
  prubeh: DuelPrubeh,
  otazka: Otazka,
  spravne: boolean,
  casMs: number,
  tedMs: number,
): DuelPrubeh {
  if (!prubeh.zahajeno || prubeh.dokonceno) return prubeh;
  const limit = limitOtazkyPrubehu(prubeh, otazka);
  const cas = Math.min(limit, Math.max(0, Math.round(casMs)));
  const stitPouzit = !spravne && prubeh.stitAktivni && !prubeh.stitSpotrebovan;
  const bodyOdpovedi = bodyZaOdpoved(spravne, cas, limit, stitPouzit);
  const odpoved: OdpovedDuelu = {
    otazkaId: otazka.id,
    spravne,
    casMs: cas,
    ...(prubeh.powerupAktualniOtazky ? { pouzityPowerup: prubeh.powerupAktualniOtazky } : {}),
  };
  const dalsiIndex = prubeh.index + 1;
  return {
    ...prubeh,
    index: dalsiIndex,
    odpovedi: [...prubeh.odpovedi, odpoved],
    body: prubeh.body + bodyOdpovedi,
    posledniBody: bodyOdpovedi,
    bonusCasuMs: 0,
    powerupAktualniOtazky: null,
    skryteMoznosti: [],
    stitAktivni: stitPouzit ? false : prubeh.stitAktivni,
    stitSpotrebovan: stitPouzit ? true : prubeh.stitSpotrebovan,
    zacatekOtazkyMs: tedMs,
    dokonceno: dalsiIndex >= prubeh.pocetOtazek,
  };
}

/** Timeout aktualni otazky: 0 bodu (spatne s casem = limit) a dalsi otazka. */
export function timeoutVPrubehu(prubeh: DuelPrubeh, otazka: Otazka, tedMs: number): DuelPrubeh {
  return odpovezVPrubehu(prubeh, otazka, false, limitOtazkyPrubehu(prubeh, otazka), tedMs);
}

/** Sestavi VysledekDuelu z dokonceneho prubehu (odevzdava se na server). */
export function vysledekZPrubehu(prubeh: DuelPrubeh, dokoncenoIso: string): VysledekDuelu {
  return {
    odpovedi: prubeh.odpovedi,
    body: prubeh.body,
    celkovyCasMs: prubeh.odpovedi.reduce((s, o) => s + o.casMs, 0),
    dokonceno: dokoncenoIso,
  };
}

/**
 * Otazky duelu v ZAVAZNEM poradi otazkyIds. Vraci null, kdyz lokalni banka
 * nekterou otazku nezna (starsi verze banky) — duel pak nejde hrat, dokud
 * sync nestahne novejsi banku. Prazdne otazkyIds = server sadu ZATAJIL
 * (adresat cilene vyzvy pred prijetim, anti-cheat) — taky null.
 */
export function otazkyDuelu(duel: Duel, banka: BankaOtazek | undefined): Otazka[] | null {
  if (!banka || duel.otazkyIds.length === 0) return null;
  const mapa = new Map(banka.otazky.map((o) => [o.id, o]));
  const otazky: Otazka[] = [];
  for (const id of duel.otazkyIds) {
    const otazka = mapa.get(id);
    if (!otazka) return null;
    otazky.push(otazka);
  }
  return otazky;
}

// ---------------------------------------------------------------------------
// Trideni seznamu duelu (stranka Duely + indikatory)

export function jeDokoncenyDuel(duel: Duel): boolean {
  return duel.stav === 'hotovy' || duel.stav === 'vyprsely';
}

export function jeUcastnikDuelu(duel: Duel, profilId: string): boolean {
  return duel.vyzyvatel.profilId === profilId || duel.souper?.profilId === profilId;
}

/** Muj odevzdany vysledek v duelu (undefined = jeste jsem nehral). */
export function mujVysledekDuelu(duel: Duel, profilId: string): VysledekDuelu | undefined {
  return duel.vysledky[profilId];
}

/**
 * ISO cas dokonceni duelu — klic chronologie pro zapocitani trofeji (serie
 * vyher musi jit podle toho, kdy duely SKONCILY, ne kdy vznikly): u vyprseleho
 * duelu okamzik vyprseni (kontumace plati od nej), jinak nejpozdejsi
 * odevzdany vysledek; bez vysledku fallback na vytvoreno.
 */
export function casDokonceniDuelu(duel: Duel): string {
  if (duel.stav === 'vyprsely') return duel.vyprsi;
  const casy = Object.values(duel.vysledky).map((v) => v.dokonceno);
  if (casy.length === 0) return duel.vytvoreno;
  return casy.reduce((a, b) => (a > b ? a : b));
}

/**
 * Hrat jde jen duel se znamym souperem (handicap je zmrazeny), bez meho
 * vysledku, nedokonceny a NEVYPRSELY (lina expirace plati i lokalne — offline
 * nejde hrat po 24h terminu, server by vysledek stejne odmitl). Cilenou vyzvu
 * jde hrat i offline (odevzdani vysledku je zaroven prijeti), pokud uz klient
 * ma sadu otazek; otevrenou az po prijeti (server). VYJIMKA duel odkazem
 * (proOdkaz): handicap je fixne 1.0 od zalozeni, takze vyzyvatel smi svou
 * pulku odehrat i driv, nez host odkaz vubec otevre (kontrakt serveru).
 */
export function muzeHratDuel(duel: Duel, profilId: string, tedIso: string): boolean {
  return (
    !jeDokoncenyDuel(duel) &&
    duel.vyprsi > tedIso &&
    jeUcastnikDuelu(duel, profilId) &&
    (duel.souper !== undefined || duel.proOdkaz === true) &&
    !duel.vysledky[profilId]
  );
}

export interface RozdeleneDuely {
  /** Cilene vyzvy pro me, ktere jsem jeste nehral (zvyraznene, pulzujici). */
  vyzvyProMe: Duel[];
  /** Otevrene rodinne vyzvy jinych hracu (prvni, kdo prijme, hraje). */
  otevrene: Duel[];
  /** Rozehrane duely, kde jsem na tahu. */
  naTahu: Duel[];
  /** Odehral jsem, ceka se na soupere. */
  cekameNaSoupere: Duel[];
  /** Moje otevrene vyzvy bez soupere (hrat jde az po prijeti). */
  cekaNaPrijeti: Duel[];
  /** Dokoncene duely (hotove + vyprsele), nejnovejsi prvni. */
  historie: Duel[];
}

/**
 * Roztridi duely pro seznam: `moje` jsou duely, kde hraju (ze serveru
 * GET /api/duely), `otevrene` cizi otevrene vyzvy. Cista funkce; `tedIso`
 * ridi LOKALNI linou expiraci — duel po vyprsi patri do historie (kontumace
 * stejnym vzorcem jako server), i kdyz sync jeste nebezel.
 */
export function rozdelDuely(
  moje: Duel[],
  otevrene: Duel[],
  profilId: string,
  tedIso: string,
): RozdeleneDuely {
  const vysledek: RozdeleneDuely = {
    vyzvyProMe: [],
    otevrene: otevrene.filter(
      (d) =>
        d.stav === 'cekajici' &&
        d.vyprsi > tedIso &&
        d.otevrenyProRodinu &&
        !d.souper &&
        d.vyzyvatel.profilId !== profilId,
    ),
    naTahu: [],
    cekameNaSoupere: [],
    cekaNaPrijeti: [],
    historie: [],
  };
  for (const puvodni of moje) {
    const duel = expirujDuel(puvodni, tedIso);
    if (!jeUcastnikDuelu(duel, profilId)) continue;
    if (jeDokoncenyDuel(duel)) {
      vysledek.historie.push(duel);
    } else if (!duel.souper && !duel.proOdkaz) {
      // Duel odkazem sem nepatri: vyzyvatel smi hrat i pred prijetim hosta
      // (handicap 1.0 od zalozeni) — spadne do naTahu / cekameNaSoupere.
      vysledek.cekaNaPrijeti.push(duel);
    } else if (duel.vysledky[profilId]) {
      vysledek.cekameNaSoupere.push(duel);
    } else if (duel.souper?.profilId === profilId && duel.stav === 'cekajici') {
      vysledek.vyzvyProMe.push(duel);
    } else {
      vysledek.naTahu.push(duel);
    }
  }
  // Bezici podle blizkosti vyprseni (nejnalehavejsi prvni), historie od nejnovejsi.
  const podleVyprsi = (a: Duel, b: Duel) => a.vyprsi.localeCompare(b.vyprsi);
  vysledek.vyzvyProMe.sort(podleVyprsi);
  vysledek.otevrene.sort(podleVyprsi);
  vysledek.naTahu.sort(podleVyprsi);
  vysledek.cekameNaSoupere.sort(podleVyprsi);
  vysledek.cekaNaPrijeti.sort(podleVyprsi);
  vysledek.historie.sort((a, b) => b.vytvoreno.localeCompare(a.vytvoreno));
  return vysledek;
}

/** Pocet cekajicich vyzev (indikator na Domu a v navigaci). */
export function pocetCekajicichVyzev(
  moje: Duel[],
  otevrene: Duel[],
  profilId: string,
  tedIso: string,
): number {
  const r = rozdelDuely(moje, otevrene, profilId, tedIso);
  return r.vyzvyProMe.length + r.otevrene.length;
}

/**
 * Slouci duely ze serveru s lokalnimi: server je zdroj pravdy, ale muj
 * lokalne odehrany vysledek, ktery na server jeste nedorazil (offline
 * fronta), se NESMI ztratit — doplni se do prichoziho zaznamu; kdyz tim ma
 * duel oba vysledky, vyhodnoti se lokalne (server dojde k temuz). Lokalni
 * duely, ktere server nevratil (starsi historie za limitem 20), zustavaji.
 * Prichozi duel se ZATAJENOU sadou otazek (prazdne otazkyIds, anti-cheat
 * serveru) nesmi prepsat lokalne znamou sadu — jinak by vyzyvatel/adresat
 * po prijeti prisel o moznost hrat.
 */
export function sloucDuely(prichozi: Duel[], lokalni: Duel[], profilId: string): Duel[] {
  const lokalniMapa = new Map(lokalni.map((d) => [d.id, d]));
  const sloucene = prichozi.map((serverovy) => {
    const mistni = lokalniMapa.get(serverovy.id);
    const duel: Duel =
      serverovy.otazkyIds.length === 0 && mistni && mistni.otazkyIds.length > 0
        ? { ...serverovy, otazkyIds: mistni.otazkyIds }
        : serverovy;
    const muj = mistni?.vysledky[profilId];
    if (!muj || duel.vysledky[profilId] || jeDokoncenyDuel(duel)) return duel;
    const vysledky = { ...duel.vysledky, [profilId]: muj };
    let novy: Duel = { ...duel, vysledky };
    if (novy.souper && vysledky[novy.vyzyvatel.profilId] && vysledky[novy.souper.profilId]) {
      novy = { ...novy, stav: 'hotovy', vitezProfilId: vyhodnotDuel(novy) };
    }
    return novy;
  });
  const prichoziId = new Set(prichozi.map((d) => d.id));
  const jenLokalni = lokalni.filter((d) => !prichoziId.has(d.id));
  const vsechny = [...sloucene, ...jenLokalni];
  // Ochrana proti neomezenemu rustu: historie se drzi jen 20 nejnovejsich
  // (stejny limit jako server), bezici duely vzdy vsechny.
  const bezici = vsechny.filter((d) => !jeDokoncenyDuel(d));
  const historie = vsechny
    .filter(jeDokoncenyDuel)
    .sort((a, b) => b.vytvoreno.localeCompare(a.vytvoreno))
    .slice(0, 20);
  return [...bezici, ...historie];
}
