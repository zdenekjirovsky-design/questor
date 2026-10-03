// Látka — fotky a povolení: dekódování fotek po jedné (paměť iOS: 12Mpx
// bitmapa ~49 MB, souběh 20 fotek by stránku shodil) a poslední známé
// povolení z localStorage (tlačítko v Učit se se neobjevuje se zpožděním).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { poJedne, zapamatujPovoleni, znamePovoleniLatky } from '../src/latka/latka';

afterEach(() => {
  vi.unstubAllGlobals();
});

function cekej(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('poJedne — fronta dekódování fotek', () => {
  it('úkoly běží postupně, nikdy dva naráz', async () => {
    let bezi = 0;
    let maximum = 0;
    const poradi: string[] = [];
    const ukol = (jmeno: string, ms: number) => async () => {
      bezi += 1;
      maximum = Math.max(maximum, bezi);
      poradi.push(`start ${jmeno}`);
      await cekej(ms);
      poradi.push(`konec ${jmeno}`);
      bezi -= 1;
      return jmeno;
    };
    const vysledky = await Promise.all([poJedne(ukol('a', 15)), poJedne(ukol('b', 1)), poJedne(ukol('c', 5))]);
    expect(vysledky).toEqual(['a', 'b', 'c']);
    expect(maximum).toBe(1);
    expect(poradi).toEqual(['start a', 'konec a', 'start b', 'konec b', 'start c', 'konec c']);
  });

  it('příprava k odeslání (prednost) předběhne čekající náhledy, běžící nepřeruší', async () => {
    const poradi: string[] = [];
    const ukol = (jmeno: string) => async () => {
      poradi.push(jmeno);
      await cekej(2);
      return jmeno;
    };
    await Promise.all([
      poJedne(ukol('nahled 1')),
      poJedne(ukol('nahled 2')),
      poJedne(ukol('nahled 3')),
      poJedne(ukol('odeslani'), true),
    ]);
    expect(poradi).toEqual(['nahled 1', 'odeslani', 'nahled 2', 'nahled 3']);
  });

  it('chyba jednoho úkolu dojde jen jeho volajícímu a frontu nezastaví', async () => {
    const chybny = poJedne(async () => {
      throw new Error('vadná fotka');
    });
    const synchronniChyba = poJedne((() => {
      throw new Error('synchronní chyba');
    }) as () => Promise<never>);
    const dalsi = poJedne(async () => 'ok');
    await expect(chybny).rejects.toThrow('vadná fotka');
    await expect(synchronniChyba).rejects.toThrow('synchronní chyba');
    await expect(dalsi).resolves.toBe('ok');
  });
});

function pametoveUloziste(pocatek: Record<string, string> = {}) {
  const data = new Map(Object.entries(pocatek));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

const SYNC_ZAPNUTY = { 'questor-sync-nastaveni': JSON.stringify({ url: 'https://s.test', token: 'rodina' }) };

describe('znamePovoleniLatky — poslední známé povolení', () => {
  it('bez syncu vždy false (ani uložené true tlačítko neukáže)', () => {
    vi.stubGlobal(
      'localStorage',
      pametoveUloziste({
        'questor-sync-nastaveni': JSON.stringify({ url: 'https://s.test', token: '' }),
        'questor-latka-povoleni:p-bez-syncu': '1',
      }),
    );
    expect(znamePovoleniLatky('p-bez-syncu')).toBe(false);
    expect(znamePovoleniLatky(undefined)).toBe(false);
  });

  it('se syncem vrátí uloženou odpověď serveru z minula', () => {
    vi.stubGlobal('localStorage', pametoveUloziste({ ...SYNC_ZAPNUTY, 'questor-latka-povoleni:p-ulozeny': '1' }));
    expect(znamePovoleniLatky('p-ulozeny')).toBe(true);
    expect(znamePovoleniLatky('p-neznamy')).toBe(false);
  });

  it('zapamatujPovoleni zapíše do localStorage a platí hned', () => {
    const uloziste = pametoveUloziste(SYNC_ZAPNUTY);
    vi.stubGlobal('localStorage', uloziste);
    zapamatujPovoleni('p-novy', true);
    expect(uloziste.data.get('questor-latka-povoleni:p-novy')).toBe('1');
    expect(znamePovoleniLatky('p-novy')).toBe(true);
  });

  it('nefunkční localStorage nic neshodí', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => zapamatujPovoleni('p-rozbity', true)).not.toThrow();
    expect(znamePovoleniLatky('p-jiny')).toBe(false);
  });
});
