// Integracni testy bundlovanych vzorovych predmetu (src/data/predmety.ts):
// aplikace musi pri startu videt OBA predmety (ekonomika + zbozinalstvi),
// vyuku zbozinalstvi, a id otazek nesmi kolidovat napric bankami a mini-kvizy
// lekci (statistiky otazek sdili jeden prostor id).
import { describe, expect, it } from 'vitest';
import {
  bundlovaneBanky,
  bundlovaneVyuky,
  VZOROVE_PREDMETY,
} from '../src/data/predmety';

describe('bundlovane vzorove predmety', () => {
  it('obsahuji ekonomiku (banka) i zbozinalstvi (banka + vyuka)', () => {
    expect(VZOROVE_PREDMETY['ekonomika-podnikani']?.banka).toBeDefined();
    expect(VZOROVE_PREDMETY['zbozinalstvi']?.banka).toBeDefined();
    expect(VZOROVE_PREDMETY['zbozinalstvi']?.vyuka).toBeDefined();
  });

  it('vyuka zbozinalstvi ma 5 lekci navazanych na temata banky', () => {
    const { banka, vyuka } = VZOROVE_PREDMETY['zbozinalstvi']!;
    expect(vyuka!.lekce).toHaveLength(5);
    const temataBanky = new Set(banka!.temata.map((t) => t.id));
    for (const lekce of vyuka!.lekce) {
      expect(temataBanky.has(lekce.temaId), `lekce ${lekce.temaId} nema tema v bance`).toBe(true);
    }
  });

  it('temaId nekoliduji napric predmety (postup lekci je klicovany temaId)', () => {
    const videna = new Map<string, string>();
    for (const banka of bundlovaneBanky()) {
      for (const tema of banka.temata) {
        expect(videna.has(tema.id), `temaId ${tema.id} je ve dvou predmetech`).toBe(false);
        videna.set(tema.id, banka.predmetId);
      }
    }
  });

  it('id otazek z bank a mini-kvizu lekci jsou navzajem unikatni', () => {
    const videnaId = new Set<string>();
    for (const banka of bundlovaneBanky()) {
      for (const otazka of banka.otazky) {
        expect(videnaId.has(otazka.id), `duplicitni id ${otazka.id}`).toBe(false);
        videnaId.add(otazka.id);
      }
    }
    let miniKvizu = 0;
    for (const vyuka of bundlovaneVyuky()) {
      for (const lekce of vyuka.lekce) {
        for (const blok of lekce.bloky) {
          if (blok.typ !== 'mini-kviz') continue;
          miniKvizu++;
          expect(videnaId.has(blok.otazka.id), `mini-kviz ${blok.otazka.id} koliduje`).toBe(false);
          videnaId.add(blok.otazka.id);
        }
      }
    }
    expect(miniKvizu).toBeGreaterThan(0);
  });
});
