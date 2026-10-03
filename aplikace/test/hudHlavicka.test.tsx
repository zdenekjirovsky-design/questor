// Testy HUD v hlavicce (src/komponenty/HudHlavicka.tsx) — mobilni opravy:
// - menu profilu/bank se zavira Escapem i JAKYMKOLI scrollem stranky (jinak
//   menu odjede s hlavickou a pruhledny fixni prekryv spolkne dalsi tuknuti);
//   na mobilu (fixni menu) jen Escapem — scroll window tam byva systemovy
//   (navrat po zavreni klavesnice iOS) a zavrel by menu hned po otevreni,
// - horni hrana fixniho menu na mobilu se meri ze spodku tlacitka,
// - „Nacitam postup…" na mobilu nevstupuje do radku HUD (odznak na avataru,
//   text jen pro ctecky) — desktopove umisteni textu zustava.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const stavSyncuMock = vi.hoisted(() => ({ nacitamPostup: false }));

vi.mock('../src/sync/sync', async (importOriginal) => {
  const puvodni = await importOriginal<typeof import('../src/sync/sync')>();
  return {
    ...puvodni,
    pripojSeKeStavuSyncu: () => () => {},
    stavSynchronizace: () => ({ ...puvodni.stavSynchronizace(), ...stavSyncuMock }),
  };
});

import HudHlavicka, {
  horniHranaMenu,
  ODSTUP_MENU_PX,
  prihlasZavireniMenu,
} from '../src/komponenty/HudHlavicka';

function klavesa(key: string): Event {
  return Object.assign(new Event('keydown'), { key });
}

describe('prihlasZavireniMenu — zavirani menu v HUD', () => {
  it('scroll stranky menu zavre (dotyk i kolecko)', () => {
    const cil = new EventTarget();
    const zavri = vi.fn();
    prihlasZavireniMenu(cil, zavri);
    cil.dispatchEvent(new Event('scroll'));
    expect(zavri).toHaveBeenCalledTimes(1);
  });

  it('Escape menu zavre, jina klavesa ne', () => {
    const cil = new EventTarget();
    const zavri = vi.fn();
    prihlasZavireniMenu(cil, zavri);
    cil.dispatchEvent(klavesa('a'));
    expect(zavri).not.toHaveBeenCalled();
    cil.dispatchEvent(klavesa('Escape'));
    expect(zavri).toHaveBeenCalledTimes(1);
  });

  it('posluchac scrollu je pasivni (neblokuje plynuly scroll)', () => {
    const volby: Record<string, unknown> = {};
    const cil = {
      addEventListener: (typ: string, _p: (e: Event) => void, v?: AddEventListenerOptions) => {
        volby[typ] = v;
      },
      removeEventListener: () => {},
    };
    prihlasZavireniMenu(cil, () => {});
    expect(volby.scroll).toEqual({ passive: true });
  });

  it('mobil (zavirejPriScrollu = false): scroll menu nezavre, Escape ano', () => {
    const cil = new EventTarget();
    const zavri = vi.fn();
    const uklid = prihlasZavireniMenu(cil, zavri, false);
    cil.dispatchEvent(new Event('scroll'));
    expect(zavri).not.toHaveBeenCalled();
    cil.dispatchEvent(klavesa('Escape'));
    expect(zavri).toHaveBeenCalledTimes(1);
    uklid();
    cil.dispatchEvent(klavesa('Escape'));
    expect(zavri).toHaveBeenCalledTimes(1);
  });

  it('mobil: posluchac scrollu se vubec neprihlasi (ani neodhlasuje)', () => {
    const typy: string[] = [];
    const odhlasene: string[] = [];
    const cil = {
      addEventListener: (typ: string) => {
        typy.push(typ);
      },
      removeEventListener: (typ: string) => {
        odhlasene.push(typ);
      },
    };
    prihlasZavireniMenu(cil, () => {}, false)();
    expect(typy).toEqual(['keydown']);
    expect(odhlasene).toEqual(['keydown']);
  });

  it('vychozi (desktop/tablet) zavira i scrollem — beze zmeny', () => {
    const typy: string[] = [];
    const cil = {
      addEventListener: (typ: string) => {
        typy.push(typ);
      },
      removeEventListener: () => {},
    };
    prihlasZavireniMenu(cil, () => {});
    expect(typy).toEqual(['keydown', 'scroll']);
  });

  it('uklid odhlasi oba posluchace — zavrene menu uz na scroll nereaguje', () => {
    const cil = new EventTarget();
    const zavri = vi.fn();
    const uklid = prihlasZavireniMenu(cil, zavri);
    uklid();
    cil.dispatchEvent(new Event('scroll'));
    cil.dispatchEvent(klavesa('Escape'));
    expect(zavri).not.toHaveBeenCalled();
  });
});

