// Obrazkovy blok — inline SVG. SVG se VZDY prohani sanitizujSvg (whitelist
// elementu/atributu, zadne <script>/<foreignObject>/on* — viz sdilene/vyuka.ts)
// a dedi barvy pres currentColor + CSS promenne tokenu.
import { useMemo } from 'react';
import { sanitizujSvg } from '@questor/sdilene';
import type { VyukovyBlokObrazek } from '@questor/sdilene';

export default function ObrazekBlok({ blok }: { blok: VyukovyBlokObrazek }) {
  const cisteSvg = useMemo(() => sanitizujSvg(blok.svg), [blok.svg]);
  return (
    <figure className="vyuka-obrazek">
      <div
        className="vyuka-obrazek__platno"
        // Bezpecne: obsah prosel sanitizujSvg (jedine povolene misto pro innerHTML).
        dangerouslySetInnerHTML={{ __html: cisteSvg }}
      />
      <figcaption>{blok.popisek}</figcaption>
    </figure>
  );
}
