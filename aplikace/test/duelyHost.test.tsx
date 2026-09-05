// Testy duelu odkazem (faze 2) — hostovska cast aplikace:
// parsovani hashe pozvanky, generovani odkazu na vsech prostredich,
// hostovsky tok (prijeti → vysledek → navrat pres tentyz odkaz),
// izolace klienta (zadny rodinny token) a skryte power-upy v hostovskem UI.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BankaOtazek, Duel, Otazka, OtazkaVyber } from '@questor/sdilene';
import { hostProfilId } from '@questor/sdilene';
import {
  _resetujPozvankuZeStartu,
  nactiHostStav,
  obnovHostDuel,
  odesliHostVysledek,
  odkazProHosta,
  pozvankaZeStartu,
  prijmiPozvanku,
  ulozHostStav,
  vychoziHostStav,
  vytvorHostKlienta,
  WEB_ADRESA_APLIKACE,
  zpracujHashPozvanky,
} from '../src/duely/host';
import {
  muzeHratDuel,
  odpovezVPrubehu,
  odstartujPrubeh,
  rozdelDuely,
  vysledekZPrubehu,
  vytvorDuelPrubeh,
} from '../src/duely/engine';
import { HostOtazka } from '../src/duely/HostDuel';
import { pametoveUloziste } from '../src/sync/klient';

// ---------------------------------------------------------------------------
// Pomucky

const DUEL_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const KOD = 'abcDEF123456_-ghiJKL7890';
const HOST_ID = hostProfilId(DUEL_ID);
const TED = '2026-09-04T12:00:00.000Z';

function otazkaVyber(id: string, obtiznost: 1 | 2 | 3 | 4 | 5 = 3): OtazkaVyber {
  return {
    id,
    temaId: 't1',
    obtiznost,
    typ: 'vyber',
    zadani: `Otazka ${id}?`,
    moznosti: ['a', 'b', 'c', 'd'],
    spravna: 0,
    vysvetleni: 'Protoze ano.',
  };
}

function banka(otazky: Otazka[]): BankaOtazek {
  return {
    predmetId: 'p',
    nazev: 'Testovaci',
    verze: 1,
    vytvoreno: '2026-09-01',
    temata: [{ id: 't1', nazev: 'Tema 1', poradi: 0 }],
    otazky,
  };
}

function duelOdkazem(prepis: Partial<Duel> = {}): Duel {
  return {
    id: DUEL_ID,
    predmetId: 'p',
    pocetOtazek: 5,
    otazkyIds: ['o1', 'o2'],
    vyzyvatel: { profilId: 'tata', jmeno: 'Tata' },
    otevrenyProRodinu: false,
    proOdkaz: true,
    handicap: { tata: 1 },
    stav: 'cekajici',
    vysledky: {},
    vytvoreno: '2026-09-04T10:00:00.000Z',
    vyprsi: '2026-09-05T10:00:00.000Z',
    ...prepis,
  };
}

/**
 * Falesny server hostovskych endpointu: GET stav (pred prijetim zatajuje
 * otazkyIds i vysledky), POST prijmout (first-wins), POST vysledek (uzavre
 * duel jako hotovy). Zaznamenava volani vc. hlavicek.
 */