describe('horniHranaMenu — fixni menu na mobilu pod tlacitkem', () => {
  it('spodek tlacitka + odstup, zaokrouhleno na cele px', () => {
    expect(horniHranaMenu(54.4)).toBe(Math.round(54.4 + ODSTUP_MENU_PX));
    expect(horniHranaMenu(0)).toBe(ODSTUP_MENU_PX);
  });

  it('odscrollovana stranka (zaporny spodek) se predava dal — CSS ji srovna max()', () => {
    expect(horniHranaMenu(-30)).toBe(-30 + ODSTUP_MENU_PX);
  });

  it('nesmyslny vstup vraci null (plati CSS fallback)', () => {
    expect(horniHranaMenu(Number.NaN)).toBeNull();
    expect(horniHranaMenu(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('HUD — stav „Načítám postup…"', () => {
  it('bez pullu neni v HUD odznak ani text', () => {
    stavSyncuMock.nacitamPostup = false;
    const html = renderToStaticMarkup(<HudHlavicka />);
    expect(html).not.toContain('hud__nacitam');
  });

  it('pri pullu: odznak ☁️ v obalu avatara (mobil) + text ve stavu pro ctecky', () => {
    stavSyncuMock.nacitamPostup = true;
    const html = renderToStaticMarkup(<HudHlavicka />);
    // Odznak je uvnitr .hud__profil (pozicovany vuci avataru, nezabira misto v radku).
    expect(html).toMatch(/<div class="hud__profil">(?:(?!<\/div>).)*<\/button><span class="hud__nacitam-odznak"/s);
    expect(html).toMatch(/class="hud__nacitam-odznak"[^>]*aria-hidden="true"/);
    // Text zustava jako role="status" na desktopovem miste (pred levelem).
    expect(html).toContain('<span class="hud__nacitam" role="status">☁️ Načítám postup…</span>');
    expect(html.indexOf('class="hud__nacitam"')).toBeLessThan(html.indexOf('hud__level-blok'));
  });
});

describe('HudHlavicka.css — mobilni pravidla (kontrakt oprav)', () => {
  const css = readFileSync(new URL('../src/komponenty/HudHlavicka.css', import.meta.url), 'utf8');
  const zacatek = css.indexOf('@media (max-width: 760px) {');
  const mobil = css.slice(zacatek, css.indexOf('\n}\n', zacatek));

  it('pruhledny prekryv menu neposouva stranku tahem prstem', () => {
    expect(css).toMatch(/\.hud__menu-prekryv \{[^}]*touch-action: none;/);
  });

  it('na mobilu je text pullu mimo tok radku a menu fixni k viewportu', () => {
    expect(zacatek).toBeGreaterThan(-1);
    expect(mobil).toMatch(/\.hud__nacitam \{[^}]*position: absolute;/);
    expect(mobil).toMatch(/\.hud__menu,\s*\.hud__menu\.hud__menu--banky \{[^}]*position: fixed;/);
    expect(mobil).toMatch(/\.hud__menu,\s*\.hud__menu\.hud__menu--banky \{[^}]*overscroll-behavior: contain;/);
  });
});
