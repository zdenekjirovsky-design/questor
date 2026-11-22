// Bleskovky — stránky kolem kola: start (/blesk: filtrace bank a témat,
// předvolby z adresy), výsledek kola (tempo, chyby, opravné kolo) a vstupy
// (Domů, Učit se, konec lekce, rychlý start, statistiky).
// Prostředí je Node bez DOM: čisté výpočty se testují přímo, stránky přes
// renderToStaticMarkup nad stavem store (viz vykresli níže).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type {
  BankaOtazek,
  Obtiznost,
  Otazka,
  OtazkaVyber,
  StatistikaOtazky,
  TestVysledek,
  VyukaPredmetu,
} from '@questor/sdilene';
import {
  bankaDlazdiceBlesku,
  bankaSTematemBlesku,
  bankySBleskovkami,
  platnaTemata,
  pocetDostupnychOtazek,
  prepniTemaVyberu,
  slovyBleskoveOtazky,
  temataProKolo,
  vychoziBankaBlesku,
} from '../src/testy/bleskStart';
import { temataBlesku } from '../src/testy/blesk';
import { inicializujBlesk } from '../src/testy/engine';
import Blesk, { BleskBezBanky } from '../src/stranky/Blesk';
import Vysledek from '../src/stranky/Vysledek';
import Test from '../src/stranky/Test';
import Domu from '../src/stranky/Domu';
import Statistiky from '../src/stranky/Statistiky';
import Uceni from '../src/vyuka/Uceni';
import LekceViewer from '../src/vyuka/LekceViewer';
import { metadataPredmetu } from '../src/data/predmety';

vi.mock('../src/sync/sync', async (puvodni) => ({
  ...(await puvodni<typeof import('../src/sync/sync')>()),
  zaznamenejDokoncenyTest: vi.fn(),
}));

const { pouzijStav } = await import('../src/stav/store');

// ---------------------------------------------------------------------------
// Fixtury

function iy(id: string, temaId: string, prepis: Partial<OtazkaVyber> = {}): OtazkaVyber {
  return {
    id,
    temaId,
    obtiznost: 1,
    typ: 'vyber',
    zadani: `Slovo b_lina ${id}.`,
    moznosti: ['i', 'y'],
    spravna: 1,
    vysvetleni: `Vysvětlení ${id}.`,
    ...prepis,
  };
}

const DLOUHA = (id: string, temaId: string): Otazka => ({
  id,
  temaId,
  obtiznost: 2,
  typ: 'vyber',
  zadani: `Dlouhá otázka ${id}?`,
  moznosti: ['první dlouhá možnost', 'druhá dlouhá možnost', 'třetí', 'čtvrtá'],
  spravna: 0,
  vysvetleni: 'Protože ano.',
});

/** Pravopis: 8 bleskových v t-bl, 4 v t-koncovky, téma t-diktat bez bleskových. */
const PRAVOPIS: BankaOtazek = {
  predmetId: 'pravopis',
  nazev: 'Pravopis — trenažér',
  verze: 1,
  vytvoreno: '2026-11-22',
  temata: [
    { id: 't-bl', nazev: 'Vyjmenovaná slova B a L', poradi: 0 },
    { id: 't-koncovky', nazev: 'Koncovky', poradi: 1 },
    { id: 't-diktat', nazev: 'Diktát bez paniky', poradi: 2 },
  ],
  otazky: [
    ...Array.from({ length: 8 }, (_, i) => iy(`bl${i}`, 't-bl')),
    ...Array.from({ length: 4 }, (_, i) => iy(`ko${i}`, 't-koncovky')),
    DLOUHA('di0', 't-diktat'),
  ],
};

/** Čeština: jen běžné otázky (žádné bleskovky). */
const CESTINA: BankaOtazek = {
  predmetId: 'cesky-jazyk',
  nazev: 'Český jazyk a literatura',
  verze: 1,
  vytvoreno: '2026-11-22',
  temata: [{ id: 'cj-lit', nazev: 'Literatura', poradi: 0 }],
  otazky: Array.from({ length: 6 }, (_, i) => DLOUHA(`cj${i}`, 'cj-lit')),
};

/** Němčina: 10 bleskových (der/die/das). */
const NEMCINA: BankaOtazek = {
  predmetId: 'nemecky-jazyk',
  nazev: 'Německý jazyk',
  verze: 1,
  vytvoreno: '2026-11-22',
  temata: [{ id: 'nj-cleny', nazev: 'Členy', poradi: 0 }],
  otazky: Array.from({ length: 10 }, (_, i) =>
    iy(`nj${i}`, 'nj-cleny', { zadani: `Jaký člen má slovo ${i}?`, moznosti: ['der', 'die', 'das'] }),
  ),
};

const VYUKA_PRAVOPIS: VyukaPredmetu = {
  predmetId: 'pravopis',
  verze: 1,
  vytvoreno: '2026-11-22',
  lekce: [
    { temaId: 't-bl', nazev: 'Vyjmenovaná slova B a L', poradi: 0, bloky: [{ typ: 'text', obsah: 'Trik rodiny.' }] },
    { temaId: 't-koncovky', nazev: 'Koncovky', poradi: 1, bloky: [{ typ: 'text', obsah: 'Tvrdá a měkká parta.' }] },
  ],
};

const VYUKA_CESTINA: VyukaPredmetu = {
  predmetId: 'cesky-jazyk',
  verze: 1,
  vytvoreno: '2026-11-22',
  lekce: [{ temaId: 'cj-lit', nazev: 'Literatura', poradi: 0, bloky: [{ typ: 'text', obsah: 'Úvod.' }] }],
};

function stat(otazkaId: string, box: StatistikaOtazky['box']): StatistikaOtazky {
  return { otazkaId, box, spravneCelkem: 1, spatneCelkem: 0, posledniOdpoved: '2026-11-22T10:00:00.000Z' };
}

function nastavProfil(predmety: string[], aktivniPredmetId: string): void {
  pouzijStav.setState({
    profily: [
      {
        id: 'p-blesk',
        jmeno: 'Kuba',
        barva: '#8b5cf6',
        predmety,
        aktivniPredmetId,
        aktualizovano: '2026-01-01T00:00:00.000Z',
      },
    ],
    aktivniProfilId: 'p-blesk',
  });
}

function odpovedi(spravne: boolean[], temaId = 't-bl'): TestVysledek['odpovedi'] {
  return spravne.map((s, i) => ({
    otazkaId: `bl${i}`,
    temaId,
    obtiznost: 1 as Obtiznost,
    spravne: s,
    casMs: 3000,
  }));
}

function vysledekBlesku(prepis: Partial<TestVysledek> = {}): TestVysledek {
  const ted = new Date().toISOString();
  return {
    id: 'blesk-1795000000000-abc',
    konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 10 },
    zacatek: ted,
    konec: ted,
    odpovedi: odpovedi([true, false, true, false, true, true, true, true]),
    uspesnost: 0.75,
    ziskaneXp: 21,
    nejdelsiCombo: 4,
    ...prepis,
  };
}

