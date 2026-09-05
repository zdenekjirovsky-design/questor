// Offline fronta neodeslaných událostí (localStorage, klíč questor-sync-fronta).
// Selhání sítě = tiché: položky zůstávají ve frontě a další pokus se odkládá
// exponenciálně (5 s → 10 s → … → max 5 min). Trvalé odmítnutí serverem
// (4xx mimo 408/429) položku zahodí, aby „jedovatá" položka neblokovala
// odesílání všeho za ní.
import type {
  ProfilRegistrZaznam,
  ProgresStudenta,
  TestVysledek,
  VysledekDuelu,
} from '@questor/sdilene';
import { ChybaSyncu, vychoziUloziste, type QuestorKlient, type Uloziste } from './klient';

export const KLIC_FRONTY = 'questor-sync-fronta';
/**
 * Fronta operací nad registrem profilů, které NEPATŘÍ žádnému žijícímu
 * profilu (dnes: smazání profilu na serveru) — nesmí zmizet s frontou
 * mazaného profilu. 'registr' nekoliduje s id profilů (UUID / p-…).
 */
export const KLIC_FRONTY_REGISTRU = `${KLIC_FRONTY}:registr`;
export const ZAKLADNI_ODKLAD_MS = 5_000;
export const MAX_ODKLAD_MS = 300_000;

/**
 * Fronta je per PROFIL (osobni data) — klic nese id profilu. Puvodni
 * spolecny klic KLIC_FRONTY je „legacy": prvni fronta, ktera pri nacteni
 * nema vlastni data a legacy klic existuje, ho adoptuje (po migraci v3→v4
 * je to fronta aktivovaneho profilu Student, jedineho, ktery tehdy existuje).
 */
export function klicFrontyProfilu(profilId: string): string {
  return `${KLIC_FRONTY}:${profilId}`;
}

/** Smaze ulozenou frontu profilu (pri smazani profilu). Fail-safe. */
export function smazUlozenouFrontuProfilu(
  profilId: string,
  uloziste: Uloziste = vychoziUloziste(),
): void {
  try {
    uloziste.removeItem(klicFrontyProfilu(profilId));
  } catch {
    // Tiche — hure nez neodstranit klic to nedopadne.
  }
}

export type PolozkaFronty =
  | { typ: 'udalost'; data: TestVysledek; vytvoreno: string }
  | { typ: 'progres'; data: ProgresStudenta; vytvoreno: string }
  | {
      typ: 'vyzva-vysledek';
      data: { vyzvaId: string; uspesnost: number; xp: number };
      vytvoreno: string;
    }
  | { typ: 'profil'; data: ProfilRegistrZaznam; vytvoreno: string }
  | { typ: 'smazani-profilu'; data: { profilId: string }; vytvoreno: string }
  | {
      typ: 'duel-vysledek';
      data: { duelId: string; profilId: string; vysledek: VysledekDuelu };
      vytvoreno: string;
    };

interface StavFronty {
  polozky: PolozkaFronty[];
  /** Kolik pokusů o odeslání po sobě selhalo. */
  selhaniPoSobe: number;
  /** Timestamp (ms), před kterým nemá smysl zkoušet znovu; null = hned. */
  dalsiPokus: number | null;
}

const PRAZDNY_STAV: StavFronty = { polozky: [], selhaniPoSobe: 0, dalsiPokus: null };

/** Část klienta, kterou fronta potřebuje (testy mockují jen tohle). */
export type KlientProFrontu = Pick<
  QuestorKlient,
  | 'posliUdalost'
  | 'posliProgres'
  | 'posliVysledekVyzvy'
  | 'posliProfil'
  | 'smazProfilNaServeru'
  | 'posliVysledekDuelu'
>;

export class SyncFronta {
  private stav: StavFronty;
  /** Po zrušení (smazaný profil) se fronta už NIKDY nezapíše do úložiště. */
  private zrusena = false;

  constructor(
    private uloziste: Uloziste = vychoziUloziste(),
    private klic: string = KLIC_FRONTY,
    /** Stary spolecny klic k adopci, kdyz vlastni klic jeste nema data. */
    private legacyKlic?: string,
  ) {
    this.stav = this.nacti();
  }

