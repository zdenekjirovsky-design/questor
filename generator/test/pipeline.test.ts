// Testy pipeline: celá cesta učivo → mock poskytovatel → banka, která projde
// validujBanku; plus pomocné funkce (id témat, kontext, sestavení otázek).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validujBanku, vytvorIdOtazky } from '@questor/sdilene';
import { beforeAll, describe, expect, it } from 'vitest';
import { nactiText, rozdelNaKapitoly, type Kapitola } from '../src/ingest';
import {
  PASMA,
  sestavOtazky,
  sestavTemata,
  vyberKontextProTema,
  vygenerujBanku,
  vytvorIdTematu,
} from '../src/pipeline';
import { vytvorPoskytovateleMock } from '../src/poskytovatele/mock';
import { dogenerujOtazky } from '../src/index';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'uceni.md');

let kapitoly: Kapitola[];

beforeAll(async () => {
  kapitoly = rozdelNaKapitoly(await nactiText(FIXTURE));
});

describe('vytvorIdTematu', () => {
  it('vyrobí slug bez diakritiky', () => {
    expect(vytvorIdTematu('Trh a tržní mechanismus')).toBe('trh-a-trzni-mechanismus');
    expect(vytvorIdTematu('Potřeby, statky & služby!')).toBe('potreby-statky-sluzby');
  });

  it('sestavTemata řeší kolize id a čísluje pořadí', () => {
    const temata = sestavTemata(['Trh', 'Trh', 'Podnikání']);
    expect(temata.map((t) => t.id)).toEqual(['trh', 'trh-2', 'podnikani']);
    expect(temata.map((t) => t.poradi)).toEqual([0, 1, 2]);
  });
});

describe('vyberKontextProTema', () => {
  it('upřednostní kapitolu odpovídající tématu', () => {
    const kontext = vyberKontextProTema(kapitoly, 'Trh a tržní mechanismus');
    expect(kontext).toContain('Tržní mechanismus');
  });

  it('bez shody vrátí učivo po pořadí', () => {
    const kontext = vyberKontextProTema(kapitoly, 'Xyz Qwrt');
    expect(kontext.length).toBeGreaterThan(0);
    expect(kontext).toContain('Potřeba je pociťovaný nedostatek');
  });
});

describe('sestavOtazky', () => {
  const tema = { id: 'trh', nazev: 'Trh', poradi: 0 };

  it('doplní id a temaId, srovná obtížnost do pásma a převede zdroj null', () => {
    const { otazky, vyrazeno } = sestavOtazky(
      [
        {
          typ: 'anone',
          obtiznost: 5,
          zadani: 'Je trh místo střetu nabídky a poptávky?',
          vysvetleni: 'Ano, trh je místo, kde se střetává nabídka s poptávkou.',
          zdroj: null,
          spravna: true,
        },
      ],
      tema,
      { min: 1, max: 2 },
    );
    expect(vyrazeno).toBe(0);
    expect(otazky).toHaveLength(1);
    expect(otazky[0].temaId).toBe('trh');
    expect(otazky[0].obtiznost).toBe(2);
    expect(otazky[0].zdroj).toBeUndefined();
    expect(otazky[0].id).toBe(
      vytvorIdOtazky('trh', 'Je trh místo střetu nabídky a poptávky?', 'anone'),
    );
  });

  it('vyřadí otázku s klíčem mimo možnosti', () => {
    const { otazky, vyrazeno } = sestavOtazky(
      [
        {
          typ: 'vyber',
          obtiznost: 1,
          zadani: 'Vadná otázka s klíčem mimo rozsah',
          vysvetleni: 'Klíč ukazuje mimo možnosti, validace ji musí vyřadit.',
          zdroj: null,
          moznosti: ['A', 'B'],
          spravna: 7,
        },
      ],
      tema,
      { min: 1, max: 2 },
    );
    expect(otazky).toHaveLength(0);
    expect(vyrazeno).toBe(1);
  });
});

describe('vygenerujBanku s mock poskytovatelem (end-to-end)', () => {
  it('vytvoří banku, která projde validujBanku, s mixem typů a obtížností', async () => {
    const zpravy: string[] = [];
    const { banka, statistiky } = await vygenerujBanku({
      kapitoly,
      predmetId: 'ekonomika-podnikani',
      nazev: 'Ekonomika a podnikání',
      poskytovatel: vytvorPoskytovateleMock(),
      nyni: new Date('2026-09-04T12:00:00.000Z'),
      log: (z) => zpravy.push(z),
    });

    // validujBanku uvnitř pipeline nespadla; kontrola i explicitně nad JSONem
    expect(() => validujBanku(JSON.parse(JSON.stringify(banka)))).not.toThrow();

    expect(banka.verze).toBe(1);
    expect(banka.predmetId).toBe('ekonomika-podnikani');
    expect(banka.temata.length).toBeGreaterThanOrEqual(3);
    expect(banka.otazky.length).toBeGreaterThan(0);

    const typy = new Set(banka.otazky.map((o) => o.typ));
    expect([...typy].sort()).toEqual(['anone', 'doplneni', 'multi', 'prirazovani', 'vyber']);

    const obtiznosti = new Set(banka.otazky.map((o) => o.obtiznost));
    for (const pasmo of PASMA) {
      expect([...obtiznosti].some((ob) => ob >= pasmo.min && ob <= pasmo.max)).toBe(true);
    }

    const ids = banka.otazky.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);

    expect(statistiky.temat).toBe(banka.temata.length);
    expect(statistiky.davekPreskoceno).toBe(0);
    expect(zpravy.some((z) => z.includes('Krok 4/4'))).toBe(true);
  });

  it('je deterministický a inkrementuje verzi podle předchozí', async () => {
    const spolecne = {
      kapitoly,
      predmetId: 'ekonomika-podnikani',
      nazev: 'Ekonomika a podnikání',
      nyni: new Date('2026-09-04T12:00:00.000Z'),
    };
    const prvni = await vygenerujBanku({ ...spolecne, poskytovatel: vytvorPoskytovateleMock() });
    const druhy = await vygenerujBanku({
      ...spolecne,
      poskytovatel: vytvorPoskytovateleMock(),
      predchoziVerze: prvni.banka.verze,
    });
    expect(druhy.banka.verze).toBe(2);
    expect(druhy.banka.otazky).toEqual(prvni.banka.otazky);
  });
});

describe('dogenerujOtazky', () => {
  it('bez ANTHROPIC_API_KEY vyhodí srozumitelnou chybu', async () => {
    const puvodni = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        dogenerujOtazky({
          nazevPredmetu: 'Ekonomika a podnikání',
          tema: { id: 'trh', nazev: 'Trh', poradi: 0 },
          obtiznost: 3,
          pocet: 3,
        }),
      ).rejects.toThrow('ANTHROPIC_API_KEY');
    } finally {
      if (puvodni !== undefined) process.env.ANTHROPIC_API_KEY = puvodni;
    }
  });
});
