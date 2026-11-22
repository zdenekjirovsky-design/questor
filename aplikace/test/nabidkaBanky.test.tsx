// Nabídka nové banky na Domů (src/hra/nabidkaBankyLogika.ts + NabidkaBanky.tsx):
// kdy se banka nabízí (čistá rozhodovací funkce), skrytí nabídky per profil
// (localStorage s try/catch), registr (Pravopis studentům češtiny) a karta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { BankaOtazek } from '@questor/sdilene';
import {
  bankaKNabidnuti,
  nactiSkryteNabidky,
  skryjNabidku,
} from '../src/hra/nabidkaBankyLogika';
import NabidkaBanky from '../src/hra/NabidkaBanky';
import { metadataPredmetu, PREDMETY, type PredmetMetadata } from '../src/data/predmety';
import { pametoveUloziste, type Uloziste } from '../src/sync/klient';
import { pouzijStav } from '../src/stav/store';

// ---------------------------------------------------------------------------
// Fixtury

const REGISTR: PredmetMetadata[] = [
  { id: 'cesky-jazyk', nazev: 'Český jazyk', ikona: '📚' },
  { id: 'pravopis', nazev: 'Pravopis', ikona: '✍️', nabidnoutK: ['cesky-jazyk'] },
  { id: 'matematika', nazev: 'Matematika', ikona: '📐' },
  { id: 'pocty', nazev: 'Počty', ikona: '🧮', nabidnoutK: ['matematika', 'fyzika'] },
];

const NACTENE = { 'cesky-jazyk': {}, pravopis: {}, matematika: {}, pocty: {} };

function nabidni(prepis: Partial<Parameters<typeof bankaKNabidnuti>[0]> = {}): string | null {
  return (
    bankaKNabidnuti({
      predmetyProfilu: ['cesky-jazyk'],
      nacteneBanky: NACTENE,
      skryte: [],
      registr: REGISTR,
      ...prepis,
    })?.id ?? null
  );
}

const BANKA_PRAVOPIS: BankaOtazek = {
  predmetId: 'pravopis',
  nazev: 'Pravopis — trenažér',
  verze: 1,
  vytvoreno: '2026-11-22',
  temata: [{ id: 't-bl', nazev: 'Vyjmenovaná slova', poradi: 0 }],
  otazky: Array.from({ length: 10 }, (_, i) => ({
    id: `p${i}`,
    temaId: 't-bl',
    obtiznost: 1 as const,
    typ: 'vyber' as const,
    zadani: `b_lina ${i}`,
    moznosti: ['i', 'y'],
    spravna: 1,
    vysvetleni: 'Bylina.',
  })),
};

// ---------------------------------------------------------------------------

describe('bankaKNabidnuti — kdy nabídnout banku', () => {
  it('nabídne banku studentovi banky z nabidnoutK', () => {
    expect(nabidni()).toBe('pravopis');
  });

  it('nenabízí, když profil žádnou z bank v nabidnoutK nestuduje', () => {
    expect(nabidni({ predmetyProfilu: ['dejepis'] })).toBeNull();
    expect(nabidni({ predmetyProfilu: [] })).toBeNull();
  });

  it('nenabízí banku, kterou profil už má', () => {
    expect(nabidni({ predmetyProfilu: ['cesky-jazyk', 'pravopis'] })).toBeNull();
  });

  it('nenabízí banku bez načteného obsahu (nabídka by vedla do prázdna)', () => {
    expect(nabidni({ nacteneBanky: { 'cesky-jazyk': {} } })).toBeNull();
    expect(nabidni({ nacteneBanky: {} })).toBeNull();
  });

  it('nenabízí banku, jejíž nabídku profil skryl', () => {
    expect(nabidni({ skryte: ['pravopis'] })).toBeNull();
    expect(nabidni({ skryte: ['pocty'] })).toBe('pravopis'); // skrytí jiné banky nevadí
  });

  it('stačí studovat JEDNU z bank v nabidnoutK', () => {
    expect(nabidni({ predmetyProfilu: ['matematika'] })).toBe('pocty');
  });

  it('z více kandidátů vybere první podle registru; po skrytí přijde na řadu další', () => {
    const obe = { predmetyProfilu: ['matematika', 'cesky-jazyk'] };
    expect(nabidni(obe)).toBe('pravopis');
    expect(nabidni({ ...obe, skryte: ['pravopis'] })).toBe('pocty');
  });

  it('banky bez nabidnoutK se nenabízejí nikdy', () => {
    expect(nabidni({ predmetyProfilu: ['pravopis'], registr: REGISTR.slice(0, 3) })).toBeNull();
  });

  it('bez předaného registru platí registr aplikace: Pravopis studentům češtiny', () => {
    const vysledek = bankaKNabidnuti({
      predmetyProfilu: ['cesky-jazyk'],
      nacteneBanky: { pravopis: {} },
      skryte: [],
    });
    expect(vysledek?.id).toBe('pravopis');
  });
});

