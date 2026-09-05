// Testy gamifikačního slice (hraSlice) — akce nad progresem studenta.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvatarKonfigurace, BankaOtazek, QuestDenni, TestVysledek } from '@questor/sdilene';
import { denZData, pondeliTydne } from '@questor/sdilene';
import type { TestStav } from '../src/testy/engine';
import { pouzijStav } from '../src/stav/store';

const dnes = denZData(new Date());

function quest(sablona: string, cil: number, odmenaXp: number, splneno = false): QuestDenni {
  return {
    id: `${dnes}:${sablona}`,
    sablona,
    popis: `quest ${sablona}`,
    cil,
    postup: splneno ? cil : 0,
    splneno,
    odmenaXp,
    datum: dnes,
  };
}

function vysledekTestu(prepis: Partial<TestVysledek> = {}): TestVysledek {
  return {
    id: `test-${Math.random().toString(36).slice(2)}`,
    konfigurace: { predmetId: 'p', rezim: 'standard', pocetOtazek: 5 },
    zacatek: new Date(Date.now() - 60_000).toISOString(),
    konec: new Date().toISOString(),
    odpovedi: [
      { otazkaId: 'o1', temaId: 't1', obtiznost: 3, spravne: true, casMs: 5000 },
    ],
    uspesnost: 0.9,
    ziskaneXp: 100,
    nejdelsiCombo: 4,
    truhla: 'stribrna',
    ...prepis,
  };
}

const testovaciBanka: BankaOtazek = {
  predmetId: 'p',
  nazev: 'Testovací',
  verze: 1,
  vytvoreno: '2026-09-04',
  temata: [{ id: 't1', nazev: 'Téma 1', poradi: 0 }],
  otazky: (['o1', 'o2', 'o3', 'o4'] as const).map((id) => ({
    id,
    temaId: 't1',
    obtiznost: 3 as const,
    typ: 'vyber' as const,
    zadani: `Otázka ${id}?`,
    moznosti: ['a', 'b'],
    spravna: 0,
    vysvetleni: 'Protože ano.',
  })),
};

beforeEach(() => {
  pouzijStav.getState().resetujProgres();
});

describe('zapocitejOdpoved', () => {
  it('přičte XP za správnou odpověď, posune Leitner box, quest i týdenní XP', () => {
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('odpovez', 3, 50)] },
    }));

    pouzijStav.getState().zapocitejOdpoved(
      { otazkaId: 'o1', temaId: 't1', obtiznost: 3, spravne: true, casMs: 4000 },
      1, // první správná v řadě → comboKrok 0 → násobič ×1
    );

    const stav = pouzijStav.getState();
    expect(stav.progres.xp).toBe(30); // 10 × 3 × 1
    expect(stav.progres.statistikyOtazek['o1'].box).toBe(3); // 2 + 1
    expect(stav.progres.questy[0].postup).toBe(1);
    expect(stav.progres.rekordy.tydenniXp[pondeliTydne(dnes)]).toBe(30);
  });

  it('za špatnou odpověď nedá XP a box klesne', () => {
    pouzijStav.getState().zapocitejOdpoved(
      { otazkaId: 'o1', temaId: 't1', obtiznost: 5, spravne: false, casMs: 4000 },
      0,
    );

    const stav = pouzijStav.getState();
    expect(stav.progres.xp).toBe(0);
    expect(stav.progres.statistikyOtazek['o1'].box).toBe(1); // 2 − 1
  });
});

