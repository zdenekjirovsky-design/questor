// Testy syncu profilu mezi zarizenimi rodiny:
// - vychozi adresy serveru per prostredi (web https / Tauri / dev / LAN http),
// - ulozeni rodinneho kodu (prazdny token = sync vypnuty, je to platna hodnota),
// - merge registru profilu (LWW dle aktualizovano; pridani ze serveru,
//   propagace smazani pres priznak naServeru, NIKDY nemazat lokalni profil,
//   ktery na serveru nebyl),
// - offline fronta PUT profilu (vytvoreni/zmena profilu radi zaznam do fronty),
// - pull kompletniho postupu pri aktivaci (LWW dle progres.aktualizovano,
//   404 = push lokalu, prepnuti profilu behem letu vysledek zahodi).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfilRegistrZaznam, ProgresStudenta } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';
import { BARVY_PROFILU } from '../src/stav/profilySlice';
import {
  jeTauriProstredi,
  nactiSyncNastaveni,
  pametoveUloziste,
  ulozSyncNastaveni,
  urciVychoziNastaveni,
  vychoziUloziste,
  type FetchFunkce,
} from '../src/sync/klient';
import { klicFrontyProfilu, KLIC_FRONTY_REGISTRU, SyncFronta } from '../src/sync/fronta';
import {
  stahniPostupProfilu,
  zaznamenejSmazaniProfilu,
  zaznamenejZmenuProfilu,
} from '../src/sync/sync';

const KLIC_NASTAVENI = 'questor-sync-nastaveni';

function vynulujStore(): void {
  pouzijStav.getState().resetujProgres();
  pouzijStav.setState({ profily: [], aktivniProfilId: null, dataProfilu: {} });
}

function zaznam(prepis: Partial<ProfilRegistrZaznam> = {}): ProfilRegistrZaznam {
  return {
    profilId: 'p-server',
    jmeno: 'Ze serveru',
    barva: '#34d399',
    predmety: ['matematika'],
    aktivniPredmetId: 'matematika',
    aktualizovano: '2026-09-01T10:00:00.000Z',
    ...prepis,
  };
}

beforeEach(() => {
  vynulujStore();
});

