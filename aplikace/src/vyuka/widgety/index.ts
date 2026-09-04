// Registr výukových widgetů — mapa widgetId → React komponenta.
// Parametry jsou typované přes WidgetParametryMapa ze sdilene (žádné casty);
// za validaci tvaru parametrů ručí validujVyuku, komponenty jí věří.
import { createElement, type ComponentType, type ReactElement } from 'react';
import type { VyukovyBlokWidget, WidgetId, WidgetParametryMapa } from '@questor/sdilene';
import Tridicka from './Tridicka';
import Pexeso from './Pexeso';
import PrubehProcesu from './PrubehProcesu';
import Popisovacka from './Popisovacka';
import CasovaOsa from './CasovaOsa';
import Srovnavac from './Srovnavac';

/** Props každého výukového widgetu: typované parametry + hlášení splnění. */
export interface WidgetProps<K extends WidgetId = WidgetId> {
  parametry: WidgetParametryMapa[K];
  onSplneno: () => void;
}

export type WidgetKomponentyMapa = { [K in WidgetId]: ComponentType<WidgetProps<K>> };

export const WIDGETY: WidgetKomponentyMapa = {
  tridicka: Tridicka,
  pexeso: Pexeso,
  'prubeh-procesu': PrubehProcesu,
  popisovacka: Popisovacka,
  'casova-osa': CasovaOsa,
  srovnavac: Srovnavac,
};

/**
 * Pohodlný vykreslovač bloku typu `widget`: přes switch udrží korelaci
 * widgetId ↔ parametry, takže volající nepotřebuje žádný cast.
 */
export function VyukovyWidget({
  blok,
  onSplneno,
}: {
  blok: VyukovyBlokWidget;
  onSplneno: () => void;
}): ReactElement {
  switch (blok.widgetId) {
    case 'tridicka':
      return createElement(WIDGETY.tridicka, { parametry: blok.parametry, onSplneno });
    case 'pexeso':
      return createElement(WIDGETY.pexeso, { parametry: blok.parametry, onSplneno });
    case 'prubeh-procesu':
      return createElement(WIDGETY['prubeh-procesu'], { parametry: blok.parametry, onSplneno });
    case 'popisovacka':
      return createElement(WIDGETY.popisovacka, { parametry: blok.parametry, onSplneno });
    case 'casova-osa':
      return createElement(WIDGETY['casova-osa'], { parametry: blok.parametry, onSplneno });
    case 'srovnavac':
      return createElement(WIDGETY.srovnavac, { parametry: blok.parametry, onSplneno });
  }
}

export { Tridicka, Pexeso, PrubehProcesu, Popisovacka, CasovaOsa, Srovnavac };