function falesnyServer(vychozi: Duel) {
  let duel = { ...vychozi };
  const volani: { url: string; metoda: string; hlavicky: Record<string, string>; telo?: unknown }[] =
    [];
  const f = async (url: string, init?: RequestInit): Promise<Response> => {
    const telo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    const hlavicky = (init?.headers ?? {}) as Record<string, string>;
    volani.push({
      url,
      metoda: init?.method ?? 'GET',
      hlavicky,
      telo,
    });
    const odpoved = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status });
    // Kod prichazi hlavickou x-questor-host-kod (GET) nebo telem (POSTy) —
    // NIKDY v URL: query string konci v access logu serveru/proxy a poprel by
    // smysl fragmentu # v odkazu.
    if (hlavicky['x-questor-host-kod'] !== KOD && telo?.kod !== KOD) {
      return odpoved({ chyba: 'Neplatný odkaz na duel' }, 403);
    }
    if (url.endsWith('/prijmout')) {
      if (duel.host) return odpoved({ chyba: 'Odkaz už někdo použil — hraje první' }, 409);
      const jmeno = telo?.jmeno as string;
      duel = {
        ...duel,
        souper: { profilId: HOST_ID, jmeno },
        host: { jmeno },
        handicap: { [duel.vyzyvatel.profilId]: 1, [HOST_ID]: 1 },
        stav: 'prijaty',
      };
      return odpoved(duel);
    }
    if (url.endsWith('/vysledek')) {
      if (duel.vysledky[HOST_ID]) return odpoved({ chyba: 'Platí první pokus' }, 409);
      duel = {
        ...duel,
        vysledky: { ...duel.vysledky, [HOST_ID]: telo?.vysledek as Duel['vysledky'][string] },
      };
      if (duel.vysledky[duel.vyzyvatel.profilId] && duel.vysledky[HOST_ID]) {
        duel = { ...duel, stav: 'hotovy', vitezProfilId: duel.vyzyvatel.profilId };
      }
      return odpoved(duel);
    }
    // GET stavu — pred prijetim hosta se sada otazek i vysledky zatajuji.
    const verejny = duel.host ? duel : { ...duel, otazkyIds: [], vysledky: {} };
    return odpoved(verejny);
  };
  return { f, volani, aktualni: () => duel };
}

// ---------------------------------------------------------------------------

describe('zpracujHashPozvanky — parsovani hashe', () => {
  it('platny hash s mrizkou i bez ni', () => {
    expect(zpracujHashPozvanky(`#duel=${DUEL_ID}.${KOD}`)).toEqual({ duelId: DUEL_ID, kod: KOD });
    expect(zpracujHashPozvanky(`duel=${DUEL_ID}.${KOD}`)).toEqual({ duelId: DUEL_ID, kod: KOD });
  });

  it('nevalidni hashe → null', () => {
    expect(zpracujHashPozvanky('')).toBeNull();
    expect(zpracujHashPozvanky('#')).toBeNull();
    expect(zpracujHashPozvanky('#neco-jineho')).toBeNull();
    expect(zpracujHashPozvanky(`#duel=${DUEL_ID}`)).toBeNull(); // chybi kod
    expect(zpracujHashPozvanky(`#duel=.${KOD}`)).toBeNull(); // chybi duelId
    expect(zpracujHashPozvanky('#duel=kratke.kod')).toBeNull(); // prilis kratke
    expect(zpracujHashPozvanky(`#duel=${DUEL_ID}.${KOD}.navic`)).toBeNull(); // tecka navic
    expect(zpracujHashPozvanky(`#duel=${DUEL_ID}.kod se%20znaky`)).toBeNull(); // cizi znaky
  });

  it('odkaz vygenerovany odkazProHosta se zpatky rozparsuje na tytez hodnoty', () => {
    const odkaz = odkazProHosta(DUEL_ID, KOD, {
      tauri: false,
      origin: 'https://koordinator-server.cz',
      base: '/questor/',
    });
    const hash = odkaz.slice(odkaz.indexOf('#'));
    expect(zpracujHashPozvanky(hash)).toEqual({ duelId: DUEL_ID, kod: KOD });
  });
});

describe('odkazProHosta — generovani na vsech prostredich', () => {
  it('web na produkci (https, base /questor/) → odkaz na tomze originu', () => {
    expect(
      odkazProHosta(DUEL_ID, KOD, {
        tauri: false,
        origin: 'https://koordinator-server.cz',
        base: '/questor/',
      }),
    ).toBe(`https://koordinator-server.cz/questor/#duel=${DUEL_ID}.${KOD}`);
  });

  it('Tauri desktop → VZDY verejna webova adresa (host otevira web)', () => {
    expect(
      odkazProHosta(DUEL_ID, KOD, {
        tauri: true,
        origin: 'http://tauri.localhost',
        base: '/',
      }),
    ).toBe(`${WEB_ADRESA_APLIKACE}#duel=${DUEL_ID}.${KOD}`);
  });

  it('dev server (http://localhost:5173, base /) → lokalni odkaz na testovani', () => {
    expect(
      odkazProHosta(DUEL_ID, KOD, { tauri: false, origin: 'http://localhost:5173', base: '/' }),
    ).toBe(`http://localhost:5173/#duel=${DUEL_ID}.${KOD}`);
  });

  it('base bez lomitek se normalizuje', () => {
    expect(
      odkazProHosta(DUEL_ID, KOD, { tauri: false, origin: 'https://x.cz', base: 'questor' }),
    ).toBe(`https://x.cz/questor/#duel=${DUEL_ID}.${KOD}`);
    expect(odkazProHosta(DUEL_ID, KOD, { tauri: false, origin: 'https://x.cz/', base: '' })).toBe(
      `https://x.cz/#duel=${DUEL_ID}.${KOD}`,
    );
  });
});

