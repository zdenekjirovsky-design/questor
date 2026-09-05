// Testy hostovské části duelového kontraktu (duel odkazem, fáze 2):
// vyhrazený profilId hosta (host:<duelId>) a pravidla duelSchema pro
// pole proOdkaz / hostKodHash / host.

import { describe, expect, it } from 'vitest';
import { duelSchema, HOST_PROFIL_PREFIX, hostProfilId, jeHostProfilId } from '../src/index';
import type { Duel } from '../src/index';

function duelOdkazem(prepis: Partial<Duel> = {}): Duel {
  return {
    id: 'd-1',
    predmetId: 'ekonomika',
    pocetOtazek: 5,
    otazkyIds: ['o-1', 'o-2', 'o-3', 'o-4', 'o-5'],
    vyzyvatel: { profilId: 'tata', jmeno: 'Táta' },
    otevrenyProRodinu: false,
    proOdkaz: true,
    hostKodHash: 'a'.repeat(64),
    handicap: { tata: 1 },
    stav: 'cekajici',
    vysledky: {},
    vytvoreno: '2026-09-04T10:00:00.000Z',
    vyprsi: '2026-09-05T10:00:00.000Z',
    ...prepis,
  };
}

describe('hostProfilId', () => {
  it('skládá vyhrazený profilId z prefixu a id duelu', () => {
    expect(hostProfilId('d-1')).toBe('host:d-1');
    expect(hostProfilId('d-1').startsWith(HOST_PROFIL_PREFIX)).toBe(true);
  });

  it('jeHostProfilId poznává jen prefix host:', () => {
    expect(jeHostProfilId('host:d-1')).toBe(true);
    expect(jeHostProfilId('tata')).toBe(false);
    expect(jeHostProfilId('hostitel')).toBe(false);
  });
});

describe('duelSchema — duel odkazem', () => {
  it('platný duel odkazem projde (bez soupeře i s hostem)', () => {
    expect(duelSchema.safeParse(duelOdkazem()).success).toBe(true);
    const sHostem = duelOdkazem({
      souper: { profilId: hostProfilId('d-1'), jmeno: 'Karel' },
      host: { jmeno: 'Karel' },
      handicap: { tata: 1, [hostProfilId('d-1')]: 1 },
      stav: 'prijaty',
    });
    expect(duelSchema.safeParse(sHostem).success).toBe(true);
  });

  it('duel odkazem nesmí být otevřený pro rodinu a musí mít hash kódu', () => {
    expect(duelSchema.safeParse(duelOdkazem({ otevrenyProRodinu: true })).success).toBe(false);
    const bezHashe = { ...duelOdkazem() };
    delete bezHashe.hostKodHash;
    expect(duelSchema.safeParse(bezHashe).success).toBe(false);
  });

  it('hostovská pole bez proOdkaz neprojdou', () => {
    const bezPriznaku = { ...duelOdkazem() };
    delete bezPriznaku.proOdkaz;
    expect(duelSchema.safeParse(bezPriznaku).success).toBe(false);
  });

  it('soupeřem duelu odkazem smí být jen host tohoto duelu', () => {
    const ciziSouper = duelOdkazem({
      souper: { profilId: 'syn', jmeno: 'Syn' },
      handicap: { tata: 1, syn: 1 },
      stav: 'prijaty',
    });
    expect(duelSchema.safeParse(ciziSouper).success).toBe(false);

    const hostJinehoDuelu = duelOdkazem({
      souper: { profilId: hostProfilId('d-2'), jmeno: 'Karel' },
      host: { jmeno: 'Karel' },
      handicap: { tata: 1, [hostProfilId('d-2')]: 1 },
      stav: 'prijaty',
    });
    expect(duelSchema.safeParse(hostJinehoDuelu).success).toBe(false);
  });

  it('výsledek hosta nesmí používat power-upy', () => {
    const hostId = hostProfilId('d-1');
    const sPowerupem = duelOdkazem({
      souper: { profilId: hostId, jmeno: 'Karel' },
      host: { jmeno: 'Karel' },
      handicap: { tata: 1, [hostId]: 1 },
      stav: 'prijaty',
      vysledky: {
        [hostId]: {
          odpovedi: [{ otazkaId: 'o-1', spravne: true, casMs: 1000, pouzityPowerup: 'stit' }],
          body: 100,
          celkovyCasMs: 1000,
          dokonceno: '2026-09-04T11:00:00.000Z',
        },
      },
    });
    expect(duelSchema.safeParse(sPowerupem).success).toBe(false);

    // Tentýž výsledek BEZ power-upu projde.
    const bezPowerupu = duelOdkazem({
      souper: { profilId: hostId, jmeno: 'Karel' },
      host: { jmeno: 'Karel' },
      handicap: { tata: 1, [hostId]: 1 },
      stav: 'prijaty',
      vysledky: {
        [hostId]: {
          odpovedi: [{ otazkaId: 'o-1', spravne: true, casMs: 1000 }],
          body: 100,
          celkovyCasMs: 1000,
          dokonceno: '2026-09-04T11:00:00.000Z',
        },
      },
    });
    expect(duelSchema.safeParse(bezPowerupu).success).toBe(true);
  });

  it('vyzyvatel nesmí mít vyhrazený hostovský profilId', () => {
    const podvrh = duelOdkazem({
      vyzyvatel: { profilId: hostProfilId('d-1'), jmeno: 'Podvrh' },
      handicap: {},
    });
    expect(duelSchema.safeParse(podvrh).success).toBe(false);
  });
});
