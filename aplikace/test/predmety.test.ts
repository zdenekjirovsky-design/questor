// Testy registru predmetu (src/data/predmety.ts):
// - metadata VSECH ocekavanych predmetu (id, nazev, ikona),
// - registr je robustni vuci chybejicim souborum obsahu (vznikaji paralelne),
// - vsechny PRITOMNE soubory obsahu jsou validni (vadny soubor by loader
//   tise preskocil — test to odhali porovnanim poctu souboru a nactenych dat),
// - unikatnost temaId a id otazek napric VSEMI pritomnymi predmety
//   (postup lekci je klicovany temaId, statistiky otazek sdili prostor id).
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ikonaPredmetu,
  maBundlovanouBanku,
  maBundlovanouVyuku,
  metadataPredmetu,
  nactiBundlovaneBanky,
  nactiBundlovaneVyuky,
  nazevPredmetu,
  PREDMETY,
  seradPredmety,
} from '../src/data/predmety';

const OCEKAVANE_ID = [
  'ekonomika-podnikani',
  'pisemna-komunikace',
  'informatika',
  'cesky-jazyk',
  'anglicky-jazyk',
  'nemecky-jazyk',
  'matematika',
  'dejepis',
  'obcanska-nauka',
  'fyzika',
  'chemie',
  'biologie-ekologie',
  'zbozinalstvi',
  'zaklady-vareni',
];

const SLOZKA_PREDMETU = fileURLToPath(new URL('../src/data/predmety', import.meta.url));

function souboryPredmetu(pripona: string): string[] {
  return readdirSync(SLOZKA_PREDMETU).filter((s) => s.endsWith(pripona));
}

describe('registr predmetu — metadata', () => {
  it('obsahuje vsechny ocekavane predmety s nazvem a ikonou', () => {
    expect(PREDMETY.map((p) => p.id).sort()).toEqual([...OCEKAVANE_ID].sort());
    for (const p of PREDMETY) {
      expect(p.id, `id ${p.id} neni slug`).toMatch(/^[a-z0-9-]+$/);
      expect(p.nazev.length, `predmet ${p.id} nema nazev`).toBeGreaterThan(0);
      expect(p.ikona.length, `predmet ${p.id} nema ikonu`).toBeGreaterThan(0);
    }
  });

  it('id predmetu jsou unikatni', () => {
    expect(new Set(PREDMETY.map((p) => p.id)).size).toBe(PREDMETY.length);
  });

  it('pomucky vraceji metadata i zalohy pro neznamy predmet', () => {
    expect(metadataPredmetu('ekonomika-podnikani')?.nazev).toBe('Ekonomika a podnikání');
    expect(metadataPredmetu('tenhle-neexistuje')).toBeUndefined();
    expect(nazevPredmetu('zbozinalstvi')).toBe('Zbožíznalství');
    expect(nazevPredmetu('tenhle-neexistuje', 'Záloha')).toBe('Záloha');
    expect(nazevPredmetu('tenhle-neexistuje')).toBe('tenhle-neexistuje');
    expect(ikonaPredmetu('matematika')).toBe('📐');
    expect(ikonaPredmetu('tenhle-neexistuje')).toBe('📘');
  });

  it('seradPredmety drzi poradi registru, neznama id az na konec', () => {
    const serazene = seradPredmety(['zbozinalstvi', 'x-cizi', 'ekonomika-podnikani', 'a-cizi']);
    expect(serazene).toEqual(['ekonomika-podnikani', 'zbozinalstvi', 'a-cizi', 'x-cizi']);
  });
});

