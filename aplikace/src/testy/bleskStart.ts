// Start bleskovek (/blesk) — čisté výpočty pro stránku stranky/Blesk.tsx
// a pro dlaždici na Domů: které banky profilu bleskovky nabízejí, která je
// předvolená, jak se čistí výběr témat a jak dlouhé kolo z něj vyjde.
// Oddělené od komponent kvůli testovatelnosti (aplikace/test).
import type { BankaOtazek, TestVysledek } from '@questor/sdilene';
import { seradPredmety } from '../data/predmety';
import { jeKoloBleskovek, maBleskovky, type TemaBlesku } from './blesk';
import { planovanyPocetOtazek, type TestStav } from './engine';

/**
 * Banky, které start bleskovek nabízí: JEN studijní banky profilu, které
 * mají načtený obsah a aspoň MIN_BLESKOVYCH bleskových otázek. Pořadí podle
 * registru předmětů.
 */
export function bankySBleskovkami(
  banky: Readonly<Record<string, BankaOtazek>>,
  predmetyProfilu: readonly string[],
): string[] {
  return seradPredmety(Object.keys(banky)).filter(
    (id) => predmetyProfilu.includes(id) && maBleskovky(banky[id]),
  );
}

/**
 * Banka vybraná na startu. Přednost má ruční volba studenta, pak parametr
 * `?predmet=`, pak banka s tématem z `?tema=`, pak AKTIVNÍ banka profilu
 * a nakonec první dostupná. Cokoli mimo `dostupne` se přeskočí; null = žádná
 * banka bleskovky nenabízí.
 */
export function vychoziBankaBlesku(vstup: {
  dostupne: readonly string[];
  /** Ruční volba studenta na stránce. */
  vybrana?: string | null;
  /** Parametr ?predmet=. */
  pozadovana?: string | null;
  /** Banka, do které patří téma z parametru ?tema= (když ho nějaká má). */
  bankaTematu?: string | null;
  /** Aktivní banka profilu. */
  aktivni?: string | null;
}): string | null {
  for (const kandidat of [vstup.vybrana, vstup.pozadovana, vstup.bankaTematu, vstup.aktivni]) {
    if (kandidat && vstup.dostupne.includes(kandidat)) return kandidat;
  }
  return vstup.dostupne[0] ?? null;
}

/**
 * Dlaždice „Bleskovky“ na Domů: banka, kterou start (/blesk) předvolí, nebo
 * null, když se dlaždice ukázat nemá. Ukazuje se, když bleskovky nabízí
 * KTERÁKOLI studijní banka profilu (ne jen aktivní) — předvolená je aktivní,
 * má-li je, jinak první vhodná v pořadí registru (stejné pravidlo jako
 * vychoziBankaBlesku na startu).
 *
 * Banky chodí po startu async. Dokud načítání běží (`obsahNacten` false),
 * napoví u ještě nenačtené banky historie testů: kdo z ní bleskovky už hrál,
 * má dlaždici hned a Domů mu po načtení neposkočí. Jakmile načítání doběhne,
 * rozhoduje jen obsah — dlaždice k bance, která chybí, by vedla do prázdna.
 */
export function bankaDlazdiceBlesku(vstup: {
  /** Banky s načteným obsahem (store `banky`). */
  banky: Readonly<Record<string, BankaOtazek | undefined>>;
  /** Studijní banky profilu (profilySlice.predmetyProfilu). */
  predmetyProfilu: readonly string[];
  /** Aktivní banka profilu. */
  aktivni: string | null;
  /** Historie testů profilu (nejnovější první). */
  historie: readonly Pick<TestVysledek, 'id' | 'konfigurace'>[];
  /** Doběhlo startovní načítání obsahu (data/pouzijObsahNacten)? */
  obsahNacten: boolean;
}): string | null {
  const hraneBanky = new Set(
    vstup.historie.filter((v) => jeKoloBleskovek(v)).map((v) => v.konfigurace.predmetId),
  );
  const vhodne = seradPredmety([...vstup.predmetyProfilu]).filter((id) => {
    const banka = vstup.banky[id];
    if (banka) return maBleskovky(banka);
    return !vstup.obsahNacten && hraneBanky.has(id);
  });
  return vychoziBankaBlesku({ dostupne: vhodne, aktivni: vstup.aktivni });
}

