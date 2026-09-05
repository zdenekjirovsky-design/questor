// Jednoduchý in-memory rate limit per IP — ochrana proti hrubé síle na tokeny
// (server poběží veřejně). Fixní okno: v jednom okně (default 60 s) smí jedna
// IP poslat maximálně `maxPozadavku` požadavků, nadlimit → 429 { chyba }.
//
// Záměrně čitelné a testovatelné: hodiny se injektují (`ted`), takže testy
// posouvají čas bez čekání. Počítadla žijí jen v paměti procesu — restart
// serveru je vynuluje, což je pro ochranu proti bruteforce v pořádku.

import type { Context, Next } from 'hono';

export interface MoznostiRateLimit {
  /** Kolik požadavků smí jedna IP v jednom okně (default 240). */
  maxPozadavku?: number;
  /** Délka okna v ms (default 60 000 = minuta). */
  oknoMs?: number;
  /** Injektované hodiny (default Date.now) — testy jimi posouvají čas. */
  ted?: () => number;
  /**
   * Kolik důvěryhodných reverzních proxy stojí před serverem (default env
   * QUESTOR_DUVERUJ_PROXY, jinak 1 — veřejné nasazení za jednou proxy).
   * 0 = X-Forwarded-For ignorovat úplně a brát jen adresu soketu (server
   * vystavený přímo — hlavičku by si psal sám klient).
   */
  duverujProxy?: number;
}

export const VYCHOZI_MAX_POZADAVKU = 240;
export const VYCHOZI_OKNO_MS = 60_000;

/** Strop počtu držených IP — nad ním se při dalším požadavku vymetou propadlá okna. */
const MAX_ZAZNAMU = 10_000;

interface Okno {
  pocatek: number;
  pocet: number;
}

/** Výchozí počet důvěryhodných proxy z env (fail-safe → 1). */
function vychoziDuverujProxy(): number {
  const raw = process.env.QUESTOR_DUVERUJ_PROXY;
  if (raw === undefined || raw === '') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

/**
 * Klíč klienta z X-Forwarded-For + adresy soketu. POZOR: standardní reverzní
 * proxy (nginx proxy_add_x_forwarded_for, Caddy, Apache) hodnotu APPENDUJÍ za
 * hlavičku poslanou klientem — první položku plně ovládá útočník a rotací
 * smyšlených IP by obešel celý limit (každý požadavek čerstvé okno). Věřit
 * se dá jen adresám přidaným vlastními proxy, tj. POSLEDNÍM `duverujProxy`
 * položkám: adresa klienta je ta, kterou appendla PRVNÍ důvěryhodná proxy
 * v řadě (duverujProxy-tá od konce). S duverujProxy=0 se hlavička ignoruje
 * úplně a platí adresa soketu (@hono/node-server ji dává do c.env.incoming).
 * Bez obojího (testy přes app.request()) spadnou všichni do jednoho klíče.
 */
function klicKlienta(c: Context, duverujProxy: number): string {
  if (duverujProxy > 0) {
    const xff = c.req.header('x-forwarded-for');
    if (xff) {
      const adresy = xff
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      // Kratší seznam než počet proxy = některá proxy neappenduje; vezme se
      // první dostupná (nejblíž klientovi z důvěryhodné části).
      const adresa = adresy[Math.max(0, adresy.length - duverujProxy)];
      if (adresa) return adresa;
    }
  }
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'bez-adresy';
}

/** Hono middleware s vlastní mapou počítadel — každá instance počítá zvlášť. */
export function vytvorRateLimit(moznosti: MoznostiRateLimit = {}) {
  const max = moznosti.maxPozadavku ?? VYCHOZI_MAX_POZADAVKU;
  const oknoMs = moznosti.oknoMs ?? VYCHOZI_OKNO_MS;
  const ted = moznosti.ted ?? Date.now;
  const duverujProxy = moznosti.duverujProxy ?? vychoziDuverujProxy();
  const pocitadla = new Map<string, Okno>();

  return async (c: Context, next: Next) => {
    const nyni = ted();

    // Úklid: mapa nesmí růst donekonečna (IP se dají střídat) — po překročení
    // stropu se propadlá okna vymetou; aktivní útočník tím limit neobejde.
    if (pocitadla.size >= MAX_ZAZNAMU) {
      for (const [klic, okno] of pocitadla) {
        if (nyni - okno.pocatek >= oknoMs) pocitadla.delete(klic);
      }
    }

    const klic = klicKlienta(c, duverujProxy);
    let okno = pocitadla.get(klic);
    if (!okno || nyni - okno.pocatek >= oknoMs) {
      okno = { pocatek: nyni, pocet: 0 };
      pocitadla.set(klic, okno);
    }
    okno.pocet += 1;

    if (okno.pocet > max) {
      const zbyvaS = Math.max(1, Math.ceil((okno.pocatek + oknoMs - nyni) / 1000));
      c.header('retry-after', String(zbyvaS));
      return c.json({ chyba: 'Příliš mnoho požadavků — zkus to za chvíli' }, 429);
    }
    await next();
  };
}
