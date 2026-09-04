// Testy čisté logiky výukových widgetů (bez DOM, bez Reactu).
import { describe, expect, it } from 'vitest';
import { vytvorNahodu } from '@questor/sdilene';
import {
  extrahujViewBox,
  formatujRok,
  hodnotyVlastnosti,
  hvezdyZaTahy,
  jePar,
  jsouRozdilne,
  posunKroku,
  pozicniProcenta,
  seradUdalosti,
  seznamVlastnosti,
  sloupcePexesa,
  tridickaHotovo,
  vsechnyKrokyNavstiveny,
  vytvorBalicek,
  vytvorTridickaStav,
  zamichej,
  zaradPolozku,
} from './logika';
import { vygenerujKonfety } from './Konfety';

describe('zamichej', () => {
  it('vrati permutaci a nemeni puvodni pole', () => {
    const puvodni = [1, 2, 3, 4, 5, 6, 7, 8];
    const kopie = [...puvodni];
    const vysledek = zamichej(puvodni, vytvorNahodu(42));
    expect(puvodni).toEqual(kopie);
    expect([...vysledek].sort((a, b) => a - b)).toEqual(kopie);
  });

  it('je deterministicke pri stejnem seedu', () => {
    const a = zamichej([1, 2, 3, 4, 5], vytvorNahodu(7));
    const b = zamichej([1, 2, 3, 4, 5], vytvorNahodu(7));
    expect(a).toEqual(b);
  });
});

describe('tridicka', () => {
  const polozky = [
    { text: 'mleko', kategorieId: 'zivocisne' },
    { text: 'jablko', kategorieId: 'rostlinne' },
    { text: 'syr', kategorieId: 'zivocisne' },
  ];

  it('spravne zarazeni presune polozku a nezvysi chyby', () => {
    const { stav, spravne } = zaradPolozku(vytvorTridickaStav(3), 0, 'zivocisne', polozky);
    expect(spravne).toBe(true);
    expect(stav.zbyva).toEqual([1, 2]);
    expect(stav.zarazeno['zivocisne']).toEqual([0]);
    expect(stav.chyby).toBe(0);
  });

  it('spatne zarazeni polozku vrati a pocita chybu', () => {
    const { stav, spravne } = zaradPolozku(vytvorTridickaStav(3), 1, 'zivocisne', polozky);
    expect(spravne).toBe(false);
    expect(stav.zbyva).toEqual([0, 1, 2]);
    expect(stav.zarazeno['zivocisne']).toBeUndefined();
    expect(stav.chyby).toBe(1);
  });

  it('uz zarazenou (nebo neexistujici) polozku ignoruje beze zmeny', () => {
    const prvni = zaradPolozku(vytvorTridickaStav(3), 0, 'zivocisne', polozky).stav;
    const znovu = zaradPolozku(prvni, 0, 'zivocisne', polozky);
    expect(znovu.spravne).toBe(false);
    expect(znovu.stav).toBe(prvni); // identicky objekt — nic se nezmenilo
  });

  it('nemutuje vstupni stav', () => {
    const puvodni = vytvorTridickaStav(3);
    zaradPolozku(puvodni, 0, 'zivocisne', polozky);
    zaradPolozku(puvodni, 1, 'zivocisne', polozky);
    expect(puvodni.zbyva).toEqual([0, 1, 2]);
    expect(puvodni.chyby).toBe(0);
  });

  it('hotovo je az po zarazeni vsech polozek', () => {
    let stav = vytvorTridickaStav(3);
    expect(tridickaHotovo(stav)).toBe(false);
    stav = zaradPolozku(stav, 0, 'zivocisne', polozky).stav;
    stav = zaradPolozku(stav, 1, 'rostlinne', polozky).stav;
    expect(tridickaHotovo(stav)).toBe(false);
    stav = zaradPolozku(stav, 2, 'zivocisne', polozky).stav;
    expect(tridickaHotovo(stav)).toBe(true);
  });

  it('respektuje zadane uvodni poradi zasobniku', () => {
    expect(vytvorTridickaStav(3, [2, 0, 1]).zbyva).toEqual([2, 0, 1]);
  });
});

