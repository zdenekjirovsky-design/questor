// Testy režimu --vyuka: celá cesta učivo → mock poskytovatel → výuka, která
// projde validujVyuku; plus převod bloků (sanitizace SVG, mini-kviz s id,
// widgety vč. převodu srovnávače na Record).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validujVyuku, vytvorIdOtazky, type Tema } from '@questor/sdilene';
import { beforeAll, describe, expect, it } from 'vitest';
import { nactiText, rozdelNaKapitoly, type Kapitola } from '../src/ingest';
import type { LlmLekce } from '../src/llm-schema-vyuka';
import { sestavLekci, vygenerujVyuku } from '../src/pipeline-vyuka';
import { vytvorPoskytovateleMock } from '../src/poskytovatele/mock';

const FIXTURE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'uceni.md');

let kapitoly: Kapitola[];

beforeAll(async () => {
  kapitoly = rozdelNaKapitoly(await nactiText(FIXTURE));
});

describe('vygenerujVyuku s mock poskytovatelem (end-to-end)', () => {
  it('vytvoří výuku, která projde validujVyuku, s lekcí na každé téma', async () => {
    const zpravy: string[] = [];
    const { vyuka, statistiky } = await vygenerujVyuku({
      kapitoly,
      predmetId: 'ekonomika-podnikani',
      nazev: 'Ekonomika a podnikání',
      poskytovatel: vytvorPoskytovateleMock(),
      nyni: new Date('2026-09-04T12:00:00.000Z'),
      log: (z) => zpravy.push(z),
    });

    // validujVyuku uvnitř pipeline nespadla; kontrola i explicitně nad JSONem
    expect(() => validujVyuku(JSON.parse(JSON.stringify(vyuka)))).not.toThrow();

    expect(vyuka.verze).toBe(1);
    expect(vyuka.predmetId).toBe('ekonomika-podnikani');
    expect(vyuka.lekce.length).toBe(statistiky.temat);
    expect(statistiky.lekciPreskoceno).toBe(0);
    expect(statistiky.blokuVyrazeno).toBe(0);

    // pořadí lekcí je souvislé od 0 a temaId unikátní
    expect(vyuka.lekce.map((l) => l.poradi)).toEqual(vyuka.lekce.map((_, i) => i));
    expect(new Set(vyuka.lekce.map((l) => l.temaId)).size).toBe(vyuka.lekce.length);

    for (const lekce of vyuka.lekce) {
      const typy = lekce.bloky.map((b) => b.typ);
      for (const povinny of ['text', 'klicove-pojmy', 'obrazek', 'karticky', 'priklad']) {
        expect(typy).toContain(povinny);
      }
      // 2 mini-kvízy s doplněným id a temaId lekce
      const kvizy = lekce.bloky.filter((b) => b.typ === 'mini-kviz');
      expect(kvizy).toHaveLength(2);
      for (const kviz of kvizy) {
        if (kviz.typ !== 'mini-kviz') continue;
        expect(kviz.otazka.temaId).toBe(lekce.temaId);
        expect(kviz.otazka.id).toMatch(/^o-/);
      }
      // widgety: třídička + srovnávač (vlastnosti převedené na Record)
      const widgety = lekce.bloky.filter((b) => b.typ === 'widget');
      expect(widgety.map((w) => (w.typ === 'widget' ? w.widgetId : '')).sort()).toEqual([
        'srovnavac',
        'tridicka',
      ]);
      const srovnavac = widgety.find((w) => w.typ === 'widget' && w.widgetId === 'srovnavac');
      if (srovnavac?.typ === 'widget' && srovnavac.widgetId === 'srovnavac') {
        expect(typeof srovnavac.parametry.polozky[0].vlastnosti).toBe('object');
        expect(Array.isArray(srovnavac.parametry.polozky[0].vlastnosti)).toBe(false);
        expect(Object.keys(srovnavac.parametry.polozky[0].vlastnosti)).toContain('Charakteristika');
      }
      // SVG obrázek přežil sanitizaci
      const obrazek = lekce.bloky.find((b) => b.typ === 'obrazek');
      if (obrazek?.typ === 'obrazek') {
        expect(obrazek.svg).toMatch(/^\s*<svg[\s>]/i);
        expect(obrazek.svg).toContain('currentColor');
      }
    }

    expect(zpravy.some((z) => z.includes('Krok 3/3'))).toBe(true);
  });

  it('je deterministický a inkrementuje verzi podle předchozí', async () => {
    const spolecne = {
      kapitoly,
      predmetId: 'ekonomika-podnikani',
      nazev: 'Ekonomika a podnikání',
      nyni: new Date('2026-09-04T12:00:00.000Z'),
    };
    const prvni = await vygenerujVyuku({ ...spolecne, poskytovatel: vytvorPoskytovateleMock() });
    const druhy = await vygenerujVyuku({
      ...spolecne,
      poskytovatel: vytvorPoskytovateleMock(),
      predchoziVerze: prvni.vyuka.verze,
    });
    expect(druhy.vyuka.verze).toBe(2);
    expect(druhy.vyuka.lekce).toEqual(prvni.vyuka.lekce);
  });
});

