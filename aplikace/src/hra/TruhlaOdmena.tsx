// TruhlaOdmena — EVENT otevírání truhly (importuje stránka Výsledek i Domů).
// Zavřená truhla → klik → zatřesení → otevření → odměna s pop + CSS konfety.
// NIKDY se neotevírá automaticky: klik je součást rituálu.
import { useEffect, useRef, useState } from 'react';
import type { Odmena, TruhlaTyp, Vzacnost } from '@questor/sdilene';
import { KARTY_VELIKANI } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import './TruhlaOdmena.css';

const NAZVY_TRUHEL: Record<TruhlaTyp, string> = {
  bronzova: 'Bronzová truhla',
  stribrna: 'Stříbrná truhla',
  zlata: 'Zlatá truhla',
};

const BARVY_VZACNOSTI: Record<Vzacnost, string> = {
  obycejna: 'var(--text-tlumeny)',
  vzacna: 'var(--info)',
  epicka: 'var(--akcent)',
  legendarni: 'var(--zlata)',
};

const NAZVY_VZACNOSTI: Record<Vzacnost, string> = {
  obycejna: 'obyčejná',
  vzacna: 'vzácná',
  epicka: 'epická',
  legendarni: 'legendární',
};

const BARVY_KONFET = [
  'var(--zlata)',
  'var(--akcent)',
  'var(--akcent-svetly)',
  'var(--uspech)',
  'var(--info)',
  'var(--stribrna)',
];

interface Konfeta {
  dx: number;
  dy: number;
  rot: number;
  barva: string;
  zpozdeni: number;
  sirka: number;
  vyska: number;
}

function vygenerujKonfety(pocet: number): Konfeta[] {
  return Array.from({ length: pocet }, (_, i) => ({
    dx: Math.round((Math.random() - 0.5) * 320),
    dy: Math.round(-60 - Math.random() * 180),
    rot: Math.round((Math.random() - 0.5) * 720),
    barva: BARVY_KONFET[i % BARVY_KONFET.length],
    zpozdeni: Math.random() * 0.15,
    sirka: 6 + Math.round(Math.random() * 5),
    vyska: 8 + Math.round(Math.random() * 6),
  }));
}

type Faze = 'zavrena' | 'treses' | 'otevrena';

interface TruhlaOdmenaProps {
  typ: TruhlaTyp;
  /** Zavolá se s odměnou hned po otevření (např. pro doprovodný text stránky). */
  onOtevreno?: (odmena: Odmena) => void;
}

