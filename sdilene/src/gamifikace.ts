// Gamifikační jádro QUESTORu — čisté funkce bez vedlejších efektů, plně testovatelné.
// Náhoda se VŽDY předává zvenku jako funkce () => number v intervalu [0, 1),
// aby šlo všechno deterministicky testovat.

import type {
  AvatarKonfigurace,
  BankaOtazek,
  KartaDefinice,
  Obtiznost,
  Odmena,
  OdpovedZaznam,
  Otazka,
  ProgresStudenta,
  QuestDenni,
  RezimTestu,
  Sbirka,
  StatistikaOtazky,
  Streak,
  Tema,
  TestVysledek,
  TruhlaTyp,
} from './typy';

// ---------------------------------------------------------------------------
// XP a levely

export const ZAKLAD_XP = 10;

/** Násobič za sérii správných odpovědí v jednom testu (comboKrok = kolikátá správná v řadě, od 0). */
export function comboNasobic(comboKrok: number): number {
  return Math.min(2, 1 + Math.max(0, comboKrok) * 0.1);
}

export function xpZaOdpoved(obtiznost: Obtiznost, comboKrok: number): number {
  return Math.round(ZAKLAD_XP * obtiznost * comboNasobic(comboKrok));
}

/** Celkové XP potřebné k dosažení daného levelu (level 1 = 0 XP). */
export function prahLevelu(level: number): number {
  return level <= 1 ? 0 : Math.ceil(100 * Math.pow(level - 1, 1.6));
}

export function levelZXp(xp: number): number {
  // Inverze prahLevelu (kvůli zaokrouhlení ceil nelze počítat čistě mocninou —
  // hrubý odhad se doladí proti skutečným prahům, ať nikdy nevznikne záporný zbytek).
  const bezpecneXp = Math.max(0, xp);
  let level = Math.floor(Math.pow(bezpecneXp / 100, 1 / 1.6)) + 1;
  while (level > 1 && prahLevelu(level) > bezpecneXp) level -= 1;
  while (prahLevelu(level + 1) <= bezpecneXp) level += 1;
  return level;
}

export interface StavLevelu {
  level: number;
  xpVLevelu: number;
  xpNaDalsiLevel: number;
  /** 0–1 postup do dalšího levelu */
  procento: number;
}

export function stavLevelu(xp: number): StavLevelu {
  const level = levelZXp(xp);
  const spodni = prahLevelu(level);
  const horni = prahLevelu(level + 1);
  const xpVLevelu = xp - spodni;
  const xpNaDalsiLevel = horni - spodni;
  return {
    level,
    xpVLevelu,
    xpNaDalsiLevel,
    procento: xpNaDalsiLevel > 0 ? xpVLevelu / xpNaDalsiLevel : 1,
  };
}

// ---------------------------------------------------------------------------
// Deterministická náhoda (pro denní questy apod.)

