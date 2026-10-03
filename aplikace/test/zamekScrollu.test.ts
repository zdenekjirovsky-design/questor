// Testy zamku scrollu stranky pod celoobrazovkovymi modaly
// (src/komponenty/zamekScrollu.ts): pocitani referenci (vic modalu naraz),
// obnoveni puvodnich inline stylu po poslednim uvolneni, idempotentni
// uvolneni (dvoji volani nesmi pustit cizi zamek) a fail-safe bez DOM.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pocetAktivnichZamku, zamkniScroll } from '../src/komponenty/zamekScrollu';

interface FalesnyStyl {
  overflow: string;
  overscrollBehavior: string;
}

/** Podvrhne document s <html> a vrati jeho inline styl. */
function podvrhniDokument(puvodni: Partial<FalesnyStyl> = {}): FalesnyStyl {
  const styl: FalesnyStyl = { overflow: '', overscrollBehavior: '', ...puvodni };
  vi.stubGlobal('document', { documentElement: { style: styl } });
  return styl;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Pocitadlo zije v modulu — kazdy test musi sve zamky uvolnit.
  expect(pocetAktivnichZamku()).toBe(0);
});

describe('zamkniScroll', () => {
  it('zamkne scroll i pretekani a po uvolneni vrati puvodni inline styly', () => {
    const styl = podvrhniDokument({ overflow: 'auto', overscrollBehavior: 'contain' });

    const uvolni = zamkniScroll();
    expect(styl.overflow).toBe('hidden');
    expect(styl.overscrollBehavior).toBe('none');
    expect(pocetAktivnichZamku()).toBe(1);

    uvolni();
    expect(styl.overflow).toBe('auto');
    expect(styl.overscrollBehavior).toBe('contain');
    expect(pocetAktivnichZamku()).toBe(0);
  });

  it('bez puvodnich inline stylu je po uvolneni zase vrati na prazdne (plati CSS)', () => {
    const styl = podvrhniDokument();
    const uvolni = zamkniScroll();
    uvolni();
    expect(styl).toEqual({ overflow: '', overscrollBehavior: '' });
  });

  it('pocita reference: zamek drzi, dokud se neuvolni posledni modal', () => {
    const styl = podvrhniDokument({ overflow: 'visible' });

    const vyprava = zamkniScroll();
    const truhla = zamkniScroll(); // truhla nad vypravou
    expect(pocetAktivnichZamku()).toBe(2);

    vyprava(); // poradi uvolneni nehraje roli
    expect(styl.overflow).toBe('hidden');
    expect(styl.overscrollBehavior).toBe('none');
    expect(pocetAktivnichZamku()).toBe(1);

    truhla();
    expect(styl.overflow).toBe('visible');
    expect(styl.overscrollBehavior).toBe('');
    expect(pocetAktivnichZamku()).toBe(0);
  });

  it('puvodni styly bere z PRVNIHO zamku — druhy zamek nesmi ulozit „hidden"', () => {
    const styl = podvrhniDokument({ overflow: 'scroll' });
    const prvni = zamkniScroll();
    const druhy = zamkniScroll(); // vidi uz overflow: hidden
    druhy();
    prvni();
    expect(styl.overflow).toBe('scroll');
  });

  it('uvolneni je idempotentni — dvoji volani neuvolni cizi zamek', () => {
    const styl = podvrhniDokument();
    const a = zamkniScroll();
    const b = zamkniScroll();

    a();
    a(); // napr. cleanup efektu + rucni zavreni
    expect(pocetAktivnichZamku()).toBe(1);
    expect(styl.overflow).toBe('hidden');

    b();
    expect(pocetAktivnichZamku()).toBe(0);
    expect(styl.overflow).toBe('');

    b(); // ani po uplnem uvolneni nejde pocitadlo pod nulu
    expect(pocetAktivnichZamku()).toBe(0);
  });

  it('po uplnem uvolneni se dalsi zamek chova jako prvni (znovu ulozi puvodni styl)', () => {
    const styl = podvrhniDokument({ overflow: 'auto' });
    zamkniScroll()();
    styl.overflow = 'clip'; // mezitim jiny stav stranky
    const uvolni = zamkniScroll();
    expect(styl.overflow).toBe('hidden');
    uvolni();
    expect(styl.overflow).toBe('clip');
  });

  it('bez document (testy, SSR) nic nedela a vrati neskodne uvolneni', () => {
    // Node prostredi vitestu document nema.
    expect(typeof document).toBe('undefined');
    const uvolni = zamkniScroll();
    expect(pocetAktivnichZamku()).toBe(0);
    expect(() => uvolni()).not.toThrow();
    expect(pocetAktivnichZamku()).toBe(0);
  });
});