describe('pozvankaZeStartu — hash pri startu aplikace', () => {
  it('precte pozvanku, vycisti hash a vysledek memoizuje', () => {
    _resetujPozvankuZeStartu();
    const zaznamy: unknown[][] = [];
    const w = {
      location: { hash: `#duel=${DUEL_ID}.${KOD}`, pathname: '/questor/', search: '' },
      history: {
        replaceState: (...args: unknown[]) => {
          zaznamy.push(args);
        },
      },
    } as unknown as Window;
    expect(pozvankaZeStartu(w)).toEqual({ duelId: DUEL_ID, kod: KOD });
    expect(zaznamy).toHaveLength(1);
    expect(zaznamy[0][2]).toBe('/questor/');
    // Druhe volani (StrictMode) vraci memoizovany vysledek bez dalsiho cisteni.
    expect(pozvankaZeStartu(w)).toEqual({ duelId: DUEL_ID, kod: KOD });
    expect(zaznamy).toHaveLength(1);
    _resetujPozvankuZeStartu();
  });

  it('bez hashe → null a adresa se nesaha', () => {
    _resetujPozvankuZeStartu();
    let cisteni = 0;
    const w = {
      location: { hash: '', pathname: '/', search: '' },
      history: {
        replaceState: () => {
          cisteni += 1;
        },
      },
    } as unknown as Window;
    expect(pozvankaZeStartu(w)).toBeNull();
    expect(cisteni).toBe(0);
    _resetujPozvankuZeStartu();
  });
});

describe('lokalni stav hosta — navrat pres tentyz odkaz', () => {
  it('uloz/nacti round-trip', () => {
    const uloziste = pametoveUloziste();
    const stav = { ...vychoziHostStav({ duelId: DUEL_ID, kod: KOD }), jmeno: 'Ondra' };
    ulozHostStav(stav, uloziste);
    expect(nactiHostStav(DUEL_ID, uloziste)).toEqual(stav);
    expect(nactiHostStav('jiny-duel', uloziste)).toBeNull();
  });

  it('poskozeny zaznam → null (fail-safe)', () => {
    const uloziste = pametoveUloziste();
    uloziste.setItem(`questor-host-duel:${DUEL_ID}`, '{rozbite');
    expect(nactiHostStav(DUEL_ID, uloziste)).toBeNull();
    uloziste.setItem(`questor-host-duel:${DUEL_ID}`, JSON.stringify({ neco: 1 }));
    expect(nactiHostStav(DUEL_ID, uloziste)).toBeNull();
  });
});

