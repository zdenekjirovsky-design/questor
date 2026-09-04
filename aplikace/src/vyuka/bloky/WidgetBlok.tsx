// Widget blok — vykresli interaktivni komponentu z registru (vyuka/registr.ts).
// Korelaci widgetId ↔ parametry drzi VyukovyWidget (switch uvnitr registru),
// takze tady nejsou zadne casty ani duplikovany dispatch.
import type { VyukovyBlokWidget } from '@questor/sdilene';
import { VyukovyWidget } from '../registr';

interface Props {
  blok: VyukovyBlokWidget;
  /** Widget hlasi splneni — odemyka dalsi blok lekce. */
  onSplneno: () => void;
}

export default function WidgetBlok({ blok, onSplneno }: Props) {
  return <VyukovyWidget blok={blok} onSplneno={onSplneno} />;
}
