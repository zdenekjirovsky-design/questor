// Výběrová otázka (1 správná z možností) — celá karta možnosti je tlačítko.
// Možnosti se zobrazují v deterministicky zamíchaném pořadí (hash id otázky),
// aby pořadí v datech neprozrazovalo klíč; odpověď nese DATOVÝ index.
import { useEffect, useMemo } from 'react';
import type { OtazkaVyber } from '@questor/sdilene';
import type { OdpovedHodnota } from '../engine';
import { indexZKlavesy, jeVstupniPole, popisekKlavesy } from './klavesy';
import { zamichaneIndexy } from './michani';

interface Props {
  otazka: OtazkaVyber;
  /** Odeslaná odpověď (fáze feedbacku), jinak null. */
  odeslana: OdpovedHodnota | null;
  /** Ukázat správně/špatně (mimo režim zkouška). */
  zobrazVyhodnoceni: boolean;
  /** Datové indexy možností skryté power-upem 50:50 (jen v duelu). */
  skryteIndexy?: number[];
  onOdpoved(hodnota: OdpovedHodnota): void;
}

export default function VyberOtazka({
  otazka,
  odeslana,
  zobrazVyhodnoceni,
  skryteIndexy,
  onOdpoved,
}: Props) {
  const zamceno = odeslana !== null;
  const vybrana = odeslana?.typ === 'vyber' ? odeslana.vybrana : null;
  // Zobrazovací pořadí možností: pozice → datový index. Možnosti skryté
  // power-upem 50:50 vypadnou úplně (klávesy se přečíslují na viditelné).
  const poradi = useMemo(() => {
    const zamichane = zamichaneIndexy(`vyber:${otazka.id}`, otazka.moznosti.length);
    return skryteIndexy && skryteIndexy.length > 0
      ? zamichane.filter((i) => !skryteIndexy.includes(i))
      : zamichane;
  }, [otazka, skryteIndexy]);

  useEffect(() => {
    if (zamceno) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const pozice = indexZKlavesy(e.key, poradi.length);
      if (pozice === null) return;
      e.preventDefault();
      onOdpoved({ typ: 'vyber', vybrana: poradi[pozice] });
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [zamceno, otazka, poradi, onOdpoved]);

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
      {poradi.map((index, pozice) => (
        <button
          key={index}
          type="button"
          className={tridaMoznosti(index)}
          disabled={zamceno}
          onClick={() => onOdpoved({ typ: 'vyber', vybrana: index })}
        >
          <span className="moznost__klavesa">{popisekKlavesy(pozice)}</span>
          <span>{otazka.moznosti[index]}</span>
        </button>
      ))}
    </div>
  );
}
