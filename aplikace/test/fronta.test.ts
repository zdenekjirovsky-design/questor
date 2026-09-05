// Testy offline fronty syncu — odesílání v pořadí, tiché selhání
// s exponenciálním odkladem, dedupe progresu a persistence v úložišti.
import { describe, expect, it, vi } from 'vitest';
import type { ProfilRegistrZaznam, ProgresStudenta, TestVysledek } from '@questor/sdilene';
import { ChybaSyncu, pametoveUloziste } from '../src/sync/klient';
import {
  MAX_ODKLAD_MS,
  SyncFronta,
  ZAKLADNI_ODKLAD_MS,
  type KlientProFrontu,
} from '../src/sync/fronta';

const vysledek = (id: string) => ({ id }) as unknown as TestVysledek;
const progres = (xp: number) => ({ xp }) as unknown as ProgresStudenta;

function mockKlient(selze = false): KlientProFrontu & {
  posliUdalost: ReturnType<typeof vi.fn>;
  posliProgres: ReturnType<typeof vi.fn>;
  posliVysledekVyzvy: ReturnType<typeof vi.fn>;
  posliProfil: ReturnType<typeof vi.fn>;
  smazProfilNaServeru: ReturnType<typeof vi.fn>;
} {
  const vysledekVolani = selze
    ? () => Promise.reject(new Error('síť spadla'))
    : () => Promise.resolve();
  return {
    posliUdalost: vi.fn(vysledekVolani),
    posliProgres: vi.fn(vysledekVolani),
    posliVysledekVyzvy: vi.fn(vysledekVolani),
    posliProfil: vi.fn(vysledekVolani),
    smazProfilNaServeru: vi.fn(vysledekVolani),
  };
}

