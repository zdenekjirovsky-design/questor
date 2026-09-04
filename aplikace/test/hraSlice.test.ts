// Testy gamifikačního slice (hraSlice) — akce nad progresem studenta.
import { beforeEach, describe, expect, it } from 'vitest';
import type { BankaOtazek, QuestDenni, TestVysledek } from '@questor/sdilene';
import { denZData, pondeliTydne } from '@questor/sdilene';
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
    } else {
      expect(odmena.kartaId).toBeTruthy();
      expect(stav.progres.sbirka.karty).toContain(odmena.kartaId);
      expect(stav.novaKarty).toContain(odmena.kartaId ?? '');
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
    expect(stav.cekajiciTruhly).toHaveLength(0);
    expect(stav.historieTestu).toHaveLength(0);
  });
});
