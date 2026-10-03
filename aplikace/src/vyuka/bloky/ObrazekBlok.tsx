// Obrazkovy blok — inline SVG. SVG se VZDY prohani sanitizujSvg (whitelist
// elementu/atributu, zadne <script>/<foreignObject>/on* — viz sdilene/vyuka.ts)
// a dedi barvy pres currentColor + CSS promenne tokenu.
//
// Mobil: siroke schema (viewBox 560–720) ma na telefonu text 4–6 px. Prehled
// zustava pres celou sirku (struktura schematu je obsah — DIDAKTIKA bod 4);
// tlacitko „Zvětšit“ (nebo klepnuti do obrazku) prepne SVG na citelnou sirku
// odvozenou z viewBoxu a posouva se do stran uvnitr platna (vyuka.css).
// Uzka/svisla schemata se nezvetsuji; lupa se skryje i tam, kde se zvetsena
// sirka vejde do platna (telefon na sirku, maly tablet — mereni
// ResizeObserverem). Na desktopu se nic nemeni (CSS).
import { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizujSvg } from '@questor/sdilene';
import type { VyukovyBlokObrazek } from '@questor/sdilene';
import { extrahujViewBox, sirkaZvetseniSvg } from '../widgety/logika';
import { jeZvetseniZbytecne } from '../lekceLogika';

function jeMobil(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

export default function ObrazekBlok({ blok }: { blok: VyukovyBlokObrazek }) {
  const cisteSvg = useMemo(() => sanitizujSvg(blok.svg), [blok.svg]);
  const sirkaZvetseni = useMemo(() => sirkaZvetseniSvg(extrahujViewBox(cisteSvg)), [cisteSvg]);
  const [zvetsene, setZvetsene] = useState(false);

  // Vnitrni sirka platna vs. zvetsena sirka — lupa jen tam, kde opravdu
  // zvetsi (vychozi false: prvni render a SSR lupu ukazou).
  const platnoRef = useRef<HTMLDivElement>(null);
  const [zbytecne, setZbytecne] = useState(false);
  useEffect(() => {
    const platno = platnoRef.current;
    if (!platno || sirkaZvetseni === null || typeof ResizeObserver === 'undefined') return;
    const zmer = () => {
      const styl = window.getComputedStyle(platno);
      const vnitrni =
        platno.clientWidth - (parseFloat(styl.paddingLeft) || 0) - (parseFloat(styl.paddingRight) || 0);
      setZbytecne(jeZvetseniZbytecne(sirkaZvetseni, vnitrni));
    };
    zmer();
    const pozorovatel = new ResizeObserver(zmer);
    pozorovatel.observe(platno);
    return () => pozorovatel.disconnect();
  }, [sirkaZvetseni]);
  const lzeZvetsit = sirkaZvetseni !== null && !zbytecne;

  const tridy = ['vyuka-obrazek'];
  if (lzeZvetsit) tridy.push('vyuka-obrazek--lze-zvetsit');
  if (lzeZvetsit && zvetsene) tridy.push('vyuka-obrazek--zvetsene');

  return (
    <figure
      className={tridy.join(' ')}
      style={
        sirkaZvetseni !== null
          ? ({ '--obrazek-sirka': `${sirkaZvetseni}px` } as React.CSSProperties)
          : undefined
      }
    >
      <div
        ref={platnoRef}
        className="vyuka-obrazek__platno"
        // Klepnuti do prehledu na mobilu = zvetsit (zpet jen tlacitkem, at
        // posouvani prstem do stran obrazek omylem nezmensi).
        onClick={
          lzeZvetsit && !zvetsene
            ? () => {
                if (jeMobil()) setZvetsene(true);
              }
            : undefined
        }
        // Bezpecne: obsah prosel sanitizujSvg (jedine povolene misto pro innerHTML).
        dangerouslySetInnerHTML={{ __html: cisteSvg }}
      />
      {lzeZvetsit && (
        <button
          type="button"
          className="vyuka-obrazek__lupa"
          aria-pressed={zvetsene}
          onClick={() => setZvetsene((z) => !z)}
        >
          {zvetsene ? '🔍 Zmenšit na šířku' : '🔍 Zvětšit (posouvej do stran)'}
        </button>
      )}
      <figcaption>{blok.popisek}</figcaption>
    </figure>
  );
}