describe('registr — metadata nabídky', () => {
  it('Pravopis je v registru hned za češtinou a nabízí se jejím studentům', () => {
    const idx = PREDMETY.findIndex((p) => p.id === 'pravopis');
    expect(PREDMETY[idx - 1]?.id).toBe('cesky-jazyk');
    expect(metadataPredmetu('pravopis')).toMatchObject({
      nazev: 'Pravopis — trenažér',
      ikona: '✍️',
      nabidnoutK: ['cesky-jazyk'],
    });
  });

  it('každé id v nabidnoutK je banka z registru (překlep by nabídku tiše vypnul)', () => {
    const znama = new Set(PREDMETY.map((p) => p.id));
    for (const p of PREDMETY) {
      for (const id of p.nabidnoutK ?? []) {
        expect(znama.has(id), `${p.id}.nabidnoutK obsahuje neznámé id ${id}`).toBe(true);
        expect(id, `${p.id} se nemůže nabízet sám sobě`).not.toBe(p.id);
      }
    }
  });
});

describe('skrytí nabídky — per profil v úložišti', () => {
  it('skrytí se uloží pro profil a druhého profilu se netýká', () => {
    const uloziste = pametoveUloziste();
    expect(nactiSkryteNabidky('kuba', uloziste)).toEqual([]);
    expect(skryjNabidku('kuba', 'pravopis', uloziste)).toEqual(['pravopis']);
    expect(nactiSkryteNabidky('kuba', uloziste)).toEqual(['pravopis']);
    expect(nactiSkryteNabidky('mama', uloziste)).toEqual([]);
    expect(uloziste.getItem('questor-nabidka-banky:kuba')).toBe('["pravopis"]');
  });

  it('opakované skrytí nic nezdvojí a další banka se přidá', () => {
    const uloziste = pametoveUloziste();
    skryjNabidku('kuba', 'pravopis', uloziste);
    skryjNabidku('kuba', 'pravopis', uloziste);
    expect(skryjNabidku('kuba', 'pocty', uloziste)).toEqual(['pravopis', 'pocty']);
  });

  it('vadná data v úložišti = nic skrytého (nabídka se prostě ukáže)', () => {
    const uloziste = pametoveUloziste();
    uloziste.setItem('questor-nabidka-banky:kuba', '{rozbité');
    expect(nactiSkryteNabidky('kuba', uloziste)).toEqual([]);
    uloziste.setItem('questor-nabidka-banky:kuba', '{"pravopis":true}');
    expect(nactiSkryteNabidky('kuba', uloziste)).toEqual([]);
    uloziste.setItem('questor-nabidka-banky:kuba', '["pravopis", 7, null]');
    expect(nactiSkryteNabidky('kuba', uloziste)).toEqual(['pravopis']);
  });

  it('úložiště, které vyhazuje (zablokované cookies), nic neshodí — skrytí si do zavření stránky pamatuje modul', () => {
    const rozbite: Uloziste = {
      getItem: () => {
        throw new Error('zakázáno');
      },
      setItem: () => {
        throw new Error('zakázáno');
      },
      removeItem: () => {
        throw new Error('zakázáno');
      },
    };
    // Vlastní id profilu: paměť modulu přežívá mezi testy souboru.
    expect(nactiSkryteNabidky('bez-uloziste', rozbite)).toEqual([]);
    expect(skryjNabidku('bez-uloziste', 'pravopis', rozbite)).toEqual(['pravopis']);
    // Zápis selhal, ale skrytí platí dál — karta se po návratu na Domů nevrátí.
    expect(nactiSkryteNabidky('bez-uloziste', rozbite)).toEqual(['pravopis']);
    expect(skryjNabidku('bez-uloziste', 'pocty', rozbite)).toEqual(['pravopis', 'pocty']);
    // Jiného profilu se paměť netýká.
    expect(nactiSkryteNabidky('bez-uloziste-jiny', rozbite)).toEqual([]);

    // Když úložiště zase funguje, spojí se uložené s tím, co drží paměť (bez duplicit).
    const funkcni = pametoveUloziste();
    funkcni.setItem('questor-nabidka-banky:bez-uloziste', '["pravopis","matematika"]');
    expect(nactiSkryteNabidky('bez-uloziste', funkcni)).toEqual(['pravopis', 'matematika', 'pocty']);
  });

  it('úložiště, kam jde jen číst (plná kvóta): dřív uložená skrytí platí a nové se pamatuje', () => {
    const zaklad = pametoveUloziste();
    zaklad.setItem('questor-nabidka-banky:plna-kvota', '["matematika"]');
    const jenCteni: Uloziste = {
      getItem: (klic) => zaklad.getItem(klic),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    expect(skryjNabidku('plna-kvota', 'pravopis', jenCteni)).toEqual(['matematika', 'pravopis']);
    expect(nactiSkryteNabidky('plna-kvota', jenCteni)).toEqual(['matematika', 'pravopis']);
    expect(zaklad.getItem('questor-nabidka-banky:plna-kvota')).toBe('["matematika"]');
  });
});

// ---------------------------------------------------------------------------
// Karta na Domů

describe('karta NabidkaBanky', () => {
  // Zustand na serveru čte počáteční stav store — před vykreslením se do něj
  // propíše aktuální (viz bleskPrubeh.test.tsx).
  const POCATECNI_STAV = { ...pouzijStav.getInitialState() };

  function vykresli(): string {
    Object.assign(pouzijStav.getInitialState(), pouzijStav.getState());
    return renderToStaticMarkup(
      <MemoryRouter>
        <NabidkaBanky />
      </MemoryRouter>,
    );
  }

  function nastavProfil(id: string, predmety: string[]): void {
    pouzijStav.setState({
      profily: [
        { id, jmeno: 'Kuba', barva: '#8b5cf6', predmety, aktivniPredmetId: predmety[0], aktualizovano: '2026-01-01T00:00:00.000Z' },
      ],
      aktivniProfilId: id,
    });
  }

  beforeEach(() => {
    pouzijStav.setState({ banky: { pravopis: BANKA_PRAVOPIS }, vyuky: {} });
  });

  afterEach(() => {
    Object.assign(pouzijStav.getInitialState(), POCATECNI_STAV);
    pouzijStav.setState({ profily: [], aktivniProfilId: null, banky: {}, vyuky: {} });
  });

  it('studentovi češtiny bez Pravopisu nabídne banku s oběma tlačítky', () => {
    nastavProfil('nabidka-1', ['cesky-jazyk']);
    const html = vykresli();
    expect(html).toContain('aria-label="Nabídka nové banky"');
    expect(html).toContain('Nová banka: Pravopis — trenažér');
    expect(html).toContain('Bleskový trénink i/y, 2 minuty denně.');
    expect(html).toContain('>Přidat mezi moje banky</button>');
    expect(html).toContain('>Teď ne</button>');
  });

  it('nic neukáže, když profil banku už má, češtinu nestuduje, nebo obsah není načtený', () => {
    nastavProfil('nabidka-2', ['cesky-jazyk', 'pravopis']);
    expect(vykresli()).toBe('');

    nastavProfil('nabidka-3', ['matematika']);
    expect(vykresli()).toBe('');

    nastavProfil('nabidka-4', ['cesky-jazyk']);
    pouzijStav.setState({ banky: {} });
    expect(vykresli()).toBe('');
  });

  it('bez aktivního profilu nic nevykreslí', () => {
    pouzijStav.setState({ profily: [], aktivniProfilId: null });
    expect(vykresli()).toBe('');
  });

  it('tlačítka karty jsou zapojená: přidání do profilu a skrytí pro profil', () => {
    const zdroj = readFileSync(
      fileURLToPath(new URL('../src/hra/NabidkaBanky.tsx', import.meta.url)),
      'utf8',
    );
    expect(zdroj).toMatch(
      /const pridej = \(\) => \{\s*if \(pridejPredmetProfilu\(nabidka\.id\)\) setPridana\(\{ profilId, predmetId: nabidka\.id \}\);/,
    );
    expect(zdroj).toMatch(
      /const tedNe = \(\) => \{\s*skryjNabidku\(profilId, nabidka\.id\);\s*setSkryto\(\(n\) => n \+ 1\);/,
    );
    expect(zdroj).toMatch(/className="tlacitko tlacitko--primarni" onClick=\{pridej\}/);
    expect(zdroj).toMatch(/title="[^"]*"\s*onClick=\{tedNe\}/);
    // Skrytí se po „Teď ne“ čte znovu (počitadlo je v závislostech).
    expect(zdroj).toMatch(/\[profilId, skryto\]/);
  });

  it('skrytá nabídka se profilu znovu neukáže, jinému profilu ano', () => {
    nastavProfil('nabidka-5', ['cesky-jazyk']);
    expect(vykresli()).toContain('Nová banka');
    skryjNabidku('nabidka-5', 'pravopis');
    expect(vykresli()).toBe('');

    nastavProfil('nabidka-6', ['cesky-jazyk']);
    expect(vykresli()).toContain('Nová banka');
  });
});