afterEach(() => {
  vychoziUloziste().removeItem(KLIC_NASTAVENI);
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------

describe('vychozi adresy serveru per prostredi', () => {
  it('web pres https → stejny origin + /questor-api, bez rodinneho kodu', () => {
    expect(
      urciVychoziNastaveni({
        protocol: 'https:',
        hostname: 'koordinator-server.cz',
        origin: 'https://koordinator-server.cz',
        tauri: false,
      }),
    ).toEqual({ url: 'https://koordinator-server.cz/questor-api', token: '' });
  });

  it('Tauri desktop → verejny server, bez rodinneho kodu', () => {
    expect(
      urciVychoziNastaveni({
        protocol: 'http:',
        hostname: 'tauri.localhost',
        origin: 'http://tauri.localhost',
        tauri: true,
      }),
    ).toEqual({ url: 'https://koordinator-server.cz/questor-api', token: '' });
  });

  it('dev (http + localhost) → lokalni server s dev tokenem', () => {
    expect(
      urciVychoziNastaveni({
        protocol: 'http:',
        hostname: 'localhost',
        origin: 'http://localhost:5173',
        tauri: false,
      }),
    ).toEqual({ url: 'http://localhost:8787', token: 'student-dev' });
  });

  it('http mimo localhost (LAN) → sync vypnuty, dokud uzivatel nevyplni adresu', () => {
    expect(
      urciVychoziNastaveni({
        protocol: 'http:',
        hostname: '192.168.1.20',
        origin: 'http://192.168.1.20',
        tauri: false,
      }),
    ).toEqual({ url: '', token: '' });
  });

  it('jeTauriProstredi pozna internni globaly, protokol tauri: i tauri.localhost', () => {
    expect(jeTauriProstredi({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(jeTauriProstredi({ __TAURI__: {} })).toBe(true);
    expect(jeTauriProstredi({ location: { protocol: 'tauri:', hostname: 'localhost' } })).toBe(true);
    expect(
      jeTauriProstredi({ location: { protocol: 'http:', hostname: 'tauri.localhost' } }),
    ).toBe(true);
    expect(
      jeTauriProstredi({ location: { protocol: 'https:', hostname: 'app.tauri.localhost' } }),
    ).toBe(true);
    expect(
      jeTauriProstredi({ location: { protocol: 'https:', hostname: 'sined.cz' } }),
    ).toBe(false);
    expect(jeTauriProstredi(undefined)).toBe(false);
  });
});

describe('rodinny kod (ulozeni)', () => {
  it('kod se ulozi a nacte zpatky', () => {
    const uloziste = pametoveUloziste();
    ulozSyncNastaveni({ url: 'https://server.test/questor-api', token: 'tajny-kod' }, uloziste);
    expect(nactiSyncNastaveni(uloziste)).toEqual({
      url: 'https://server.test/questor-api',
      token: 'tajny-kod',
    });
  });

  it('prazdny token je PLATNA hodnota (sync vypnuty) — nespadne na vychozi', () => {
    const uloziste = pametoveUloziste();
    ulozSyncNastaveni({ url: 'http://localhost:8787', token: '' }, uloziste);
    expect(nactiSyncNastaveni(uloziste).token).toBe('');
  });
});

// ---------------------------------------------------------------------------

describe('merge registru profilu (aplikujRegistrProfilu, LWW)', () => {
  it('server novejsi → prevezme metadata vc. zruseni PINu a oznaci naServeru', () => {
    const kuba = pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika']);
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({
        ...p,
        pinHash: 'stary-hash',
        aktualizovano: '2026-09-01T10:00:00.000Z',
      })),
    });

    const { pushnout, smazane } = pouzijStav.getState().aplikujRegistrProfilu([
      zaznam({
        profilId: kuba.id,
        jmeno: 'Kubis',
        barva: '#60a5fa',
        predmety: ['fyzika', 'chemie'],
        aktivniPredmetId: 'fyzika',
        aktualizovano: '2026-09-02T10:00:00.000Z',
        // BEZ pinHash → zruseni PINu na jinem zarizeni plati i tady.
      }),
    ]);

    expect(pushnout).toEqual([]);
    expect(smazane).toEqual([]);
    const profil = pouzijStav.getState().profily[0];
    expect(profil.jmeno).toBe('Kubis');
    expect(profil.barva).toBe('#60a5fa');
    expect(profil.predmety).toEqual(['fyzika', 'chemie']);
    expect(profil.aktivniPredmetId).toBe('fyzika');
    expect(profil.aktualizovano).toBe('2026-09-02T10:00:00.000Z');
    expect(profil.naServeru).toBe(true);
    expect('pinHash' in profil).toBe(false);
  });

  it('lokal novejsi → zustava a vraci se v pushnout (s priznakem naServeru)', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({
        ...p,
        aktualizovano: '2026-09-03T10:00:00.000Z',
      })),
    });

    const { pushnout } = pouzijStav.getState().aplikujRegistrProfilu([
      zaznam({ profilId: kuba.id, jmeno: 'Stary Kuba', aktualizovano: '2026-09-01T10:00:00.000Z' }),
    ]);

    expect(pushnout.map((p) => p.id)).toEqual([kuba.id]);
    const profil = pouzijStav.getState().profily[0];
    expect(profil.jmeno).toBe('Kuba');
    expect(profil.naServeru).toBe(true);
  });

  it('profil jen na serveru se PRIDA (naServeru, avatar do snimku pro kartu)', () => {
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const avatarZeServeru = { ...pouzijStav.getState().progres.avatar, barvaVlasu: '#ff0000' };

    const { pushnout } = pouzijStav
      .getState()
      .aplikujRegistrProfilu([
        zaznam({ profilId: 'p-mama', jmeno: 'Máma', avatar: avatarZeServeru }),
      ]);

    const stav = pouzijStav.getState();
    const mama = stav.profily.find((p) => p.id === 'p-mama');
    expect(mama).toBeTruthy();
    expect(mama!.jmeno).toBe('Máma');
    expect(mama!.naServeru).toBe(true);
    expect(stav.dataProfilu['p-mama'].progres.avatar.barvaVlasu).toBe('#ff0000');
    // KLICOVE: snimek ma progres.aktualizovano = EPOCHA — pri aktivaci na
    // novem zarizeni musi LWW pull vyhrat SERVEROVY postup, ne prazdny lokal.
    expect(stav.dataProfilu['p-mama'].progres.aktualizovano).toBe('1970-01-01T00:00:00.000Z');
    // Lokalni profil, ktery server nezna, jde do pushnout (nikdy se nemaze).
    expect(pushnout.map((p) => p.jmeno)).toEqual(['Kuba']);
  });

  it('profil smazany na serveru (ma naServeru) se smaze i lokalne', () => {
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const mama = pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[1]);
    // Oba profily uz server znal.
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({ ...p, naServeru: true })),
    });

    // Server zna uz jen Kubu (mama byla smazana na jinem zarizeni). Mama je
    // ted AKTIVNI → aplikace se vraci na vyber profilu.
    const kubaId = pouzijStav.getState().profily[0].id;
    const { smazane } = pouzijStav
      .getState()
      .aplikujRegistrProfilu([
        zaznam({ profilId: kubaId, jmeno: 'Kuba', aktualizovano: '2020-01-01T00:00:00.000Z' }),
      ]);

    expect(smazane).toEqual([mama.id]);
    const stav = pouzijStav.getState();
    expect(stav.profily.map((p) => p.jmeno)).toEqual(['Kuba']);
    expect(stav.aktivniProfilId).toBe(null);
    expect(stav.dataProfilu[mama.id]).toBeUndefined();
  });

  it('lokalni profil BEZ priznaku naServeru se NIKDY nemaze — jen pushne', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);

    const { pushnout, smazane } = pouzijStav.getState().aplikujRegistrProfilu([]);

    expect(smazane).toEqual([]);
    expect(pushnout.map((p) => p.id)).toEqual([kuba.id]);
    expect(pouzijStav.getState().profily).toHaveLength(1);
  });

  it('POJISTKA: prazdny registr NEsmaze lokalni profily se znamym serverem — pushnou se', () => {
    // Preinstalovany server / ztracena questor.db vrati 200 [] — lokalni data
    // jsou posledni zaloha a plosny vymaz je nenavratny.
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[1]);
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({ ...p, naServeru: true })),
    });

    const { pushnout, smazane } = pouzijStav.getState().aplikujRegistrProfilu([]);

    expect(smazane).toEqual([]);
    const stav = pouzijStav.getState();
    expect(stav.profily.map((p) => p.jmeno)).toEqual(['Kuba', 'Máma']);
    expect(stav.aktivniProfilId).not.toBe(null);
    // Server se z lokalnich dat znovu naplni.
    expect(pushnout.map((p) => p.jmeno)).toEqual(['Kuba', 'Máma']);
  });

  it('POJISTKA: cizi registr, ktery by smazal VSECHNY lokalni profily, je nesmaze', () => {
    // Prepnuti Adresy serveru na jinou instanci se stejnym rodinnym kodem:
    // server vrati jen cizi profily — vsechny lokalni by sly do kose.
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[1]);
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({ ...p, naServeru: true })),
    });

    const { pushnout, smazane } = pouzijStav
      .getState()
      .aplikujRegistrProfilu([zaznam({ profilId: 'p-cizi', jmeno: 'Cizí' })]);

    expect(smazane).toEqual([]);
    const stav = pouzijStav.getState();
    expect(stav.profily.map((p) => p.jmeno)).toEqual(['Kuba', 'Máma', 'Cizí']);
    expect(pushnout.map((p) => p.jmeno)).toEqual(['Kuba', 'Máma']);
  });

  it('stejny cas (LWW remiza) → lokal zustava a nic se nepushuje', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const cas = '2026-09-02T10:00:00.000Z';
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({ ...p, aktualizovano: cas })),
    });

    const { pushnout } = pouzijStav
      .getState()
      .aplikujRegistrProfilu([
        zaznam({ profilId: kuba.id, jmeno: 'Jiny Kuba', aktualizovano: cas }),
      ]);

    expect(pushnout).toEqual([]);
    expect(pouzijStav.getState().profily[0].jmeno).toBe('Kuba');
    expect(pouzijStav.getState().profily[0].naServeru).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('offline fronta PUT profilu', () => {
  it('zmena profilu radi zaznam registru do fronty profilu (dedupe na nejnovejsi)', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    zaznamenejZmenuProfilu(kuba.id);
    pouzijStav.getState().prejmenujProfil(kuba.id, 'Kubis');
    zaznamenejZmenuProfilu(kuba.id);

    const fronta = new SyncFronta(vychoziUloziste(), klicFrontyProfilu(kuba.id));
    const profily = fronta.polozky().filter((p) => p.typ === 'profil');
    expect(profily).toHaveLength(1);
    const data = profily[0].data as ProfilRegistrZaznam;
    expect(data.profilId).toBe(kuba.id);
    expect(data.jmeno).toBe('Kubis');
    expect(data.predmety.length).toBeGreaterThan(0);
    expect(data.aktivniPredmetId).toBeTruthy();
    expect(typeof data.aktualizovano).toBe('string');
    // Avatar aktivniho profilu jde z pracovni sady.
    expect(data.avatar).toEqual(pouzijStav.getState().progres.avatar);
  });

  it('vytvoreni profilu naplanuje push automaticky (dynamicky import)', async () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    // naplanujPushProfilu jde pres dynamicky import — pockat na microtasky.
    await new Promise((r) => setTimeout(r, 20));

    const fronta = new SyncFronta(vychoziUloziste(), klicFrontyProfilu(kuba.id));
    expect(fronta.polozky().some((p) => p.typ === 'profil')).toBe(true);
  });

  it('smazani profilu zapomene jeho frontu a DELETE zaradi do fronty registru', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    zaznamenejZmenuProfilu(kuba.id);
    zaznamenejSmazaniProfilu(kuba.id);

    // Fronta profilu je pryc (klic smazany), DELETE ceka ve fronte registru.
    expect(vychoziUloziste().getItem(klicFrontyProfilu(kuba.id))).toBe(null);
    const registr = new SyncFronta(vychoziUloziste(), KLIC_FRONTY_REGISTRU);
    const smazani = registr.polozky().filter((p) => p.typ === 'smazani-profilu');
    expect(smazani.map((p) => (p.data as { profilId: string }).profilId)).toContain(kuba.id);
    // Uklid, at polozka nestrasi dalsi testy.
    registr.zrus();
    vychoziUloziste().removeItem(KLIC_FRONTY_REGISTRU);
  });
});