  private nacti(): StavFronty {
    try {
      let raw = this.uloziste.getItem(this.klic);
      if (!raw && this.legacyKlic) {
        // Adopce fronty ze spolecneho klice (pred zavedenim profilu):
        // data se prevezmou pod vlastni klic a legacy klic se odstrani,
        // aby je neprevzala i fronta jineho profilu.
        raw = this.uloziste.getItem(this.legacyKlic);
        if (raw) {
          this.uloziste.setItem(this.klic, raw);
          this.uloziste.removeItem(this.legacyKlic);
        }
      }
      if (!raw) return { ...PRAZDNY_STAV, polozky: [] };
      const data = JSON.parse(raw) as Partial<StavFronty>;
      return {
        polozky: Array.isArray(data.polozky) ? (data.polozky as PolozkaFronty[]) : [],
        selhaniPoSobe: typeof data.selhaniPoSobe === 'number' ? data.selhaniPoSobe : 0,
        dalsiPokus: typeof data.dalsiPokus === 'number' ? data.dalsiPokus : null,
      };
    } catch {
      return { ...PRAZDNY_STAV, polozky: [] };
    }
  }

  private uloz(): void {
    // Zrušená fronta (smazaný profil) nesmí klíč v úložišti znovu založit —
    // uloz() může doběhnout i PO smazání profilu (letící odesli() v syncu).
    if (this.zrusena) return;
    try {
      this.uloziste.setItem(this.klic, JSON.stringify(this.stav));
    } catch {
      // Tiché — fronta pak žije jen v paměti do zavření aplikace.
    }
  }

  /**
   * Zruší frontu při smazání profilu: vyprázdní položky (osobní data smazaného
   * profilu se už neodesílají) a trvale zakáže zápis do úložiště. Letící
   * odesli() po návratu z awaitu najde prázdnou frontu a skončí bez zápisu.
   */
  zrus(): void {
    this.zrusena = true;
    this.stav = { polozky: [], selhaniPoSobe: 0, dalsiPokus: null };
  }

  polozky(): readonly PolozkaFronty[] {
    return this.stav.polozky;
  }

  velikost(): number {
    return this.stav.polozky.length;
  }

  pridejUdalost(vysledek: TestVysledek): void {
    this.stav.polozky.push({ typ: 'udalost', data: vysledek, vytvoreno: new Date().toISOString() });
    this.uloz();
  }

  /** Progres je snapshot — ve frontě se drží vždy jen ten nejnovější. */
  pridejProgres(progres: ProgresStudenta): void {
    this.stav.polozky = this.stav.polozky.filter((p) => p.typ !== 'progres');
    this.stav.polozky.push({ typ: 'progres', data: progres, vytvoreno: new Date().toISOString() });
    this.uloz();
  }

  pridejVysledekVyzvy(vyzvaId: string, telo: { uspesnost: number; xp: number }): void {
    this.stav.polozky.push({
      typ: 'vyzva-vysledek',
      data: { vyzvaId, ...telo },
      vytvoreno: new Date().toISOString(),
    });
    this.uloz();
  }

  /**
   * Vysledek pulky duelu (POST /api/duely/:id/vysledek). Server bere PRVNI
   * zapis za profil — pripadny duplikat ve fronte se dedupuje podle duelId
   * (opakovane odeslani by server stejne odmitl 409 a fronta by ho zahodila).
   */
  pridejVysledekDuelu(duelId: string, profilId: string, vysledek: VysledekDuelu): void {
    if (
      this.stav.polozky.some((p) => p.typ === 'duel-vysledek' && p.data.duelId === duelId)
    ) {
      return;
    }
    this.stav.polozky.push({
      typ: 'duel-vysledek',
      data: { duelId, profilId, vysledek },
      vytvoreno: new Date().toISOString(),
    });
    this.uloz();
  }

  /**
   * Záznam registru profilů je snapshot — ve frontě se drží vždy jen ten
   * nejnovější pro daný profil (stejný vzor jako pridejProgres).
   */
  pridejProfil(zaznam: ProfilRegistrZaznam): void {
    this.stav.polozky = this.stav.polozky.filter(
      (p) => !(p.typ === 'profil' && p.data.profilId === zaznam.profilId),
    );
    this.stav.polozky.push({ typ: 'profil', data: zaznam, vytvoreno: new Date().toISOString() });
    this.uloz();
  }

