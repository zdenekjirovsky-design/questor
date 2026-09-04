// Doplňovací otázka — input + Enter. Porovnává se normalizovaně
// (jeOdpovedSpravna ve sdíleném jádru), tady jen sbíráme text.
import { useEffect, useRef, useState } from 'react';
import type { OtazkaDoplneni } from '@questor/sdilene';
import type { OdpovedHodnota } from '../engine';

interface Props {
  otazka: OtazkaDoplneni;
  odeslana: OdpovedHodnota | null;
  zobrazVyhodnoceni: boolean;
  /** Byla odpověď správně? (jen pro obarvení pole ve fázi feedbacku) */
  spravne: boolean | null;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

export default function DoplneniOtazka({
  otazka,
  odeslana,
  zobrazVyhodnoceni,
  spravne,
  onOdpoved,
}: Props) {
  const zamceno = odeslana !== null;
  const [text, setText] = useState('');
  const vstup = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!zamceno) vstup.current?.focus();
  }, [zamceno, otazka.id]);

  const odesli = () => {
    if (text.trim() === '') return;
    onOdpoved({ typ: 'doplneni', text });
  };

  const zobrazeny = zamceno && odeslana?.typ === 'doplneni' ? odeslana.text : text;
  const tridaVstupu =
    zamceno && zobrazVyhodnoceni
      ? `doplneni--${spravne ? 'spravne' : 'spatne'}${spravne ? '' : ' animace-zatreseni'}`
      : '';

  return (
    <div>
      <div className="doplneni">
        <input
          ref={vstup}
          type="text"
          value={zobrazeny}
          placeholder="Napiš odpověď…"
          disabled={zamceno}
          className={tridaVstupu}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              odesli();
            }
          }}
          aria-label="Tvoje odpověď"
        />
        {!zamceno && (
          <button
            type="button"
            className="tlacitko tlacitko--primarni"
            disabled={text.trim() === ''}
            onClick={odesli}
          >
            Odpovědět
          </button>
        )}
      </div>
      {zamceno && zobrazVyhodnoceni && spravne === false && (
        <p className="doplneni__spravna">Správně je: {otazka.spravneOdpovedi[0]}</p>
      )}
    </div>
  );
}