describe('zapocitejTest', () => {
  it('aktualizuje streak, rekordy, questy a zařadí truhlu z testu do fronty', () => {
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('uspesnost', 1, 80)] },
    }));

    pouzijStav.getState().zapocitejTest(vysledekTestu());

    const stav = pouzijStav.getState();
    expect(stav.progres.streak.aktualni).toBe(1);
    expect(stav.progres.dokonceneTesty).toBe(1);
    expect(stav.progres.questy[0].splneno).toBe(true);
    expect(stav.progres.xp).toBe(80); // XP za splněný quest
    expect(stav.progres.rekordy.nejlepsiUspesnost).toBe(0.9);
    expect(stav.progres.rekordy.nejdelsiCombo).toBe(4);
    expect(stav.cekajiciTruhly).toContain('stribrna');
    expect(stav.historieTestu).toHaveLength(1);
  });

  it('XP za quest připíše jen jednou', () => {
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('uspesnost', 1, 80)] },
    }));

    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));
    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));

    const stav = pouzijStav.getState();
    expect(stav.progres.xp).toBe(80);
    expect(stav.progres.dokonceneTesty).toBe(2);
  });

  it('za všechny 3 splněné questy přidá bonusovou bronzovou truhlu (jen 1× denně)', () => {
    pouzijStav.setState((s) => ({
      progres: {
        ...s.progres,
        questy: [quest('odpovez', 3, 50, true), quest('obtiznost', 5, 60, true), quest('uspesnost', 1, 80)],
      },
    }));

    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));
    const bronzove1 = pouzijStav.getState().cekajiciTruhly.filter((t) => t === 'bronzova').length;
    expect(bronzove1).toBe(1);

    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));
    const bronzove2 = pouzijStav.getState().cekajiciTruhly.filter((t) => t === 'bronzova').length;
    expect(bronzove2).toBe(1); // podruhé už ne
  });

  it('uděluje mistrovské karty tématu podle podílu zvládnutých otázek', () => {
    pouzijStav.setState({ banky: { p: testovaciBanka } });
    pouzijStav.setState((s) => ({
      progres: {
        ...s.progres,
        statistikyOtazek: {
          o1: { otazkaId: 'o1', box: 3, spravneCelkem: 2, spatneCelkem: 0, posledniOdpoved: dnes },
          o2: { otazkaId: 'o2', box: 4, spravneCelkem: 3, spatneCelkem: 0, posledniOdpoved: dnes },
        },
      },
    }));

    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));

    const stav = pouzijStav.getState();
    expect(stav.progres.sbirka.karty).toContain('tema:t1:bronz'); // 2/4 = 50 %
    expect(stav.progres.sbirka.karty).not.toContain('tema:t1:stribro');
    expect(stav.novaKarty).toContain('tema:t1:bronz');

    // Stejná karta se podruhé nepřidá.
    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));
    const pocet = pouzijStav
      .getState()
      .progres.sbirka.karty.filter((k) => k === 'tema:t1:bronz').length;
    expect(pocet).toBe(1);
  });

  it('dokončí výzvu s odpovídajícím vyzvaId', () => {
    pouzijStav.getState().prijmiVyzvy([
      {
        id: 'v1',
        zprava: 'Dáš 90 %?',
        konfigurace: { predmetId: 'p', rezim: 'standard', pocetOtazek: 10 },
        vytvoreno: new Date().toISOString(),
        stav: 'nova',
      },
    ]);

    pouzijStav.getState().zapocitejTest(vysledekTestu({ vyzvaId: 'v1', truhla: undefined }));

    const vyzva = pouzijStav.getState().vyzvy.find((v) => v.id === 'v1');
    expect(vyzva?.stav).toBe('dokoncena');
    expect(vyzva?.vysledek?.uspesnost).toBe(0.9);
  });
});