export function hashRetezce(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — malý deterministický PRNG. */
export function vytvorNahodu(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Vážený výběr `pocet` položek bez opakování. */
export function vazenyVyber<T>(
  polozky: T[],
  vahy: number[],
  pocet: number,
  nahoda: () => number,
): T[] {
  const zbyle = polozky.map((p, i) => ({ p, v: Math.max(0.0001, vahy[i] ?? 1) }));
  const vysledek: T[] = [];
  while (vysledek.length < pocet && zbyle.length > 0) {
    const soucet = zbyle.reduce((s, z) => s + z.v, 0);
    let los = nahoda() * soucet;
    let idx = 0;
    for (; idx < zbyle.length - 1; idx++) {
      los -= zbyle[idx].v;
      if (los <= 0) break;
    }
    vysledek.push(zbyle[idx].p);
    zbyle.splice(idx, 1);
  }
  return vysledek;
}

// ---------------------------------------------------------------------------
// Datumové pomůcky (pracujeme s lokálními dny YYYY-MM-DD)

export function denZData(d: Date): string {
  const r = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const den = String(d.getDate()).padStart(2, '0');
  return `${r}-${m}-${den}`;
}

export function rozdilDnu(drivejsi: string, pozdejsi: string): number {
  const a = new Date(`${drivejsi}T12:00:00`);
  const b = new Date(`${pozdejsi}T12:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Pondělí týdne daného dne (klíč pro týdenní XP). */
export function pondeliTydne(den: string): string {
  const d = new Date(`${den}T12:00:00`);
  const posun = (d.getDay() + 6) % 7; // Po=0 … Ne=6
  d.setDate(d.getDate() - posun);
  return denZData(d);
}

// ---------------------------------------------------------------------------
// Streak

export function aktualizujStreakPoAktivite(streak: Streak, dnes: string): Streak {
  if (streak.posledniDen === dnes) return streak;
  let aktualni: number;
  let zmrazeni = streak.zmrazeni;
  if (streak.posledniDen === null) {
    aktualni = 1;
  } else {
    const mezera = rozdilDnu(streak.posledniDen, dnes);
    if (mezera === 1) {
      aktualni = streak.aktualni + 1;
    } else if (mezera === 2 && zmrazeni > 0) {
      // jeden vynechaný den zachrání zmrazení
      zmrazeni -= 1;
      aktualni = streak.aktualni + 1;
    } else {
      aktualni = 1;
    }
  }
  return {
    aktualni,
    nejdelsi: Math.max(streak.nejdelsi, aktualni),
    posledniDen: dnes,
    zmrazeni,
  };
}

// ---------------------------------------------------------------------------
// Truhly (variabilní odměny)

export function urciTruhlu(uspesnost: number): TruhlaTyp | null {
  if (uspesnost >= 0.9) return 'zlata';
  if (uspesnost >= 0.7) return 'stribrna';
  if (uspesnost >= 0.5) return 'bronzova';
  return null;
}

const VAHY_TRUHEL: Record<TruhlaTyp, { xpMin: number; xpMax: number; pKarta: number; pZmrazeni: number }> = {
  bronzova: { xpMin: 20, xpMax: 40, pKarta: 0.2, pZmrazeni: 0.1 },
  stribrna: { xpMin: 40, xpMax: 80, pKarta: 0.3, pZmrazeni: 0.15 },
  zlata: { xpMin: 80, xpMax: 150, pKarta: 0.45, pZmrazeni: 0.15 },
};

/** Po kolika truhlách bez karty je karta garantovaná (pity timer). */
export const PITY_LIMIT = 3;

const VAHA_VZACNOSTI: Record<KartaDefinice['vzacnost'], number> = {
  obycejna: 60,
  vzacna: 25,
  epicka: 10,
  legendarni: 5,
};

/**
 * Otevře truhlu. Vrací odměnu a novou podobu sbírky (imutabilně).
 * `dostupneKarty` = definice karet, které lze vylosovat (vlastněné se filtrují tady).
 */
export function otevriTruhlu(
  typ: TruhlaTyp,
  sbirka: Sbirka,
  dostupneKarty: KartaDefinice[],
  nahoda: () => number,
): { odmena: Odmena; sbirka: Sbirka } {
  const cfg = VAHY_TRUHEL[typ];
  const nevlastnene = dostupneKarty.filter((k) => !sbirka.karty.includes(k.id));
  const pity = sbirka.truhelBezKarty >= PITY_LIMIT;
  const los = nahoda();

  const daKartu = nevlastnene.length > 0 && (pity || los < cfg.pKarta);
  if (daKartu) {
    const [karta] = vazenyVyber(
      nevlastnene,
      nevlastnene.map((k) => VAHA_VZACNOSTI[k.vzacnost]),
      1,
      nahoda,
    );
    return {
      odmena: { typ: 'karta', kartaId: karta.id },
      sbirka: { karty: [...sbirka.karty, karta.id], truhelBezKarty: 0 },
    };
  }

  const novaSbirka: Sbirka = { ...sbirka, truhelBezKarty: sbirka.truhelBezKarty + 1 };
  // Zmrazení má pevné pásmo [pKarta, pKarta+pZmrazeni) — když karta padnout
  // nemůže (vše vlastněno), její pásmo připadne XP, ne zmrazení.
  if (los >= cfg.pKarta && los < cfg.pKarta + cfg.pZmrazeni) {
    return { odmena: { typ: 'zmrazeni' }, sbirka: novaSbirka };
  }
  const xp = Math.round(cfg.xpMin + nahoda() * (cfg.xpMax - cfg.xpMin));
  return { odmena: { typ: 'xp', xp }, sbirka: novaSbirka };
}

// ---------------------------------------------------------------------------
// Sbírka — Velikáni ekonomie + mistrovské karty za témata

export const KARTY_VELIKANI: KartaDefinice[] = [
  { id: 'smith', jmeno: 'Adam Smith', titul: 'Neviditelná ruka trhu', popis: 'Otec moderní ekonomie. Bohatství národů, 1776.', vzacnost: 'obycejna' },
  { id: 'ricardo', jmeno: 'David Ricardo', titul: 'Komparativní výhoda', popis: 'Proč se vyplatí obchodovat, i když je soused lepší ve všem.', vzacnost: 'obycejna' },
  { id: 'schumpeter', jmeno: 'Joseph Schumpeter', titul: 'Kreativní destrukce', popis: 'Inovace požírají staré firmy. A je to tak správně.', vzacnost: 'obycejna' },
  { id: 'samuelson', jmeno: 'Paul Samuelson', titul: 'Učebnice století', popis: 'Ekonomii naučil půlku planety.', vzacnost: 'obycejna' },
  { id: 'keynes', jmeno: 'John Maynard Keynes', titul: 'Stát jako záchranná brzda', popis: 'V krizi má stát šlápnout na plyn.', vzacnost: 'vzacna' },
  { id: 'hayek', jmeno: 'Friedrich August Hayek', titul: 'Řád bez plánovače', popis: 'Ceny vědí víc než úředníci.', vzacnost: 'vzacna' },
  { id: 'friedman', jmeno: 'Milton Friedman', titul: 'Peníze především', popis: 'Inflace je vždy a všude měnový jev.', vzacnost: 'vzacna' },
  { id: 'kahneman', jmeno: 'Daniel Kahneman', titul: 'Myšlení rychlé a pomalé', popis: 'Psycholog, který dostal Nobelovku za ekonomii.', vzacnost: 'vzacna' },
  { id: 'englis', jmeno: 'Karel Engliš', titul: 'Architekt koruny', popis: 'Šestinásobný ministr financí první republiky.', vzacnost: 'epicka' },
  { id: 'rasin', jmeno: 'Alois Rašín', titul: 'Tvrdá měna', popis: 'Zachránil korunu měnovou odlukou 1919.', vzacnost: 'epicka' },
  { id: 'ostrom', jmeno: 'Elinor Ostrom', titul: 'Správa společného', popis: 'První žena s Nobelovkou za ekonomii.', vzacnost: 'epicka' },
  { id: 'bata', jmeno: 'Tomáš Baťa', titul: 'Náš zákazník, náš pán', popis: 'Ze Zlína dobyl svět. Systém řízení, který se učí dodnes.', vzacnost: 'legendarni' },
];

export type StupenMistrovstvi = 'bronz' | 'stribro' | 'zlato';

export function idMistrovskeKarty(temaId: string, stupen: StupenMistrovstvi): string {
  return `tema:${temaId}:${stupen}`;
}

// ---------------------------------------------------------------------------
// Denní questy

export interface KontextQuestu {
  temata: Tema[];
  /** Téma s nejnižší úspěšností (pokud už nějaká data jsou). */
  nejslabsiTemaId?: string;
}

interface SablonaQuestu {
  sablona: string;
  vytvor(nahoda: () => number, ctx: KontextQuestu): Omit<QuestDenni, 'id' | 'datum' | 'postup' | 'splneno'> | null;
}

const SABLONY_QUESTU: SablonaQuestu[] = [
  {
    sablona: 'odpovez',
    vytvor: (nahoda) => {
      const cil = [10, 15, 20][Math.floor(nahoda() * 3)];
      return { sablona: 'odpovez', popis: `Odpověz dnes na ${cil} otázek`, cil, odmenaXp: 40 + cil * 2 };
    },
  },
  {
    sablona: 'uspesnost',
    vytvor: () => ({
      sablona: 'uspesnost',
      popis: 'Dokonči test s úspěšností aspoň 80 %',
      cil: 1,
      odmenaXp: 80,
    }),
  },
  {
    sablona: 'obtiznost',
    vytvor: (nahoda) => {
      const cil = [5, 8][Math.floor(nahoda() * 2)];
      return {
        sablona: 'obtiznost',
        popis: `Zvládni ${cil} otázek obtížnosti 3+`,
        cil,
        odmenaXp: 50 + cil * 5,
        parametry: { minObtiznost: 3 },
      };
    },
  },
  {
    sablona: 'tema',
    vytvor: (nahoda, ctx) => {
      const temaId = ctx.nejslabsiTemaId ?? (ctx.temata.length > 0 ? ctx.temata[Math.floor(nahoda() * ctx.temata.length)].id : undefined);
      if (!temaId) return null;
      const tema = ctx.temata.find((t) => t.id === temaId);
      return {
        sablona: 'tema',
        popis: `Odpověz na 8 otázek z tématu „${tema?.nazev ?? temaId}“`,
        cil: 8,
        odmenaXp: 90,
        parametry: { temaId },
      };
    },
  },
  {
    sablona: 'bezchyby',
    vytvor: () => ({
      sablona: 'bezchyby',
      popis: 'Zvládni 5 otázek v řadě bez chyby',
      cil: 5,
      odmenaXp: 75,
    }),
  },
];

/** Vygeneruje 3 denní questy — deterministicky z data, takže restart aplikace nic nezmění. */
export function vygenerujDenniQuesty(datum: string, ctx: KontextQuestu): QuestDenni[] {
  const nahoda = vytvorNahodu(hashRetezce(`questy:${datum}`));
  const vybrane = vazenyVyber(SABLONY_QUESTU, SABLONY_QUESTU.map(() => 1), 3, nahoda);
  const questy: QuestDenni[] = [];
  for (const s of vybrane) {
    const zaklad = s.vytvor(nahoda, ctx);
    if (!zaklad) continue;
    questy.push({
      ...zaklad,
      id: `${datum}:${s.sablona}`,
      datum,
      postup: 0,
      splneno: false,
    });
  }
  return questy;
}

/** Aktualizuje postup questů po jedné zodpovězené otázce. Vrací nové pole (imutabilně). */
export function aplikujOdpovedNaQuesty(questy: QuestDenni[], zaznam: OdpovedZaznam, comboAktualni: number): QuestDenni[] {
  return questy.map((q) => {
    if (q.splneno) return q;
    let postup = q.postup;
    switch (q.sablona) {
      case 'odpovez':
        postup += 1;
        break;
      case 'obtiznost':
        if (zaznam.spravne && zaznam.obtiznost >= Number(q.parametry?.minObtiznost ?? 3)) postup += 1;
        break;
      case 'tema':
        if (zaznam.temaId === q.parametry?.temaId) postup += 1;
        break;
      case 'bezchyby':
        postup = zaznam.spravne ? Math.max(postup, Math.min(comboAktualni, q.cil)) : postup;
        break;
      default:
        return q;
    }
    const splneno = postup >= q.cil;
    return { ...q, postup: Math.min(postup, q.cil), splneno };
  });
}

/** Aktualizuje postup questů po dokončeném testu. */
export function aplikujTestNaQuesty(questy: QuestDenni[], vysledek: TestVysledek): QuestDenni[] {
  return questy.map((q) => {
    if (q.splneno || q.sablona !== 'uspesnost') return q;
    if (vysledek.uspesnost >= 0.8) {
      return { ...q, postup: q.cil, splneno: true };
    }
    return q;
  });
}

// ---------------------------------------------------------------------------
// Výběr otázek do testu (Leitner + režimy obtížnosti)

export function rozsahObtiznosti(rezim: RezimTestu): [number, number] {
  switch (rezim) {
    case 'rozcvicka': return [1, 2];
    case 'standard': return [2, 4];
    case 'hardcore': return [4, 5];
    case 'adaptivni': return [1, 5];
    case 'zkouska': return [1, 5];
  }
}

export function vahaOtazkyPodleBoxu(stat: StatistikaOtazky | undefined): number {
  if (!stat) return 3.5; // nové otázky mají přednost před zvládnutými
  return [5, 4, 3, 2, 1][stat.box];
}

/**
 * Vybere otázky do testu: filtr podle témat a režimu, vážený výběr podle
 * Leitnerova boxu (slabé a nové otázky chodí častěji).
 */
export function vyberOtazkyDoTestu(
  banka: BankaOtazek,
  rezim: RezimTestu,
  pocet: number,
  temataId: string[] | undefined,
  statistiky: Record<string, StatistikaOtazky>,
  nahoda: () => number,
): Otazka[] {
  const [min, max] = rozsahObtiznosti(rezim);
  let kandidati = banka.otazky.filter(
    (o) => o.obtiznost >= min && o.obtiznost <= max && (!temataId || temataId.includes(o.temaId)),
  );
  // Kdyby filtr obtížnosti vyprázdnil nabídku, povol všechny obtížnosti.
  if (kandidati.length < pocet) {
    kandidati = banka.otazky.filter((o) => !temataId || temataId.includes(o.temaId));
  }
  return vazenyVyber(
    kandidati,
    kandidati.map((o) => vahaOtazkyPodleBoxu(statistiky[o.id])),
    Math.min(pocet, kandidati.length),
    nahoda,
  );
}

/** Adaptivní režim: další cílová obtížnost podle výsledku poslední odpovědi. */
export function dalsiObtiznost(aktualni: Obtiznost, posledniSpravne: boolean): Obtiznost {
  const nova = posledniSpravne ? aktualni + 1 : aktualni - 1;
  return Math.max(1, Math.min(5, nova)) as Obtiznost;
}

/** Aktualizace Leitnerova boxu po odpovědi. */
export function aktualizujStatistiku(
  stat: StatistikaOtazky | undefined,
  otazkaId: string,
  spravne: boolean,
  ted: string,
): StatistikaOtazky {
  const box = stat?.box ?? 2;
  const novyBox = (spravne ? Math.min(4, box + 1) : Math.max(0, box - 1)) as StatistikaOtazky['box'];
  return {
    otazkaId,
    box: novyBox,
    spravneCelkem: (stat?.spravneCelkem ?? 0) + (spravne ? 1 : 0),
    spatneCelkem: (stat?.spatneCelkem ?? 0) + (spravne ? 0 : 1),
    posledniOdpoved: ted,
  };
}

// ---------------------------------------------------------------------------
// Výchozí progres

export const VYCHOZI_AVATAR: AvatarKonfigurace = {
  // Dlouhé vlasy jsou identita. Nastavení nabízí jen barvy, nikdy nůžky.
  barvaVlasu: '#6b4a2f',
  pozadi: 'vesmir',
};

export function vychoziProgres(ted: string): ProgresStudenta {
  return {
    xp: 0,
    streak: { aktualni: 0, nejdelsi: 0, posledniDen: null, zmrazeni: 1 },
    questy: [],
    sbirka: { karty: [], truhelBezKarty: 0 },
    avatar: VYCHOZI_AVATAR,
    statistikyOtazek: {},
    rekordy: {
      nejlepsiUspesnost: 0,
      nejdelsiCombo: 0,
      nejrychlejsiBezchybnyMs: null,
      tydenniXp: {},
    },
    dokonceneTesty: 0,
    aktualizovano: ted,
  };
}

// ---------------------------------------------------------------------------
// Normalizace odpovědí (doplňovací otázky)

export function normalizujOdpoved(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function jeOdpovedSpravna(odpoved: string, spravneOdpovedi: string[]): boolean {
  const n = normalizujOdpoved(odpoved);
  return spravneOdpovedi.some((s) => normalizujOdpoved(s) === n);
}
