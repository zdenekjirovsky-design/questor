// Testy ingestu: načtení .md fixture a členění textu na kapitoly.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MAX_DELKA_KAPITOLY, nactiText, rozdelNaKapitoly } from '../src/ingest';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'uceni.md');

describe('nactiText', () => {
  it('načte .md soubor jako text', async () => {
    const text = await nactiText(FIXTURE);
    expect(text).toContain('Potřeba je pociťovaný nedostatek');
    expect(text).toContain('## Trh a tržní mechanismus');
  });

  it('odmítne nepodporovanou příponu se srozumitelnou chybou', async () => {
    await expect(nactiText('/neexistuje/ucivo.xlsx')).rejects.toThrow('Nepodporovaná přípona');
  });
});

describe('rozdelNaKapitoly', () => {
  it('rozdělí fixture podle nadpisů na kapitoly se správnými názvy', async () => {
    const kapitoly = rozdelNaKapitoly(await nactiText(FIXTURE));
    const nadpisy = kapitoly.map((k) => k.nadpis);
    expect(nadpisy).toContain('Potřeby a statky');
    expect(nadpisy).toContain('Trh a tržní mechanismus');
    expect(nadpisy).toContain('Podnikání a právní formy');
    for (const kapitola of kapitoly) {
      expect(kapitola.text.length).toBeLessThanOrEqual(MAX_DELKA_KAPITOLY);
    }
  });

  it('dlouhou sekci rozdělí po odstavcích na části do limitu', () => {
    const odstavec = 'Toto je věta o ekonomice, která se opakuje. '.repeat(20).trim();
    const text = `## Dlouhé téma\n\n${Array.from({ length: 8 }, () => odstavec).join('\n\n')}`;
    const kapitoly = rozdelNaKapitoly(text, 2000);
    expect(kapitoly.length).toBeGreaterThan(1);
    expect(kapitoly[0].nadpis).toBe('Dlouhé téma');
    expect(kapitoly[1].nadpis).toBe('Dlouhé téma (část 2)');
    for (const kapitola of kapitoly) {
      expect(kapitola.text.length).toBeLessThanOrEqual(2000);
      expect(kapitola.text.length).toBeGreaterThan(0);
    }
  });

  it('text bez nadpisů dostane odvozený nadpis z prvního řádku', () => {
    const kapitoly = rozdelNaKapitoly('Podnikání je soustavná činnost.\n\nDalší odstavec textu.');
    expect(kapitoly).toHaveLength(1);
    expect(kapitoly[0].nadpis).toBe('Podnikání je soustavná činnost.');
    expect(kapitoly[0].text).toContain('Další odstavec');
  });

  it('velmi dlouhý odstavec bez hranic vět rozseká po znacích', () => {
    const text = `## Extrém\n${'x'.repeat(7000)}`;
    const kapitoly = rozdelNaKapitoly(text, 3000);
    expect(kapitoly.length).toBeGreaterThanOrEqual(3);
    for (const kapitola of kapitoly) {
      expect(kapitola.text.length).toBeLessThanOrEqual(3000);
    }
  });

  it('prázdný text vrátí prázdné pole', () => {
    expect(rozdelNaKapitoly('')).toEqual([]);
    expect(rozdelNaKapitoly('\n\n  \n')).toEqual([]);
  });
});
