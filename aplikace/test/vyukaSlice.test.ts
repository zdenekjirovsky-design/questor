// Testy slice vyuky (vyukaSlice) — verze obsahu, postup bloku a pravidla
// odmen: XP_ZA_LEKCI jen 1x denne na lekci, streak aktivita, questy `lekce`.
import { beforeEach, describe, expect, it } from 'vitest';
import type { QuestDenni, VyukaPredmetu } from '@questor/sdilene';
import { denZData, XP_ZA_LEKCI } from '@questor/sdilene';
import { pouzijStav } from '../src/stav/store';
import { najdiLekci } from '../src/stav/vyukaSlice';

const dnes = denZData(new Date());

function vzorovaVyuka(prepis: Partial<VyukaPredmetu> = {}): VyukaPredmetu {
  return {
    predmetId: 'testovy-predmet',
    verze: 1,
    vytvoreno: '2026-09-04',
    lekce: [
      {
        temaId: 't1',
        nazev: 'První lekce',
        poradi: 0,
        bloky: [
          { typ: 'text', obsah: 'Ahoj, tohle je **učivo**.' },
          { typ: 'klicove-pojmy', polozky: [{ pojem: 'Pojem', definice: 'Definice' }] },
          { typ: 'priklad', zadani: 'Kolik je 2+2?', reseni: 'Jsou to 4.' },
        ],
      },
      {
        temaId: 't2',
        nazev: 'Druhá lekce',
        poradi: 1,
        bloky: [{ typ: 'text', obsah: 'Druhé učivo.' }],
      },
    ],
    ...prepis,
  };
}

function questDne(sablona: string, prepis: Partial<QuestDenni> = {}): QuestDenni {
  return {
    id: `${dnes}:${sablona}`,
    sablona,
    popis: `quest ${sablona}`,
    cil: 1,
    postup: 0,
    splneno: false,
    odmenaXp: 60,
    datum: dnes,
    ...prepis,
  };
}

function nastavQuesty(questy: QuestDenni[]): void {
  const progres = pouzijStav.getState().progres;
  pouzijStav.setState({ progres: { ...progres, questy } });
}

beforeEach(() => {
  pouzijStav.getState().resetujProgres();
  pouzijStav.setState({ vyuky: {}, postupLekci: {} });
});

describe('prijmiVyuku', () => {
  it('prijme novou vyuku a odmitne stejnou nebo nizsi verzi', () => {
    const stav = pouzijStav.getState();
    expect(stav.prijmiVyuku(vzorovaVyuka())).toBe(true);
    expect(pouzijStav.getState().vyuky['testovy-predmet'].verze).toBe(1);

    expect(pouzijStav.getState().prijmiVyuku(vzorovaVyuka())).toBe(false);
    expect(pouzijStav.getState().prijmiVyuku(vzorovaVyuka({ verze: 0 }))).toBe(false);

    expect(pouzijStav.getState().prijmiVyuku(vzorovaVyuka({ verze: 3 }))).toBe(true);
    expect(pouzijStav.getState().vyuky['testovy-predmet'].verze).toBe(3);
  });
});

describe('najdiLekci', () => {
  it('najde lekci podle temaId napric vyukami', () => {
    pouzijStav.getState().prijmiVyuku(vzorovaVyuka());
    const nalez = najdiLekci(pouzijStav.getState().vyuky, 't2');
    expect(nalez?.predmetId).toBe('testovy-predmet');
    expect(nalez?.lekce.nazev).toBe('Druhá lekce');
    expect(najdiLekci(pouzijStav.getState().vyuky, 'neexistuje')).toBeNull();
  });
});

describe('dokonciBlok', () => {
  it('zaznamena blok jen jednou (idempotentni)', () => {
    const stav = pouzijStav.getState();
    stav.dokonciBlok('t1', 0);
    stav.dokonciBlok('t1', 1);
    stav.dokonciBlok('t1', 0);
    expect(pouzijStav.getState().postupLekci['t1'].dokonceneBloky).toEqual([0, 1]);
  });
});