describe('questy patri AKTIVNI bance profilu (filtr banky)', () => {
  function nastavProfil(aktivniPredmetId: string): void {
    pouzijStav.setState({
      profily: [
        {
          id: 'p-test',
          jmeno: 'Kuba',
          barva: '#8b5cf6',
          predmety: ['matematika', 'fyzika'],
          aktivniPredmetId,
        },
      ],
      aktivniProfilId: 'p-test',
    });
  }

  function beziciTest(predmetId: string): TestStav {
    return {
      konfigurace: { predmetId, rezim: 'standard', pocetOtazek: 5 },
      zacatek: new Date().toISOString(),
      otazky: [],
      pool: [],
      index: 0,
      odpovedi: [],
      combo: 1,
      nejdelsiCombo: 1,
      ziskaneXp: 0,
      posledniXp: 0,
      cilovaObtiznost: 2,
      dokonceno: false,
    };
  }

  afterEach(() => {
    pouzijStav.setState({ profily: [], aktivniProfilId: null, dataProfilu: {}, aktualniTest: null });
  });

  it('test z JINE banky neplni quest uspesnost ani nedava jeho XP', () => {
    nastavProfil('matematika');
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('uspesnost', 1, 80)] },
    }));

    pouzijStav.getState().zapocitejTest(
      vysledekTestu({
        konfigurace: { predmetId: 'fyzika', rezim: 'standard', pocetOtazek: 5 },
        truhla: undefined,
      }),
    );

    const stav = pouzijStav.getState();
    expect(stav.progres.questy[0].splneno).toBe(false); // quest matematiky se nehnul
    expect(stav.progres.xp).toBe(0); // zadne XP za cizi quest
    // Streak, pocitadla a historie bezi dal — filtr je JEN na questech.
    expect(stav.progres.streak.aktualni).toBe(1);
    expect(stav.progres.dokonceneTesty).toBe(1);
    expect(stav.historieTestu).toHaveLength(1);

    // Test AKTIVNI banky quest splni normalne.
    pouzijStav.getState().zapocitejTest(
      vysledekTestu({
        konfigurace: { predmetId: 'matematika', rezim: 'standard', pocetOtazek: 5 },
        truhla: undefined,
      }),
    );
    expect(pouzijStav.getState().progres.questy[0].splneno).toBe(true);
    expect(pouzijStav.getState().progres.xp).toBe(80);
  });

  it('test z JINE banky nedava ani bonusovou truhlu za vsechny 3 questy', () => {
    nastavProfil('matematika');
    pouzijStav.setState((s) => ({
      progres: {
        ...s.progres,
        questy: [quest('odpovez', 3, 50, true), quest('obtiznost', 5, 60, true), quest('lekce', 1, 60, true)],
      },
    }));

    pouzijStav.getState().zapocitejTest(
      vysledekTestu({
        konfigurace: { predmetId: 'fyzika', rezim: 'standard', pocetOtazek: 5 },
        truhla: undefined,
      }),
    );
    expect(pouzijStav.getState().cekajiciTruhly).toEqual([]);

    // Test aktivni banky bonus udeli.
    pouzijStav.getState().zapocitejTest(
      vysledekTestu({
        konfigurace: { predmetId: 'matematika', rezim: 'standard', pocetOtazek: 5 },
        truhla: undefined,
      }),
    );
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['bronzova']);
  });

  it('odpoved v testu JINE banky neplni questy (prepnuti chipu uprostred testu)', () => {
    nastavProfil('matematika');
    pouzijStav.setState((s) => ({
      progres: { ...s.progres, questy: [quest('odpovez', 3, 50)] },
      aktualniTest: beziciTest('fyzika'),
    }));

    pouzijStav.getState().zapocitejOdpoved(
      { otazkaId: 'o1', temaId: 't1', obtiznost: 3, spravne: true, casMs: 4000 },
      1,
    );

    const stav = pouzijStav.getState();
    expect(stav.progres.questy[0].postup).toBe(0); // quest matematiky se nehnul
    expect(stav.progres.xp).toBe(30); // XP za odpoved se pocita dal
    expect(stav.progres.statistikyOtazek['o1'].box).toBe(3); // Leitner bezi dal

    // Odpoved v testu AKTIVNI banky quest plni.
    pouzijStav.setState({ aktualniTest: beziciTest('matematika') });
    pouzijStav.getState().zapocitejOdpoved(
      { otazkaId: 'o2', temaId: 't1', obtiznost: 3, spravne: true, casMs: 4000 },
      1,
    );
    expect(pouzijStav.getState().progres.questy[0].postup).toBe(1);
  });
});

