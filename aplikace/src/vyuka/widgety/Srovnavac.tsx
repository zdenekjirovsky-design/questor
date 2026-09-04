// Srovnávač — 2–4 položky jako karty vedle sebe. Řádky vlastností jsou na
// začátku zakryté; klik na vlastnost je odkryje (pop), rozdílné hodnoty se
// zvýrazní. Odkrytí všech vlastností → onSplneno + oslava.
import { useMemo, useRef, useState } from 'react';
import type { SrovnavacParametry } from '@questor/sdilene';
import { hodnotyVlastnosti, jsouRozdilne, seznamVlastnosti } from './logika';
import Konfety from './Konfety';
import './Srovnavac.css';

interface Props {
  parametry: SrovnavacParametry;
  onSplneno: () => void;
}

export default function Srovnavac({ parametry, onSplneno }: Props) {
  const vlastnosti = useMemo(() => seznamVlastnosti(parametry.polozky), [parametry.polozky]);
  const [odkryte, setOdkryte] = useState<Set<string>>(new Set());
  const [aktivni, setAktivni] = useState<string | null>(null);
  const splnenoHlaseno = useRef(false);

  const hotovo = odkryte.size === vlastnosti.length && vlastnosti.length > 0;

  const klikniVlastnost = (klic: string) => {
    setAktivni(klic);
    setOdkryte((stare) => {
      if (stare.has(klic)) return stare;
      const nove = new Set(stare).add(klic);
      if (nove.size === vlastnosti.length && !splnenoHlaseno.current) {
        splnenoHlaseno.current = true;
        onSplneno();
      }
      return nove;
    });
  };

  const pocet = parametry.polozky.length;

  return (
    <div className="srovnavac">
      <p className="srovnavac__napoveda">
        Klikej na vlastnosti a odkrývej srovnání. Rozdíly se zvýrazní.
      </p>

      <div
        className="srovnavac__mrizka"
        style={{ gridTemplateColumns: `minmax(110px, 1.1fr) repeat(${pocet}, minmax(0, 1fr))` }}
        role="table"
        aria-label="Srovnání položek"
      >
        {/* Hlavička: prázdný roh + názvy položek */}
        <div className="srovnavac__roh" role="columnheader" aria-label="Vlastnost" />
        {parametry.polozky.map((p, i) => (
          <div key={i} className="srovnavac__hlava" role="columnheader">
            {p.nazev}
          </div>
        ))}

        {vlastnosti.map((klic) => {
          const hodnoty = hodnotyVlastnosti(parametry.polozky, klic);
          const odkryta = odkryte.has(klic);
          const rozdilne = odkryta && jsouRozdilne(hodnoty);
          return (
            <div key={klic} className="srovnavac__radek" role="row">
              <button
                type="button"
                className={[
                  'srovnavac__vlastnost',
                  odkryta ? 'srovnavac__vlastnost--odkryta' : '',
                  aktivni === klic ? 'srovnavac__vlastnost--aktivni' : '',
                ].join(' ')}
                onClick={() => klikniVlastnost(klic)}
                aria-expanded={odkryta}
              >
                <span>{klic}</span>
                {odkryta ? (
                  <span
                    className={`srovnavac__stitek ${
                      rozdilne ? 'srovnavac__stitek--rozdil' : 'srovnavac__stitek--shoda'
                    }`}
                  >
                    {rozdilne ? 'liší se' : 'shodné'}
                  </span>
                ) : (
                  <span className="srovnavac__stitek srovnavac__stitek--odkryj" aria-hidden="true">
                    odkryj
                  </span>
                )}
              </button>
              {hodnoty.map((hodnota, i) => (
                <div
                  key={i}
                  role="cell"
                  className={[
                    'srovnavac__hodnota',
                    odkryta ? 'srovnavac__hodnota--odkryta' : '',
                    rozdilne ? 'srovnavac__hodnota--rozdil' : '',
                    aktivni === klic && odkryta ? 'srovnavac__hodnota--aktivni' : '',
                  ].join(' ')}
                  style={odkryta ? { animationDelay: `${i * 0.07}s` } : undefined}
                >
                  {odkryta ? (hodnota ?? '—') : '?'}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="srovnavac__paticka" aria-live="polite">
        {hotovo ? (
          <div className="srovnavac__oslava animace-pop">
            <Konfety pocet={18} />
            <span className="srovnavac__oslava-titul">Srovnáno! 🎉</span>
            <span className="srovnavac__oslava-detail">
              Prošel jsi všech {vlastnosti.length} vlastností.
            </span>
          </div>
        ) : (
          <span className="srovnavac__zbyva">
            Odkryto {odkryte.size} z {vlastnosti.length} vlastností
          </span>
        )}
      </div>
    </div>
  );
}