// ---------------------------------------------------------------------------

describe('pull postupu pri aktivaci (stahniPostupProfilu, LWW)', () => {
  function zapniSync(): void {
    ulozSyncNastaveni({ url: 'http://server.test', token: 'rodina' });
  }

  /** Fetch stub: GET progresu vraci `odpoved`, zapisy se evideji. */
  function nastavFetch(odpoved: { status: number; telo: unknown }) {
    const volani: { metoda: string; url: string; telo?: unknown }[] = [];
    const f = vi.fn<FetchFunkce>(async (url, init) => {
      const metoda = init?.method ?? 'GET';
      volani.push({
        metoda,
        url,
        telo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (metoda === 'GET' && url.includes('/api/progres/')) {
        return new Response(JSON.stringify(odpoved.telo), { status: odpoved.status });
      }
      // POST progresu / PUT profilu — server vsechno prijme.
      return new Response(JSON.stringify({ ok: true, prijato: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', f);
    return volani;
  }

  function serverovyProgres(xp: number, aktualizovano: string): ProgresStudenta {
    return { ...structuredClone(pouzijStav.getState().progres), xp, aktualizovano };
  }

  it('serverovy progres s novejsim aktualizovano nahradi lokalni snimek a obnovi questy', async () => {
    zapniSync();
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({
      progres: { ...pouzijStav.getState().progres, xp: 10, aktualizovano: '2026-09-01T10:00:00.000Z' },
    });
    nastavFetch({
      status: 200,
      telo: { progres: serverovyProgres(777, '2026-09-04T10:00:00.000Z'), prijato: 'x' },
    });

    await stahniPostupProfilu();

    const progres = pouzijStav.getState().progres;
    expect(progres.xp).toBe(777);
    expect(progres.aktualizovano).toBe('2026-09-04T10:00:00.000Z');
    // Odvozene se obnovilo — questy dneska existuji.
    expect(progres.questy.length).toBeGreaterThan(0);
  });

  it('splnene questy ze serveroveho progresu se oznaci jako odmenene (zadna dvoji odmena)', async () => {
    zapniSync();
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({
      progres: { ...pouzijStav.getState().progres, aktualizovano: '2026-09-01T10:00:00.000Z' },
      questyOdmeneno: [],
    });
    // Dnesni quest splneny (a tedy uz odmeneny) na jinem zarizeni.
    const dnes = new Date();
    const den = `${dnes.getFullYear()}-${String(dnes.getMonth() + 1).padStart(2, '0')}-${String(dnes.getDate()).padStart(2, '0')}`;
    const splnenyQuest = {
      id: `${den}:spravne`,
      sablona: 'spravne',
      popis: 'Odpověz 10× správně',
      cil: 10,
      postup: 10,
      splneno: true,
      odmenaXp: 50,
      datum: den,
    };
    const serverovy = {
      ...serverovyProgres(500, '2026-09-04T10:00:00.000Z'),
      questy: [splnenyQuest],
    };
    nastavFetch({ status: 200, telo: { progres: serverovy, prijato: 'x' } });

    await stahniPostupProfilu();

    // Prevzaty snapshot + quest oznaceny jako odmeneny — pristi
    // zapocitejOdpoved/dokonciLekci ho NEodmeni podruhe.
    expect(pouzijStav.getState().progres.xp).toBe(500);
    expect(pouzijStav.getState().questyOdmeneno).toContain(`${den}:spravne`);
  });

  it('lokalni progres novejsi → zustava a pushne se na server', async () => {
    zapniSync();
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({
      progres: { ...pouzijStav.getState().progres, xp: 500, aktualizovano: '2026-09-05T10:00:00.000Z' },
    });
    const volani = nastavFetch({
      status: 200,
      telo: { progres: serverovyProgres(1, '2026-09-01T10:00:00.000Z'), prijato: 'x' },
    });

    await stahniPostupProfilu();

    expect(pouzijStav.getState().progres.xp).toBe(500);
    const push = volani.find((v) => v.metoda === 'POST' && v.url.endsWith('/api/progres'));
    expect(push).toBeTruthy();
    expect((push!.telo as Record<string, unknown>).xp).toBe(500);
    expect((push!.telo as Record<string, unknown>).profilId).toBe(
      pouzijStav.getState().aktivniProfilId,
    );
  });

  it('404 (server o profilu nic nema) → lokalni postup se pushne', async () => {
    zapniSync();
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({
      progres: { ...pouzijStav.getState().progres, xp: 250 },
    });
    const volani = nastavFetch({ status: 404, telo: { chyba: 'neni' } });

    await stahniPostupProfilu();

    expect(pouzijStav.getState().progres.xp).toBe(250);
    const push = volani.find((v) => v.metoda === 'POST' && v.url.endsWith('/api/progres'));
    expect(push).toBeTruthy();
  });

  it('prepnuti profilu behem letu → vysledek se ZAHODI', async () => {
    zapniSync();
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const mama = pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[1]);
    pouzijStav.getState().prepniProfil(kuba.id);

    const f = vi.fn<FetchFunkce>(async (url, init) => {
      if ((init?.method ?? 'GET') === 'GET' && url.includes('/api/progres/')) {
        // Behem letu se prepne na mamu — pull patril Kubovi.
        pouzijStav.getState().prepniProfil(mama.id);
        return new Response(
          JSON.stringify({
            progres: serverovyProgres(9999, '2099-01-01T00:00:00.000Z'),
            prijato: 'x',
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', f);

    await stahniPostupProfilu();

    // Serverovy (Kubuv) progres nesmi pristat v pracovni sade mamy.
    expect(pouzijStav.getState().progres.xp).not.toBe(9999);
  });

  it('bez rodinneho kodu je pull no-op (zadny fetch)', async () => {
    ulozSyncNastaveni({ url: 'http://server.test', token: '' });
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const f = vi.fn<FetchFunkce>();
    vi.stubGlobal('fetch', f);

    await stahniPostupProfilu();

    expect(f).not.toHaveBeenCalled();
  });
});
