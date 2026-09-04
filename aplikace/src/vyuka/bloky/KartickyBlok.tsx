// Karticky (flashcards) — 3D flip otacenim kliknutim, sipky mezi kartami.
// Klavesnice: sipky vlevo/vpravo prochazi, mezernik/Enter otaci.
import { useState } from 'react';
import type { VyukovyBlokKarticky } from '@questor/sdilene';

export default function KartickyBlok({ blok }: { blok: VyukovyBlokKarticky }) {
  const [index, setIndex] = useState(0);
  const [otocene, setOtocene] = useState<Set<number>>(new Set());
  const [videne, setVidene] = useState<Set<number>>(new Set([0]));

  const pocet = blok.polozky.length;
  const karticka = blok.polozky[index];
  const jeOtocena = otocene.has(index);

  const otoc = () => {
    setOtocene((s) => {
      const nove = new Set(s);
      if (nove.has(index)) nove.delete(index);
      else nove.add(index);
      return nove;
    });
  };

  const posun = (smer: -1 | 1) => {
    const novy = (index + smer + pocet) % pocet;
    setIndex(novy);
    setVidene((s) => new Set(s).add(novy));
  };

  return (
    <div className="karticky">
      <div className="karticky__titulek">
        <span aria-hidden="true">🃏</span> Kartičky — klikni a otoč
      </div>
      <div className="karticky__scena">
        <button
          type="button"
          className="karticky__sipka"
          onClick={() => posun(-1)}
          disabled={pocet <= 1}
          aria-label="Předchozí kartička"
        >
          ‹
        </button>
        <button
          type="button"
          className={`karticka${jeOtocena ? ' karticka--otocena' : ''}`}
          onClick={otoc}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              posun(-1);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              posun(1);
            }
          }}
          aria-label={jeOtocena ? `Zadní strana: ${karticka.zadni}` : `Přední strana: ${karticka.predni}`}
        >
          <span className="karticka__vnitrek">
            <span className="karticka__strana karticka__strana--predni">
              {karticka.predni}
              <span className="karticka__napoveda">otočit ↻</span>
            </span>
            <span className="karticka__strana karticka__strana--zadni">{karticka.zadni}</span>
          </span>
        </button>
        <button
          type="button"
          className="karticky__sipka"
          onClick={() => posun(1)}
          disabled={pocet <= 1}
          aria-label="Další kartička"
        >
          ›
        </button>
      </div>
      <div className="karticky__stav">
        <span className="karticky__pocitadlo">
          {index + 1}/{pocet}
        </span>
        <span className="karticky__tecky" aria-hidden="true">
          {blok.polozky.map((_, i) => (
            <i
              key={i}
              className={
                i === index
                  ? 'karticky__tecka karticky__tecka--aktivni'
                  : videne.has(i)
                    ? 'karticky__tecka karticky__tecka--videna'
                    : 'karticky__tecka'
              }
            />
          ))}
        </span>
        {videne.size === pocet && <span className="karticky__hotovo">Všechny prohlédnuté ✓</span>}
      </div>
    </div>
  );
}