describe('hostovsky klient — izolace a tvary pozadavku', () => {
  it('vola hostovske endpointy BEZ rodinneho tokenu', async () => {
    const server = falesnyServer(duelOdkazem());
    const klient = vytvorHostKlienta('https://server.cz/questor-api', server.f);
    await klient.stavDuelu(DUEL_ID, KOD);
    await klient.prijmiDuel(DUEL_ID, KOD, 'Ondra');
    await klient.posliVysledekHosta(DUEL_ID, KOD, {
      odpovedi: [],
      body: 0,
      celkovyCasMs: 0,
      dokonceno: TED,
    });
    expect(server.volani.map((v) => v.url)).toEqual([
      `https://server.cz/questor-api/api/hoste/duely/${DUEL_ID}`,
      `https://server.cz/questor-api/api/hoste/duely/${DUEL_ID}/prijmout`,
      `https://server.cz/questor-api/api/hoste/duely/${DUEL_ID}/vysledek`,
    ]);
    // GET nese kod hlavickou; kod NIKDY necestuje v URL (access log proxy).
    expect(server.volani[0].hlavicky['x-questor-host-kod']).toBe(KOD);
    for (const v of server.volani) {
      expect(v.url).not.toContain(KOD);
      expect(v.hlavicky['x-questor-token']).toBeUndefined();
    }
    expect(server.volani[1].telo).toEqual({ kod: KOD, jmeno: 'Ondra' });
  });

  it('spatny kod → ChybaSyncu se statusem 403', async () => {
    const server = falesnyServer(duelOdkazem());
    const klient = vytvorHostKlienta('https://server.cz/api-x', server.f);
    await expect(klient.stavDuelu(DUEL_ID, 'spatny-kod-uplne-jiny')).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('hostovsky tok — prijeti, hra, vysledek, navrat pres odkaz', () => {
  it('cely tok od odkazu po hotovy duel, stav prezije navrat', async () => {
    const vyzyvatelovoVysledek = {
      odpovedi: [
        { otazkaId: 'o1', spravne: true, casMs: 3000 },
        { otazkaId: 'o2', spravne: true, casMs: 4000 },
      ],
      body: 280,
      celkovyCasMs: 7000,
      dokonceno: '2026-09-04T11:00:00.000Z',
    };
    const server = falesnyServer(
      duelOdkazem({ vysledky: { tata: vyzyvatelovoVysledek }, handicap: { tata: 1 } }),
    );
    const klient = vytvorHostKlienta('https://server.cz/questor-api', server.f);
    const uloziste = pametoveUloziste();

    // 1. Host otevrel odkaz → parsovani + prvni nacteni stavu.
    const odkaz = odkazProHosta(DUEL_ID, KOD, {
      tauri: true,
      origin: 'http://tauri.localhost',
      base: '/',
    });
    const pozvanka = zpracujHashPozvanky(odkaz.slice(odkaz.indexOf('#')));
    expect(pozvanka).not.toBeNull();
    let stav = vychoziHostStav(pozvanka!);
    stav = await obnovHostDuel(klient, stav, uloziste);
    // ANTI-CHEAT pred prijetim: zadna sada otazek, zadne vysledky vyzyvatele.
    expect(stav.duel?.otazkyIds).toEqual([]);
    expect(stav.duel?.vysledky).toEqual({});

    // 2. Prijeti se jmenem → plny duel, handicap OBOU 1.0.
    stav = await prijmiPozvanku(klient, stav, 'Ondra', uloziste);
    expect(stav.jmeno).toBe('Ondra');
    expect(stav.duel?.otazkyIds).toEqual(['o1', 'o2']);
    expect(stav.duel?.handicap[HOST_ID]).toBe(1);
    expect(stav.duel?.host).toEqual({ jmeno: 'Ondra' });

    // 3. Hra stejnym enginem — nasobic hosta je 1.0.
    const otazky = [otazkaVyber('o1'), otazkaVyber('o2')];
    let prubeh = odstartujPrubeh(vytvorDuelPrubeh(stav.duel!, HOST_ID, TED), 1_000);
    expect(prubeh.nasobicCasu).toBe(1);
    prubeh = odpovezVPrubehu(prubeh, otazky[0], true, 2_000, 3_000);
    prubeh = odpovezVPrubehu(prubeh, otazky[1], false, 5_000, 8_000);
    expect(prubeh.dokonceno).toBe(true);
    const vysledek = vysledekZPrubehu(prubeh, '2026-09-04T12:05:00.000Z');
    stav = { ...stav, prubeh, vysledek };
    ulozHostStav(stav, uloziste);

    // 4. Odeslani vysledku → server uzavre duel (oba vysledky).
    stav = await odesliHostVysledek(klient, stav, uloziste);
    expect(stav.odeslano).toBe(true);
    expect(stav.duel?.stav).toBe('hotovy');
    expect(stav.duel?.vysledky[HOST_ID]?.odpovedi).toHaveLength(2);
    // Vysledek hosta nenese zadny power-up (host je nema).
    expect(
      stav.duel?.vysledky[HOST_ID]?.odpovedi.every((o) => o.pouzityPowerup === undefined),
    ).toBe(true);

    // 5. Navrat pres tentyz odkaz: ulozeny stav zna jmeno, kod i vysledek.
    const poNavratu = nactiHostStav(DUEL_ID, uloziste);
    expect(poNavratu?.jmeno).toBe('Ondra');
    expect(poNavratu?.kod).toBe(KOD);
    expect(poNavratu?.odeslano).toBe(true);
    expect(poNavratu?.duel?.stav).toBe('hotovy');
  });

  it('obnovHostDuel neprepise lokalne znamou sadu otazek zatajenou verzi', async () => {
    const server = falesnyServer(duelOdkazem()); // host jeste neprijal → GET zatajuje
    const klient = vytvorHostKlienta('https://server.cz/questor-api', server.f);
    const uloziste = pametoveUloziste();
    const stav = {
      ...vychoziHostStav({ duelId: DUEL_ID, kod: KOD }),
      jmeno: 'Ondra',
      duel: duelOdkazem({ otazkyIds: ['o1', 'o2'] }),
    };
    const novy = await obnovHostDuel(klient, stav, uloziste);
    expect(novy.duel?.otazkyIds).toEqual(['o1', 'o2']);
  });

  it('druhe prijeti tehoz odkazu → 409 (first-wins)', async () => {
    const server = falesnyServer(duelOdkazem());
    const klient = vytvorHostKlienta('https://server.cz/questor-api', server.f);
    const uloziste = pametoveUloziste();
    let stav = vychoziHostStav({ duelId: DUEL_ID, kod: KOD });
    stav = await prijmiPozvanku(klient, stav, 'Ondra', uloziste);
    await expect(prijmiPozvanku(klient, stav, 'Petr', uloziste)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe('duel odkazem v rodinnem seznamu (vyzyvatel)', () => {
  it('vyzyvatel smi hrat svou pulku i pred prijetim hosta', () => {
    const duel = duelOdkazem();
    expect(muzeHratDuel(duel, 'tata', TED)).toBe(true);
    // Bezny rodinny duel bez soupere hrat nejde (kontrola, ze vyjimka je jen
    // pro proOdkaz).
    const otevreny = duelOdkazem({ proOdkaz: undefined, otevrenyProRodinu: true });
    expect(muzeHratDuel(otevreny, 'tata', TED)).toBe(false);
  });

  it('rozdelDuely: proOdkaz bez soupere je na tahu, po odehrani ceka na hosta', () => {
    const bezVysledku = duelOdkazem();
    const sVysledkem = duelOdkazem({
      vysledky: {
        tata: { odpovedi: [], body: 100, celkovyCasMs: 5000, dokonceno: TED },
      },
    });
    const r1 = rozdelDuely([bezVysledku], [], 'tata', TED);
    expect(r1.naTahu.map((d) => d.id)).toEqual([DUEL_ID]);
    expect(r1.cekaNaPrijeti).toEqual([]);
    const r2 = rozdelDuely([sVysledkem], [], 'tata', TED);
    expect(r2.cekameNaSoupere.map((d) => d.id)).toEqual([DUEL_ID]);
  });

  it('rodinna otevrena vyzva bez soupere dal ceka na prijeti (regrese)', () => {
    const otevreny = duelOdkazem({ proOdkaz: undefined, otevrenyProRodinu: true });
    const r = rozdelDuely([otevreny], [], 'tata', TED);
    expect(r.cekaNaPrijeti.map((d) => d.id)).toEqual([DUEL_ID]);
  });
});

describe('hostovske UI — power-upy jsou skryte', () => {
  it('HostOtazka nevykresluje listu power-upu, ale odpocet ano', () => {
    const duel = duelOdkazem({
      souper: { profilId: HOST_ID, jmeno: 'Ondra' },
      host: { jmeno: 'Ondra' },
      handicap: { tata: 1, [HOST_ID]: 1 },
      stav: 'prijaty',
    });
    const prubeh = odstartujPrubeh(vytvorDuelPrubeh(duel, HOST_ID, TED), Date.parse(TED));
    const html = renderToStaticMarkup(
      <HostOtazka prubeh={prubeh} otazka={otazkaVyber('o1')} onOdpoved={() => {}} />,
    );
    expect(html).not.toContain('duel-powerup');
    expect(html).toContain('duel-odpocet__bar');
    expect(html).toContain('1/2');
    expect(html).toContain('Otazka o1?');
  });
});

// Pojistka: banka pomucek se pouziva ve flow testu vyse jen pro otazky —
// tenhle test drzi kompilator, at helper nezustane mrtvy.
describe('pomucky testu', () => {
  it('banka obsahuje zadane otazky', () => {
    expect(banka([otazkaVyber('o1')]).otazky).toHaveLength(1);
  });
});
