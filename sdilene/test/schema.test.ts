// Testy validace banky otázek a stabilních id.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validujBanku, vytvorIdOtazky } from '../src/index';
import type { BankaOtazek, Otazka } from '../src/index';

function platnaBanka(): BankaOtazek {
  return {
    predmetId: 'testovaci-predmet',
    nazev: 'Testovací předmět',
    verze: 1,
    vytvoreno: '2026-09-04',
    temata: [{ id: 'tema-a', nazev: 'Téma A', poradi: 1 }],
    otazky: [
      {
        id: 'o-1',
        temaId: 'tema-a',
        obtiznost: 2,
        typ: 'vyber',
        zadani: 'Co je poptávka?',
        moznosti: ['Množství, které chtějí kupující koupit', 'Množství, které nabízejí prodávající'],
        spravna: 0,
        vysvetleni: 'Poptávka je strana kupujících.',
      },
      {
        id: 'o-2',
        temaId: 'tema-a',
        obtiznost: 3,
        typ: 'multi',
        zadani: 'Které z následujících jsou výrobní faktory?',
        moznosti: ['Práce', 'Půda', 'Reklama', 'Kapitál'],
        spravne: [0, 1, 3],
        vysvetleni: 'Výrobní faktory jsou práce, půda a kapitál.',
      },
    ],
  };
}

describe('validujBanku', () => {
  it('přijme platnou banku a vrátí typovaná data', () => {
    const banka = validujBanku(platnaBanka());
    expect(banka.predmetId).toBe('testovaci-predmet');
    expect(banka.otazky).toHaveLength(2);
  });

  it('přijme reálnou demo banku Ekonomika a podnikání', () => {
    const cesta = fileURLToPath(new URL('../../data/banky/ekonomika-podnikani.json', import.meta.url));
    const banka = validujBanku(JSON.parse(readFileSync(cesta, 'utf8')));
    expect(banka.verze).toBeGreaterThanOrEqual(2);
    expect(banka.otazky.length).toBeGreaterThanOrEqual(72);
    expect(banka.temata.length).toBe(9);
  });

  it('odmítne otázku s odkazem na neexistující téma', () => {
    const banka = platnaBanka();
    banka.otazky[0] = { ...banka.otazky[0], temaId: 'neexistuje' } as Otazka;
    expect(() => validujBanku(banka)).toThrow(/neexistující téma/);
  });

  it('odmítne duplicitní id otázek', () => {
    const banka = platnaBanka();
    banka.otazky[1] = { ...banka.otazky[1], id: 'o-1' } as Otazka;
    expect(() => validujBanku(banka)).toThrow(/Duplicitní id/);
  });

  it('odmítne index správné odpovědi mimo možnosti (vyber i multi)', () => {
    const vyber = platnaBanka();
    (vyber.otazky[0] as Extract<Otazka, { typ: 'vyber' }>).spravna = 5;
    expect(() => validujBanku(vyber)).toThrow(/mimo možnosti/);

    const multi = platnaBanka();
    (multi.otazky[1] as Extract<Otazka, { typ: 'multi' }>).spravne = [0, 9];
    expect(() => validujBanku(multi)).toThrow(/mimo možnosti/);
  });

  it('odmítne duplicitní indexy správných odpovědí u multi', () => {
    const banka = platnaBanka();
    (banka.otazky[1] as Extract<Otazka, { typ: 'multi' }>).spravne = [0, 0];
    expect(() => validujBanku(banka)).toThrow(/Duplicitní indexy/);
  });

  it('odmítne nevalidní predmetId a verzi < 1', () => {
    expect(() => validujBanku({ ...platnaBanka(), predmetId: 'Škaredé ID!' })).toThrow(/validací/);
    expect(() => validujBanku({ ...platnaBanka(), verze: 0 })).toThrow(/validací/);
  });

  it('odmítne prázdné a nesmyslné vstupy', () => {
    expect(() => validujBanku(null)).toThrow(/validací/);
    expect(() => validujBanku({})).toThrow(/validací/);
    expect(() => validujBanku({ ...platnaBanka(), otazky: [] })).toThrow(/validací/);
  });
});

describe('vytvorIdOtazky', () => {
  it('je stabilní pro stejný vstup a rozlišuje různé vstupy', () => {
    const a = vytvorIdOtazky('tema-a', 'Co je poptávka?', 'vyber');
    expect(a).toBe(vytvorIdOtazky('tema-a', 'Co je poptávka?', 'vyber'));
    expect(a).toMatch(/^o-[a-z0-9]+$/);
    expect(a).not.toBe(vytvorIdOtazky('tema-b', 'Co je poptávka?', 'vyber'));
    expect(a).not.toBe(vytvorIdOtazky('tema-a', 'Co je nabídka?', 'vyber'));
    expect(a).not.toBe(vytvorIdOtazky('tema-a', 'Co je poptávka?', 'anone'));
  });
});
