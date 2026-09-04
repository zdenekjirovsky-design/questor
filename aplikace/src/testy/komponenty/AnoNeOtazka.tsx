// Ano/ne otázka — dvě velké karty, klávesy 1/A = ano, 2/N = ne.
import { useEffect } from 'react';
import type { OtazkaAnoNe } from '@questor/sdilene';
import type { OdpovedHodnota } from '../engine';
import { jeVstupniPole } from './klavesy';

interface Props {
  otazka: OtazkaAnoNe;
  odeslana: OdpovedHodnota | null;
  zobrazVyhodnoceni: boolean;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

const VOLBY: { hodnota: boolean; text: string; klavesa: string }[] = [
  { hodnota: true, text: 'Ano', klavesa: '1' },
  { hodnota: false, text: 'Ne', klavesa: '2' },
];

export default function AnoNeOtazka({ otazka, odeslana, zobrazVyhodnoceni, onOdpoved }: Props) {
  const zamceno = odeslana !== null;
  const vybrana = odeslana?.typ === 'anone' ? odeslana.hodnota : null;

  useEffect(() => {
    if (zamceno) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      let hodnota: boolean | null = null;
      if (k === '1' || k === 'a') hodnota = true;
      else if (k === '2' || k === 'n') hodnota = false;
      if (hodnota === null) return;
      e.preventDefault();
      onOdpoved({ typ: 'anone', hodnota });
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [zamceno, onOdpoved]);

  const trida = (hodnota: boolean): string => {
    const tridy = ['moznost'];
    if (zamceno && zobrazVyhodnoceni) {
      if (hodnota === otazka.spravna) tridy.push('moznost--spravne');
      else if (hodnota === vybrana) tridy.push('moznost--spatne', 'animace-zatreseni');
    } else if (hodnota === vybrana) {
      tridy.push('moznost--vybrana');
    }
    return tridy.join(' ');
  };

  return (
    <div className="moznosti" role="group" aria-label="Ano, nebo ne?">
      {VOLBY.map((volba) => (
        <button
          key={volba.text}
          type="button"
          className={trida(volba.hodnota)}
          disabled={zamceno}
          onClick={() => onOdpoved({ typ: 'anone', hodnota: volba.hodnota })}
        >
          <span className="moznost__klavesa">{volba.klavesa}</span>
          <span>{volba.text}</span>
        </button>
      ))}
    </div>
  );
}
