// Registr vyukovych widgetu — JEDINE misto, odkud si UI bere mapu WIDGETY.
//
// Skutecne komponenty ziji ve slozce ./widgety/ (index.ts); registr je jen
// re-exportuje pod stabilnimi jmeny, aby zbytek UI (bloky/WidgetBlok.tsx)
// nemusel znat vnitrni strukturu modulu widgetu. Docasny stub z doby
// paralelniho vyvoje (widgety-stub.tsx) byl odstranen pri integraci.
export { WIDGETY, VyukovyWidget } from './widgety';
export type { WidgetProps, WidgetKomponentyMapa, WidgetKomponentyMapa as WidgetMapa } from './widgety';
