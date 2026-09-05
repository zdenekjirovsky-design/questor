// Testy filtrovani statistik podle studijni banky (src/stranky/statistikyVypocty.ts):
// - posledni testy se filtruji podle konfigurace.predmetId,
// - tydenni XP banky se cte z prubezneho agregatu tydenniXpTestuPodleBank
//   (vede ho hraSlice.zapocitejTest — presny za celou historii, ne jen
//   z okna poslednich 10 testu v historieTestu).
import { describe, expect, it } from 'vitest';
import type { TestVysledek } from '@questor/sdilene';
import { testyBanky, tydenniXpBanky } from '../src/stranky/statistikyVypocty';

function vysledek(predmetId: string, ziskaneXp: number, konec: string): TestVysledek {
  return {
    id: `t-${predmetId}-${konec}-${ziskaneXp}`,
    konfigurace: { predmetId, rezim: 'standard', pocetOtazek: 5 },
    zacatek: konec,
    konec,
    odpovedi: [{ otazkaId: 'o1', temaId: 't1', obtiznost: 3, spravne: true, casMs: 1000 }],
    uspesnost: 1,
    ziskaneXp,
    nejdelsiCombo: 1,
  };
}

const historie: TestVysledek[] = [
  vysledek('matematika', 100, '2026-09-01T10:00:00.000Z'), // pondeli tydne 2026-08-31
  vysledek('matematika', 50, '2026-09-04T10:00:00.000Z'),
  vysledek('fyzika', 70, '2026-09-04T12:00:00.000Z'),
  vysledek('matematika', 30, '2026-08-25T10:00:00.000Z'), // predchozi tyden (2026-08-24)
];

describe('statistiky — filtrovani podle banky', () => {
  it('testyBanky vraci jen testy dane banky (konfigurace.predmetId)', () => {
    expect(testyBanky(historie, 'matematika')).toHaveLength(3);
    expect(testyBanky(historie, 'fyzika')).toHaveLength(1);
    expect(testyBanky(historie, 'chemie')).toHaveLength(0);
    // Bez banky (null) se nic nefiltruje.
    expect(testyBanky(historie, null)).toHaveLength(4);
  });

  it('tydenniXpBanky vraci tydny vybrane banky z agregatu', () => {
    const agregat = {
      matematika: { '2026-08-31': 150, '2026-08-24': 30 },
      fyzika: { '2026-08-31': 70 },
    };
    expect(tydenniXpBanky(agregat, 'matematika')).toEqual({
      '2026-08-31': 150,
      '2026-08-24': 30,
    });
    expect(tydenniXpBanky(agregat, 'fyzika')).toEqual({ '2026-08-31': 70 });
    // Banka bez testu = prazdny graf, zadny pad.
    expect(tydenniXpBanky(agregat, 'chemie')).toEqual({});
    expect(tydenniXpBanky({}, 'matematika')).toEqual({});
  });

  it('tydenniXpBanky bez banky (null) scita tydny pres vsechny banky', () => {
    const agregat = {
      matematika: { '2026-08-31': 150, '2026-08-24': 30 },
      fyzika: { '2026-08-31': 70 },
    };
    expect(tydenniXpBanky(agregat, null)).toEqual({ '2026-08-31': 220, '2026-08-24': 30 });
  });
});
