// Testy scrollu pri navigaci (src/komponenty/ResetScrollu.tsx): nova stranka
// (PUSH/REPLACE) zacina nahore, zpet/vpred (POP) vraci ulozenou pozici a bez
// ni nesahá na scroll; pozice se ukladaji podle zaznamu historie s limitem;
// rucni obnova (history.scrollRestoration) se po odpojeni vrati a pri
// odchodu ze stranky se vraci 'auto' (po reloadu pozici obnovi prohlizec).
// Prostredi testu je node bez DOM — testuji se funkce, ktere komponenta
// vola ze svych efektu, a komponenta sama jen pres renderToStaticMarkup.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import ResetScrollu, {
  LIMIT_POZIC,
  nastavRucniObnovu,
  sledujPozici,
  srovnejScrollPoNavigaci,
  vratAutoPriOdchodu,
  zapamatujPozici,
  type CilUdalostiOdchodu,
  type DokumentProOdchod,
  type HistorieProScroll,
  type OknoProScroll,
} from '../src/komponenty/ResetScrollu';

describe('srovnejScrollPoNavigaci', () => {
  it('PUSH (odkaz, navigate) → nahoru', () => {
    const scrollTo = vi.fn();
    srovnejScrollPoNavigaci('PUSH', 'k2', new Map(), scrollTo);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('REPLACE (presmerovani) → nahoru', () => {
    const scrollTo = vi.fn();
    srovnejScrollPoNavigaci('REPLACE', 'k2', new Map(), scrollTo);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('PUSH ignoruje pozici ulozenou pod stejnym klicem', () => {
    const scrollTo = vi.fn();
    srovnejScrollPoNavigaci('PUSH', 'k2', new Map([['k2', 700]]), scrollTo);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('POP (zpet/vpred) NEresetuje nahoru — vrati ulozenou pozici cile', () => {
    const scrollTo = vi.fn();
    srovnejScrollPoNavigaci('POP', 'k1', new Map([['k1', 640], ['k2', 90]]), scrollTo);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith(0, 640);
  });

  it('POP bez ulozene pozice (start aplikace, po reloadu) scroll nemeni — obnovu po reloadu dela prohlizec (rezim auto pri odchodu)', () => {
    const scrollTo = vi.fn();
    srovnejScrollPoNavigaci('POP', 'default', new Map(), scrollTo);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('POP na ulozenou nulu odroluje nahoru (0 neni „nezname")', () => {
    const scrollTo = vi.fn();
    srovnejScrollPoNavigaci('POP', 'k1', new Map([['k1', 0]]), scrollTo);
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('zapamatujPozici', () => {
  it('uklada a prepisuje pozici zaznamu', () => {
    const pamet = new Map<string, number>();
    zapamatujPozici(pamet, 'a', 100);
    zapamatujPozici(pamet, 'a', 250);
    expect(pamet.get('a')).toBe(250);
    expect(pamet.size).toBe(1);
  });

  it('nad limit zahodi nejdele nenavstiveny zaznam', () => {
    const pamet = new Map<string, number>();
    zapamatujPozici(pamet, 'a', 1, 3);
    zapamatujPozici(pamet, 'b', 2, 3);
    zapamatujPozici(pamet, 'c', 3, 3);
    zapamatujPozici(pamet, 'a', 10, 3); // a je zase nejcerstvejsi
    zapamatujPozici(pamet, 'd', 4, 3);
    expect([...pamet.keys()]).toEqual(['c', 'a', 'd']);
    expect(pamet.get('a')).toBe(10);
  });

  it('vychozi limit drzi pamet omezenou', () => {
    const pamet = new Map<string, number>();
    for (let i = 0; i < LIMIT_POZIC + 20; i++) zapamatujPozici(pamet, `k${i}`, i);
    expect(pamet.size).toBe(LIMIT_POZIC);
    expect(pamet.has('k0')).toBe(false);
    expect(pamet.get(`k${LIMIT_POZIC + 19}`)).toBe(LIMIT_POZIC + 19);
  });
});

/** Podvrh okna: scrollY se nastavuje rucne, scroll udalost se vyvola rucne. */
function falesneOkno() {
  const posluchaci = new Set<() => void>();
  const volbyPosluchacu: (AddEventListenerOptions | undefined)[] = [];
  const okno = {
    scrollY: 0,
    addEventListener(_typ: 'scroll', posluchac: () => void, volby?: AddEventListenerOptions) {
      posluchaci.add(posluchac);
      volbyPosluchacu.push(volby);
    },
    removeEventListener(_typ: 'scroll', posluchac: () => void) {
      posluchaci.delete(posluchac);
    },
  } satisfies OknoProScroll;
  const odroluj = (y: number) => {
    okno.scrollY = y;
    for (const p of posluchaci) p();
  };
  return { okno, odroluj, posluchaci, volbyPosluchacu };
}

describe('sledujPozici', () => {
  it('uklada scrollY pod aktualni zaznam historie (klic se cte pri kazde udalosti)', () => {
    const { okno, odroluj } = falesneOkno();
    const pamet = new Map<string, number>();
    let klic = 'domu';
    const uklid = sledujPozici(okno, () => klic, pamet);

    odroluj(420);
    klic = 'test'; // navigace — reset nahoru vyvola scroll uz pod novym klicem
    odroluj(0);
    odroluj(180);

    expect(pamet.get('domu')).toBe(420);
    expect(pamet.get('test')).toBe(180);
    uklid();
  });

  it('posluchac je pasivni (nebrzdi scroll) a uklid ho odebere', () => {
    const { okno, odroluj, posluchaci, volbyPosluchacu } = falesneOkno();
    const pamet = new Map<string, number>();
    const uklid = sledujPozici(okno, () => 'a', pamet);
    expect(posluchaci.size).toBe(1);
    expect(volbyPosluchacu[0]).toEqual({ passive: true });

    uklid();
    expect(posluchaci.size).toBe(0);
    odroluj(999);
    expect(pamet.has('a')).toBe(false);
  });

  it('cesta tam a zpet: POP vrati pozici, kterou stranka mela pri odchodu', () => {
    const { okno, odroluj } = falesneOkno();
    const pamet = new Map<string, number>();
    let klic = 'uceni';
    const uklid = sledujPozici(okno, () => klic, pamet);
    const scrollTo = vi.fn((_x: number, y: number) => odroluj(y));

    odroluj(900); // student sjede k lekci dole na Uceni
    klic = 'lekce'; // PUSH na lekci
    srovnejScrollPoNavigaci('PUSH', klic, pamet, scrollTo);
    odroluj(2400); // cte lekci
    klic = 'uceni'; // zpet (POP)
    srovnejScrollPoNavigaci('POP', klic, pamet, scrollTo);

    expect(scrollTo.mock.calls).toEqual([
      [0, 0],
      [0, 900],
    ]);
    expect(pamet.get('lekce')).toBe(2400);
    uklid();
  });
});

describe('nastavRucniObnovu', () => {
  it('prepne na manual a uklid vrati puvodni hodnotu', () => {
    const historie: HistorieProScroll = { scrollRestoration: 'auto' };
    const uklid = nastavRucniObnovu(historie);
    expect(historie.scrollRestoration).toBe('manual');
    uklid();
    expect(historie.scrollRestoration).toBe('auto');
  });

  it('bez podpory scrollRestoration (stara WebView) nic nepridava', () => {
    const historie: HistorieProScroll = {};
    const uklid = nastavRucniObnovu(historie);
    expect('scrollRestoration' in historie).toBe(false);
    uklid();
    expect('scrollRestoration' in historie).toBe(false);
  });
});

/** Podvrh cile udalosti: posluchace podle typu, udalost se vyvola rucne. */
function falesnyCil() {
  const posluchaci = new Map<string, Set<(e: Event) => void>>();
  const cil = {
    addEventListener(typ: string, posluchac: (e: Event) => void) {
      if (!posluchaci.has(typ)) posluchaci.set(typ, new Set());
      posluchaci.get(typ)!.add(posluchac);
    },
    removeEventListener(typ: string, posluchac: (e: Event) => void) {
      posluchaci.get(typ)?.delete(posluchac);
    },
  } satisfies CilUdalostiOdchodu;
  const vyvolej = (typ: string, udalost: object = {}) => {
    for (const p of posluchaci.get(typ) ?? []) p(udalost as Event);
  };
  const pocet = () => [...posluchaci.values()].reduce((n, m) => n + m.size, 0);
  return { cil, vyvolej, pocet };
}

function falesnyDokument() {
  const { cil, vyvolej, pocet } = falesnyCil();
  // Mutovatelny visibilityState; jinak presne tvar DokumentProOdchod.
  const dokument: CilUdalostiOdchodu & { visibilityState: string } = {
    ...cil,
    visibilityState: 'visible',
  };
  const zmenViditelnost = (stav: 'hidden' | 'visible') => {
    dokument.visibilityState = stav;
    vyvolej('visibilitychange');
  };
  return { dokument: dokument satisfies DokumentProOdchod, zmenViditelnost, pocet };
}

describe('vratAutoPriOdchodu', () => {
  it('pagehide → auto (reload/odchod: pozici obnovi prohlizec)', () => {
    const okno = falesnyCil();
    const { dokument } = falesnyDokument();
    const historie: HistorieProScroll = { scrollRestoration: 'manual' };
    const uklid = vratAutoPriOdchodu(okno.cil, dokument, historie);
    okno.vyvolej('pagehide');
    expect(historie.scrollRestoration).toBe('auto');
    uklid();
  });

  it('pageshow z bfcache (persisted) → zpet manual; bez persisted nic', () => {
    const okno = falesnyCil();
    const { dokument } = falesnyDokument();
    const historie: HistorieProScroll = { scrollRestoration: 'manual' };
    const uklid = vratAutoPriOdchodu(okno.cil, dokument, historie);
    okno.vyvolej('pagehide');
    okno.vyvolej('pageshow', { persisted: false });
    expect(historie.scrollRestoration).toBe('auto');
    okno.vyvolej('pageshow', { persisted: true });
    expect(historie.scrollRestoration).toBe('manual');
    uklid();
  });

  it('schovani tabu → auto, zviditelneni → manual (iOS zahozeny tab)', () => {
    const okno = falesnyCil();
    const { dokument, zmenViditelnost } = falesnyDokument();
    const historie: HistorieProScroll = { scrollRestoration: 'manual' };
    const uklid = vratAutoPriOdchodu(okno.cil, dokument, historie);
    zmenViditelnost('hidden');
    expect(historie.scrollRestoration).toBe('auto');
    zmenViditelnost('visible');
    expect(historie.scrollRestoration).toBe('manual');
    uklid();
  });

  it('uklid odebere vsechny posluchace — dalsi udalosti rezim nemeni', () => {
    const okno = falesnyCil();
    const dok = falesnyDokument();
    const historie: HistorieProScroll = { scrollRestoration: 'manual' };
    const uklid = vratAutoPriOdchodu(okno.cil, dok.dokument, historie);
    expect(okno.pocet()).toBe(2);
    expect(dok.pocet()).toBe(1);
    uklid();
    expect(okno.pocet()).toBe(0);
    expect(dok.pocet()).toBe(0);
    okno.vyvolej('pagehide');
    dok.zmenViditelnost('hidden');
    expect(historie.scrollRestoration).toBe('manual');
  });

  it('bez podpory scrollRestoration (stara WebView) nic neprihlasi', () => {
    const okno = falesnyCil();
    const dok = falesnyDokument();
    const historie: HistorieProScroll = {};
    const uklid = vratAutoPriOdchodu(okno.cil, dok.dokument, historie);
    expect(okno.pocet()).toBe(0);
    expect(dok.pocet()).toBe(0);
    uklid();
    expect('scrollRestoration' in historie).toBe(false);
  });

  it('spolu s nastavRucniObnovu: start manual, odchod auto, uklid vrati puvodni', () => {
    const okno = falesnyCil();
    const { dokument } = falesnyDokument();
    const historie: HistorieProScroll = { scrollRestoration: 'auto' };
    const uklidObnovy = nastavRucniObnovu(historie);
    const uklidOdchodu = vratAutoPriOdchodu(okno.cil, dokument, historie);
    expect(historie.scrollRestoration).toBe('manual');
    okno.vyvolej('pagehide');
    expect(historie.scrollRestoration).toBe('auto');
    okno.vyvolej('pageshow', { persisted: true });
    expect(historie.scrollRestoration).toBe('manual');
    uklidOdchodu();
    uklidObnovy();
    expect(historie.scrollRestoration).toBe('auto');
  });
});

describe('ResetScrollu (komponenta)', () => {
  it('nic nevykresluje a uvnitr routeru nepada (bez DOM efekty nebezi)', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/uceni']}>
        <ResetScrollu />
      </MemoryRouter>,
    );
    expect(html).toBe('');
  });
});
