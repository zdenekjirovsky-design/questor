// Testy lokalnich profilu (src/stav/profilySlice.ts + src/profily/pin.ts):
// - izolace dat dvou profilu (XP, postup lekci — nic neprosakuje),
// - prepinani a odhlaseni (snimky dataProfilu),
// - PIN: hash pres SHA-256 se soli id profilu, overeni, brzda 3 pokusu / 30 s,
// - mazani profilu (posledni nejde, aktivni vraci na vyber),
// - denni questy per profil (seed doplneny o id profilu),
// - sync: udalosti a progres nesou top-level profilId a profilJmeno.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TestVysledek } from '@questor/sdilene';
import { vygenerujDenniQuesty } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';
import {
  aktivniPredmetProfilu,
  BARVY_PROFILU,
  najdiAktivniProfil,
  predmetyProfilu,
} from '../src/stav/profilySlice';
import { PREDMETY } from '../src/data/predmety';
import {
  jePlatnyPin,
  overPin,
  vynulujPokusyProTesty,
  zahashujPin,
  zaznamenejPokus,
  zbyvaPauzaMs,
} from '../src/profily/pin';
import { klicFrontyProfilu, KLIC_FRONTY, SyncFronta } from '../src/sync/fronta';
import { pametoveUloziste, vychoziUloziste } from '../src/sync/klient';

function vynulujProfily(): void {
  pouzijStav.getState().resetujProgres();
  pouzijStav.setState({ profily: [], aktivniProfilId: null, dataProfilu: {} });
}

beforeEach(() => {
  vynulujProfily();
  vynulujPokusyProTesty();
});

// ---------------------------------------------------------------------------