describe('sestavLekci — převod bloků a obrana', () => {
  const tema: Tema = { id: 'trh', nazev: 'Trh', poradi: 0 };

  const zakladniText = { typ: 'text', obsah: 'Krátký výklad o trhu.' } as const;

  it('sanitizuje SVG obrázku (script a on* atributy zmizí, blok zůstane)', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [
        zakladniText,
        {
          typ: 'obrazek',
          svg: '<svg viewBox="0 0 10 10" onload="evil()"><script>alert(1)</script><rect x="1" y="1" width="4" height="4" fill="currentColor" /></svg>',
          popisek: 'Schéma',
        },
      ],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 0);
    expect(vyrazeno).toBe(0);
    const obrazek = lekce?.bloky.find((b) => b.typ === 'obrazek');
    expect(obrazek?.typ).toBe('obrazek');
    if (obrazek?.typ === 'obrazek') {
      expect(obrazek.svg).not.toContain('script');
      expect(obrazek.svg).not.toContain('onload');
      expect(obrazek.svg).toContain('<rect');
    }
  });

  it('zahodí obrázek, ze kterého po sanitizaci nezbude SVG', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [
        zakladniText,
        { typ: 'obrazek', svg: '<div>tohle není svg</div>', popisek: 'Nic' },
      ],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 0);
    expect(vyrazeno).toBe(1);
    expect(lekce?.bloky).toHaveLength(1);
  });

  it('mini-kvízu doplní id a temaId a vynechá zdroj null', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [
        {
          typ: 'mini-kviz',
          otazka: {
            typ: 'anone',
            obtiznost: 2,
            zadani: 'Je trh místo střetu nabídky a poptávky?',
            vysvetleni: 'Ano, přesně tak trh funguje.',
            zdroj: null,
            spravna: true,
          },
        },
      ],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 3);
    expect(vyrazeno).toBe(0);
    expect(lekce?.poradi).toBe(3);
    const kviz = lekce?.bloky[0];
    if (kviz?.typ === 'mini-kviz') {
      expect(kviz.otazka.temaId).toBe('trh');
      expect(kviz.otazka.id).toBe(
        vytvorIdOtazky('trh', 'Je trh místo střetu nabídky a poptávky?', 'anone'),
      );
      expect(kviz.otazka.zdroj).toBeUndefined();
    } else {
      expect.unreachable('očekáván blok mini-kviz');
    }
  });

  it('zahodí mini-kvíz s klíčem mimo možnosti, zbytek lekce nechá', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [
        zakladniText,
        {
          typ: 'mini-kviz',
          otazka: {
            typ: 'vyber',
            obtiznost: 1,
            zadani: 'Vadná otázka s klíčem mimo rozsah',
            vysvetleni: 'Klíč ukazuje mimo možnosti.',
            zdroj: null,
            moznosti: ['A', 'B'],
            spravna: 7,
          },
        },
      ],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 0);
    expect(vyrazeno).toBe(1);
    expect(lekce?.bloky).toHaveLength(1);
    expect(lekce?.bloky[0].typ).toBe('text');
  });

  it('zahodí třídičku s položkou odkazující na neexistující kategorii', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [
        zakladniText,
        {
          typ: 'widget-tridicka',
          zadani: 'Roztřiď',
          kategorie: [
            { id: 'a', nazev: 'A' },
            { id: 'b', nazev: 'B' },
          ],
          polozky: [
            { text: 'položka 1', kategorieId: 'a' },
            { text: 'položka 2', kategorieId: 'NEEXISTUJE' },
          ],
        },
      ],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 0);
    expect(vyrazeno).toBe(1);
    expect(lekce?.bloky.map((b) => b.typ)).toEqual(['text']);
  });

  it('převede průběh procesu (ikona null se vynechá) a srovnávač na Record', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [
        {
          typ: 'widget-prubeh-procesu',
          zadani: 'Jak vzniká cena',
          kroky: [
            { nazev: 'Nabídka', popis: 'Prodávající nabízejí.', ikona: null },
            { nazev: 'Poptávka', popis: 'Kupující poptávají.', ikona: '🛒' },
          ],
        },
        {
          typ: 'widget-srovnavac',
          polozky: [
            { nazev: 'Nabídka', vlastnosti: [{ nazev: 'Kdo', hodnota: 'prodávající' }] },
            { nazev: 'Poptávka', vlastnosti: [{ nazev: 'Kdo', hodnota: 'kupující' }] },
          ],
        },
      ],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 0);
    expect(vyrazeno).toBe(0);
    const [proces, srovnavac] = lekce?.bloky ?? [];
    if (proces?.typ === 'widget' && proces.widgetId === 'prubeh-procesu') {
      expect(proces.parametry.kroky[0]).toEqual({ nazev: 'Nabídka', popis: 'Prodávající nabízejí.' });
      expect(proces.parametry.kroky[1].ikona).toBe('🛒');
    } else {
      expect.unreachable('očekáván widget prubeh-procesu');
    }
    if (srovnavac?.typ === 'widget' && srovnavac.widgetId === 'srovnavac') {
      expect(srovnavac.parametry.polozky[0].vlastnosti).toEqual({ Kdo: 'prodávající' });
    } else {
      expect.unreachable('očekáván widget srovnavac');
    }
  });

  it('vrátí lekce null, když nezbude žádný použitelný blok', () => {
    const llm: LlmLekce = {
      nazev: 'Trh',
      bloky: [{ typ: 'obrazek', svg: '<div>nic</div>', popisek: 'Nic' }],
    };
    const { lekce, vyrazeno } = sestavLekci(llm, tema, 0);
    expect(lekce).toBeNull();
    expect(vyrazeno).toBe(1);
  });
});