describe('dokonciLekci', () => {
  it('pripise XP_ZA_LEKCI a zapocita streak pri prvnim dokonceni dne', () => {
    nastavQuesty([questDne('odpovez', { cil: 10, odmenaXp: 40 })]);
    const xpPred = pouzijStav.getState().progres.xp;

    const vysledek = pouzijStav.getState().dokonciLekci('t1');

    expect(vysledek).toEqual({ xp: XP_ZA_LEKCI, poprveDnes: true });
    const progres = pouzijStav.getState().progres;
    expect(progres.xp).toBe(xpPred + XP_ZA_LEKCI);
    expect(progres.streak.posledniDen).toBe(dnes);
    expect(progres.streak.aktualni).toBe(1);
    const postup = pouzijStav.getState().postupLekci['t1'];
    expect(postup.posledniXpDen).toBe(dnes);
    expect(postup.dokoncenoPoprve).not.toBeNull();
    expect(postup.pocetDokonceni).toBe(1);
  });

  it('druhe dokonceni tehoz dne uz XP nepripise', () => {
    pouzijStav.getState().dokonciLekci('t1');
    const xpPoPrvnim = pouzijStav.getState().progres.xp;

    const vysledek = pouzijStav.getState().dokonciLekci('t1');

    expect(vysledek).toEqual({ xp: 0, poprveDnes: false });
    expect(pouzijStav.getState().progres.xp).toBe(xpPoPrvnim);
    expect(pouzijStav.getState().postupLekci['t1'].pocetDokonceni).toBe(2);
  });

  it('dalsi den XP pripise znovu a prodlouzi streak', () => {
    pouzijStav.getState().dokonciLekci('t1');
    const xpPoPrvnim = pouzijStav.getState().progres.xp;

    const zitra = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const vysledek = pouzijStav.getState().dokonciLekci('t1', zitra);

    expect(vysledek.poprveDnes).toBe(true);
    expect(vysledek.xp).toBe(XP_ZA_LEKCI);
    expect(pouzijStav.getState().progres.xp).toBe(xpPoPrvnim + XP_ZA_LEKCI);
    expect(pouzijStav.getState().progres.streak.aktualni).toBe(2);
  });

  it('plni quest sablony `lekce` a jeho odmenu pripise jen jednou', () => {
    nastavQuesty([questDne('lekce', { odmenaXp: 60 })]);
    const xpPred = pouzijStav.getState().progres.xp;

    const vysledek = pouzijStav.getState().dokonciLekci('t1');

    expect(vysledek.xp).toBe(XP_ZA_LEKCI + 60);
    const stav = pouzijStav.getState();
    expect(stav.progres.xp).toBe(xpPred + XP_ZA_LEKCI + 60);
    expect(stav.progres.questy[0].splneno).toBe(true);
    expect(stav.questyOdmeneno).toContain(`${dnes}:lekce`);

    // Jina lekce tentyz den: quest uz je splneny — jen XP za lekci.
    const druha = pouzijStav.getState().dokonciLekci('t2');
    expect(druha.xp).toBe(XP_ZA_LEKCI);
  });

  it('zacniLekciZnovu vynuluje bloky, ale zachova pocitadla a denni XP zamek', () => {
    const stav = pouzijStav.getState();
    stav.dokonciBlok('t1', 0);
    stav.dokonciBlok('t1', 1);
    stav.dokonciBlok('t1', 2);
    pouzijStav.getState().dokonciLekci('t1');

    pouzijStav.getState().zacniLekciZnovu('t1');

    const postup = pouzijStav.getState().postupLekci['t1'];
    expect(postup.dokonceneBloky).toEqual([]); // lekce jde projit znovu
    expect(postup.pocetDokonceni).toBe(1);
    expect(postup.posledniXpDen).toBe(dnes); // dnesni XP zamek plati dal
    expect(postup.dokoncenoPoprve).not.toBeNull();

    // Druhy pruchod tyz den: dokonceni bez XP; dalsi den by XP padlo (kryto vyse).
    const znovu = pouzijStav.getState().dokonciLekci('t1');
    expect(znovu).toEqual({ xp: 0, poprveDnes: false });
  });

  it('resetujProgres smaze i postup lekci (obsah vyuky zustava)', () => {
    pouzijStav.getState().prijmiVyuku(vzorovaVyuka());
    pouzijStav.getState().dokonciBlok('t1', 0);
    pouzijStav.getState().dokonciLekci('t1');
    expect(pouzijStav.getState().postupLekci['t1']).toBeDefined();

    pouzijStav.getState().resetujProgres();

    expect(pouzijStav.getState().postupLekci).toEqual({});
    expect(pouzijStav.getState().vyuky['testovy-predmet']).toBeDefined();
  });

  it('quest `lekce` s parametrem temaId pocita jen lekce daneho tematu', () => {
    nastavQuesty([questDne('lekce', { odmenaXp: 60, parametry: { temaId: 't2' } })]);

    const jina = pouzijStav.getState().dokonciLekci('t1');
    expect(jina.xp).toBe(XP_ZA_LEKCI); // quest se nehnul
    expect(pouzijStav.getState().progres.questy[0].splneno).toBe(false);

    const spravna = pouzijStav.getState().dokonciLekci('t2');
    expect(spravna.xp).toBe(XP_ZA_LEKCI + 60);
    expect(pouzijStav.getState().progres.questy[0].splneno).toBe(true);
  });
});