describe('profily — zakladani a prepinani', () => {
  it('vytvorProfil zalozi profil a rovnou na nej prepne (cista pracovni sada)', () => {
    const profil = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const stav = pouzijStav.getState();
    expect(stav.profily).toHaveLength(1);
    expect(stav.aktivniProfilId).toBe(profil.id);
    expect(stav.progres.xp).toBe(0);
    expect(profil.pinHash).toBeUndefined();
  });

  it('izolace: XP a postup lekci jednoho profilu neprosakne druhemu', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({
      progres: { ...pouzijStav.getState().progres, xp: 500 },
    });
    pouzijStav.getState().dokonciBlok('zakladni-pojmy', 0);

    // Zalozeni maminho profilu prepne na cistou sadu.
    const mama = pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[4]);
    expect(pouzijStav.getState().progres.xp).toBe(0);
    expect(pouzijStav.getState().postupLekci).toEqual({});

    // Mama ziska svoje XP a postup.
    pouzijStav.setState({
      progres: { ...pouzijStav.getState().progres, xp: 70 },
    });
    pouzijStav.getState().dokonciBlok('vareni-zaklady', 0);

    // Zpet na Kubu: jeho data jsou nedotcena.
    expect(pouzijStav.getState().prepniProfil(kuba.id)).toBe(true);
    expect(pouzijStav.getState().progres.xp).toBe(500);
    expect(pouzijStav.getState().postupLekci).toEqual({
      'zakladni-pojmy': expect.objectContaining({ dokonceneBloky: [0] }),
    });

    // A zpet na mamu: jeji data taky.
    expect(pouzijStav.getState().prepniProfil(mama.id)).toBe(true);
    expect(pouzijStav.getState().progres.xp).toBe(70);
    expect(pouzijStav.getState().postupLekci).toEqual({
      'vareni-zaklady': expect.objectContaining({ dokonceneBloky: [0] }),
    });
  });

  it('resetujProgres maze jen aktivni profil', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({ progres: { ...pouzijStav.getState().progres, xp: 500 } });
    pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[4]);
    pouzijStav.setState({ progres: { ...pouzijStav.getState().progres, xp: 70 } });

    pouzijStav.getState().resetujProgres();
    expect(pouzijStav.getState().progres.xp).toBe(0);

    pouzijStav.getState().prepniProfil(kuba.id);
    expect(pouzijStav.getState().progres.xp).toBe(500);
  });

  it('odhlasProfil ulozi snimek a vrati na vyber (aktivniProfilId null)', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({ progres: { ...pouzijStav.getState().progres, xp: 123 } });
    pouzijStav.getState().odhlasProfil();

    const stav = pouzijStav.getState();
    expect(stav.aktivniProfilId).toBe(null);
    // Pracovni sada je cista (zadny unik dat pod obrazovkou vyberu).
    expect(stav.progres.xp).toBe(0);
    // Snimek profilu drzi jeho data.
    expect(stav.dataProfilu[kuba.id].progres.xp).toBe(123);
  });

  it('prepniProfil na neznamy id nebo na sebe vrati false', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    expect(pouzijStav.getState().prepniProfil('neexistuje')).toBe(false);
    expect(pouzijStav.getState().prepniProfil(kuba.id)).toBe(false);
  });

  it('prejmenujProfil zmeni jmeno (profil Student z migrace jde prejmenovat)', () => {
    const student = pouzijStav.getState().vytvorProfil('Student', BARVY_PROFILU[0]);
    expect(pouzijStav.getState().prejmenujProfil(student.id, 'Kuba')).toBe(true);
    expect(pouzijStav.getState().profily[0].jmeno).toBe('Kuba');
    expect(pouzijStav.getState().prejmenujProfil(student.id, '   ')).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('profily — PIN', () => {
  it('plati jen 4–6 cislic', () => {
    expect(jePlatnyPin('1234')).toBe(true);
    expect(jePlatnyPin('123456')).toBe(true);
    expect(jePlatnyPin('123')).toBe(false);
    expect(jePlatnyPin('1234567')).toBe(false);
    expect(jePlatnyPin('12a4')).toBe(false);
    expect(jePlatnyPin('')).toBe(false);
  });

  it('hash je deterministicky a soleny id profilu', async () => {
    const a = await zahashujPin('1234', 'profil-a');
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
    expect(await zahashujPin('1234', 'profil-a')).toBe(a);
    // Stejny PIN, jiny profil (sul) → jiny hash.
    expect(await zahashujPin('1234', 'profil-b')).not.toBe(a);
    // Jiny PIN, stejny profil → jiny hash.
    expect(await zahashujPin('4321', 'profil-a')).not.toBe(a);
  });

  it('overPin pozna spravny i spatny PIN', async () => {
    const hash = await zahashujPin('987654', 'profil-a');
    expect(await overPin('987654', 'profil-a', hash)).toBe(true);
    expect(await overPin('987655', 'profil-a', hash)).toBe(false);
    expect(await overPin('987654', 'profil-b', hash)).toBe(false);
    expect(await overPin('abc', 'profil-a', hash)).toBe(false);
  });

  it('3 spatne pokusy = 30 s pauza; spravny pokus pocitadlo nuluje', () => {
    const ted = 1_000_000;
    zaznamenejPokus('p1', false, ted);
    zaznamenejPokus('p1', false, ted);
    expect(zbyvaPauzaMs('p1', ted)).toBe(0);
    zaznamenejPokus('p1', false, ted);
    expect(zbyvaPauzaMs('p1', ted)).toBe(30_000);
    expect(zbyvaPauzaMs('p1', ted + 29_999)).toBe(1);
    expect(zbyvaPauzaMs('p1', ted + 30_000)).toBe(0);
    // Jiny profil neni blokovany.
    expect(zbyvaPauzaMs('p2', ted)).toBe(0);
    // Spravny pokus vse nuluje.
    zaznamenejPokus('p1', true, ted + 31_000);
    zaznamenejPokus('p1', false, ted + 32_000);
    expect(zbyvaPauzaMs('p1', ted + 32_000)).toBe(0);
  });

  it('nastavPinProfilu nastavi, zmeni i zrusi PIN', async () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const hash = await zahashujPin('1234', kuba.id);
    expect(pouzijStav.getState().nastavPinProfilu(kuba.id, hash)).toBe(true);
    expect(pouzijStav.getState().profily[0].pinHash).toBe(hash);
    expect(pouzijStav.getState().nastavPinProfilu(kuba.id, undefined)).toBe(true);
    expect('pinHash' in pouzijStav.getState().profily[0]).toBe(false);
    expect(pouzijStav.getState().nastavPinProfilu('neexistuje', hash)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('profily — mazani', () => {
  it('posledni profil smazat NEJDE', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    expect(pouzijStav.getState().smazProfil(kuba.id)).toBe(false);
    expect(pouzijStav.getState().profily).toHaveLength(1);
  });

  it('smazani neaktivniho profilu odstrani profil i jeho data', () => {
    const kuba = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.setState({ progres: { ...pouzijStav.getState().progres, xp: 500 } });
    pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[4]);

    expect(pouzijStav.getState().smazProfil(kuba.id)).toBe(true);
    const stav = pouzijStav.getState();
    expect(stav.profily.map((p) => p.jmeno)).toEqual(['Máma']);
    expect(stav.dataProfilu[kuba.id]).toBeUndefined();
    // Aktivni profil (Mama) bezi dal.
    expect(stav.aktivniProfilId).not.toBe(null);
  });

  it('smazani aktivniho profilu vrati na vyber a jeho data zahodi', () => {
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    const mama = pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[4]);
    pouzijStav.setState({ progres: { ...pouzijStav.getState().progres, xp: 70 } });

    expect(pouzijStav.getState().smazProfil(mama.id)).toBe(true);
    const stav = pouzijStav.getState();
    expect(stav.aktivniProfilId).toBe(null);
    expect(stav.progres.xp).toBe(0);
    expect(stav.profily.map((p) => p.jmeno)).toEqual(['Kuba']);
    expect(stav.dataProfilu[mama.id]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------

describe('profily — denni questy per profil', () => {
  const ctx = {
    temata: [
      { id: 't1', nazev: 'Téma 1', poradi: 0 },
      { id: 't2', nazev: 'Téma 2', poradi: 1 },
    ],
    nejslabsiTemaId: 't1',
  };

  it('seed s id profilu je deterministicky a ruzne profily dostanou jine questy', () => {
    const datum = '2026-09-05';
    const kuba1 = vygenerujDenniQuesty(datum, ctx, 'profil-kuba');
    const kuba2 = vygenerujDenniQuesty(datum, ctx, 'profil-kuba');
    expect(kuba1).toEqual(kuba2);

    // Ruzne seedy → jina sada questu (deterministicke overeni na tomto paru).
    const mama = vygenerujDenniQuesty(datum, ctx, 'profil-mama');
    expect(mama.map((q) => q.sablona)).not.toEqual(kuba1.map((q) => q.sablona));
  });

  it('bez seedu zustava puvodni (zpetne kompatibilni) chovani', () => {
    const datum = '2026-09-05';
    expect(vygenerujDenniQuesty(datum, ctx)).toEqual(vygenerujDenniQuesty(datum, ctx, undefined));
  });

  it('obnovDenniQuesty seeduje questy profilem × aktivni bankou', () => {
    pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    pouzijStav.getState().obnovDenniQuesty();
    const kubovy = pouzijStav.getState().progres.questy;
    expect(kubovy.length).toBeGreaterThan(0);
    const idKuby = pouzijStav.getState().aktivniProfilId!;
    const aktivniBanka = aktivniPredmetProfilu(najdiAktivniProfil(pouzijStav.getState()))!;
    // Prima kontrola: stejny vysledek jako generator se seedem profil:banka.
    expect(kubovy).toEqual(
      vygenerujDenniQuesty(
        kubovy[0].datum,
        { temata: [], nejslabsiTemaId: undefined },
        `${idKuby}:${aktivniBanka}`,
      ),
    );
  });
});

// ---------------------------------------------------------------------------

describe('profily — studijni banky', () => {
  const vsechna = PREDMETY.map((p) => p.id);

  it('vyber pri zalozeni: poradi vyberu se drzi, prvni vybrana je aktivni', () => {
    const profil = pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika', 'fyzika']);
    expect(profil.predmety).toEqual(['matematika', 'fyzika']);
    expect(profil.aktivniPredmetId).toBe('matematika');
    expect(aktivniPredmetProfilu(profil)).toBe('matematika');
  });

  it('zalozeni bez vyberu (fail-safe) → vsechny banky registru, min. 1 vzdy plati', () => {
    const profil = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
    expect(profil.predmety).toEqual(vsechna);
    expect(profil.aktivniPredmetId).toBe(vsechna[0]);
    const prazdny = pouzijStav
      .getState()
      .vytvorProfil('Máma', BARVY_PROFILU[1], undefined, undefined, []);
    expect(prazdny.predmety).toEqual(vsechna);
  });

  it('neznama id se pri zalozeni tise ignoruji (banka odebrana z aplikace)', () => {
    const profil = pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, [
        'uz-neexistuje',
        'chemie',
        'chemie', // duplicita se zahazuje
      ]);
    expect(profil.predmety).toEqual(['chemie']);
    expect(profil.aktivniPredmetId).toBe('chemie');
  });

  it('profil s neexistujici aktivni bankou NESPADNE — cteni spadne na prvni platnou', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['dejepis', 'chemie']);
    // Simulace budouciho stavu: aktivni banka i cast predmetu uz v registru neni.
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({
        ...p,
        predmety: ['zrusena-banka', 'chemie'],
        aktivniPredmetId: 'zrusena-banka',
      })),
    });
    const profil = najdiAktivniProfil(pouzijStav.getState())!;
    expect(predmetyProfilu(profil)).toEqual(['chemie']);
    expect(aktivniPredmetProfilu(profil)).toBe('chemie');
    // Questy dne se generuji bez padu (seed profil:chemie).
    pouzijStav.getState().obnovDenniQuesty();
    expect(pouzijStav.getState().progres.questy.length).toBeGreaterThan(0);
  });

  it('prepnuti aktivni banky prehodi questy dne a zpetne prepnuti NEgeneruje nove', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika', 'fyzika']);
    pouzijStav.getState().obnovDenniQuesty();
    const questyMat = pouzijStav.getState().progres.questy;
    expect(questyMat.length).toBeGreaterThan(0);
    // Odmenime prvni quest, at je videt, ze se snimkuje i questyOdmeneno.
    pouzijStav.setState({ questyOdmeneno: [questyMat[0].id] });

    expect(pouzijStav.getState().prepniAktivniPredmet('fyzika')).toBe(true);
    const stavFyzika = pouzijStav.getState();
    expect(aktivniPredmetProfilu(najdiAktivniProfil(stavFyzika))).toBe('fyzika');
    const questyFyz = stavFyzika.progres.questy;
    // Questy fyziky jsou vygenerovane cerstve (seed profil:fyzika, viz test
    // seedu vyse) a nic z nich neni odmenene.
    expect(questyFyz.length).toBeGreaterThan(0);
    expect(stavFyzika.questyOdmeneno).toEqual([]);
    // Snimek matematiky ceka pod klicem banky.
    expect(stavFyzika.questyPodleBank.matematika.questy).toEqual(questyMat);

    // Zpet na matematiku: STEJNE questy i odmeny — zadne nove zadarmo.
    expect(pouzijStav.getState().prepniAktivniPredmet('matematika')).toBe(true);
    const zpet = pouzijStav.getState();
    expect(zpet.progres.questy).toEqual(questyMat);
    expect(zpet.questyOdmeneno).toEqual([questyMat[0].id]);
    expect(zpet.questyPodleBank.fyzika.questy).toEqual(questyFyz);
    expect(zpet.questyPodleBank.matematika).toBeUndefined();
  });

  it('prepnuti na banku mimo profil nebo na aktivni vraci false', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika', 'fyzika']);
    expect(pouzijStav.getState().prepniAktivniPredmet('chemie')).toBe(false);
    expect(pouzijStav.getState().prepniAktivniPredmet('matematika')).toBe(false);
  });

  it('pridani a odebrani banky; posledni banka odebrat NEJDE', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika']);
    expect(pouzijStav.getState().odeberPredmetProfilu('matematika')).toBe(false);

    expect(pouzijStav.getState().pridejPredmetProfilu('fyzika')).toBe(true);
    expect(pouzijStav.getState().pridejPredmetProfilu('fyzika')).toBe(false); // uz je
    expect(pouzijStav.getState().pridejPredmetProfilu('neznama')).toBe(false); // mimo registr
    expect(predmetyProfilu(najdiAktivniProfil(pouzijStav.getState()))).toEqual([
      'matematika',
      'fyzika',
    ]);

    expect(pouzijStav.getState().odeberPredmetProfilu('fyzika')).toBe(true);
    expect(predmetyProfilu(najdiAktivniProfil(pouzijStav.getState()))).toEqual(['matematika']);
  });

  it('pridani/odebrani banky zachovava ulozena neznama id (vrati se s navratem banky)', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika', 'chemie']);
    // Simulace: banka „docasne-pryc" byla docasne odebrana z registru —
    // v ulozenem poli profilu ale zustava (cteni ji jen tise ignoruje).
    pouzijStav.setState({
      profily: pouzijStav.getState().profily.map((p) => ({
        ...p,
        predmety: ['matematika', 'docasne-pryc', 'chemie'],
      })),
    });

    expect(pouzijStav.getState().pridejPredmetProfilu('fyzika')).toBe(true);
    expect(najdiAktivniProfil(pouzijStav.getState())!.predmety).toEqual([
      'matematika',
      'docasne-pryc',
      'chemie',
      'fyzika',
    ]);

    expect(pouzijStav.getState().odeberPredmetProfilu('chemie')).toBe(true);
    expect(najdiAktivniProfil(pouzijStav.getState())!.predmety).toEqual([
      'matematika',
      'docasne-pryc',
      'fyzika',
    ]);
    // Cteci cesta nezname id dal tise ignoruje.
    expect(predmetyProfilu(najdiAktivniProfil(pouzijStav.getState()))).toEqual([
      'matematika',
      'fyzika',
    ]);
  });

  it('odebrani AKTIVNI banky prepne na prvni zbylou a jeji questy zustanou ulozene', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika', 'fyzika']);
    pouzijStav.getState().obnovDenniQuesty();
    const questyMat = pouzijStav.getState().progres.questy;

    expect(pouzijStav.getState().odeberPredmetProfilu('matematika')).toBe(true);
    const stav = pouzijStav.getState();
    const profil = najdiAktivniProfil(stav)!;
    expect(predmetyProfilu(profil)).toEqual(['fyzika']);
    expect(aktivniPredmetProfilu(profil)).toBe('fyzika');
    // Postup (questy dne) odebrane banky zustava ulozeny — vrati se s ni.
    expect(stav.questyPodleBank.matematika.questy).toEqual(questyMat);
  });

  it('questy bank se snimkuji per profil (prepnuti profilu je nemicha)', () => {
    pouzijStav
      .getState()
      .vytvorProfil('Kuba', BARVY_PROFILU[0], undefined, undefined, ['matematika', 'fyzika']);
    pouzijStav.getState().obnovDenniQuesty();
    pouzijStav.getState().prepniAktivniPredmet('fyzika');
    const kubuvSnimek = pouzijStav.getState().questyPodleBank;
    expect(Object.keys(kubuvSnimek)).toEqual(['matematika']);
    const kuba = pouzijStav.getState().aktivniProfilId!;

    pouzijStav.getState().vytvorProfil('Máma', BARVY_PROFILU[1], undefined, undefined, ['chemie']);
    expect(pouzijStav.getState().questyPodleBank).toEqual({});

    pouzijStav.getState().prepniProfil(kuba);
    expect(pouzijStav.getState().questyPodleBank).toEqual(kubuvSnimek);
  });
});

