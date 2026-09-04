// Pipeline generátoru: témata → dávky otázek (téma × pásmo obtížnosti) →
// verifikační průchod → sestavení banky (id přes vytvorIdOtazky, dedup,
// validujBanku). Verzi banky určuje volající (CLI ji čte z existujícího souboru).

import {
  otazkaSchema,
  validujBanku,
  vytvorIdOtazky,
  type BankaOtazek,
  type Obtiznost,
  type Otazka,
  type Tema,
} from '@questor/sdilene';
import type { Kapitola } from './ingest';
import type { LlmOtazka } from './llm-schema';
import type { PasmoObtiznosti, Poskytovatel } from './poskytovatele/rozhrani';

/** Pásma obtížnosti, pro která se generují dávky (podle docs/ARCHITEKTURA.md). */
export const PASMA: PasmoObtiznosti[] = [
  { min: 1, max: 2 },
  { min: 3, max: 3 },
  { min: 4, max: 5 },
];

/** Počet otázek v jedné dávce (téma × pásmo). */
export const OTAZEK_NA_DAVKU = 6;

export interface StatistikyGenerovani {
  temat: number;
  davekCelkem: number;
  davekPreskoceno: number;
  vygenerovano: number;
  poOvereni: number;
  vyrazenoValidaci: number;
  duplicit: number;
}

export interface VstupPipeline {
  kapitoly: Kapitola[];
  predmetId: string;
  nazev: string;
  poskytovatel: Poskytovatel;
  /** Verze banky v cílovém souboru; výsledná verze = předchozí + 1 (jinak 1). */
  predchoziVerze?: number;
  /** Čas vytvoření — injektuje se v testech. */
  nyni?: Date;
  log?: (zprava: string) => void;
}

/** Id tématu ze jména: bez diakritiky, malá písmena, pomlčky. */
export function vytvorIdTematu(nazev: string): string {
  const zaklad = nazev
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return zaklad === '' ? 'tema' : zaklad;
}

/** Z názvů témat vytvoří Tema[] s unikátními id a pořadím. */
export function sestavTemata(nazvy: string[]): Tema[] {
  const videna = new Set<string>();
  return nazvy.map((nazev, poradi) => {
    let id = vytvorIdTematu(nazev);
    let n = 2;
    while (videna.has(id)) {
      id = `${vytvorIdTematu(nazev)}-${n}`;
      n += 1;
    }
    videna.add(id);
    return { id, nazev, poradi };
  });
}

/**
 * Vybere z kapitol výřez učiva relevantní k tématu (podle výskytu slov názvu),
 * do maxDelka znaků. Bez zásahu (žádná slova se netrefí) bere kapitoly po pořadí.
 */
export function vyberKontextProTema(
  kapitoly: Kapitola[],
  nazevTematu: string,
  maxDelka = 12_000,
): string {
  const normalizuj = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const slova = normalizuj(nazevTematu)
    .split(/[^a-z0-9]+/)
    .filter((s) => s.length >= 4);

  const ohodnocene = kapitoly.map((kapitola, index) => {
    const nadpis = normalizuj(kapitola.nadpis);
    const telo = normalizuj(kapitola.text);
    let skore = 0;
    for (const slovo of slova) {
      if (nadpis.includes(slovo)) skore += 5;
      skore += pocetVyskytu(telo, slovo);
    }
    return { kapitola, index, skore };
  });

  const maNejakouShodu = ohodnocene.some((o) => o.skore > 0);
  const poradi = maNejakouShodu
    ? [...ohodnocene].sort((a, b) => b.skore - a.skore || a.index - b.index)
    : ohodnocene;

  const vybrane: typeof ohodnocene = [];
  let delka = 0;
  for (const polozka of poradi) {
    if (maNejakouShodu && polozka.skore === 0 && vybrane.length > 0) break;
    const prirustek = polozka.kapitola.nadpis.length + polozka.kapitola.text.length + 8;
    if (vybrane.length > 0 && delka + prirustek > maxDelka) continue;
    vybrane.push(polozka);
    delka += prirustek;
  }
  // Kapitoly ve výřezu drží pořadí učiva, ať kontext dává smysl při čtení.
  vybrane.sort((a, b) => a.index - b.index);
  return vybrane.map((v) => `## ${v.kapitola.nadpis}\n${v.kapitola.text}`).join('\n\n');
}

function pocetVyskytu(text: string, hledane: string): number {
  let pocet = 0;
  let od = 0;
  for (;;) {
    const i = text.indexOf(hledane, od);
    if (i === -1) return pocet;
    pocet += 1;
    od = i + hledane.length;
  }
}

/**
 * Kontroly konzistence klíče správnosti, které schéma jednotlivé otázky nehlídá
 * (ve sdilene je hlídá až superRefine celé banky — tady je potřeba dřív,
 * aby jedna vadná otázka neshodila validaci celé banky).
 */
export function jeKonzistentni(otazka: Otazka): boolean {
  if (otazka.typ === 'vyber') {
    return otazka.spravna < otazka.moznosti.length;
  }
  if (otazka.typ === 'multi') {
    return (
      otazka.spravne.every((s) => s < otazka.moznosti.length) &&
      new Set(otazka.spravne).size === otazka.spravne.length
    );
  }
  return true;
}