describe('registr predmetu — bundlovany obsah', () => {
  it('je robustni vuci chybejicimu souboru (predmet bez obsahu se proste nenabidne)', async () => {
    expect(maBundlovanouBanku('tenhle-predmet-nema-soubor')).toBe(false);
    expect(maBundlovanouVyuku('tenhle-predmet-nema-soubor')).toBe(false);
    const banky = await nactiBundlovaneBanky();
    expect(banky.some((b) => b.predmetId === 'tenhle-predmet-nema-soubor')).toBe(false);
  });

  it('ekonomika je presunuta na konvenci predmety/<id>.banka.json', async () => {
    expect(maBundlovanouBanku('ekonomika-podnikani')).toBe(true);
    const banky = await nactiBundlovaneBanky();
    const ekonomika = banky.find((b) => b.predmetId === 'ekonomika-podnikani');
    expect(ekonomika).toBeDefined();
    expect(ekonomika!.otazky.length).toBeGreaterThan(0);
    expect(banky.some((b) => b.predmetId === 'zbozinalstvi')).toBe(true);
  });

  it('vsechny pritomne soubory obsahu jsou validni (zadny se pri nacteni nepreskoci)', async () => {
    const [banky, vyuky] = await Promise.all([nactiBundlovaneBanky(), nactiBundlovaneVyuky()]);
    expect(banky.length, 'nektera *.banka.json neprosla validaci').toBe(
      souboryPredmetu('.banka.json').length,
    );
    expect(vyuky.length, 'nektera *.vyuka.json neprosla validaci').toBe(
      souboryPredmetu('.vyuka.json').length,
    );
  });

  it('kazdy soubor patri predmetu z registru a predmetId sedi s nazvem souboru', async () => {
    const [banky, vyuky] = await Promise.all([nactiBundlovaneBanky(), nactiBundlovaneVyuky()]);
    const znamaId = new Set(PREDMETY.map((p) => p.id));
    for (const banka of banky) {
      expect(znamaId.has(banka.predmetId), `banka ${banka.predmetId} neni v registru`).toBe(true);
      expect(maBundlovanouBanku(banka.predmetId), `predmetId ${banka.predmetId} nesedi s nazvem souboru`).toBe(true);
    }
    for (const vyuka of vyuky) {
      expect(znamaId.has(vyuka.predmetId), `vyuka ${vyuka.predmetId} neni v registru`).toBe(true);
      expect(maBundlovanouVyuku(vyuka.predmetId), `predmetId ${vyuka.predmetId} nesedi s nazvem souboru`).toBe(true);
    }
  });

  it('temaId nekoliduji napric VSEMI pritomnymi predmety (postup lekci je klicovany temaId)', async () => {
    const banky = await nactiBundlovaneBanky();
    const videna = new Map<string, string>();
    for (const banka of banky) {
      for (const tema of banka.temata) {
        expect(
          videna.has(tema.id),
          `temaId ${tema.id} je v predmetech ${videna.get(tema.id)} i ${banka.predmetId}`,
        ).toBe(false);
        videna.set(tema.id, banka.predmetId);
      }
    }
  });

  it('id otazek z bank a mini-kvizu lekci jsou navzajem unikatni napric predmety', async () => {
    const [banky, vyuky] = await Promise.all([nactiBundlovaneBanky(), nactiBundlovaneVyuky()]);
    const videnaId = new Map<string, string>();
    for (const banka of banky) {
      for (const otazka of banka.otazky) {
        expect(
          videnaId.has(otazka.id),
          `id ${otazka.id} je v ${videnaId.get(otazka.id)} i ${banka.predmetId}`,
        ).toBe(false);
        videnaId.set(otazka.id, banka.predmetId);
      }
    }
    for (const vyuka of vyuky) {
      for (const lekce of vyuka.lekce) {
        for (const blok of lekce.bloky) {
          if (blok.typ !== 'mini-kviz') continue;
          expect(
            videnaId.has(blok.otazka.id),
            `mini-kviz ${blok.otazka.id} (${vyuka.predmetId}) koliduje s ${videnaId.get(blok.otazka.id)}`,
          ).toBe(false);
          videnaId.set(blok.otazka.id, `vyuka ${vyuka.predmetId}`);
        }
      }
    }
  });

  it('lekce vyuky se vazou na temata banky sveho predmetu (kdyz banka existuje)', async () => {
    const [banky, vyuky] = await Promise.all([nactiBundlovaneBanky(), nactiBundlovaneVyuky()]);
    const bankyMapa = new Map(banky.map((b) => [b.predmetId, b]));
    for (const vyuka of vyuky) {
      const banka = bankyMapa.get(vyuka.predmetId);
      if (!banka) continue; // vyuka bez banky je povolena (obsah vznika paralelne)
      const temataBanky = new Set(banka.temata.map((t) => t.id));
      for (const lekce of vyuka.lekce) {
        expect(
          temataBanky.has(lekce.temaId),
          `lekce ${lekce.temaId} (${vyuka.predmetId}) nema tema v bance`,
        ).toBe(true);
      }
    }
  });
});