// ---------------------------------------------------------------------------

describe('profily — sync (profilId a profilJmeno na payloadech)', () => {
  function vysledekTestu(): TestVysledek {
    return {
      id: `test-${Math.random().toString(36).slice(2)}`,
      konfigurace: { predmetId: 'p', rezim: 'standard', pocetOtazek: 5 },
      zacatek: new Date(Date.now() - 60_000).toISOString(),
      konec: new Date().toISOString(),
      odpovedi: [{ otazkaId: 'o1', temaId: 't1', obtiznost: 3, spravne: true, casMs: 5000 }],
      uspesnost: 1,
      ziskaneXp: 90,
      nejdelsiCombo: 1,
      truhla: 'zlata',
    };
  }

  it('udalost i progres jdou do fronty profilu s top-level profilId/profilJmeno', async () => {
    // Sit je v testu vypnuta — sync selze ticho a polozky zustanou ve fronte.
    vi.stubGlobal('fetch', () => Promise.reject(new Error('sit vypnuta v testu')));
    try {
      const { zaznamenejDokoncenyTest } = await import('../src/sync/sync');
      const profil = pouzijStav.getState().vytvorProfil('Kuba', BARVY_PROFILU[0]);
      const vysledek = vysledekTestu();
      zaznamenejDokoncenyTest(vysledek);

      // Fronta profilu zije pod klicem s id profilu (sdilene zalozni uloziste).
      const fronta = new SyncFronta(vychoziUloziste(), klicFrontyProfilu(profil.id));
      const polozky = fronta.polozky();
      const udalost = polozky.find((p) => p.typ === 'udalost');
      const progres = polozky.find((p) => p.typ === 'progres');
      expect(udalost).toBeTruthy();
      expect(progres).toBeTruthy();

      // Zpetna kompatibilita: puvodni pole zustavaji, profil je NAVIC top-level.
      const dataUdalosti = udalost!.data as TestVysledek & Record<string, unknown>;
      expect(dataUdalosti.id).toBe(vysledek.id);
      expect(dataUdalosti.uspesnost).toBe(1);
      expect(dataUdalosti.profilId).toBe(profil.id);
      expect(dataUdalosti.profilJmeno).toBe('Kuba');
      const dataProgresu = progres!.data as unknown as Record<string, unknown>;
      expect(dataProgresu.profilId).toBe(profil.id);
      expect(dataProgresu.profilJmeno).toBe('Kuba');
      expect(dataProgresu.xp).toBe(pouzijStav.getState().progres.xp);
      // Snapshot progresu nese i studijni banky profilu (dalsi top-level
      // pole v JSON blobu — server je pri validaci odstripuje, POST projde).
      expect(dataProgresu.predmety).toEqual(predmetyProfilu(profil));
      expect(dataProgresu.aktivniPredmetId).toBe(aktivniPredmetProfilu(profil));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fronta profilu adoptuje starou spolecnou frontu (a legacy klic smaze)', () => {
    const uloziste = pametoveUloziste();
    const stara = new SyncFronta(uloziste, KLIC_FRONTY);
    stara.pridejUdalost(vysledekTestu());

    const nova = new SyncFronta(uloziste, klicFrontyProfilu('student-1'), KLIC_FRONTY);
    expect(nova.velikost()).toBe(1);
    expect(uloziste.getItem(KLIC_FRONTY)).toBe(null);

    // Druhy profil uz nema co adoptovat — zacina s prazdnou frontou.
    const dalsi = new SyncFronta(uloziste, klicFrontyProfilu('mama-1'), KLIC_FRONTY);
    expect(dalsi.velikost()).toBe(0);
  });
});
