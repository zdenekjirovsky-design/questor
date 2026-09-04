// Offline fronta neodeslaných událostí (localStorage, klíč questor-sync-fronta).
// Selhání sítě = tiché: položky zůstávají ve frontě a další pokus se odkládá
// exponenciálně (5 s → 10 s → … → max 5 min). Trvalé odmítnutí serverem
// (4xx mimo 408/429) položku zahodí, aby „jedovatá" položka neblokovala
// odesílání všeho za ní.
import type { ProgresStudenta, TestVysledek } from '@questor/sdilene';
import { ChybaSyncu, vychoziUloziste, type QuestorKlient, type Uloziste } from './klient';

export const KLIC_FRONTY = 'questor-sync-fronta';
export const ZAKLADNI_ODKLAD_MS = 5_000;
export const MAX_ODKLAD_MS = 300_000;

export type PolozkaFronty =
  | { typ: 'udalost'; data: TestVysledek; vytvoreno: string }
  | { typ: 'progres'; data: ProgresStudenta; vytvoreno: string }
  | {
      typ: 'vyzva-vysledek';
      data: { vyzvaId: string; uspesnost: number; xp: number };
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
  'posliUdalost' | 'posliProgres' | 'posliVysledekVyzvy'
>;

export class SyncFronta {
  private stav: StavFronty;

  constructor(
    private uloziste: Uloziste = vychoziUloziste(),
    private klic: string = KLIC_FRONTY,
  ) {
    this.stav = this.nacti();
  }

  private nacti(): StavFronty {
    try {
      const raw = this.uloziste.getItem(this.klic);
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
    try {
      this.uloziste.setItem(this.klic, JSON.stringify(this.stav));
    } catch {
      // Tiché — fronta pak žije jen v paměti do zavření aplikace.
    }
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
