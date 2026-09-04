// Výběrová otázka (1 správná z možností) — celá karta možnosti je tlačítko.
import { useEffect } from 'react';
import type { OtazkaVyber } from '@questor/sdilene';
import type { OdpovedHodnota } from '../engine';
import { indexZKlavesy, jeVstupniPole, popisekKlavesy } from './klavesy';

interface Props {
  otazka: OtazkaVyber;
  /** Odeslaná odpověď (fáze feedbacku), jinak null. */
  odeslana: OdpovedHodnota | null;
  /** Ukázat správně/špatně (mimo režim zkouška). */
  zobrazVyhodnoceni: boolean;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

export default function VyberOtazka({ otazka, odeslana, zobrazVyhodnoceni, onOdpoved }: Props) {
  const zamceno = odeslana !== null;
  const vybrana = odeslana?.typ === 'vyber' ? odeslana.vybrana : null;

  useEffect(() => {
    if (zamceno) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const index = indexZKlavesy(e.key, otazka.moznosti.length);
      if (index === null) return;
      e.preventDefault();
      onOdpoved({ typ: 'vyber', vybrana: index });
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [zamceno, otazka, onOdpoved]);

  const tridaMoznosti = (index: number): string => {
    const tridy = ['moznost'];
    if (zamceno && zobrazVyhodnoceni) {
      if (index === otazka.spravna) tridy.push('moznost--spravne');
      else if (index === vybrana) tridy.push('moznost--spatne', 'animace-zatreseni');
    } else if (index === vybrana) {
      tridy.push('moznost--vybrana');
    }
    return tridy.join(' ');
  };

  return (
    <div className="moznosti" role="group" aria-label="Možnosti odpovědi">
      {otazka.moznosti.map((text, index) => (
        <button
          key={index}
          type="button"
          className={tridaMoznosti(index)}
          disabled={zamceno}
          onClick={() => onOdpoved({ typ: 'vyber', vybrana: index })}
        >
          <span className="moznost__klavesa">{popisekKlavesy(index)}</span>
          <span>{text}</span>
        </button>
      ))}
    </div>
  );
}