describe('pexeso', () => {
  const dvojice = [
    { a: 'jakost', b: 'souhrn vlastnosti vyrobku' },
    { a: 'norma', b: 'zavazny predpis' },
    { a: 'atest', b: 'osvedceni o jakosti' },
  ];

  it('balicek ma 2 karty na dvojici a zachova obsah', () => {
    const balicek = vytvorBalicek(dvojice, vytvorNahodu(1));
    expect(balicek).toHaveLength(6);
    for (let i = 0; i < dvojice.length; i++) {
      const karty = balicek.filter((k) => k.parId === i);
      expect(karty).toHaveLength(2);
      expect(karty.map((k) => k.strana).sort()).toEqual(['a', 'b']);
      expect(karty.find((k) => k.strana === 'a')?.text).toBe(dvojice[i].a);
      expect(karty.find((k) => k.strana === 'b')?.text).toBe(dvojice[i].b);
    }
  });

  it('jePar pozna jen protilehle karty stejne dvojice', () => {
    expect(jePar({ parId: 1, strana: 'a', text: 'x' }, { parId: 1, strana: 'b', text: 'y' })).toBe(true);
    expect(jePar({ parId: 1, strana: 'a', text: 'x' }, { parId: 2, strana: 'b', text: 'y' })).toBe(false);
    // stejna strana stejne dvojice neni par (nemuze v balicku nastat, ale logika je striktni)
    expect(jePar({ parId: 1, strana: 'a', text: 'x' }, { parId: 1, strana: 'a', text: 'x' })).toBe(false);
  });

  it('hvezdy: 3 do 1,5x minima, 2 do 2,5x minima, jinak 1', () => {
    expect(hvezdyZaTahy(6, 6)).toBe(3); // perfektni hra
    expect(hvezdyZaTahy(6, 9)).toBe(3); // presne 1,5x
    expect(hvezdyZaTahy(6, 10)).toBe(2);
    expect(hvezdyZaTahy(6, 15)).toBe(2); // presne 2,5x
    expect(hvezdyZaTahy(6, 16)).toBe(1);
    expect(hvezdyZaTahy(2, 3)).toBe(3); // zaokrouhleni nahoru (1,5 * 2 = 3)
  });

  it('sloupce mrizky rostou s poctem karet', () => {
    expect(sloupcePexesa(4)).toBe(3);
    expect(sloupcePexesa(12)).toBe(4);
    expect(sloupcePexesa(16)).toBe(5);
    expect(sloupcePexesa(24)).toBe(6);
  });
});

describe('krokovani (prubeh procesu, casova osa)', () => {
  it('posunKroku se drzi v mezich', () => {
    expect(posunKroku(0, 4, -1)).toBe(0);
    expect(posunKroku(0, 4, 1)).toBe(1);
    expect(posunKroku(3, 4, 1)).toBe(3);
  });

  it('vsechnyKrokyNavstiveny vyzaduje kazdy index', () => {
    expect(vsechnyKrokyNavstiveny(new Set([0, 1, 2]), 3)).toBe(true);
    expect(vsechnyKrokyNavstiveny(new Set([0, 2]), 3)).toBe(false);
    expect(vsechnyKrokyNavstiveny(new Set(), 0)).toBe(true);
  });
});