/** Která z dostupných bank má bleskové téma `temaId` (null = žádná). */
export function bankaSTematemBlesku(
  dostupne: readonly string[],
  temataBank: Readonly<Record<string, readonly TemaBlesku[]>>,
  temaId: string | null | undefined,
): string | null {
  if (!temaId) return null;
  return dostupne.find((id) => (temataBank[id] ?? []).some((t) => t.id === temaId)) ?? null;
}

/** Z výběru nechá jen témata, která banka pro bleskovky opravdu má (bez duplicit). */
export function platnaTemata(
  temata: readonly Pick<TemaBlesku, 'id'>[],
  vybrana: readonly string[],
): string[] {
  const znama = new Set(temata.map((t) => t.id));
  return vybrana.filter((id, i) => znama.has(id) && vybrana.indexOf(id) === i);
}

/** Přepne téma ve výběru (vybrané odebere, nevybrané přidá). */
export function prepniTemaVyberu(vybrana: readonly string[], temaId: string): string[] {
  return vybrana.includes(temaId) ? vybrana.filter((id) => id !== temaId) : [...vybrana, temaId];
}

/**
 * `temataId` pro konfiguraci kola: žádné vybrané téma i všechna vybraná
 * znamenají „Vše“ (undefined = míchané kolo přes celou banku).
 */
export function temataProKolo(
  temata: readonly Pick<TemaBlesku, 'id'>[],
  vybrana: readonly string[],
): string[] | undefined {
  const platna = platnaTemata(temata, vybrana);
  return platna.length === 0 || platna.length >= temata.length ? undefined : platna;
}

/**
 * „N bleskových otázek“ ve správném tvaru. `pad` rozlišuje jen jednotné
 * číslo: 'kdo' = 1 blesková otázka, 'koho' = 1 bleskovou otázku (má jen…).
 */
export function slovyBleskoveOtazky(pocet: number, pad: 'kdo' | 'koho' = 'kdo'): string {
  if (pocet === 1) return pad === 'koho' ? '1 bleskovou otázku' : '1 blesková otázka';
  if (pocet >= 2 && pocet <= 4) return `${pocet} bleskové otázky`;
  return `${pocet} bleskových otázek`;
}

/** Kolik bleskových otázek je k dispozici pro daný výběr témat. */
export function pocetDostupnychOtazek(
  temata: readonly Pick<TemaBlesku, 'id' | 'pocet'>[],
  vybrana: readonly string[],
): number {
  const vyber = temataProKolo(temata, vybrana);
  return temata
    .filter((t) => vyber === undefined || vyber.includes(t.id))
    .reduce((s, t) => s + t.pocet, 0);
}

/** Rozehraný test nebo kolo, na které start bleskovek upozorní. */
export interface RozehranyTest {
  /** Je to kolo bleskovek (jinak běžný test)? */
  jeBlesk: boolean;
  predmetId: string;
  /** Kolik otázek už má odpověď. */
  zodpovezeno: number;
  /** Kolik otázek test celkem plánuje. */
  celkem: number;
}

/**
 * Popis rozehraného testu pro upozornění na startu bleskovek (null = nic
 * neběží). Start kvůli němu NEPŘESMĚROVÁVÁ: nedohraný test (třeba dny starý,
 * z úplně jiné banky) nesmí studentovi bleskovky „unést“ — jen se nabídne
 * k pokračování a nové kolo ho nahradí stejně jako nově spuštěný test.
 */
export function rozehranyTest(
  stav: Pick<TestStav, 'blesk' | 'konfigurace' | 'odpovedi' | 'otazky' | 'pool' | 'dokonceno'> | null,
): RozehranyTest | null {
  if (!stav || stav.dokonceno) return null;
  return {
    jeBlesk: stav.blesk !== undefined,
    predmetId: stav.konfigurace.predmetId,
    zodpovezeno: stav.odpovedi.length,
    celkem: planovanyPocetOtazek(stav as TestStav),
  };
}
