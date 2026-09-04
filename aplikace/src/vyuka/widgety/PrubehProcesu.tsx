// Průběh procesu — kroky jako pilulky se šipkami, aktivní krok zvýrazněný
// s popisem, tlačítka Zpět/Další i klik na krok, šipky klávesnice.
// Projití všech kroků → onSplneno + malá oslava.
import { useEffect, useRef, useState } from 'react';
import type { PrubehProcesuParametry } from '@questor/sdilene';
import { posunKroku, vsechnyKrokyNavstiveny } from './logika';
import { jeVstupniPole } from '../../testy/komponenty/klavesy';
import './PrubehProcesu.css';

interface Props {
  parametry: PrubehProcesuParametry;
  onSplneno: () => void;
}

export default function PrubehProcesu({ parametry, onSplneno }: Props) {
  const pocet = parametry.kroky.length;
  const [aktivni, setAktivni] = useState(0);
  const [navstivene, setNavstivene] = useState<Set<number>>(new Set([0]));
  const splnenoHlaseno = useRef(false);
  const koren = useRef<HTMLDivElement | null>(null);

  const hotovo = vsechnyKrokyNavstiveny(navstivene, pocet);

  const prejdiNa = (index: number) => {
    if (index < 0 || index >= pocet) return;
    setAktivni(index);
    setNavstivene((stare) => {
      if (stare.has(index)) return stare;
      const nove = new Set(stare).add(index);
      if (vsechnyKrokyNavstiveny(nove, pocet) && !splnenoHlaseno.current) {
        splnenoHlaseno.current = true;
        onSplneno();
      }
      return nove;
    });
  };

  // Šipky vlevo/vpravo — jen když je fokus uvnitř widgetu (na stránce může
  // být víc widgetů pod sebou).
  useEffect(() => {
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!koren.current || !koren.current.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        prejdiNa(posunKroku(aktivni, pocet, 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prejdiNa(posunKroku(aktivni, pocet, -1));
      }
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  });

  const krok = parametry.kroky[aktivni];

  return (
    <div className="prubeh" ref={koren}>
      <p className="prubeh__zadani">{parametry.zadani}</p>

      <div className="prubeh__pilulky" role="group" aria-label="Kroky procesu">
        {parametry.kroky.map((k, i) => (
          <span key={i} className="prubeh__clanek">
            {i > 0 && (
              <span
                className={`prubeh__sipka ${i <= aktivni ? 'prubeh__sipka--projita' : ''}`}
                aria-hidden="true"
              >
                →
              </span>
            )}
            <button
              type="button"
              className={[
                'prubeh__pilulka',
                i === aktivni ? 'prubeh__pilulka--aktivni' : '',
                navstivene.has(i) && i !== aktivni ? 'prubeh__pilulka--navstivena' : '',
              ].join(' ')}
              onClick={() => prejdiNa(i)}
              aria-current={i === aktivni ? 'step' : undefined}
            >
              <span className="prubeh__pilulka-cislo" aria-hidden="true">
                {navstivene.has(i) && i !== aktivni ? '✓' : i + 1}
              </span>
              {k.ikona && (
                <span className="prubeh__pilulka-ikona" aria-hidden="true">
                  {k.ikona}
                </span>
              )}
              <span>{k.nazev}</span>
            </button>
          </span>
        ))}
      </div>

      <div className="prubeh__detail panel" key={aktivni}>
        <div className="prubeh__detail-hlavicka">
          {krok.ikona && (
            <span className="prubeh__detail-ikona" aria-hidden="true">
              {krok.ikona}
            </span>
          )}
          <h3 className="prubeh__detail-nazev">
            {aktivni + 1}. {krok.nazev}
          </h3>
        </div>
        <p className="prubeh__detail-popis">{krok.popis}</p>
      </div>

      <div className="prubeh__ovladani">
        <button
          type="button"
          className="tlacitko"
          onClick={() => prejdiNa(posunKroku(aktivni, pocet, -1))}
          disabled={aktivni === 0}
        >
          ← Zpět
        </button>
        <span className="prubeh__pocitadlo" aria-live="polite">
          {hotovo ? (
            <span className="prubeh__hotovo animace-pop">Prošel jsi celý proces! ✓</span>
          ) : (
            <>
              Krok {aktivni + 1} z {pocet}
            </>
          )}
        </span>
        <button
          type="button"
          className={`tlacitko ${aktivni < pocet - 1 ? 'tlacitko--primarni' : ''}`}
          onClick={() => prejdiNa(posunKroku(aktivni, pocet, 1))}
          disabled={aktivni === pocet - 1}
        >
          Další →
        </button>
      </div>
    </div>
  );
}