export default function TruhlaOdmena({ typ, onOtevreno }: TruhlaOdmenaProps) {
  const otevriTruhluAkce = pouzijStav((s) => s.otevriTruhluAkce);
  // Truhla, která už ve frontě nečeká (typicky remount Výsledku po otevření),
  // se rovnou ukáže jako otevřená — bez odměny a bez možnosti kliknout.
  const [uzOtevrena] = useState(
    () => !pouzijStav.getState().cekajiciTruhly.includes(typ),
  );
  const [faze, setFaze] = useState<Faze>(uzOtevrena ? 'otevrena' : 'zavrena');
  const [odmena, setOdmena] = useState<Odmena | null>(null);
  const [konfety, setKonfety] = useState<Konfeta[]>([]);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (casovac.current) clearTimeout(casovac.current);
    },
    [],
  );

  const klik = () => {
    if (faze !== 'zavrena') return;
    setFaze('treses');
    casovac.current = setTimeout(() => {
      const ziskana = otevriTruhluAkce(typ);
      if (!ziskana) {
        // Fronta už truhlu tohohle typu nemá (mezitím otevřená jinde) —
        // žádná odměna, jen otevřený stav bez konfet.
        setFaze('otevrena');
        return;
      }
      setOdmena(ziskana);
      setKonfety(vygenerujKonfety(28));
      setFaze('otevrena');
      onOtevreno?.(ziskana);
    }, 600);
  };

  const karta =
    odmena?.typ === 'karta' && odmena.kartaId
      ? KARTY_VELIKANI.find((k) => k.id === odmena.kartaId)
      : undefined;

  return (
    <div className={`truhla truhla--${typ} truhla--faze-${faze}`}>
      <div className="truhla__scena">
        {/* Konfety */}
        {faze === 'otevrena' && (
          <div className="truhla__konfety" aria-hidden="true">
            {konfety.map((k, i) => (
              <span
                key={i}
                className="truhla__konfeta"
                style={
                  {
                    '--dx': `${k.dx}px`,
                    '--dy': `${k.dy}px`,
                    '--rot': `${k.rot}deg`,
                    '--zpozdeni': `${k.zpozdeni}s`,
                    width: k.sirka,
                    height: k.vyska,
                    background: k.barva,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}

        {/* Odměna */}
        {faze === 'otevrena' && odmena && (
          <div className="truhla__odmena animace-pop">
            {odmena.typ === 'xp' && (
              <div className="truhla__odmena-xp">+{odmena.xp ?? 0} XP</div>
            )}
            {odmena.typ === 'zmrazeni' && (
              <div className="truhla__odmena-zmrazeni">
                <span className="truhla__odmena-emoji">❄️</span>
                <span>Zmrazení streaku +1</span>
              </div>
            )}
            {odmena.typ === 'karta' && (
              <div
                className="truhla__odmena-karta"
                style={{ '--barva-vzacnosti': BARVY_VZACNOSTI[karta?.vzacnost ?? 'obycejna'] } as React.CSSProperties}
              >
                <div className="truhla__odmena-karta-typ">Nová karta!</div>
                <div className="truhla__odmena-karta-jmeno">{karta?.jmeno ?? odmena.kartaId}</div>
                <div className="truhla__odmena-karta-titul">{karta?.titul ?? ''}</div>
                <div className="truhla__odmena-karta-vzacnost">
                  {NAZVY_VZACNOSTI[karta?.vzacnost ?? 'obycejna']}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Truhla */}
        <button
          type="button"
          className="truhla__telo"
          onClick={klik}
          disabled={faze !== 'zavrena'}
          aria-label={`${NAZVY_TRUHEL[typ]} — kliknutím otevřeš`}
        >
          {faze === 'otevrena' && <div className="truhla__zare" aria-hidden="true" />}
          <svg viewBox="0 0 160 130" width="160" height="130" aria-hidden="true">
            {/* Spodek truhly */}
            <g className="truhla__spodek">
              <rect x="25" y="60" width="110" height="54" rx="10" fill="var(--truhla-barva)" />
              <rect x="25" y="60" width="110" height="54" rx="10" fill="rgba(0,0,0,0.28)" />
              <rect x="30" y="64" width="100" height="16" rx="6" fill="rgba(0,0,0,0.18)" />
              <rect x="46" y="60" width="9" height="54" fill="rgba(0,0,0,0.22)" />
              <rect x="105" y="60" width="9" height="54" fill="rgba(0,0,0,0.22)" />
            </g>
            {/* Víko */}
            <g className="truhla__viko">
              <path
                d="M25 64 L25 46 Q25 14 80 14 Q135 14 135 46 L135 64 Z"
                fill="var(--truhla-barva)"
              />
              <path
                d="M25 64 L25 46 Q25 14 80 14 Q135 14 135 46 L135 64 Z"
                fill="rgba(255,255,255,0.12)"
              />
              <path d="M25 56 L135 56 L135 64 L25 64 Z" fill="rgba(0,0,0,0.25)" />
              <rect x="46" y="20" width="9" height="44" fill="rgba(0,0,0,0.2)" />
              <rect x="105" y="20" width="9" height="44" fill="rgba(0,0,0,0.2)" />
              <path
                d="M34 34 Q44 20 62 17 Q46 26 40 40 Z"
                fill="rgba(255,255,255,0.28)"
              />
            </g>
            {/* Zámek */}
            <g className="truhla__zamek">
              <rect x="69" y="52" width="22" height="26" rx="5" fill="var(--zlata)" />
              <rect x="69" y="52" width="22" height="26" rx="5" fill="rgba(0,0,0,0.12)" />
              <circle cx="80" cy="62" r="3.6" fill="rgba(0,0,0,0.55)" />
              <path d="M78.6 63 L81.4 63 L82.5 71 L77.5 71 Z" fill="rgba(0,0,0,0.55)" />
            </g>
          </svg>
        </button>

        <div className="truhla__popisek">
          {faze === 'zavrena' && (
            <>
              <div className="truhla__nazev">{NAZVY_TRUHEL[typ]}</div>
              <div className="truhla__vyzva-klik">Klikni a otevři!</div>
            </>
          )}
          {faze === 'treses' && <div className="truhla__vyzva-klik">…</div>}
          {faze === 'otevrena' && !odmena && (
            <div className="truhla__vyzva-klik">Odměna už je vyzvednutá.</div>
          )}
        </div>
      </div>
    </div>
  );
}