describe('tydenniXpTestuPodleBank (agregat pro graf Statistik)', () => {
  it('scita ziskaneXp podle banky testu a tydne konce', () => {
    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined })); // banka p, 100 XP
    pouzijStav.getState().zapocitejTest(vysledekTestu({ truhla: undefined }));
    pouzijStav.getState().zapocitejTest(
      vysledekTestu({
        konfigurace: { predmetId: 'fyzika', rezim: 'standard', pocetOtazek: 5 },
        ziskaneXp: 40,
        truhla: undefined,
      }),
    );

    const agregat = pouzijStav.getState().tydenniXpTestuPodleBank;
    expect(agregat['p'][pondeliTydne(dnes)]).toBe(200);
    expect(agregat['fyzika'][pondeliTydne(dnes)]).toBe(40);

    // Reset agregat maze.
    pouzijStav.getState().resetujProgres();
    expect(pouzijStav.getState().tydenniXpTestuPodleBank).toEqual({});
  });
});

describe('otevriTruhluAkce', () => {
  it('vrátí odměnu, aplikuje ji do progresu a odebere truhlu z fronty', () => {
    pouzijStav.setState({ cekajiciTruhly: ['zlata'] });
    const pred = pouzijStav.getState().progres;

    const odmena = pouzijStav.getState().otevriTruhluAkce('zlata');
    expect(odmena).not.toBeNull();
    if (!odmena) throw new Error('odmena nemá být null');

    const stav = pouzijStav.getState();
    expect(stav.cekajiciTruhly).toHaveLength(0);
    if (odmena.typ === 'xp') {
      expect(stav.progres.xp).toBe(pred.xp + (odmena.xp ?? 0));
      expect(odmena.xp).toBeGreaterThan(0);
    } else if (odmena.typ === 'zmrazeni') {
      expect(stav.progres.streak.zmrazeni).toBe(pred.streak.zmrazeni + 1);
    } else if (odmena.typ === 'vybava') {
      expect(odmena.vybavaId).toBeTruthy();
      expect(stav.progres.vlastnenaVybava).toContain(odmena.vybavaId);
    } else {
      expect(odmena.kartaId).toBeTruthy();
      expect(stav.progres.sbirka.karty).toContain(odmena.kartaId);
      expect(stav.novaKarty).toContain(odmena.kartaId ?? '');
    }
  });

  it('odměna typu výbava se přidá do vlastnenaVybava (deterministická náhoda)', () => {
    // Zlatá truhla: pásmo výbavy je [0.45, 0.70) — první los 0.5 padne do něj,
    // druhý los 0 vybere ve váženém výběru první nevlastněnou položku katalogu.
    const losy = [0.5, 0];
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => losy.shift() ?? 0);
    try {
      pouzijStav.setState({ cekajiciTruhly: ['zlata'] });
      const odmena = pouzijStav.getState().otevriTruhluAkce('zlata');

      expect(odmena?.typ).toBe('vybava');
      expect(odmena?.vybavaId).toBeTruthy();
      const stav = pouzijStav.getState();
      expect(stav.progres.vlastnenaVybava).toContain(odmena?.vybavaId);
      expect(stav.progres.vlastnenaVybava).toHaveLength(1);
      expect(stav.cekajiciTruhly).toHaveLength(0);
      // Výbava nedává XP ani kartu.
      expect(stav.progres.xp).toBe(0);
      expect(stav.progres.sbirka.karty).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  it('už vlastněná výbava se z losu vynechá — stejný los dá jinou položku', () => {
    const losy = [0.5, 0, 0.5, 0];
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => losy.shift() ?? 0);
    try {
      pouzijStav.setState({ cekajiciTruhly: ['zlata', 'zlata'] });
      const prvni = pouzijStav.getState().otevriTruhluAkce('zlata');
      const druha = pouzijStav.getState().otevriTruhluAkce('zlata');

      expect(prvni?.typ).toBe('vybava');
      expect(druha?.typ).toBe('vybava');
      expect(druha?.vybavaId).not.toBe(prvni?.vybavaId);
      expect(pouzijStav.getState().progres.vlastnenaVybava).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('bez čekající truhly daného typu odměnu odmítne (žádný farming z prázdné fronty)', () => {
    pouzijStav.setState({ cekajiciTruhly: ['zlata'] });
    expect(pouzijStav.getState().otevriTruhluAkce('zlata')).not.toBeNull();

    const pred = pouzijStav.getState().progres;
    // Fronta je prázdná — opakované otevírání (remount Výsledku) nesmí nic dát.
    for (let i = 0; i < 5; i++) {
      expect(pouzijStav.getState().otevriTruhluAkce('zlata')).toBeNull();
    }
    const po = pouzijStav.getState().progres;
    expect(po.xp).toBe(pred.xp);
    expect(po.streak.zmrazeni).toBe(pred.streak.zmrazeni);
    expect(po.sbirka.karty).toEqual(pred.sbirka.karty);

    // Ani typ, který ve frontě nikdy nebyl.
    pouzijStav.setState({ cekajiciTruhly: ['bronzova'] });
    expect(pouzijStav.getState().otevriTruhluAkce('zlata')).toBeNull();
    expect(pouzijStav.getState().cekajiciTruhly).toEqual(['bronzova']);
  });
});

describe('zmenAvatara', () => {
  it('uloží celou konfiguraci avataru do progresu (vlastněná výbava zůstává)', () => {
    const progres = pouzijStav.getState().progres;
    pouzijStav.setState({ progres: { ...progres, vlastnenaVybava: ['bryle-cerne'] } });
    const nova: AvatarKonfigurace = {
      pohlavi: 'zena',
      tvarObliceje: 'kulaty',
      barvaPleti: '#d9a066',
      barvaVlasu: '#d16ba5',
      stylVlasu: 'kratke',
      vybava: { oci: 'bryle-cerne' },
    };

    pouzijStav.getState().zmenAvatara(nova);

    expect(pouzijStav.getState().progres.avatar).toEqual(nova);
  });

  it('odfiltruje nasazenou výbavu, kterou hráč nevlastní (invariant nasazené ⊆ vlastněné)', () => {
    // Scénář: editor drží návrh s výbavou z doby před resetem progresu —
    // po resetu je vlastnenaVybava prázdná a zápis ji nesmí obejít.
    const progres = pouzijStav.getState().progres;
    pouzijStav.setState({ progres: { ...progres, vlastnenaVybava: ['bryle-cerne'] } });
    const navrh: AvatarKonfigurace = {
      pohlavi: 'muz',
      tvarObliceje: 'ovalny',
      barvaPleti: '#f2c9a0',
      barvaVlasu: '#6b4a2f',
      stylVlasu: 'culik',
      vybava: { hlava: 'koruna', oci: 'bryle-cerne', pozadi: 'stadion' },
    };

    pouzijStav.getState().zmenAvatara(navrh);

    // Nevlastněná koruna a stadion zmizely, vlastněné brýle zůstaly.
    expect(pouzijStav.getState().progres.avatar.vybava).toEqual({ oci: 'bryle-cerne' });
    expect(pouzijStav.getState().progres.avatar.stylVlasu).toBe('culik');
  });
});

describe('obnovDenniQuesty a reset', () => {
  it('vygeneruje questy pro dnešek a reset vše vrátí do výchozího stavu', () => {
    pouzijStav.setState({ banky: { p: testovaciBanka } });
    pouzijStav.getState().obnovDenniQuesty();

    const questy = pouzijStav.getState().progres.questy;
    expect(questy.length).toBeGreaterThan(0);
    expect(questy[0].datum).toBe(dnes);

    pouzijStav.getState().resetujProgres();
    const stav = pouzijStav.getState();
    expect(stav.progres.xp).toBe(0);
    expect(stav.progres.questy).toHaveLength(0);
    expect(stav.progres.vlastnenaVybava).toHaveLength(0);
    expect(stav.progres.avatar.stylVlasu).toBe('rozpustene'); // reset maže vše vč. avataru
    expect(stav.cekajiciTruhly).toHaveLength(0);
    expect(stav.historieTestu).toHaveLength(0);
  });
});
