// České popisky režimů testu (sdílí stránky Test a Výsledek).
import type { RezimTestu } from '@questor/sdilene';

export const NAZVY_REZIMU: Record<RezimTestu, string> = {
  rozcvicka: 'Rozcvička',
  standard: 'Standard',
  hardcore: 'Hardcore',
  adaptivni: 'Adaptivní',
  zkouska: 'Zkouška',
};

export const POPISY_REZIMU: Record<RezimTestu, string> = {
  rozcvicka: 'Lehké otázky na rozjezd (obtížnost 1–2)',
  standard: 'Vyvážený mix (obtížnost 2–4)',
  hardcore: 'Jen ty nejtěžší (obtížnost 4–5)',
  adaptivni: 'Obtížnost se přizpůsobuje tvým odpovědím',
  zkouska: 'Časový limit, vyhodnocení až na konci — jako naostro',
};
