// Doplňovací otázka — input + Enter. Porovnává se normalizovaně
// (jeOdpovedSpravna ve sdíleném jádru), tady jen sbíráme text.
// Autofokus jen s myší/klávesnicí: na dotyku by vyjela klávesnice a stránka
// poskočila (v testu po „Další“, v lekci i u hotových mini-kvízů).
import { useEffect, useRef, useState } from 'react';
import type { OtazkaDoplneni } from '@questor/sdilene';
import type { OdpovedHodnota } from '../engine';
import { jeDotykoveZarizeni } from '../../vyuka/widgety/dotyk';

interface Props {
  otazka: OtazkaDoplneni;
  odeslana: OdpovedHodnota | null;
  zobrazVyhodnoceni: boolean;
  /** Byla odpověď správně? (jen pro obarvení pole ve fázi feedbacku) */
  spravne: boolean | null;
  /**
   * Fokusovat pole po zobrazení (výchozí true — test a duel na desktopu).
   * Na dotykovém zařízení se nefokusuje nikdy; v lekci (mini-kvíz) má volající
   * předat false, jinak by si pole vzalo fokus i u hotových bloků.
   */
  autoFocus?: boolean;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

export default function DoplneniOtazka({
  otazka,
  odeslana,
  zobrazVyhodnoceni,
  spravne,
  autoFocus = true,
  onOdpoved,
}: Props) {
  const zamceno = odeslana !== null;
  const [text, setText] = useState('');
  const vstup = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (zamceno || !autoFocus || jeDotykoveZarizeni()) return;
    // preventScroll: posun stránky řídí test/duel (návrat na začátek otázky),
    // fokus ho nesmí přebít skokem k poli.
    vstup.current?.focus({ preventScroll: true });
  }, [zamceno, otazka.id, autoFocus]);

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