describe('SyncFronta', () => {
  it('odešle položky v pořadí a frontu vyprázdní', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));
    fronta.pridejVysledekVyzvy('vyzva-1', { uspesnost: 0.8, xp: 120 });
    fronta.pridejProgres(progres(500));

    const klient = mockKlient();
    const zprava = await fronta.odesli(klient, 1_000);

    expect(zprava).toEqual({ odeslano: 3, zbyva: 0 });
    expect(fronta.velikost()).toBe(0);
    expect(klient.posliUdalost).toHaveBeenCalledWith(vysledek('v1'));
    expect(klient.posliVysledekVyzvy).toHaveBeenCalledWith('vyzva-1', {
      uspesnost: 0.8,
      xp: 120,
    });
    expect(klient.posliProgres).toHaveBeenCalledWith(progres(500));
  });

  it('progres se dedupuje — ve frontě je vždy jen nejnovější snapshot', () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejProgres(progres(100));
    fronta.pridejUdalost(vysledek('v1'));
    fronta.pridejProgres(progres(999));

    expect(fronta.velikost()).toBe(2);
    const progresy = fronta.polozky().filter((p) => p.typ === 'progres');
    expect(progresy).toHaveLength(1);
    expect(progresy[0].data).toEqual(progres(999));
  });

  it('selhání je tiché: položka zůstává a další pokus se odkládá exponenciálně', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));

    const rozbity = mockKlient(true);
    const ted = 10_000;
    await expect(fronta.odesli(rozbity, ted)).resolves.toEqual({ odeslano: 0, zbyva: 1 });
    expect(fronta.velikost()).toBe(1);

    // 1. selhání → odklad 5 s
    expect(fronta.muzeZkusit(ted + ZAKLADNI_ODKLAD_MS - 1)).toBe(false);
    expect(fronta.muzeZkusit(ted + ZAKLADNI_ODKLAD_MS)).toBe(true);

    // 2. selhání → odklad 10 s
    const ted2 = ted + ZAKLADNI_ODKLAD_MS;
    await fronta.odesli(rozbity, ted2);
    expect(fronta.muzeZkusit(ted2 + 2 * ZAKLADNI_ODKLAD_MS - 1)).toBe(false);
    expect(fronta.muzeZkusit(ted2 + 2 * ZAKLADNI_ODKLAD_MS)).toBe(true);
  });

  it('odklad je zastropovaný na 5 minutách', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));
    const rozbity = mockKlient(true);
    let ted = 0;
    for (let i = 0; i < 12; i++) {
      fronta.vynulujOdklad();
      await fronta.odesli(rozbity, ted);
    }
    expect(fronta.muzeZkusit(ted + MAX_ODKLAD_MS - 1)).toBe(false);
    expect(fronta.muzeZkusit(ted + MAX_ODKLAD_MS)).toBe(true);
  });

  it('během odkladu se nic neposílá (žádné zbytečné požadavky)', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));
    const rozbity = mockKlient(true);
    await fronta.odesli(rozbity, 0);
    expect(rozbity.posliUdalost).toHaveBeenCalledTimes(1);

    await expect(fronta.odesli(rozbity, 1_000)).resolves.toEqual({ odeslano: 0, zbyva: 1 });
    expect(rozbity.posliUdalost).toHaveBeenCalledTimes(1); // v odkladu se nevolá
  });

  it('po úspěchu se odklad vynuluje', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));
    await fronta.odesli(mockKlient(true), 0); // selhání → odklad
    fronta.vynulujOdklad(); // ruční sync
    await fronta.odesli(mockKlient(), 1);
    expect(fronta.velikost()).toBe(0);
    fronta.pridejUdalost(vysledek('v2'));
    expect(fronta.muzeZkusit(2)).toBe(true);
  });

  it('částečné selhání: odeslané položky zmizí, zbytek čeká', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));
    fronta.pridejProgres(progres(100));

    const klient = mockKlient();
    klient.posliProgres.mockRejectedValueOnce(new Error('výpadek'));
    const zprava = await fronta.odesli(klient, 0);

    expect(zprava).toEqual({ odeslano: 1, zbyva: 1 });
    expect(fronta.polozky()[0].typ).toBe('progres');
  });

  it('zápis do fronty během letícího odeslání neztratí žádnou položku', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejProgres(progres(1));

    const klient = mockKlient();
    // Během awaitu odeslání P1 přijde dokončený test: událost + nový progres
    // (pridejProgres odfiltruje letící P1 z indexu 0 a pole přeindexuje).
    klient.posliProgres.mockImplementationOnce(async () => {
      fronta.pridejUdalost(vysledek('u1'));
      fronta.pridejProgres(progres(2));
    });

    const zprava = await fronta.odesli(klient, 0);

    expect(zprava.zbyva).toBe(0);
    expect(fronta.velikost()).toBe(0);
    // Událost u1 nesmí tiše zmizet a novější progres musí odejít taky.
    expect(klient.posliUdalost).toHaveBeenCalledWith(vysledek('u1'));
    expect(klient.posliProgres).toHaveBeenCalledWith(progres(2));
  });

  it('trvale odmítnutá položka (4xx) se zahodí a neblokuje zbytek fronty', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejVysledekVyzvy('smazana-vyzva', { uspesnost: 1, xp: 10 });
    fronta.pridejUdalost(vysledek('v1'));

    const klient = mockKlient();
    klient.posliVysledekVyzvy.mockRejectedValue(new ChybaSyncu('Výzva neexistuje', 404));

    const zprava = await fronta.odesli(klient, 0);

    expect(zprava).toEqual({ odeslano: 1, zbyva: 0 });
    expect(fronta.velikost()).toBe(0);
    expect(klient.posliUdalost).toHaveBeenCalledWith(vysledek('v1'));
    // Zahození není selhání — žádný odklad.
    expect(fronta.muzeZkusit(1)).toBe(true);
  });

  it('408/429 se počítají jako dočasné selhání — položka zůstává', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejUdalost(vysledek('v1'));

    const klient = mockKlient();
    klient.posliUdalost.mockRejectedValueOnce(new ChybaSyncu('Moc požadavků', 429));

    await expect(fronta.odesli(klient, 0)).resolves.toEqual({ odeslano: 0, zbyva: 1 });
    expect(fronta.velikost()).toBe(1);
    expect(fronta.muzeZkusit(ZAKLADNI_ODKLAD_MS - 1)).toBe(false);
  });

  it('zrus() vyprázdní frontu a zakáže zápis — letící odesli() klíč znovu nezaloží', async () => {
    const uloziste = pametoveUloziste();
    const klic = 'questor-sync-fronta:smazany-profil';
    const fronta = new SyncFronta(uloziste, klic);
    fronta.pridejUdalost(vysledek('v1'));
    fronta.pridejUdalost(vysledek('v2'));
    expect(uloziste.getItem(klic)).not.toBeNull();

    const klient = mockKlient();
    // Během letícího awaitu odeslání v1 se profil smaže: klíč zmizí a fronta
    // se zruší. Bez příznaku zrusena by odesli() po doběhnutí klíč znovu
    // zapsal a osobní data smazaného profilu by v localStorage zůstala navždy.
    klient.posliUdalost.mockImplementationOnce(async () => {
      uloziste.removeItem(klic);
      fronta.zrus();
    });

    await fronta.odesli(klient, 0);

    expect(uloziste.getItem(klic)).toBeNull();
    expect(fronta.velikost()).toBe(0);
    // v2 patřila smazanému profilu — po zrušení se už neodesílá.
    expect(klient.posliUdalost).toHaveBeenCalledTimes(1);

    // Ani další pokusy o zápis klíč nevzkřísí.
    fronta.pridejUdalost(vysledek('v3'));
    expect(uloziste.getItem(klic)).toBeNull();
  });

  it('přežije restart — načte se ze stejného úložiště', async () => {
    const uloziste = pametoveUloziste();
    const prvni = new SyncFronta(uloziste);
    prvni.pridejUdalost(vysledek('v1'));
    prvni.pridejProgres(progres(100));

    const podruhe = new SyncFronta(uloziste);
    expect(podruhe.velikost()).toBe(2);
    const klient = mockKlient();
    await podruhe.odesli(klient, 0);
    expect(klient.posliUdalost).toHaveBeenCalledWith(vysledek('v1'));
  });
});