/**
 * Z otázek od modelu sestaví doménové Otazka[]: doplní temaId, srovná obtížnost
 * do pásma, vyrobí id přes vytvorIdOtazky a zvaliduje schématem ze sdilene.
 */
export function sestavOtazky(
  llmOtazky: LlmOtazka[],
  tema: Tema,
  pasmo: PasmoObtiznosti,
): { otazky: Otazka[]; vyrazeno: number } {
  const otazky: Otazka[] = [];
  let vyrazeno = 0;
  for (const llm of llmOtazky) {
    const { zdroj, obtiznost, ...zbytek } = llm;
    const kandidat = {
      ...zbytek,
      obtiznost: Math.min(pasmo.max, Math.max(pasmo.min, obtiznost)) as Obtiznost,
      ...(zdroj === null ? {} : { zdroj }),
      temaId: tema.id,
      id: vytvorIdOtazky(tema.id, llm.zadani, llm.typ),
    };
    const vysledek = otazkaSchema.safeParse(kandidat);
    if (vysledek.success && jeKonzistentni(vysledek.data as Otazka)) {
      otazky.push(vysledek.data as Otazka);
    } else {
      vyrazeno += 1;
    }
  }
  return { otazky, vyrazeno };
}

/** Kompletní běh pipeline nad načtenými kapitolami — vrátí zvalidovanou banku. */
export async function vygenerujBanku(
  vstup: VstupPipeline,
): Promise<{ banka: BankaOtazek; statistiky: StatistikyGenerovani }> {
  const log = vstup.log ?? (() => {});
  const { poskytovatel, kapitoly } = vstup;

  log(`Krok 1/4: extrakce témat (${kapitoly.length} kapitol)…`);
  const nazvyTemat = await poskytovatel.extrahujTemata({
    nazevPredmetu: vstup.nazev,
    kapitoly,
  });
  const temata = sestavTemata(nazvyTemat);
  log(`Témata (${temata.length}): ${temata.map((t) => t.nazev).join(', ')}`);

  const statistiky: StatistikyGenerovani = {
    temat: temata.length,
    davekCelkem: temata.length * PASMA.length,
    davekPreskoceno: 0,
    vygenerovano: 0,
    poOvereni: 0,
    vyrazenoValidaci: 0,
    duplicit: 0,
  };

  const vsechny: Otazka[] = [];
  const videnaId = new Set<string>();
  let cisloDavky = 0;

  log(`Krok 2/4 a 3/4: generování a ověřování dávek (${statistiky.davekCelkem})…`);
  for (const tema of temata) {
    const kontext = vyberKontextProTema(kapitoly, tema.nazev);
    for (const pasmo of PASMA) {
      cisloDavky += 1;
      const oznaceni = `[${cisloDavky}/${statistiky.davekCelkem}] ${tema.nazev} × obtížnost ${
        pasmo.min === pasmo.max ? pasmo.min : `${pasmo.min}–${pasmo.max}`
      }`;

      const surove = await poskytovatel.vygenerujOtazky({
        nazevPredmetu: vstup.nazev,
        tema,
        pasmo,
        pocet: OTAZEK_NA_DAVKU,
        kontext,
      });
      if (surove === null) {
        statistiky.davekPreskoceno += 1;
        log(`${oznaceni}: dávka přeskočena.`);
        continue;
      }
      statistiky.vygenerovano += surove.length;

      const overene = await poskytovatel.overOtazky({
        nazevPredmetu: vstup.nazev,
        tema,
        otazky: surove,
        kontext,
      });
      if (overene === null) {
        log(`${oznaceni}: ověření neproběhlo, dávka zůstává neověřená.`);
      }
      const kOtazkam = overene ?? surove;
      statistiky.poOvereni += kOtazkam.length;

      const { otazky, vyrazeno } = sestavOtazky(kOtazkam, tema, pasmo);
      statistiky.vyrazenoValidaci += vyrazeno;
      let novych = 0;
      for (const otazka of otazky) {
        if (videnaId.has(otazka.id)) {
          statistiky.duplicit += 1;
          continue;
        }
        videnaId.add(otazka.id);
        vsechny.push(otazka);
        novych += 1;
      }
      log(
        `${oznaceni}: ${surove.length} vygenerováno, ${kOtazkam.length} po ověření, ${novych} přijato` +
          (vyrazeno > 0 ? `, ${vyrazeno} vyřazeno validací` : ''),
      );
    }
  }

  if (vsechny.length === 0) {
    throw new Error('Nevznikla žádná platná otázka — banku nelze sestavit.');
  }

  log('Krok 4/4: sestavení a validace banky…');
  const banka = validujBanku({
    predmetId: vstup.predmetId,
    nazev: vstup.nazev,
    verze: (vstup.predchoziVerze ?? 0) + 1,
    vytvoreno: (vstup.nyni ?? new Date()).toISOString(),
    temata,
    otazky: vsechny,
  });
  return { banka, statistiky };
}