describe('popisovacka', () => {
  it('extrahuje viewBox vcetne zapornych a desetinnych hodnot', () => {
    expect(extrahujViewBox('<svg viewBox="0 0 200 100"><rect /></svg>')).toEqual({
      minX: 0,
      minY: 0,
      sirka: 200,
      vyska: 100,
    });
    expect(extrahujViewBox("<svg viewBox='-10.5, -5 21 10.5'></svg>")).toEqual({
      minX: -10.5,
      minY: -5,
      sirka: 21,
      vyska: 10.5,
    });
  });

  it('bez viewBoxu spadne na width/height a pak na 0 0 100 100', () => {
    expect(extrahujViewBox('<svg width="300" height="150"></svg>')).toEqual({
      minX: 0,
      minY: 0,
      sirka: 300,
      vyska: 150,
    });
    expect(extrahujViewBox('<svg></svg>')).toEqual({ minX: 0, minY: 0, sirka: 100, vyska: 100 });
  });

  it('neplatny viewBox (nulova sirka) se ignoruje', () => {
    expect(extrahujViewBox('<svg viewBox="0 0 0 100" width="50" height="25"></svg>')).toEqual({
      minX: 0,
      minY: 0,
      sirka: 50,
      vyska: 25,
    });
  });

  it('pozicniProcenta prevadi souradnice bodu na procenta kontejneru', () => {
    const vb = { minX: -10, minY: 0, sirka: 20, vyska: 40 };
    expect(pozicniProcenta({ x: 0, y: 10 }, vb)).toEqual({ levaPct: 50, horniPct: 25 });
    expect(pozicniProcenta({ x: -10, y: 40 }, vb)).toEqual({ levaPct: 0, horniPct: 100 });
  });
});

describe('casova osa', () => {
  it('seradi udalosti podle roku (stabilne podle nazvu pri shode)', () => {
    const serazene = seradUdalosti([
      { rok: 1950, nazev: 'B', popis: 'x' },
      { rok: -300, nazev: 'A', popis: 'x' },
      { rok: 1950, nazev: 'A', popis: 'x' },
    ]);
    expect(serazene.map((u) => `${u.rok}:${u.nazev}`)).toEqual(['-300:A', '1950:A', '1950:B']);
  });

  it('formatuje zaporne roky jako pr. n. l.', () => {
    expect(formatujRok(-300)).toBe('300 př. n. l.');
    expect(formatujRok(1987)).toBe('1987');
  });
});

describe('srovnavac', () => {
  const polozky: { nazev: string; vlastnosti: Record<string, string> }[] = [
    { nazev: 'Sklo', vlastnosti: { hmotnost: 'vysoka', recyklace: 'ano' } },
    { nazev: 'Plast', vlastnosti: { hmotnost: 'nizka', recyklace: 'ano', cena: 'nizka' } },
  ];

  it('seznamVlastnosti sjednoti klice v poradi vyskytu', () => {
    expect(seznamVlastnosti(polozky)).toEqual(['hmotnost', 'recyklace', 'cena']);
  });

  it('hodnotyVlastnosti doplni null za chybejici vlastnost', () => {
    expect(hodnotyVlastnosti(polozky, 'cena')).toEqual([null, 'nizka']);
    expect(hodnotyVlastnosti(polozky, 'hmotnost')).toEqual(['vysoka', 'nizka']);
  });

  it('jsouRozdilne porovnava jen pritomne hodnoty (bez ohledu na velikost pismen)', () => {
    expect(jsouRozdilne(['vysoka', 'nizka'])).toBe(true);
    expect(jsouRozdilne(['Ano', 'ano '])).toBe(false);
    expect(jsouRozdilne([null, 'nizka'])).toBe(false); // jedina pritomna hodnota
    expect(jsouRozdilne([])).toBe(false);
  });
});

describe('konfety', () => {
  it('vygeneruje pozadovany pocet castic v rozumnych mezich', () => {
    const konfety = vygenerujKonfety(30, vytvorNahodu(5));
    expect(konfety).toHaveLength(30);
    for (const k of konfety) {
      expect(Math.abs(k.dx)).toBeLessThanOrEqual(170);
      expect(k.dy).toBeLessThanOrEqual(-40);
      expect(k.dy).toBeGreaterThanOrEqual(-230);
      expect(k.sirka).toBeGreaterThanOrEqual(6);
      expect(k.vyska).toBeGreaterThanOrEqual(8);
      expect(k.barva.startsWith('var(--')).toBe(true);
    }
  });

  it('je deterministicke pri injektovane nahode', () => {
    expect(vygenerujKonfety(8, vytvorNahodu(9))).toEqual(vygenerujKonfety(8, vytvorNahodu(9)));
  });
});
