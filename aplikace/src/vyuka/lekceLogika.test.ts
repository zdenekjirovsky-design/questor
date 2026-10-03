// Testy cistych pomucek vyukove casti (posun v lekci, klice bloku,
// doporuceni „pokracuj tady", lupa schematu).
import { describe, expect, it } from 'vitest';
import type { Lekce, VyukovyBlok } from '@questor/sdilene';
import {
  jeZvetseniZbytecne,
  klicBloku,
  kontextDoporuceni,
  pripnuteVKontextu,
  stejnyObsahLekce,
  vyberDoporuceni,
  zarovnaniBloku,
} from './lekceLogika';

describe('zarovnaniBloku', () => {
  it('mobil vzdy zarovna zacatek bloku pod listu', () => {
    expect(zarovnaniBloku({ mobil: true, vyskaBloku: 120, vyskaOkna: 700, vyskaListy: 120 })).toBe('start');
    expect(zarovnaniBloku({ mobil: true, vyskaBloku: 1200, vyskaOkna: 700, vyskaListy: 120 })).toBe('start');
  });

  it('desktop drzi stred, dokud se blok vejde pod listu', () => {
    expect(zarovnaniBloku({ mobil: false, vyskaBloku: 400, vyskaOkna: 800, vyskaListy: 96 })).toBe('center');
    expect(zarovnaniBloku({ mobil: false, vyskaBloku: 704, vyskaOkna: 800, vyskaListy: 96 })).toBe('center');
  });

  it('desktop: blok vyssi nez misto pod listou jde na zacatek (nadpis nezajede pod listu)', () => {
    expect(zarovnaniBloku({ mobil: false, vyskaBloku: 705, vyskaOkna: 800, vyskaListy: 96 })).toBe('start');
  });
});

const TEXT_A: VyukovyBlok = { typ: 'text', obsah: 'Prvni odstavec.' };
const TEXT_B: VyukovyBlok = { typ: 'text', obsah: 'Jiny odstavec.' };

describe('klicBloku', () => {
  it('je stabilni pro stejny obsah a index', () => {
    expect(klicBloku(TEXT_A, 2)).toBe(klicBloku({ ...TEXT_A }, 2));
  });

  it('meni se se zmenou obsahu i indexu (zmeneny blok se namontuje znovu)', () => {
    expect(klicBloku(TEXT_A, 2)).not.toBe(klicBloku(TEXT_B, 2));
    expect(klicBloku(TEXT_A, 2)).not.toBe(klicBloku(TEXT_A, 3));
  });
});

describe('stejnyObsahLekce', () => {
  const lekce: Lekce = { temaId: 't', nazev: 'Lekce', poradi: 0, bloky: [TEXT_A] };

  it('nova instance se stejnym obsahem = stejna lekce (zadna nabidka nove verze)', () => {
    expect(stejnyObsahLekce(lekce, JSON.parse(JSON.stringify(lekce)) as Lekce)).toBe(true);
  });

  it('pridany blok = jina lekce', () => {
    expect(stejnyObsahLekce(lekce, { ...lekce, bloky: [TEXT_A, TEXT_B] })).toBe(false);
  });
});

describe('vyberDoporuceni', () => {
  const l = (temaId: string, zacata: boolean, hotovo: boolean) => ({ lekce: { temaId }, zacata, hotovo });

  it('bez pripnuti: prvni rozdelana, jinak prvni nezacata, jinak nic', () => {
    expect(vyberDoporuceni([l('a', false, false), l('b', true, false)], null)?.lekce.temaId).toBe('b');
    expect(vyberDoporuceni([l('a', true, true), l('b', false, false)], null)?.lekce.temaId).toBe('b');
    expect(vyberDoporuceni([l('a', true, true)], null)).toBeNull();
  });

  it('pripnute doporuceni plati, i kdyz pull postupu udela rozdelanou jinou lekci', () => {
    const poPullu = [l('a', false, false), l('b', true, false)];
    expect(vyberDoporuceni(poPullu, 'a')?.lekce.temaId).toBe('a');
  });

  it('pripnuta lekce, ktera je hotova nebo zmizela, uz neplati', () => {
    expect(vyberDoporuceni([l('a', true, true), l('b', false, false)], 'a')?.lekce.temaId).toBe('b');
    expect(vyberDoporuceni([l('b', false, false)], 'x')?.lekce.temaId).toBe('b');
  });
});

describe('pripnuti doporuceni a kontext (profil + aktivni banka)', () => {
  const l = (temaId: string, zacata: boolean, hotovo: boolean) => ({ lekce: { temaId }, zacata, hotovo });
  const vCestine = kontextDoporuceni('p1', 'cestina');
  const pripnuti = { kontext: vCestine, temaId: 'cj-1' };

  it('stejny kontext: pripnuti plati i po pozdnim pullu postupu', () => {
    expect(pripnuteVKontextu(pripnuti, kontextDoporuceni('p1', 'cestina'))).toBe('cj-1');
    // pull postupu: jinde vznikla rozdelana lekce, karta zustava
    const poPullu = [l('cj-1', false, false), l('zb-1', true, false)];
    expect(vyberDoporuceni(poPullu, pripnuteVKontextu(pripnuti, vCestine))?.lekce.temaId).toBe('cj-1');
  });

  it('prepnuti aktivni banky pripnuti rusi — doporuceni miri do nove aktivni banky', () => {
    const veZbozi = kontextDoporuceni('p1', 'zbozi');
    expect(pripnuteVKontextu(pripnuti, veZbozi)).toBeNull();
    // aktivni banka je v seznamu prvni
    const poPrepnuti = [l('zb-1', true, false), l('cj-1', true, false)];
    expect(vyberDoporuceni(poPrepnuti, pripnuteVKontextu(pripnuti, veZbozi))?.lekce.temaId).toBe('zb-1');
  });

  it('prepnuti profilu pripnuti rusi', () => {
    expect(pripnuteVKontextu(pripnuti, kontextDoporuceni('p2', 'cestina'))).toBeNull();
  });

  it('bez profilu / banky je kontext stabilni (zadne nekonecne prepinani)', () => {
    expect(kontextDoporuceni(undefined, null)).toBe(kontextDoporuceni(null, null));
    expect(kontextDoporuceni('p1', null)).not.toBe(kontextDoporuceni('p1', 'cestina'));
  });
});

describe('jeZvetseniZbytecne (lupa schematu)', () => {
  it('telefon na vysku: zvetseni pridava (lupa zustava)', () => {
    expect(jeZvetseniZbytecne(576, 270)).toBe(false);
  });

  it('telefon na sirku / maly tablet: zvetsena sirka se vejde do platna (lupa pryc)', () => {
    expect(jeZvetseniZbytecne(576, 594)).toBe(true);
    expect(jeZvetseniZbytecne(648, 594)).toBe(true); // o mene nez 15 % sirsi = nic znatelneho
  });

  it('zvetseni o vic nez 15 % lupu necha', () => {
    expect(jeZvetseniZbytecne(648, 520)).toBe(false);
  });

  it('neznama sirka platna (0) lupu necha', () => {
    expect(jeZvetseniZbytecne(576, 0)).toBe(false);
    expect(jeZvetseniZbytecne(576, -4)).toBe(false);
  });
});
