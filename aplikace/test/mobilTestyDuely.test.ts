// Mobilni opravy testu a duelu: ochranna prodleva proti dvojimu ťuknuti,
// posuny stranky (zpetna vazba / zacatek otazky), lehka obnova seznamu
// duelu s omezenim cetnosti a podpis rozlozeni seznamu (odlozene
// preskladani pod prstem), pevna sirka cisel meridla rychlosti, plny sync
// pri otevreni Duely s neprazdnou frontou, CSS fullscreen modalu duelu
// a desktopovy hover moznosti beze zmeny.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Duel } from '@questor/sdilene';
import { OCHRANNA_PRODLEVA_MS, jeVOchranneProdleve } from '../src/testy/ochranaKliku';
import { jeNadHornimOkrajem, posunDoZorneho, posunPodListou } from '../src/testy/posun';
import { pocetKaret, pocetNovychKaret, podpisRozdeleni, rozdelDuely } from '../src/duely/engine';
import { formatujCasOtazky, sekundyOtazky } from '../src/duely/pomocne';

// Klient serveru se podvrhne — obnova nesmi sahat na sit.
const { stahniDuely } = vi.hoisted(() => ({ stahniDuely: vi.fn() }));
vi.mock('../src/duely/pomocne', async (puvodni) => ({
  ...(await puvodni<typeof import('../src/duely/pomocne')>()),
  duelovyKlient: () => ({ stahniDuely }),
}));

// Sync se podvrhne jen v tom, co pouziva otevreni stranky Duely (stav fronty
// a spusteni plneho syncu) — zbytek modulu zustava puvodni.
const { stavSynchronizace, synchronizuj } = vi.hoisted(() => ({
  stavSynchronizace: vi.fn(() => ({ veFronte: 0 })),
  synchronizuj: vi.fn(async () => {}),
}));
vi.mock('../src/sync/sync', async (puvodni) => ({
  ...(await puvodni<typeof import('../src/sync/sync')>()),
  stavSynchronizace,
  synchronizuj,
}));

const { pouzijStav } = await import('../src/stav/store');
const {
  INTERVAL_OBNOVY_DUELU_MS,
  jeStavZObnovy,
  maSeObnovitDuely,
  obnovDuely,
  obnovPriOtevreniDuelu,
  resetujObnovuDuelu,
} = await import('../src/duely/obnoveni');

