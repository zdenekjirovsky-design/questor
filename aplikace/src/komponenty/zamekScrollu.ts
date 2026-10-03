// Zamek scrollu stranky pod celoobrazovkovymi modaly (mobil). Bez nej na
// konci vnitrniho scrollu modalu gesto „preteka" do stranky pod nim a po
// zavreni modalu je dashboard jinde, nez student skoncil.
// Pocitani referenci: vic modalu naraz (napr. truhla nad vypravou) drzi zamek,
// dokud se nezavre posledni. Zamek se vzdy uvolni i pri unmountu (odchod
// z routy, chyba) — hook vraci uklid z useEffect.
import { useEffect } from 'react';

let pocetZamku = 0;
let puvodniOverflow = '';
let puvodniOverscroll = '';

/** Zamkne scroll dokumentu; vraci funkci, ktera ho (jednou) zase uvolni. */
export function zamkniScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  const html = document.documentElement;
  if (pocetZamku === 0) {
    puvodniOverflow = html.style.overflow;
    puvodniOverscroll = html.style.overscrollBehavior;
    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
  }
  pocetZamku += 1;
  let uvolneno = false;
  return () => {
    if (uvolneno) return;
    uvolneno = true;
    pocetZamku = Math.max(0, pocetZamku - 1);
    if (pocetZamku === 0) {
      html.style.overflow = puvodniOverflow;
      html.style.overscrollBehavior = puvodniOverscroll;
    }
  };
}

/** Drzi zamek scrollu, dokud je `aktivni` true a komponenta je pripojena. */
export function pouzijZamekScrollu(aktivni: boolean): void {
  useEffect(() => {
    if (!aktivni) return;
    return zamkniScroll();
  }, [aktivni]);
}

/** Jen pro testy — stav pocitadla. */
export function pocetAktivnichZamku(): number {
  return pocetZamku;
}