// ---------------------------------------------------------------------------

describe('SyncFronta — registr profilu (profil / smazani-profilu)', () => {
  const zaznam = (profilId: string, jmeno: string): ProfilRegistrZaznam => ({
    profilId,
    jmeno,
    barva: '#8b5cf6',
    predmety: ['matematika'],
    aktivniPredmetId: 'matematika',
    aktualizovano: '2026-09-05T10:00:00.000Z',
  });

  it('pridejProfil dedupuje na nejnovejsi zaznam DANEHO profilu', () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejProfil(zaznam('p1', 'Kuba'));
    fronta.pridejProfil(zaznam('p2', 'Mama'));
    fronta.pridejProfil(zaznam('p1', 'Kubis'));

    const profily = fronta.polozky().filter((p) => p.typ === 'profil');
    expect(profily).toHaveLength(2);
    expect(profily.map((p) => (p.data as ProfilRegistrZaznam).jmeno)).toEqual(['Mama', 'Kubis']);
  });

  it('pridejSmazaniProfilu zahodi cekajici upsert tehoz profilu a dedupuje se', () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejProfil(zaznam('p1', 'Kuba'));
    fronta.pridejSmazaniProfilu('p1');
    fronta.pridejSmazaniProfilu('p1');

    expect(fronta.velikost()).toBe(1);
    expect(fronta.polozky()[0].typ).toBe('smazani-profilu');
  });

  it('odesli vola posliProfil a smazProfilNaServeru', async () => {
    const fronta = new SyncFronta(pametoveUloziste());
    fronta.pridejProfil(zaznam('p1', 'Kuba'));
    fronta.pridejSmazaniProfilu('p2');

    const klient = mockKlient();
    const zprava = await fronta.odesli(klient, 1_000);

    expect(zprava).toEqual({ odeslano: 2, zbyva: 0 });
    expect(klient.posliProfil).toHaveBeenCalledWith(zaznam('p1', 'Kuba'));
    expect(klient.smazProfilNaServeru).toHaveBeenCalledWith('p2');
  });
});