/** Text souboru ze src/ (CSS bez komentaru). */
function nactiZdroj(cesta: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${cesta}`, import.meta.url)), 'utf8');
}

function nactiCss(cesta: string): string {
  return nactiZdroj(cesta).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Obsah vsech bloku `@media <dotaz> { … }` (parovani zavorek). */
function blokyMedia(css: string, dotaz: RegExp): string {
  const bloky: string[] = [];
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
    bloky.push(css.slice(zacatek.lastIndex, i - 1));
  }
  return bloky.join('\n');
}

/** Deklarace pravidel, jejichz seznam selektoru obsahuje presne `selektor`. */
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

const TED = '2026-09-04T12:00:00.000Z';

function duel(id: string, prepis: Partial<Duel> = {}): Duel {
  return {
    id,
    predmetId: 'p',
    pocetOtazek: 5,
    otazkyIds: ['o1', 'o2'],
    vyzyvatel: { profilId: 'tata', jmeno: 'Tata' },
    souper: { profilId: 'ja', jmeno: 'Ja' },
    otevrenyProRodinu: false,
    handicap: { tata: 1, ja: 1 },
    stav: 'prijaty',
    vysledky: {},
    vytvoreno: '2026-09-04T10:00:00.000Z',
    vyprsi: '2100-01-01T00:00:00.000Z',
    ...prepis,
  };
}

// ---------------------------------------------------------------------------

describe('ochranna prodleva po zobrazeni otazky', () => {
  it('blokuje jen kliky v prvnich OCHRANNA_PRODLEVA_MS', () => {
    expect(OCHRANNA_PRODLEVA_MS).toBeGreaterThanOrEqual(300);
    expect(OCHRANNA_PRODLEVA_MS).toBeLessThanOrEqual(400);
    expect(jeVOchranneProdleve(1000, 1000)).toBe(true);
    expect(jeVOchranneProdleve(1000, 1000 + OCHRANNA_PRODLEVA_MS - 1)).toBe(true);
    expect(jeVOchranneProdleve(1000, 1000 + OCHRANNA_PRODLEVA_MS)).toBe(false);
  });

  it('bez znameho zobrazeni nebo s casem pred nim neblokuje', () => {
    expect(jeVOchranneProdleve(null, 5)).toBe(false);
    expect(jeVOchranneProdleve(1000, 900)).toBe(false);
    expect(jeVOchranneProdleve(1000, 1100, 50)).toBe(false);
  });
});

describe('posuny stranky', () => {
  it('zacatek otazky je nad okrajem jen kdyz lezi nad scroll-margin-top', () => {
    expect(jeNadHornimOkrajem(-40, 0)).toBe(true);
    expect(jeNadHornimOkrajem(0, 0)).toBe(false);
    expect(jeNadHornimOkrajem(20, 57)).toBe(true); // pod status barem PWA
    expect(jeNadHornimOkrajem(56.5, 57)).toBe(false); // tolerance zaokrouhleni
    expect(jeNadHornimOkrajem(300, 12)).toBe(false);
  });

  it('posunDoZorneho dorolovava jen „nejblize" (zadny posun, kdyz je prvek videt)', () => {
    const scrollIntoView = vi.fn();
    posunDoZorneho({ scrollIntoView } as unknown as Element);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: 'nearest' });
    // Bez prvku (panel jeste/uz neni) nic nespadne.
    expect(() => posunDoZorneho(null)).not.toThrow();
  });

  it('posunPodListou mimo lekci jen doroluje (horni okraj necha na CSS)', () => {
    const scrollIntoView = vi.fn();
    const prvek = { scrollIntoView, style: {} as CSSStyleDeclaration, closest: () => null };
    posunPodListou(prvek as unknown as HTMLElement);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(prvek.style.scrollMarginTop).toBeUndefined();
  });
});

describe('meridlo rychlosti — cisla v pevne sirce', () => {
  it('stopky ukazuji jen cislo sekund, s jednotkou zvlast', () => {
    expect(sekundyOtazky(12_449)).toBe('12,4');
    expect(sekundyOtazky(-5)).toBe('0,0');
    expect(formatujCasOtazky(9_960)).toBe('10,0 s');
  });
});

describe('seznam duelu — podpis rozlozeni', () => {
  it('zmena dat karty podpis nemeni, nova vyzva nebo presun do historie ano', () => {
    const zaklad = [duel('a'), duel('b', { vyprsi: '2100-01-02T00:00:00.000Z' })];
    const r1 = rozdelDuely(zaklad, [], 'ja', TED);
    // Jen jina data na karte (skore soupere) — karty zustanou na mistech.
    const r2 = rozdelDuely(
      [duel('a', { vysledky: { tata: { odpovedi: [], body: 10, celkovyCasMs: 1, dokonceno: TED } } }), zaklad[1]],
      [],
      'ja',
      TED,
    );
    expect(podpisRozdeleni(r2)).toBe(podpisRozdeleni(r1));
    expect(pocetNovychKaret(r1, r2)).toBe(0);

    // Nova cilena vyzva nahore = jiny podpis a 1 nova karta.
    const r3 = rozdelDuely([...zaklad, duel('c', { stav: 'cekajici' })], [], 'ja', TED);
    expect(r3.vyzvyProMe.map((d) => d.id)).toEqual(['c']);
    expect(podpisRozdeleni(r3)).not.toBe(podpisRozdeleni(r1));
    expect(pocetNovychKaret(r1, r3)).toBe(1);

    // Presun do historie = jiny podpis, ale zadna nova karta.
    const r4 = rozdelDuely([duel('a', { stav: 'hotovy' }), zaklad[1]], [], 'ja', TED);
    expect(podpisRozdeleni(r4)).not.toBe(podpisRozdeleni(r1));
    expect(pocetNovychKaret(r1, r4)).toBe(0);
  });

  it('pocetKaret: prazdna arena = 0 (prazdny snimek se nahradi hned, neodklada)', () => {
    const prazdna = rozdelDuely([], [], 'ja', TED);
    expect(pocetKaret(prazdna)).toBe(0);
    // Prvni vyzva v zivote: podpis se lisi, ale stary snimek nema kartu.
    const sVyzvou = rozdelDuely([duel('c', { stav: 'cekajici' })], [], 'ja', TED);
    expect(podpisRozdeleni(sVyzvou)).not.toBe(podpisRozdeleni(prazdna));
    expect(pocetKaret(sVyzvou)).toBe(1);
    // Karty se pocitaji pres vsechny sekce (vc. historie a otevrenych vyzev).
    const ruzne = rozdelDuely(
      [duel('a'), duel('h', { stav: 'hotovy' })],
      [duel('o', { stav: 'cekajici', souper: undefined, otevrenyProRodinu: true, vyzyvatel: { profilId: 'mama', jmeno: 'Mama' } })],
      'ja',
      TED,
    );
    expect(pocetKaret(ruzne)).toBe(3);
  });
});

describe('lehka obnova duelu', () => {
  beforeEach(() => {
    resetujObnovuDuelu();
    stahniDuely.mockReset();
    pouzijStav.setState({ aktivniProfilId: 'ja', duely: [], otevreneDuely: [] });
  });

  afterEach(() => {
    resetujObnovuDuelu();
  });

  it('maSeObnovitDuely: poprve vzdy, pak az po intervalu', () => {
    expect(INTERVAL_OBNOVY_DUELU_MS).toBeGreaterThanOrEqual(30_000);
    expect(INTERVAL_OBNOVY_DUELU_MS).toBeLessThanOrEqual(60_000);
    expect(maSeObnovitDuely(undefined, 0)).toBe(true);
    expect(maSeObnovitDuely(1000, 1000 + INTERVAL_OBNOVY_DUELU_MS - 1)).toBe(false);
    expect(maSeObnovitDuely(1000, 1000 + INTERVAL_OBNOVY_DUELU_MS)).toBe(true);
    expect(maSeObnovitDuely(5000, 1000)).toBe(true); // posunute hodiny neblokuji
  });

  it('stahne jen duely, zapise je a do intervalu znovu nejde na sit', async () => {
    stahniDuely.mockResolvedValue({ moje: [duel('a')], otevrene: [] });
    expect(await obnovDuely(1_000)).toBe(true);
    expect(stahniDuely).toHaveBeenCalledWith('ja');
    const stav = pouzijStav.getState();
    expect(stav.duely.map((d) => d.id)).toContain('a');
    // UI pozna, ze tenhle stav zapsala obnova (ne uzivatel).
    expect(jeStavZObnovy(stav.duely, stav.otevreneDuely)).toBe(true);
    expect(jeStavZObnovy([...stav.duely], stav.otevreneDuely)).toBe(false);

    expect(await obnovDuely(1_000 + 10_000)).toBe(false);
    expect(stahniDuely).toHaveBeenCalledTimes(1);
    expect(await obnovDuely(1_000 + INTERVAL_OBNOVY_DUELU_MS)).toBe(true);
    expect(stahniDuely).toHaveBeenCalledTimes(2);
  });

  it('prepnuti profilu behem stahovani vysledek zahodi; chyba site je ticha', async () => {
    stahniDuely.mockImplementation(async () => {
      pouzijStav.setState({ aktivniProfilId: 'jiny' });
      return { moje: [duel('a')], otevrene: [] };
    });
    expect(await obnovDuely(1_000)).toBe(false);
    expect(pouzijStav.getState().duely).toEqual([]);

    pouzijStav.setState({ aktivniProfilId: 'ja' });
    resetujObnovuDuelu();
    stahniDuely.mockRejectedValue(new Error('offline'));
    expect(await obnovDuely(1_000)).toBe(false);
  });

  it('zahozeny vysledek (prepnuti profilu) interval nezablokuje — po navratu se stahuje hned', async () => {
    stahniDuely.mockImplementationOnce(async () => {
      pouzijStav.setState({ aktivniProfilId: 'jiny' });
      return { moje: [duel('a')], otevrene: [] };
    });
    expect(await obnovDuely(1_000)).toBe(false);

    // Navrat na profil do 45 s (rodic prave poslal vyzvu) — obnova jde na sit.
    pouzijStav.setState({ aktivniProfilId: 'ja' });
    stahniDuely.mockResolvedValueOnce({ moje: [duel('a')], otevrene: [] });
    expect(await obnovDuely(1_000 + 5_000)).toBe(true);
    expect(stahniDuely).toHaveBeenCalledTimes(2);
    expect(pouzijStav.getState().duely.map((d) => d.id)).toContain('a');
  });

  it('po chybe site interval plati (spatna sit se nezkousi pri kazdem otevreni)', async () => {
    stahniDuely.mockRejectedValueOnce(new Error('offline'));
    expect(await obnovDuely(1_000)).toBe(false);
    expect(await obnovDuely(1_000 + 5_000)).toBe(false);
    expect(stahniDuely).toHaveBeenCalledTimes(1);
  });

  it('bez aktivniho profilu nic nestahuje', async () => {
    pouzijStav.setState({ aktivniProfilId: null });
    expect(await obnovDuely(1_000)).toBe(false);
    expect(stahniDuely).not.toHaveBeenCalled();
  });
});

describe('otevreni stranky Duely — fronta syncu', () => {
  beforeEach(() => {
    resetujObnovuDuelu();
    stahniDuely.mockReset();
    synchronizuj.mockClear();
    stavSynchronizace.mockReset();
    pouzijStav.setState({ aktivniProfilId: 'ja', duely: [], otevreneDuely: [] });
  });

  afterEach(() => {
    resetujObnovuDuelu();
  });

  it('prazdna fronta = jen lehka obnova seznamu (zadny plny sync)', async () => {
    stavSynchronizace.mockReturnValue({ veFronte: 0 });
    stahniDuely.mockResolvedValue({ moje: [duel('a')], otevrene: [] });
    await obnovPriOtevreniDuelu();
    expect(stahniDuely).toHaveBeenCalledWith('ja');
    expect(synchronizuj).not.toHaveBeenCalled();
  });

  it('neodeslany vysledek ve fronte = plny „rucni" sync (odesle frontu), bez lehke obnovy', async () => {
    stavSynchronizace.mockReturnValue({ veFronte: 2 });
    await obnovPriOtevreniDuelu();
    expect(synchronizuj).toHaveBeenCalledTimes(1);
    expect(synchronizuj).toHaveBeenCalledWith('rucne');
    expect(stahniDuely).not.toHaveBeenCalled();
  });

  it('chyba syncu je ticha', async () => {
    stavSynchronizace.mockReturnValue({ veFronte: 1 });
    synchronizuj.mockRejectedValueOnce(new Error('offline'));
    await expect(obnovPriOtevreniDuelu()).resolves.toBeUndefined();
  });
});

describe('ochrana kliku v rodinnem duelu — cela sekce vc. power-upu', () => {
  // Bez DOM rendereru (projekt nema jsdom) se hlida zdrojak: navrat na
  // zacatek otazky muze pod prst druheho ťuknuti posunout listu power-upu.
  const zdroj = nactiZdroj('duely/DuelHrani.tsx');
  const otazkaDuelu = zdroj.slice(zdroj.indexOf('function OtazkaDuelu'));

  it('onClickCapture je na sekci .duel-hrani, ne jen na panelu otazky', () => {
    expect(otazkaDuelu).toMatch(/<section\s[^>]*className="duel-hrani"[^>]*onClickCapture=\{ochranaKliku\}/);
    expect(otazkaDuelu).not.toMatch(/className="panel test-otazka"[^>]*onClickCapture/);
    // Power-upy lezi uvnitr chranene sekce.
    const sekce = otazkaDuelu.slice(otazkaDuelu.indexOf('<section'), otazkaDuelu.indexOf('</section>'));
    expect(sekce).toContain('<PowerupLista');
  });
});

describe('CSS — fullscreen modal duelu a hover moznosti', () => {
  it('modal duelu na mobilu: hranate rohy a bez bocnich ramecku se dvema tridami (prebije .panel)', () => {
    const mobil = blokyMedia(nactiCss('duely/Duely.css'), /\(max-width:\s*760px\)/);
    const d = deklarace(mobil, '.panel.duely__modal');
    expect(d['border-radius']).toBe('0');
    expect(d['border-left']).toBe('none');
    expect(d['border-right']).toBe('none');
    expect(d['padding-top']).toContain('env(safe-area-inset-top');
    // Jednotridni pravidlo by global.css (v bundlu posledni) tise prebil.
    expect(deklarace(mobil, '.duely__modal')['border-radius']).toBeUndefined();
  });

  it('hover moznosti jen pro mys a s deklaracemi beze zmeny proti desktopu', () => {
    const css = nactiCss('testy/testy.css');
    const hover = deklarace(blokyMedia(css, /\(hover:\s*hover\)/), '.moznost:hover:not(:disabled)');
    expect(hover).toEqual({
      transform: 'translateY(-2px)',
      'border-color': 'var(--akcent)',
      'box-shadow': 'var(--zare-akcent)',
    });
    // Zadne pravidlo navic pro vybranou moznost pod kurzorem.
    expect(css).not.toContain('.moznost--vybrana:hover');
  });
});
