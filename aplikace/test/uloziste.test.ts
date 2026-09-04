// Testy IndexedDB uloziste obsahu (src/sync/uloziste.ts) — v Node zadne
// indexedDB neni, helper je ale fail-safe: cteni vrati prazdno, zapisy
// tise projdou. Aplikace pak jede jen z bundlu a serveru.
import { describe, expect, it } from 'vitest';
import { nactiVsechenObsah, smazObsah, ulozObsah } from '../src/sync/uloziste';

describe('uloziste obsahu (bez indexedDB)', () => {
  it('cteni vrati prazdne pole misto chyby', async () => {
    await expect(nactiVsechenObsah('banky')).resolves.toEqual([]);
    await expect(nactiVsechenObsah('vyuky')).resolves.toEqual([]);
  });

  it('zapis a mazani tise projdou', async () => {
    await expect(ulozObsah('banky', 'x', { predmetId: 'x' })).resolves.toBeUndefined();
    await expect(smazObsah('vyuky', 'x')).resolves.toBeUndefined();
  });
});
