// Hook ochranne prodlevy po zobrazeni otazky — viz ochranaKliku.ts.
import { useCallback, useLayoutEffect, useRef } from 'react';
import type { MouseEvent } from 'react';
import { jeVOchranneProdleve } from './ochranaKliku';

function ted(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Vraci handler pro `onClickCapture` panelu otazky (u rodinneho duelu cele
 * sekce otazky vc. power-upu). Okamzik zobrazeni se nastavi pri mountu
 * a pri kazde zmene `klic` (index otazky) — v layout efektu, tedy jeste
 * pred prvnim vykreslenim nove otazky. Klik v prodleve
 * se zastavi uz ve fazi capture, takze k tlacitkum moznosti vubec nedojde
 * (vizualne nic — zadne zasednuti ani zmena kurzoru). Klik vyvolany
 * klavesnici (Enter/mezernik na tlacitku, `detail === 0`) projde vzdy.
 */
export function pouzijOchranuKliku(klic: unknown): (e: MouseEvent) => void {
  const zobrazeno = useRef<number | null>(null);
  useLayoutEffect(() => {
    zobrazeno.current = ted();
  }, [klic]);
  return useCallback((e: MouseEvent) => {
    if (e.detail === 0) return;
    if (!jeVOchranneProdleve(zobrazeno.current, ted())) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);
}
