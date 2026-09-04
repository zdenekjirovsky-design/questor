// Multi otázka (více správných) — klikáním/klávesami se přepíná výběr,
// Enter (nebo tlačítko) odešle. Hodnotí se PŘESNÁ shoda množin.
// Možnosti se zobrazují v deterministicky zamíchaném pořadí (hash id otázky),
// aby pořadí v datech neprozrazovalo klíč; odpověď nese DATOVÉ indexy.
import { useEffect, useMemo, useState } from 'react';
import type { OtazkaMulti } from '@questor/sdilene';
import type { OdpovedHodnota } from '../engine';
import { indexZKlavesy, jeVstupniPole, popisekKlavesy } from './klavesy';
import { zamichaneIndexy } from './michani';

interface Props {
  otazka: OtazkaMulti;
  odeslana: OdpovedHodnota | null;
  zobrazVyhodnoceni: boolean;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

export default function MultiOtazka({ otazka, odeslana, zobrazVyhodnoceni, onOdpoved }: Props) {
  const zamceno = odeslana !== null;
  const [vybrane, setVybrane] = useState<number[]>([]);
  const odeslane = odeslana?.typ === 'multi' ? odeslana.vybrane : [];
  // Zobrazovací pořadí možností: pozice → datový index.
  const poradi = useMemo(
    () => zamichaneIndexy(`multi:${otazka.id}`, otazka.moznosti.length),
    [otazka],
  );

  const prepni = (index: number) => {
    setVybrane((stare) =>
      stare.includes(index) ? stare.filter((i) => i !== index) : [...stare, index],
    );
  };

  const odesli = () => {
    if (vybrane.length === 0) return;
    onOdpoved({ typ: 'multi', vybrane: [...vybrane].sort((a, b) => a - b) });
  };

  useEffect(() => {
    if (zamceno) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        odesli();
        return;
      }
      const pozice = indexZKlavesy(e.key, otazka.moznosti.length);
      if (pozice === null) return;
      e.preventDefault();
      prepni(poradi[pozice]);
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  });

  const tridaMoznosti = (index: number): string => {
    const tridy = ['moznost'];
    if (zamceno && zobrazVyhodnoceni) {
      if (otazka.spravne.includes(index)) tridy.push('moznost--spravne');
      else if (odeslane.includes(index)) tridy.push('moznost--spatne', 'animace-zatreseni');
    } else if ((zamceno ? odeslane : vybrane).includes(index)) {
      tridy.push('moznost--vybrana');
    }
    return tridy.join(' ');
  };

  return (
    <div>
      <p className="parovani__napoveda">Správných odpovědí může být víc — označ všechny.</p>
      <div className="moznosti" role="group" aria-label="Možnosti odpovědi (více správných)">
        {poradi.map((index, pozice) => (
          <button
            key={index}
            type="button"
            className={tridaMoznosti(index)}
            disabled={zamceno}
            aria-pressed={(zamceno ? odeslane : vybrane).includes(index)}
            onClick={() => prepni(index)}
          >
            <span className="moznost__klavesa">{popisekKlavesy(pozice)}</span>
            <span>{otazka.moznosti[index]}</span>
          </button>
        ))}
      </div>
      {!zamceno && (
        <div className="parovani__akce">
          <button
            type="button"
            className="tlacitko tlacitko--primarni"
            disabled={vybrane.length === 0}
            onClick={odesli}
          >
            Potvrdit (Enter)
          </button>
        </div>
      )}
    </div>
  );
}
