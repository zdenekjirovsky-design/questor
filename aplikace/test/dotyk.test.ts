// Testy detekce dotykoveho zarizeni (src/vyuka/widgety/dotyk.ts).
// Tridicka podle ni vypina HTML5 drag & drop (na dotyku nefunguje) a jede
// v rezimu klik-klik. Detekce musi byt fail-safe: bez matchMedia nebo pri
// jeho chybe se chova jako desktop (false).
import { describe, expect, it } from 'vitest';
import { jeDotykoveZarizeni, jeHrubyPointer, type MatchMediaFn } from '../src/vyuka/widgety/dotyk';

describe('jeHrubyPointer — detekce (pointer: coarse)', () => {
  it('hruby pointer (dotyk) vraci true', () => {
    const matchMedia: MatchMediaFn = (dotaz) => ({ matches: dotaz === '(pointer: coarse)' });
    expect(jeHrubyPointer(matchMedia)).toBe(true);
  });

  it('jemny pointer (mys) vraci false', () => {
    const matchMedia: MatchMediaFn = () => ({ matches: false });
    expect(jeHrubyPointer(matchMedia)).toBe(false);
  });

  it('pta se presne na (pointer: coarse)', () => {
    const dotazy: string[] = [];
    const matchMedia: MatchMediaFn = (dotaz) => {
      dotazy.push(dotaz);
      return { matches: true };
    };
    jeHrubyPointer(matchMedia);
    expect(dotazy).toEqual(['(pointer: coarse)']);
  });

  it('bez matchMedia (stara WebView, testy) je fail-safe false', () => {
    expect(jeHrubyPointer(undefined)).toBe(false);
    expect(jeHrubyPointer(null)).toBe(false);
  });

  it('vyjimka v matchMedia znamena false, ne pad widgetu', () => {
    const matchMedia: MatchMediaFn = () => {
      throw new Error('matchMedia neni k dispozici');
    };
    expect(jeHrubyPointer(matchMedia)).toBe(false);
  });

  it('nevalidni navratova hodnota (bez matches) znamena false', () => {
    const matchMedia = (() => ({})) as unknown as MatchMediaFn;
    expect(jeHrubyPointer(matchMedia)).toBe(false);
  });
});

describe('jeDotykoveZarizeni — cteni prostredi', () => {
  it('bez window (node testy) vraci false a nepada', () => {
    expect(jeDotykoveZarizeni()).toBe(false);
  });
});
