// Pexeso — hledání dvojic pojem ↔ definice. Karty rubem nahoru, 3D otáčení,
// nalezená dvojice zůstává a zazáří, počítadlo tahů, na konci hvězdy podle
// počtu tahů + konfety + onSplneno.
import { useEffect, useRef, useState } from 'react';
import type { PexesoParametry } from '@questor/sdilene';
import { hvezdyZaTahy, jePar, sloupcePexesa, vytvorBalicek, type PexesoKarta } from './logika';
import Konfety from './Konfety';
import './Pexeso.css';

interface Props {
  parametry: PexesoParametry;
  onSplneno: () => void;
}

export default function Pexeso({ parametry, onSplneno }: Props) {
  // Balíček se míchá jednou při mountu (každá hra jiná).
  const [balicek] = useState<PexesoKarta[]>(() => vytvorBalicek(parametry.dvojice, Math.random));
  const [otocene, setOtocene] = useState<number[]>([]); // indexy právě otočených (max 2)
  const [nalezene, setNalezene] = useState<Set<number>>(new Set()); // parId nalezených dvojic
  const [prave, setPrave] = useState<number | null>(null); // parId právě nalezené (záře)
  const [tahy, setTahy] = useState(0);
  const zamek = useRef(false);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splnenoHlaseno = useRef(false);

  useEffect(
    () => () => {
      if (casovac.current) clearTimeout(casovac.current);
    },
    [],
  );

  const hotovo = nalezene.size === parametry.dvojice.length;
  const hvezdy = hvezdyZaTahy(parametry.dvojice.length, tahy);

  const otoc = (index: number) => {
    if (zamek.current || hotovo) return;
    const karta = balicek[index];
    if (nalezene.has(karta.parId) || otocene.includes(index)) return;

    if (otocene.length < 1) {
      setOtocene([index]);
      return;
    }

    // Druhá karta tahu
    const prvni = balicek[otocene[0]];
    const novyTah = tahy + 1;
    setTahy(novyTah);
    setOtocene([otocene[0], index]);

    if (jePar(prvni, karta)) {
      const noveNalezene = new Set(nalezene).add(karta.parId);
      setPrave(karta.parId);
      setNalezene(noveNalezene);
      setOtocene([]);
      if (noveNalezene.size === parametry.dvojice.length && !splnenoHlaseno.current) {
        splnenoHlaseno.current = true;
        onSplneno();
      }
      return;
    }

    // Neshoda — chvilku ukázat, pak otočit zpět
    zamek.current = true;
    casovac.current = setTimeout(() => {
      setOtocene([]);
      zamek.current = false;
    }, 950);
  };

  const sloupce = sloupcePexesa(balicek.length);

  return (
    <div className="pexeso">
      <div className="pexeso__lista">
        <span className="pexeso__pocitadlo">
          Tahy: <strong>{tahy}</strong>
        </span>
        <span className="pexeso__pocitadlo">
          Dvojice: <strong>{nalezene.size}</strong> / {parametry.dvojice.length}
        </span>
      </div>

      <div
        className="pexeso__mrizka"
        style={{ gridTemplateColumns: `repeat(${sloupce}, minmax(0, 1fr))` }}
        role="group"
        aria-label="Hrací plocha pexesa"
      >
        {balicek.map((karta, index) => {
          const jeOtocena = otocene.includes(index) || nalezene.has(karta.parId);
          const jeNalezena = nalezene.has(karta.parId);
          return (
            <button
              key={index}
              type="button"
              className={[
                'pexeso__karta',
                jeOtocena ? 'pexeso__karta--licem' : '',
                jeNalezena ? 'pexeso__karta--nalezena' : '',
                jeNalezena && prave === karta.parId ? 'pexeso__karta--prave' : '',
              ].join(' ')}
              onClick={() => otoc(index)}
              disabled={jeNalezena || hotovo}
              aria-label={jeOtocena ? karta.text : `Zakrytá karta ${index + 1}`}
            >
              <span className="pexeso__karta-vnitrek">
                <span className="pexeso__karta-rub" aria-hidden="true">
                  <span className="pexeso__karta-znak">?</span>
                </span>
                <span className={`pexeso__karta-lic pexeso__karta-lic--${karta.strana}`}>
                  {karta.text}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="pexeso__paticka" aria-live="polite">
        {hotovo && (
          <div className="pexeso__oslava animace-pop">
            <Konfety />
            <div className="pexeso__hvezdy" aria-label={`Hodnocení: ${hvezdy} z 3 hvězd`}>
              {[1, 2, 3].map((h) => (
                <span
                  key={h}
                  className={`pexeso__hvezda ${h <= hvezdy ? 'pexeso__hvezda--plna' : ''}`}
                  style={{ animationDelay: `${0.15 * h}s` }}
                  aria-hidden="true"
                >
                  ★
                </span>
              ))}
            </div>
            <span className="pexeso__oslava-titul">
              {hvezdy === 3 ? 'Skvělá paměť!' : hvezdy === 2 ? 'Slušný výkon!' : 'Dohráno!'}
            </span>
            <span className="pexeso__oslava-detail">
              Všech {parametry.dvojice.length} dvojic za {tahy}{' '}
              {tahy >= 5 ? 'tahů' : tahy >= 2 ? 'tahy' : 'tah'}.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