  /**
   * Smazání profilu na serveru (DELETE je idempotentní — stačí jednou).
   * Čekající upsert téhož profilu je se smazáním bezpředmětný, zahodí se.
   */
  pridejSmazaniProfilu(profilId: string): void {
    this.stav.polozky = this.stav.polozky.filter(
      (p) =>
        !(p.typ === 'profil' && p.data.profilId === profilId) &&
        !(p.typ === 'smazani-profilu' && p.data.profilId === profilId),
    );
    this.stav.polozky.push({
      typ: 'smazani-profilu',
      data: { profilId },
      vytvoreno: new Date().toISOString(),
    });
    this.uloz();
  }

  /** Je čas na další pokus? (exponenciální odklad po selháních) */
  muzeZkusit(ted: number = Date.now()): boolean {
    return this.stav.dalsiPokus === null || ted >= this.stav.dalsiPokus;
  }

  /** Ruční sync smaže odklad — zkusí se hned. */
  vynulujOdklad(): void {
    this.stav.dalsiPokus = null;
    this.uloz();
  }

  /** Odstraní KONKRÉTNÍ položku podle identity (pole se mohlo během awaitu změnit). */
  private odeberPolozku(polozka: PolozkaFronty): void {
    const idx = this.stav.polozky.indexOf(polozka);
    if (idx >= 0) this.stav.polozky.splice(idx, 1);
  }

  /**
   * Zkusí odeslat frontu v pořadí. Při selhání sítě/serveru se zastaví,
   * položka zůstává a naplánuje se exponenciální odklad. Položku trvale
   * odmítnutou serverem (4xx mimo 408/429) zahodí a pokračuje dál.
   * NIKDY nevyhazuje — selhání sítě je tiché.
   *
   * Odeslaná položka se odebírá podle IDENTITY, ne pozičně: pridejProgres()
   * může frontu během letícího awaitu přefiltrovat a shift() by pak odstranil
   * jinou položku, než která byla odeslána.
   */
  async odesli(
    klient: KlientProFrontu,
    ted: number = Date.now(),
  ): Promise<{ odeslano: number; zbyva: number }> {
    if (this.stav.polozky.length === 0) {
      return { odeslano: 0, zbyva: 0 };
    }
    if (!this.muzeZkusit(ted)) {
      return { odeslano: 0, zbyva: this.stav.polozky.length };
    }

    let odeslano = 0;
    while (this.stav.polozky.length > 0) {
      const polozka = this.stav.polozky[0];
      try {
        if (polozka.typ === 'udalost') {
          await klient.posliUdalost(polozka.data);
        } else if (polozka.typ === 'progres') {
          await klient.posliProgres(polozka.data);
        } else if (polozka.typ === 'profil') {
          await klient.posliProfil(polozka.data);
        } else if (polozka.typ === 'smazani-profilu') {
          await klient.smazProfilNaServeru(polozka.data.profilId);
        } else if (polozka.typ === 'duel-vysledek') {
          const { duelId, profilId, vysledek } = polozka.data;
          await klient.posliVysledekDuelu(duelId, { profilId, vysledek });
        } else {
          const { vyzvaId, uspesnost, xp } = polozka.data;
          await klient.posliVysledekVyzvy(vyzvaId, { uspesnost, xp });
        }
      } catch (chyba) {
        const status = chyba instanceof ChybaSyncu ? chyba.status : undefined;
        const trvaleOdmitnuto =
          status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (trvaleOdmitnuto) {
          // Server položku definitivně nechce (např. 404 smazané výzvy) —
          // zahodit a pokračovat, jinak by blokovala všechno za sebou.
          this.odeberPolozku(polozka);
          this.uloz();
          continue;
        }
        this.stav.selhaniPoSobe += 1;
        this.stav.dalsiPokus =
          ted + Math.min(MAX_ODKLAD_MS, ZAKLADNI_ODKLAD_MS * 2 ** (this.stav.selhaniPoSobe - 1));
        this.uloz();
        return { odeslano, zbyva: this.stav.polozky.length };
      }
      this.odeberPolozku(polozka);
      odeslano += 1;
    }

    this.stav.selhaniPoSobe = 0;
    this.stav.dalsiPokus = null;
    this.uloz();
    return { odeslano, zbyva: 0 };
  }
}
