// Testy mobilni struktury vyukovych bloku a widgetu (server-side render bez
// DOM): prvky, o ktere se opiraji mobilni pravidla CSS (rezervy vysky,
// nazvy polozek v kartovem srovnavaci, staticky popis bodu, lupa schematu).
// Samotny vzhled (media query) se overuje v prohlizeci.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import KartickyBlok from '../bloky/KartickyBlok';
import ObrazekBlok from '../bloky/ObrazekBlok';
import CasovaOsa from './CasovaOsa';
import Popisovacka from './Popisovacka';
import PrubehProcesu from './PrubehProcesu';
import Srovnavac from './Srovnavac';
import Tridicka from './Tridicka';

const nic = () => {};

function pocet(html: string, hledane: string): number {
  return html.split(hledane).length - 1;
}

describe('mobilni struktura widgetu', () => {
  it('Srovnavac: kazda bunka hodnoty nese nazev sve polozky (kartovy layout)', () => {
    const html = renderToStaticMarkup(
      <Srovnavac
        parametry={{
          polozky: [
            { nazev: 'Monopol', vlastnosti: { cena: 'urcuje sam', pocet: '1' } },
            { nazev: 'Oligopol', vlastnosti: { cena: 'dohoda', pocet: 'nekolik' } },
            { nazev: 'Dokonala konkurence', vlastnosti: { cena: 'trh', pocet: 'mnoho' } },
          ],
        }}
        onSplneno={nic}
      />,
    );
    expect(pocet(html, 'srovnavac__hodnota-nazev')).toBe(6); // 2 vlastnosti × 3 polozky
    expect(html).toContain('>Dokonala konkurence</span>');
  });

  it('PrubehProcesu: neviditelne rezervy vysky pro vsechny neaktivni kroky', () => {
    const html = renderToStaticMarkup(
      <PrubehProcesu
        parametry={{
          zadani: 'Reklamace',
          kroky: [
            { nazev: 'Podani', popis: 'Kratky popis.' },
            { nazev: 'Posouzeni', popis: 'Mnohem delsi popis kroku, ktery se na telefonu zalomi do vice radku.' },
            { nazev: 'Vyrizeni', popis: 'Konec.' },
          ],
        }}
        onSplneno={nic}
      />,
    );
    expect(pocet(html, 'prubeh__detail--rezerva')).toBe(2);
    expect(pocet(html, 'aria-hidden="true"><div class="prubeh__detail-hlavicka"')).toBe(2);
  });

  it('CasovaOsa: rezervy vysky detailu pro ostatni udalosti', () => {
    const html = renderToStaticMarkup(
      <CasovaOsa
        parametry={{
          udalosti: [
            { rok: 1348, nazev: 'Univerzita', popis: 'Zalozeni.' },
            { rok: 1415, nazev: 'Hus', popis: 'Upaleni.' },
          ],
        }}
        onSplneno={nic}
      />,
    );
    expect(pocet(html, 'casova-osa__detail--rezerva')).toBe(1);
  });

  it('KartickyBlok: rezervy obou stran kazde karty (vyska = nejdelsi strana)', () => {
    const html = renderToStaticMarkup(
      <KartickyBlok
        blok={{
          typ: 'karticky',
          polozky: [
            { predni: 'Jakost', zadni: 'Souhrn vlastnosti vyrobku.' },
            { predni: 'Norma', zadni: 'Dokument s pravidly.' },
          ],
        }}
      />,
    );
    expect(pocet(html, 'karticka__rezerva')).toBe(4);
  });

  it('Popisovacka: staticky popis bodu pod obrazkem drzi misto uz pred prvnim tuknutim', () => {
    const html = renderToStaticMarkup(
      <Popisovacka
        parametry={{
          svg: "<svg viewBox='0 0 560 240' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='10' height='10'/></svg>",
          body: [
            { x: 335, y: 148, nazev: 'Patka', popis: 'Zesileni u rukojeti.' },
            { x: 359, y: 116, nazev: 'Krcek', popis: 'Prechod do rukojeti.' },
          ],
        }}
        onSplneno={nic}
      />,
    );
    expect(html).toContain('popisovacka__detail');
    expect(html).toContain('popisovacka__detail-prazdny');
  });

  it('Tridicka: bez vybraneho stitku zadny mobilni panel kosu', () => {
    const html = renderToStaticMarkup(
      <Tridicka
        parametry={{
          zadani: 'Roztrid',
          kategorie: [
            { id: 'a', nazev: 'Lyrika' },
            { id: 'b', nazev: 'Epika' },
          ],
          polozky: [
            { text: 'oda', kategorieId: 'a' },
            { text: 'bajka', kategorieId: 'b' },
          ],
        }}
        onSplneno={nic}
      />,
    );
    expect(html).not.toContain('tridicka__panel');
  });
});

describe('ObrazekBlok — lupa jen u sirokych schemat', () => {
  // Bez DOM se platno nemeri (ResizeObserver v efektu) — prvni render lupu
  // ukaze; skryti tam, kde se zvetseni vejde do platna, testuje
  // jeZvetseniZbytecne v lekceLogika.test.ts.
  it('siroke schema: tlacitko Zvetsit a sirka zvetseni podle viewBoxu', () => {
    const html = renderToStaticMarkup(
      <ObrazekBlok
        blok={{
          typ: 'obrazek',
          svg: "<svg viewBox='0 0 640 375' xmlns='http://www.w3.org/2000/svg'><text x='10' y='20' font-size='10'>A</text></svg>",
          popisek: 'Schema',
        }}
      />,
    );
    expect(html).toContain('vyuka-obrazek__lupa');
    expect(html).toContain('--obrazek-sirka:576px');
  });

  it('svisle schema: bez lupy', () => {
    const html = renderToStaticMarkup(
      <ObrazekBlok
        blok={{
          typ: 'obrazek',
          svg: "<svg viewBox='0 0 470 640' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='10' height='10'/></svg>",
          popisek: 'Schema',
        }}
      />,
    );
    expect(html).not.toContain('vyuka-obrazek__lupa');
  });
});