/**
 * Zustand při vykreslení na serveru (renderToStaticMarkup) nečte aktuální,
 * ale POČÁTEČNÍ stav store (getServerSnapshot). Před vykreslením se proto
 * aktuální stav propíše do objektu počátečního stavu; po testu se vrací
 * záloha (afterEach).
 */
const POCATECNI_STAV = { ...pouzijStav.getInitialState() };

function vykresli(prvek: ReactElement, cesta = '/'): string {
  Object.assign(pouzijStav.getInitialState(), pouzijStav.getState());
  return renderToStaticMarkup(<MemoryRouter initialEntries={[cesta]}>{prvek}</MemoryRouter>);
}

/** Čipy (banky / témata) startu: [text, aria-pressed]. */
function cipy(html: string): [string, string][] {
  return [...html.matchAll(/<button type="button" class="blesk-cip[^"]*" aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)].map(
    (m) => [m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), m[1]],
  );
}

function nactiZdroj(cesta: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${cesta}`, import.meta.url)), 'utf8');
}

beforeEach(() => {
  pouzijStav.getState().resetujProgres();
  pouzijStav.setState({
    banky: { pravopis: PRAVOPIS, 'cesky-jazyk': CESTINA },
    vyuky: {},
    aktualniTest: null,
    posledniVysledek: null,
    dataProfilu: {},
  });
  nastavProfil(['cesky-jazyk', 'pravopis'], 'cesky-jazyk');
});

afterEach(() => {
  Object.assign(pouzijStav.getInitialState(), POCATECNI_STAV);
  pouzijStav.setState({ profily: [], aktivniProfilId: null, dataProfilu: {}, banky: {}, vyuky: {}, aktualniTest: null });
});

// ---------------------------------------------------------------------------
// Start — čisté výpočty

describe('start bleskovek — filtrace bank', () => {
  const banky = { pravopis: PRAVOPIS, 'cesky-jazyk': CESTINA, 'nemecky-jazyk': NEMCINA };

  it('nabízí jen banky PROFILU s aspoň MIN_BLESKOVYCH bleskovými otázkami, v pořadí registru', () => {
    expect(bankySBleskovkami(banky, ['nemecky-jazyk', 'pravopis', 'cesky-jazyk'])).toEqual(['pravopis', 'nemecky-jazyk']);
    // Banka mimo profil se nenabízí, i když bleskovky má.
    expect(bankySBleskovkami(banky, ['cesky-jazyk', 'pravopis'])).toEqual(['pravopis']);
    // Čeština bleskové otázky nemá.
    expect(bankySBleskovkami(banky, ['cesky-jazyk'])).toEqual([]);
    expect(bankySBleskovkami({}, ['pravopis'])).toEqual([]);
  });

  it('banka s devíti bleskovými otázkami je pod hranicí', () => {
    const mala: BankaOtazek = { ...PRAVOPIS, otazky: PRAVOPIS.otazky.slice(0, 9) };
    expect(bankySBleskovkami({ pravopis: mala }, ['pravopis'])).toEqual([]);
  });

  it('předvolená banka: ruční volba › ?predmet= › banka tématu z ?tema= › aktivní › první', () => {
    const dostupne = ['pravopis', 'nemecky-jazyk'];
    expect(vychoziBankaBlesku({ dostupne, aktivni: 'nemecky-jazyk' })).toBe('nemecky-jazyk');
    expect(vychoziBankaBlesku({ dostupne, aktivni: 'cesky-jazyk' })).toBe('pravopis'); // aktivní bleskovky nemá
    expect(vychoziBankaBlesku({ dostupne, pozadovana: 'nemecky-jazyk', aktivni: 'pravopis' })).toBe('nemecky-jazyk');
    expect(vychoziBankaBlesku({ dostupne, pozadovana: 'matematika', aktivni: 'pravopis' })).toBe('pravopis');
    expect(vychoziBankaBlesku({ dostupne, bankaTematu: 'nemecky-jazyk', aktivni: 'pravopis' })).toBe('nemecky-jazyk');
    expect(
      vychoziBankaBlesku({ dostupne, vybrana: 'pravopis', pozadovana: 'nemecky-jazyk', aktivni: 'nemecky-jazyk' }),
    ).toBe('pravopis');
    expect(vychoziBankaBlesku({ dostupne: [], aktivni: 'pravopis' })).toBeNull();
  });

  it('bankaSTematemBlesku najde banku podle bleskového tématu', () => {
    const temataBank = { pravopis: temataBlesku(PRAVOPIS, {}), 'nemecky-jazyk': temataBlesku(NEMCINA, {}) };
    const dostupne = ['pravopis', 'nemecky-jazyk'];
    expect(bankaSTematemBlesku(dostupne, temataBank, 'nj-cleny')).toBe('nemecky-jazyk');
    expect(bankaSTematemBlesku(dostupne, temataBank, 't-diktat')).toBeNull(); // téma bez bleskových otázek
    expect(bankaSTematemBlesku(dostupne, temataBank, null)).toBeNull();
  });
});

describe('dlaždice na Domů — bankaDlazdiceBlesku', () => {
  const banky = { pravopis: PRAVOPIS, 'cesky-jazyk': CESTINA, 'nemecky-jazyk': NEMCINA };
  const kolo = (predmetId: string, id = 'blesk-1-x') => ({
    id,
    konfigurace: { predmetId, rezim: 'rozcvicka' as const, pocetOtazek: 10 as const },
  });
  const zaklad = { banky, aktivni: 'cesky-jazyk', historie: [], obsahNacten: true };

  it('ukáže se, když bleskovky nabízí KTERÁKOLI banka profilu — i když aktivní je jiná', () => {
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: ['cesky-jazyk', 'pravopis'] })).toBe('pravopis');
    // Bez banky s bleskovkami mezi bankami profilu dlaždice není.
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: ['cesky-jazyk'] })).toBeNull();
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: [] })).toBeNull();
  });

  it('předvolená je aktivní banka, má-li bleskovky; jinak první vhodná v pořadí registru', () => {
    const profil = ['nemecky-jazyk', 'cesky-jazyk', 'pravopis']; // pořadí v profilu nerozhoduje
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: profil, aktivni: 'nemecky-jazyk' })).toBe('nemecky-jazyk');
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: profil, aktivni: 'pravopis' })).toBe('pravopis');
    // Aktivní čeština bleskovky nemá → registr: pravopis je před němčinou.
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: profil, aktivni: 'cesky-jazyk' })).toBe('pravopis');
    expect(bankaDlazdiceBlesku({ ...zaklad, predmetyProfilu: profil, aktivni: null })).toBe('pravopis');
  });

  it('banka pod hranicí MIN_BLESKOVYCH dlaždici nedává', () => {
    const maly = { ...PRAVOPIS, otazky: PRAVOPIS.otazky.slice(0, 9) };
    expect(
      bankaDlazdiceBlesku({ ...zaklad, banky: { pravopis: maly, 'cesky-jazyk': CESTINA }, predmetyProfilu: ['cesky-jazyk', 'pravopis'] }),
    ).toBeNull();
  });

  it('než se banky načtou, napoví historie: kolo bleskovek z dosud nenačtené banky profilu', () => {
    const nacteno = { 'cesky-jazyk': CESTINA }; // pravopis ještě nedorazil
    const profil = ['cesky-jazyk', 'pravopis'];
    const vstup = { banky: nacteno, predmetyProfilu: profil, aktivni: 'cesky-jazyk', obsahNacten: false };
    expect(bankaDlazdiceBlesku({ ...vstup, historie: [] })).toBeNull();
    expect(bankaDlazdiceBlesku({ ...vstup, historie: [kolo('pravopis')] })).toBe('pravopis');
    // Opravné kolo je taky kolo bleskovek.
    expect(bankaDlazdiceBlesku({ ...vstup, historie: [kolo('pravopis', 'blesk-oprava-1-x')] })).toBe('pravopis');
    // Banka mimo profil, běžný test ani test, který se jako bleskovky jen počítá, nenapovídají.
    expect(bankaDlazdiceBlesku({ ...vstup, historie: [kolo('nemecky-jazyk')] })).toBeNull();
    expect(bankaDlazdiceBlesku({ ...vstup, historie: [kolo('pravopis', 'vysledek-1-x')] })).toBeNull();
    expect(bankaDlazdiceBlesku({ ...vstup, historie: [kolo('pravopis', 'blesk-test-1-x')] })).toBeNull();
  });

  it('načtená banka má poslední slovo — historie ji nepřebije', () => {
    const bezBlesku = { ...PRAVOPIS, otazky: [DLOUHA('di0', 't-diktat')] };
    expect(
      bankaDlazdiceBlesku({
        banky: { pravopis: bezBlesku, 'cesky-jazyk': CESTINA },
        predmetyProfilu: ['cesky-jazyk', 'pravopis'],
        aktivni: 'pravopis',
        historie: [kolo('pravopis')],
        obsahNacten: false,
      }),
    ).toBeNull();
  });

  it('po doběhnutí načítání historie nenapovídá (banka, která chybí, by vedla do prázdna)', () => {
    expect(
      bankaDlazdiceBlesku({
        banky: { 'cesky-jazyk': CESTINA },
        predmetyProfilu: ['cesky-jazyk', 'pravopis'],
        aktivni: 'pravopis',
        historie: [kolo('pravopis')],
        obsahNacten: true,
      }),
    ).toBeNull();
  });

  it('během načítání drží předvolbu stabilní: aktivní banka z historie má přednost před už načtenou', () => {
    // Němčina už je načtená, aktivní pravopis teprve dorazí — titulek dlaždice nepřeskočí.
    expect(
      bankaDlazdiceBlesku({
        banky: { 'nemecky-jazyk': NEMCINA },
        predmetyProfilu: ['nemecky-jazyk', 'pravopis'],
        aktivni: 'pravopis',
        historie: [kolo('pravopis')],
        obsahNacten: false,
      }),
    ).toBe('pravopis');
  });
});

describe('start bleskovek — filtrace témat', () => {
  const temata = temataBlesku(PRAVOPIS, {});

  it('čipy témat jsou jen témata s bleskovými otázkami', () => {
    expect(temata.map((t) => [t.id, t.pocet])).toEqual([
      ['t-bl', 8],
      ['t-koncovky', 4],
    ]);
  });

  it('platnaTemata zahodí neznámá témata a duplicity', () => {
    expect(platnaTemata(temata, ['t-koncovky', 't-diktat', 'cizi', 't-koncovky'])).toEqual(['t-koncovky']);
    expect(platnaTemata(temata, [])).toEqual([]);
  });

  it('prepniTemaVyberu přidává a odebírá', () => {
    expect(prepniTemaVyberu([], 't-bl')).toEqual(['t-bl']);
    expect(prepniTemaVyberu(['t-bl', 't-koncovky'], 't-bl')).toEqual(['t-koncovky']);
  });

  it('žádné i všechna vybraná témata = „Vše“ (míchané kolo)', () => {
    expect(temataProKolo(temata, [])).toBeUndefined();
    expect(temataProKolo(temata, ['t-bl', 't-koncovky'])).toBeUndefined();
    expect(temataProKolo(temata, ['t-koncovky'])).toEqual(['t-koncovky']);
    expect(temataProKolo(temata, ['cizi'])).toBeUndefined();
  });

  it('slovyBleskoveOtazky skloňuje počet', () => {
    expect(slovyBleskoveOtazky(1)).toBe('1 blesková otázka');
    expect(slovyBleskoveOtazky(1, 'koho')).toBe('1 bleskovou otázku');
    expect(slovyBleskoveOtazky(4, 'koho')).toBe('4 bleskové otázky');
    expect(slovyBleskoveOtazky(5)).toBe('5 bleskových otázek');
    expect(slovyBleskoveOtazky(0)).toBe('0 bleskových otázek');
  });

  it('pocetDostupnychOtazek sčítá bleskové otázky výběru', () => {
    expect(pocetDostupnychOtazek(temata, [])).toBe(12);
    expect(pocetDostupnychOtazek(temata, ['t-koncovky'])).toBe(4);
    expect(pocetDostupnychOtazek(temata, ['t-bl', 't-koncovky'])).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Start — stránka

describe('stránka /blesk', () => {
  it('jediná banka s bleskovkami: název banky, čipy témat se zvládnutím, délka 10 / 20 a Spustit', () => {
    pouzijStav.setState((s) => ({
      progres: {
        ...s.progres,
        statistikyOtazek: { bl0: stat('bl0', 3), bl1: stat('bl1', 4), bl2: stat('bl2', 1), ko0: stat('ko0', 4) },
      },
    }));
    const html = vykresli(<Blesk />, '/blesk');
    expect(html).toContain('<h1 class="blesk-start__titulek">⚡ Bleskovky</h1>');
    expect(html).toContain('Pravopis — trenažér');
    expect(html).not.toContain('Český jazyk'); // banka bez bleskovek se nenabízí
    // „Vše“ je výchozí; zvládnutí = podíl bleskových otázek v boxu 3+.
    expect(cipy(html)).toEqual([
      ['🔀 Vše 25 %', 'true'], // 3 z 12
      ['Vyjmenovaná slova B a L 25 %', 'false'], // 2 z 8
      ['Koncovky 25 %', 'false'], // 1 ze 4
    ]);
    expect(html).not.toContain('Diktát bez paniky'); // téma bez bleskových otázek
    expect(html).toContain('vše, míchané — doporučeno');
    expect(html).toMatch(/class="blesk-pocet blesk-pocet--vybrany" aria-pressed="true">10</);
    expect(html).toMatch(/class="blesk-pocet" aria-pressed="false">20</);
    expect(html).toContain('🎁 První kolo dne = truhla');
    expect(html).toMatch(/<span class="znak-blesku" aria-hidden="true">⚡<\/span> Spustit/);
  });

  it('?predmet= a ?tema= předvyberou banku a téma', () => {
    const html = vykresli(<Blesk />, '/blesk?predmet=pravopis&tema=t-koncovky');
    expect(cipy(html)).toEqual([
      ['🔀 Vše 0 %', 'false'],
      ['Vyjmenovaná slova B a L 0 %', 'false'],
      ['Koncovky 0 %', 'true'],
    ]);
    expect(html).toContain('1 vybráno');
    expect(html).toContain('Výběr má jen 4 bleskové otázky — kolo bude kratší.');
  });

  it('téma, které banka pro bleskovky nemá, se tiše zahodí (zůstává „Vše“)', () => {
    const html = vykresli(<Blesk />, '/blesk?predmet=pravopis&tema=t-diktat');
    expect(cipy(html)[0]).toEqual(['🔀 Vše 0 %', 'true']);
    expect(html).not.toContain('kolo bude kratší');
  });

  it('víc bank s bleskovkami: nabídka bank, předvolená aktivní, ?predmet= ji přebije', () => {
    pouzijStav.setState({ banky: { pravopis: PRAVOPIS, 'cesky-jazyk': CESTINA, 'nemecky-jazyk': NEMCINA } });
    nastavProfil(['pravopis', 'nemecky-jazyk', 'cesky-jazyk'], 'nemecky-jazyk');

    const aktivni = cipy(vykresli(<Blesk />, '/blesk'));
    expect(aktivni.slice(0, 2)).toEqual([
      ['✍️ Pravopis — trenažér', 'false'],
      ['🇩🇪 Německý jazyk', 'true'],
    ]);
    expect(aktivni.map((c) => c[0])).toContain('Členy 0 %'); // témata vybrané banky

    const zAdresy = cipy(vykresli(<Blesk />, '/blesk?predmet=pravopis'));
    expect(zAdresy.slice(0, 2)).toEqual([
      ['✍️ Pravopis — trenažér', 'true'],
      ['🇩🇪 Německý jazyk', 'false'],
    ]);

    // Jen téma v adrese: banka se dohledá podle něj.
    const zTematu = cipy(vykresli(<Blesk />, '/blesk?tema=t-koncovky'));
    expect(zTematu[0]).toEqual(['✍️ Pravopis — trenažér', 'true']);
    expect(zTematu).toContainEqual(['Koncovky 0 %', 'true']);
  });

  it('když dnešní truhla z bleskovek už padla, start to říká', () => {
    pouzijStav.setState({ historieTestu: [vysledekBlesku({ truhla: 'stribrna' })] });
    const html = vykresli(<Blesk />, '/blesk');
    expect(html).toContain('Dnešní truhla už je tvoje ✓');
    expect(html).not.toContain('První kolo dne = truhla');
  });

  it('běžící test má přednost — start nic nevykreslí a přesměruje na /test', () => {
    const stav = inicializujBlesk(PRAVOPIS, { predmetId: 'pravopis', pocetOtazek: 10 }, {}, () => 0, new Date().toISOString());
    pouzijStav.setState({ aktualniTest: stav });
    expect(vykresli(<Blesk />, '/blesk')).toBe('');
    expect(nactiZdroj('stranky/Blesk.tsx')).toContain('if (aktualniTest) return <Navigate to="/test" replace />;');
  });

  it('bez vhodné banky čeká na načtení obsahu, pak ukáže přátelský prázdný stav', () => {
    nastavProfil(['cesky-jazyk'], 'cesky-jazyk');
    // Při prvním vykreslení se obsah teprve načítá.
    const nacitam = vykresli(<Blesk />, '/blesk');
    expect(nacitam).toContain('Načítám banky…');
    expect(nacitam).not.toContain('Spustit');

    const pravopis = metadataPredmetu('pravopis');
    if (!pravopis) throw new Error('pravopis chybí v registru');
    const prazdno = vykresli(<BleskBezBanky kPridani={[pravopis]} onPridat={() => {}} />, '/blesk');
    expect(prazdno).toContain('Bleskovky jsou rychlý dril');
    expect(prazdno).toContain('✍️ Přidat banku Pravopis — trenažér');
    expect(prazdno).toContain('href="/nastaveni"');
    expect(prazdno).toContain('← Zpět domů');
    // Bez banky k přidání zůstane jen vysvětlení a odkazy.
    expect(vykresli(<BleskBezBanky kPridani={[]} onPridat={() => {}} />, '/blesk')).not.toContain('Přidat banku');
  });

  it('„Spustit“ zakládá kolo z vybrané banky, délky a témat (zapojení)', () => {
    const zdroj = nactiZdroj('stranky/Blesk.tsx');
    expect(zdroj).toMatch(
      /const povedlo = zacniBlesk\(\{\s*predmetId,\s*pocetOtazek: pocet,\s*temataId: temataProKolo\(temata, vybrana\),\s*\}\);/,
    );
    expect(zdroj).toMatch(/className="tlacitko tlacitko--zlate[^"]*"[^>]*\s+onClick=\{spust\}/);
    // Přidání banky z prázdného stavu jde rovnou do profilu.
    expect(zdroj).toContain('<BleskBezBanky kPridani={kPridani} onPridat={pridejPredmetProfilu} />');
  });

  it('start je líná routa /blesk přes lazySObnovou (jako /latka)', () => {
    const app = nactiZdroj('App.tsx');
    expect(app).toContain("const Blesk = lazySObnovou(() => import('./stranky/Blesk'));");
    expect(app).toMatch(/<Route\s+path="\/blesk"\s+element=\{\s*<Suspense fallback=\{<p>Načítám…<\/p>\}>\s*<Blesk \/>/);
    // Spodní mobilní lišta se nemění — /blesk v navigaci není.
    expect(app).not.toMatch(/cesta: '\/blesk'/);
  });
});

// ---------------------------------------------------------------------------
// Výsledek kola

describe('výsledek kola bleskovek', () => {
  it('ukáže štítek, úspěšnost, XP, tempo a combo — bez „času testu“ a „Hrát znovu“', () => {
    pouzijStav.setState({ posledniVysledek: vysledekBlesku() });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('aria-label="Výsledek bleskovek"');
    expect(html).toContain('<div class="stitek blesk-stitek">⚡ Bleskovky</div>');
    expect(html).toContain('75 %');
    expect(html).toContain('6 z 8 otázek správně');
    expect(html).toContain('+21 XP');
    expect(html).toMatch(/⚡ 20<\/div><div class="vysledek-stat__popis">za minutu</); // 8 odpovědí po 3 s
    expect(html).toContain('🔥 ×4');
    expect(html).not.toContain('čas testu');
    expect(html).not.toContain('Hrát znovu');
    expect(html).not.toContain('Rozcvička');
  });

  it('vypíše chyby se správně doplněným zněním, vysvětlením a tématem', () => {
    pouzijStav.setState({ posledniVysledek: vysledekBlesku() });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('Tyhle ti utekly');
    expect(html).toMatch(/Slovo <span class="blesk-slovo">b<span class="blesk-policko blesk-policko--text">y<\/span>lina<\/span> bl1\./);
    expect(html).toContain('Vysvětlení bl1.');
    expect(html).toContain('Vysvětlení bl3.');
    expect(html).not.toContain('Vysvětlení bl0.'); // správně zodpovězená se nevypisuje
    expect(html).toContain('<span class="stitek blesk-chyba__tema">Vyjmenovaná slova B a L</span>');
    expect(html).toContain('Jak ti šla témata');
  });

  it('nabízí opravné kolo s počtem chyb, další kolo a Domů', () => {
    pouzijStav.setState({ posledniVysledek: vysledekBlesku() });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('🔁 Oprav si chyby (2)');
    expect(html).toMatch(/<span class="znak-blesku" aria-hidden="true">⚡<\/span> Další kolo/);
    expect(html).toMatch(/<a class="tlacitko"[^>]*href="\/"[^>]*>Domů<\/a>/);
  });

  it('bez chyb: žádný výpis ani opravné kolo, hlavní akce je další kolo', () => {
    pouzijStav.setState({
      posledniVysledek: vysledekBlesku({ odpovedi: odpovedi([true, true, true]), uspesnost: 1 }),
    });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('bez jediné chyby! 💎');
    expect(html).not.toContain('Tyhle ti utekly');
    expect(html).not.toContain('Oprav si chyby');
    expect(html).toMatch(/class="tlacitko tlacitko--zlate"><span><span class="znak-blesku"/);
  });

  it('chyba v otázce, kterou banka už nezná, se do opravného kola nepočítá', () => {
    const chybne = [...odpovedi([false, false]), { otazkaId: 'zmizela', temaId: 't-bl', obtiznost: 1 as Obtiznost, spravne: false, casMs: 1000 }];
    pouzijStav.setState({ posledniVysledek: vysledekBlesku({ odpovedi: chybne, uspesnost: 0 }) });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('🔁 Oprav si chyby (2)');
    expect(html).toContain('Tahle otázka už v bance není');
  });

  it('studený start (banka se teprve načítá): opravné kolo drží místo, ale nejde spustit; nic se netvrdí o bance', () => {
    pouzijStav.setState({ banky: {}, posledniVysledek: vysledekBlesku() });
    const html = vykresli(<Vysledek />, '/vysledek');
    // Tlačítko je na svém místě (po načtení neposkočí), jen zatím neaktivní.
    expect(html).toMatch(/<button type="button" class="tlacitko tlacitko--zlate" disabled="">🔁 Oprav si chyby \(2\)<\/button>/);
    expect(pocetVyskytu(html, 'Načítám znění otázky…')).toBe(2);
    expect(html).not.toContain('už v bance není');
    // Další kolo a Domů fungují hned.
    expect(html).toMatch(/class="tlacitko tlacitko--primarni"><span><span class="znak-blesku"/);
    expect(html).toContain('75 %');
  });

  it('s načtenou bankou je opravné kolo aktivní', () => {
    pouzijStav.setState({ posledniVysledek: vysledekBlesku() });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toMatch(/<button type="button" class="tlacitko tlacitko--zlate">🔁 Oprav si chyby \(2\)<\/button>/);
    expect(html).not.toContain('Načítám znění otázky…');
  });

  it('tlačítka výsledku jsou zapojená na opravné a další kolo', () => {
    const zdroj = nactiZdroj('stranky/Vysledek.tsx');
    expect(zdroj).toMatch(
      /const opravChyby = \(\) => \{\s*if \(zacniBleskOpravu\(vysledek\.konfigurace\.predmetId, kOprave\)\) navigate\('\/test'\);/,
    );
    expect(zdroj).toMatch(/disabled=\{bankaSeNacita\}\s*onClick=\{opravChyby\}/);
    // Další kolo: po opravném kole se délka a témata berou z historie.
    expect(zdroj).toMatch(
      /navigate\(zacniBlesk\(konfiguraceDalsihoKola\(vysledek, historieTestu\)\) \? '\/test' : '\/blesk'\);/,
    );
    expect(zdroj).toMatch(/onClick=\{dalsiKolo\}/);
    // Čekání na banku řídí společný hook (ne vlastní odhad stránky).
    expect(zdroj).toContain('const bankaSeNacita = banka === undefined && !obsahNacten;');
  });

  it('truhla se ukáže jako u testu, když ji kolo dostalo', () => {
    pouzijStav.setState({
      posledniVysledek: vysledekBlesku({ truhla: 'stribrna' }),
      cekajiciTruhly: ['stribrna'],
    });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('vysledek-truhla');
    expect(html).toContain('Stříbrná truhla');
    expect(html).not.toContain('vysledek-blesk__pozn');
  });

  it('bez truhly vysvětlí proč: málo procent / dnešní už padla / opravné kolo', () => {
    // Pod 50 % — dávka pořád čeká.
    const slabe = vysledekBlesku({ uspesnost: 0.4 });
    pouzijStav.setState({ posledniVysledek: slabe, historieTestu: [slabe] });
    expect(vykresli(<Vysledek />, '/vysledek')).toContain('Na truhlu je potřeba aspoň 50 % — dnešní truhla pořád čeká.');

    // Truhlu už dnes dalo jiné kolo.
    const dalsi = vysledekBlesku({ id: 'blesk-1795000000001-def' });
    pouzijStav.setState({
      posledniVysledek: dalsi,
      historieTestu: [dalsi, vysledekBlesku({ truhla: 'zlata' })],
    });
    expect(vykresli(<Vysledek />, '/vysledek')).toContain('Dnešní truhlu už máš — tohle kolo byl trénink navíc.');

    // Opravné kolo truhlu nedává nikdy.
    const oprava = vysledekBlesku({ id: 'blesk-oprava-1795000000002-ghi', uspesnost: 1, odpovedi: odpovedi([true]) });
    pouzijStav.setState({ posledniVysledek: oprava, historieTestu: [oprava] });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('⚡ Bleskovky — oprava chyb');
    expect(html).toContain('Opravné kolo truhlu nedává');
  });

  it('běžný test, který se jako bleskovky jen POČÍTÁ (blesk-test-…), má běžný výsledek', () => {
    pouzijStav.setState({
      posledniVysledek: vysledekBlesku({
        id: 'blesk-test-1795000000000-abc',
        konfigurace: { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 10 },
        zacatek: '2026-11-22T10:00:00.000Z',
        konec: '2026-11-22T10:02:05.000Z',
        truhla: 'stribrna',
      }),
      cekajiciTruhly: ['stribrna'],
    });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('aria-label="Výsledek testu"');
    expect(html).toContain('<div class="stitek">Standard</div>');
    expect(html).toContain('⚔️ Hrát znovu');
    expect(html).toContain('2:05');
    expect(html).toContain('Stříbrná truhla');
    expect(html).not.toContain('Bleskovky');
    expect(html).not.toContain('Tyhle ti utekly');
    expect(html).not.toContain('Další kolo');
    expect(html).not.toContain('vysledek-blesk__pozn');
  });

  it('…a když truhlu nedostal, protože dnešní dávku už vybralo jiné kolo, řekne proč', () => {
    const test = vysledekBlesku({
      id: 'blesk-test-1795000000001-abc',
      konfigurace: { predmetId: 'pravopis', rezim: 'zkouska', pocetOtazek: 10 },
      uspesnost: 0.9,
    });
    pouzijStav.setState({
      posledniVysledek: test,
      historieTestu: [test, vysledekBlesku({ truhla: 'zlata' })],
    });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('<div class="stitek">Zkouška</div>');
    expect(html).toContain(
      '<p class="vysledek-blesk__pozn">Truhlu za rychlé doplňovačky dnes už máš — testy z nich ji dávají jednou denně, stejně jako bleskovky.</p>',
    );
    expect(html).toContain('⚔️ Hrát znovu');

    // Pod 50 % se nic nevysvětluje (jako u každého testu bez truhly).
    const slaby = { ...test, uspesnost: 0.3 };
    pouzijStav.setState({ posledniVysledek: slaby, historieTestu: [slaby] });
    expect(vykresli(<Vysledek />, '/vysledek')).not.toContain('vysledek-blesk__pozn');
  });

  it('běžný test bez převahy bleskových otázek poznámku o truhle nemá nikdy', () => {
    const test = vysledekBlesku({
      id: 'vysledek-1795000000002-abc',
      konfigurace: { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 10 },
      uspesnost: 0.3,
    });
    pouzijStav.setState({
      posledniVysledek: test,
      historieTestu: [test, vysledekBlesku({ truhla: 'zlata' })],
    });
    expect(vykresli(<Vysledek />, '/vysledek')).not.toContain('vysledek-blesk__pozn');
  });

  it('výsledek běžného testu se nemění (režim, čas testu, Hrát znovu)', () => {
    pouzijStav.setState({
      posledniVysledek: vysledekBlesku({
        id: 'vysledek-1795000000000-abc',
        konfigurace: { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 10 },
        zacatek: '2026-11-22T10:00:00.000Z',
        konec: '2026-11-22T10:02:05.000Z',
      }),
    });
    const html = vykresli(<Vysledek />, '/vysledek');
    expect(html).toContain('aria-label="Výsledek testu"');
    expect(html).toContain('<div class="stitek">Standard</div>');
    expect(html).toContain('⚔️ Hrát znovu');
    expect(html).toContain('2:05');
    expect(html).not.toContain('Bleskovky');
    expect(html).not.toContain('Tyhle ti utekly');
  });
});

// ---------------------------------------------------------------------------
// Vstupy

describe('vstupy do bleskovek', () => {
  it('Domů: dlaždice, když bleskovky nabízí KTERÁKOLI banka profilu; vede na /blesk a ukazuje stav denní truhly', () => {
    // Aktivní čeština bleskovky nemá, ale Pravopis mezi bankami profilu ano
    // → dlaždice je tam a v titulku nese banku, kterou start předvolí.
    const ceka = bezKomentaru(vykresli(<Domu />));
    expect(ceka).toMatch(/<a class="panel domu-uceni domu-blesk domu-blesk--truhla"[^>]*href="\/blesk"/);
    expect(ceka).toContain('Bleskovky<span class="domu-uceni__banka"> · ✍️ Pravopis — trenažér</span>');
    expect(ceka).toContain('🎁 První kolo dne = truhla.');
    expect(ceka).not.toContain('/blesk?predmet=');

    // S aktivním Pravopisem stejně.
    nastavProfil(['cesky-jazyk', 'pravopis'], 'pravopis');
    expect(bezKomentaru(vykresli(<Domu />))).toContain('Bleskovky<span class="domu-uceni__banka"> · ✍️ Pravopis — trenažér</span>');

    // Truhla dnes už padla → dlaždice bez zlatého rámečku.
    pouzijStav.setState({ historieTestu: [vysledekBlesku({ truhla: 'stribrna' })] });
    const hotovo = vykresli(<Domu />);
    expect(hotovo).toMatch(/<a class="panel domu-uceni domu-blesk"[^>]*href="\/blesk"/);
    expect(hotovo).toContain('Dnešní truhla už je tvoje ✓');

    // Profil bez banky s bleskovkami dlaždici nemá.
    nastavProfil(['cesky-jazyk'], 'cesky-jazyk');
    expect(vykresli(<Domu />)).not.toContain('domu-blesk');
  });

  it('Domů: s víc bankami s bleskovkami nese dlaždice aktivní, jinak první v pořadí registru', () => {
    pouzijStav.setState({ banky: { pravopis: PRAVOPIS, 'cesky-jazyk': CESTINA, 'nemecky-jazyk': NEMCINA } });
    nastavProfil(['cesky-jazyk', 'nemecky-jazyk', 'pravopis'], 'nemecky-jazyk');
    expect(bezKomentaru(vykresli(<Domu />))).toContain('<span class="domu-uceni__banka"> · 🇩🇪 Německý jazyk</span></span><span class="domu-uceni__popis">Rychlý dril');

    nastavProfil(['cesky-jazyk', 'nemecky-jazyk', 'pravopis'], 'cesky-jazyk');
    expect(bezKomentaru(vykresli(<Domu />))).toContain('Bleskovky<span class="domu-uceni__banka"> · ✍️ Pravopis — trenažér</span>');
  });

  it('Domů: než se banky načtou, napoví historie — kdo bleskovky hrál, má dlaždici hned', () => {
    // Čeština (aktivní) už je načtená, Pravopis teprve dorazí.
    pouzijStav.setState({ banky: { 'cesky-jazyk': CESTINA } });
    // Bez historie se nic neslibuje.
    expect(vykresli(<Domu />)).not.toContain('domu-blesk');

    // Kolo z banky MIMO profil nenapovídá nic.
    pouzijStav.setState({
      historieTestu: [
        vysledekBlesku({ konfigurace: { predmetId: 'nemecky-jazyk', rezim: 'rozcvicka', pocetOtazek: 10 } }),
      ],
    });
    expect(vykresli(<Domu />)).not.toContain('domu-blesk');

    // Kolo bleskovek z banky profilu → dlaždice je tam ještě před načtením obsahu.
    pouzijStav.setState({ historieTestu: [vysledekBlesku()] });
    const html = bezKomentaru(vykresli(<Domu />));
    expect(html).toMatch(/<a class="panel domu-uceni domu-blesk[^"]*"[^>]*href="\/blesk"/);
    expect(html).toContain('<span class="domu-uceni__banka"> · ✍️ Pravopis — trenažér</span>');

    // Načtená banka má poslední slovo: bez bleskových otázek dlaždice zmizí.
    pouzijStav.setState({
      banky: { 'cesky-jazyk': CESTINA, pravopis: { ...PRAVOPIS, otazky: [DLOUHA('di0', 't-diktat')] } },
    });
    expect(vykresli(<Domu />)).not.toContain('domu-blesk');
  });

  it('Domů: dlaždice je zapojená na rozhodovací funkci a na stav načítání obsahu', () => {
    const zdroj = nactiZdroj('stranky/Domu.tsx');
    expect(zdroj).toContain('const obsahNacten = pouzijObsahNacten();');
    expect(zdroj).toMatch(
      /bankaDlazdiceBlesku\(\{\s*banky: s\.banky,\s*predmetyProfilu: bankyProfilu,\s*aktivni: aktivniPredmet,\s*historie: s\.historieTestu,\s*obsahNacten,\s*\}\)/,
    );
    // Odkaz bez ?predmet= — banku předvolí start stejným pravidlem.
    expect(zdroj).toMatch(/\{bankaBlesku && \(\s*<Link\s+to="\/blesk"/);
  });

  it('Domů: dlaždice leží až za Učit se a Duely (objeví se async a nesmí je posunout)', () => {
    nastavProfil(['cesky-jazyk', 'pravopis'], 'pravopis');
    const html = vykresli(<Domu />);
    const blesk = html.indexOf('domu-blesk');
    expect(html.indexOf('href="/uceni"')).toBeLessThan(blesk);
    expect(html.indexOf('href="/duely"')).toBeLessThan(blesk);
    expect(blesk).toBeLessThan(html.indexOf('domu__questy'));
  });

  it('Učit se: tlačítko ⚡ Bleskovky u nadpisu banky, která je nabízí', () => {
    pouzijStav.setState({ vyuky: { pravopis: VYUKA_PRAVOPIS, 'cesky-jazyk': VYUKA_CESTINA } });
    const html = vykresli(<Uceni />, '/uceni');
    expect(pocetVyskytu(html, 'uceni__blesk')).toBe(1);
    expect(html).toMatch(/<h2 class="uceni__predmet-nazev"><span aria-hidden="true">✍️<\/span> Pravopis — trenažér<\/h2><a class="tlacitko uceni__blesk"[^>]*href="\/blesk\?predmet=pravopis"/);
    // Čeština bleskovky nemá — nadpis bez tlačítka.
    expect(html).toMatch(/Český jazyk a literatura<\/h2><\/div>/);
  });

  it('konec lekce: „Procvič bleskovkami“ jen když má téma aspoň 5 bleskových otázek', () => {
    pouzijStav.setState({
      vyuky: { pravopis: VYUKA_PRAVOPIS },
      postupLekci: {
        't-bl': { dokonceneBloky: [0], dokoncenoPoprve: '2026-11-22T10:00:00.000Z', posledniXpDen: null, pocetDokonceni: 1 },
        't-koncovky': { dokonceneBloky: [0], dokoncenoPoprve: '2026-11-22T10:00:00.000Z', posledniXpDen: null, pocetDokonceni: 1 },
      },
    });
    const lekce = (temaId: string) =>
      vykresli(
        <Routes>
          <Route path="/uceni/:temaId" element={<LekceViewer />} />
        </Routes>,
        `/uceni/${temaId}`,
      );

    // t-bl má 8 bleskových otázek: bleskovky jsou primární (zlaté), test vedle.
    const sBleskem = lekce('t-bl');
    expect(sBleskem).toMatch(/class="tlacitko tlacitko--zlate"><span><span class="znak-blesku" aria-hidden="true">⚡<\/span> Procvič bleskovkami/);
    expect(sBleskem).toMatch(/class="tlacitko tlacitko--primarni">⚔️ Otestuj se z tématu/);
    expect(sBleskem.indexOf('Procvič bleskovkami')).toBeLessThan(sBleskem.indexOf('Otestuj se z tématu'));

    // t-koncovky má jen 4: zůstává jen test (zlatý jako dřív).
    const bezBlesku = lekce('t-koncovky');
    expect(bezBlesku).not.toContain('Procvič bleskovkami');
    expect(bezBlesku).toMatch(/class="tlacitko tlacitko--zlate">⚔️ Otestuj se z tématu/);
  });

  it('rychlý start na /test: sekundární odkaz na bleskovky, když je některá banka profilu má', () => {
    const html = vykresli(<Test />, '/test');
    expect(html).toContain('⚔️ Spustit test');
    // Předvolená je aktivní čeština (bez bleskovek) → odkaz vede na výběr.
    expect(html).toMatch(/<a class="tlacitko"[^>]*href="\/blesk"[^>]*>⚡ Bleskovky<\/a>/);

    nastavProfil(['cesky-jazyk', 'pravopis'], 'pravopis');
    expect(vykresli(<Test />, '/test')).toMatch(/href="\/blesk\?predmet=pravopis"[^>]*>⚡ Bleskovky<\/a>/);

    nastavProfil(['cesky-jazyk'], 'cesky-jazyk');
    expect(vykresli(<Test />, '/test')).not.toContain('Bleskovky');
  });

  it('Statistiky: kolo bleskovek se v posledních testech jmenuje ⚡ Bleskovky, ne Rozcvička', () => {
    nastavProfil(['cesky-jazyk', 'pravopis'], 'pravopis');
    pouzijStav.setState({
      historieTestu: [
        vysledekBlesku(),
        vysledekBlesku({ id: 'vysledek-1-x', konfigurace: { predmetId: 'pravopis', rezim: 'rozcvicka', pocetOtazek: 5 } }),
      ],
    });
    const html = vykresli(<Statistiky />, '/statistiky');
    expect(html).toContain('<td>⚡ Bleskovky</td>');
    expect(html).toContain('<td>Rozcvička</td>');
    expect(html).not.toContain('Oprava chyb');
  });

  it('Statistiky: běžný test, který se jako bleskovky jen počítá, si nechává název svého režimu', () => {
    nastavProfil(['cesky-jazyk', 'pravopis'], 'pravopis');
    pouzijStav.setState({
      historieTestu: [
        vysledekBlesku({ id: 'blesk-test-1-x', konfigurace: { predmetId: 'pravopis', rezim: 'standard', pocetOtazek: 10 } }),
        vysledekBlesku({ id: 'blesk-test-2-x', konfigurace: { predmetId: 'pravopis', rezim: 'zkouska', pocetOtazek: 10 } }),
      ],
    });
    const html = vykresli(<Statistiky />, '/statistiky');
    expect(html).toContain('<td>Standard</td>');
    expect(html).toContain('<td>Zkouška</td>');
    expect(html).not.toContain('⚡ Bleskovky');
  });

  it('Statistiky: opravné kolo má vlastní název (krátká kola nevypadají jako slabé bleskovky)', () => {
    nastavProfil(['cesky-jazyk', 'pravopis'], 'pravopis');
    pouzijStav.setState({
      historieTestu: [
        vysledekBlesku({ id: 'blesk-oprava-1795000000002-ghi', odpovedi: odpovedi([true, true]), uspesnost: 1 }),
        vysledekBlesku(),
      ],
    });
    const html = vykresli(<Statistiky />, '/statistiky');
    expect(pocetVyskytu(html, '<td>⚡ Oprava chyb</td>')).toBe(1);
    expect(pocetVyskytu(html, '<td>⚡ Bleskovky</td>')).toBe(1);
    expect(html).not.toContain('<td>Rozcvička</td>');
  });
});

/** React na serveru odděluje sousední textové uzly komentářem — pro porovnání textu pryč. */
function bezKomentaru(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

function pocetVyskytu(html: string, hledane: string): number {
  return html.split(hledane).length - 1;
}

// ---------------------------------------------------------------------------
// CSS — start, dlaždice na Domů a tlačítko v Učit se

function nactiCss(cesta: string): string {
  return nactiZdroj(cesta).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Rozsahy bloků `@media <dotaz> { … }` (párování závorek). */
function rozsahyMedia(css: string, dotaz: RegExp): { od: number; obsahOd: number; do: number }[] {
  const rozsahy: { od: number; obsahOd: number; do: number }[] = [];
  const zacatek = new RegExp(`@media\\s*${dotaz.source}\\s*\\{`, 'g');
  let shoda: RegExpExecArray | null;
  while ((shoda = zacatek.exec(css)) !== null) {
    let hloubka = 1;
    let i = zacatek.lastIndex;
    while (i < css.length && hloubka > 0) {
      if (css[i] === '{') hloubka += 1;
      else if (css[i] === '}') hloubka -= 1;
      i += 1;
    }
    rozsahy.push({ od: shoda.index, obsahOd: zacatek.lastIndex, do: i });
  }
  return rozsahy;
}

function blokyMedia(css: string, dotaz: RegExp): string {
  return rozsahyMedia(css, dotaz)
    .map((r) => css.slice(r.obsahOd, r.do - 1))
    .join('\n');
}

function bezMedia(css: string, dotaz: RegExp): string {
  let vysledek = '';
  let pozice = 0;
  for (const r of rozsahyMedia(css, dotaz)) {
    vysledek += css.slice(pozice, r.od);
    pozice = r.do;
  }
  return vysledek + css.slice(pozice);
}

/** Deklarace pravidel, jejichž seznam selektorů obsahuje přesně `selektor`. */
function deklarace(css: string, selektor: string): Record<string, string> {
  const vysledek: Record<string, string> = {};
  const pravidlo = /([^{}]+)\{([^{}]*)\}/g;
  let shoda: RegExpExecArray | null;
  while ((shoda = pravidlo.exec(css)) !== null) {
    const selektory = shoda[1].split(',').map((x) => x.trim());
    if (!selektory.includes(selektor)) continue;
    for (const radek of shoda[2].split(';')) {
      const dvojtecka = radek.indexOf(':');
      if (dvojtecka < 0) continue;
      vysledek[radek.slice(0, dvojtecka).trim()] = radek.slice(dvojtecka + 1).trim();
    }
  }
  return vysledek;
}

const MOBIL = /\(max-width:\s*760px\)/;
const HOVER = /\(hover:\s*hover\)/;

describe('CSS bleskovek mimo průběh — mobil a desktop', () => {
  const start = nactiCss('stranky/Blesk.css');
  const startMobil = blokyMedia(start, MOBIL);

  it('start: čipy a délka kola mají na mobilu dotykovou plochu aspoň 44 px', () => {
    expect(parseInt(deklarace(startMobil, '.blesk-cip')['min-height'], 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(deklarace(startMobil, '.blesk-pocet')['min-height'], 10)).toBeGreaterThanOrEqual(44);
    expect(parseInt(deklarace(startMobil, '.tlacitko.blesk-start__spustit')['min-height'], 10)).toBeGreaterThanOrEqual(44);
  });

  it('start: pata se „Spustit“ je na mobilu přilepená nad spodní lištou a nese safe-area', () => {
    const pata = deklarace(startMobil, '.blesk-start__pata');
    expect(pata.position).toBe('sticky');
    expect(pata.bottom).toContain('env(safe-area-inset-bottom');
    expect(pata.background).toBe('var(--pozadi-panel)'); // neprůhledná — čipy pod ní neprosvítají
    // Na desktopu pata přilepená není (běžný tok stránky).
    expect(deklarace(bezMedia(start, MOBIL), '.blesk-start__pata').position).toBeUndefined();
  });

  it('start: hover jen pro myš', () => {
    expect(bezMedia(start, HOVER)).not.toContain(':hover');
  });

  it('Domů: dlaždice a karta nabídky přebíjejí .panel dvěma třídami, hover jen pro myš, žádný pulz', () => {
    const domu = nactiCss('stranky/Domu.css');
    expect(deklarace(domu, '.panel.domu-blesk--truhla')['border-color']).toBeDefined();
    expect(deklarace(domu, '.panel.domu-nabidka').display).toBe('flex');
    expect(deklarace(blokyMedia(domu, HOVER), '.domu-uceni.domu-blesk:hover')['border-color']).toBe('var(--zlata)');
    expect(bezMedia(domu, HOVER)).not.toContain(':hover');
    // Dlaždice bleskovek nepulzuje (mobil: nové nekonečné animace box-shadow nepřidávat).
    expect(deklarace(domu, '.panel.domu-blesk--truhla').animation).toBeUndefined();
  });

  it('Učit se: nadpis banky drží mezeru na řádku, tlačítko bleskovek ji nemění', () => {
    const vyuka = nactiCss('vyuka/vyuka.css');
    expect(deklarace(vyuka, '.uceni__predmet-hlava')['margin-bottom']).toBe('12px');
    expect(deklarace(vyuka, '.uceni__predmet-nazev')['margin-bottom']).toBe('0');
    expect(deklarace(vyuka, '.tlacitko.uceni__blesk').flex).toBe('none');
  });
});
