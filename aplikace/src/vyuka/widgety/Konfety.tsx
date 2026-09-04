// Konfety — sdílená mikrooslava widgetů (čisté CSS částice, žádná knihovna).
// Rodič musí mít position: relative; výbuch se odpálí jednou při mountu.
import { useState } from 'react';
import './Konfety.css';

const BARVY = [
  'var(--zlata)',
  'var(--akcent)',
  'var(--akcent-svetly)',
  'var(--uspech)',
  'var(--info)',
  'var(--stribrna)',
];

export interface Konfeta {
  dx: number;
  dy: number;
  rot: number;
  barva: string;
  zpozdeni: number;
  sirka: number;
  vyska: number;
}

/** Vygeneruje částice výbuchu; náhoda se injektuje kvůli testům. */
export function vygenerujKonfety(pocet: number, nahoda: () => number = Math.random): Konfeta[] {
  return Array.from({ length: pocet }, (_, i) => ({
    dx: Math.round((nahoda() - 0.5) * 340),
    dy: Math.round(-40 - nahoda() * 190),
    rot: Math.round((nahoda() - 0.5) * 720),
    barva: BARVY[i % BARVY.length],
    zpozdeni: nahoda() * 0.18,
    sirka: 6 + Math.round(nahoda() * 5),
    vyska: 8 + Math.round(nahoda() * 6),
  }));
}

export default function Konfety({ pocet = 26 }: { pocet?: number }) {
  const [konfety] = useState(() => vygenerujKonfety(pocet));
  return (
    <div className="widget-konfety" aria-hidden="true">
      {konfety.map((k, i) => (
        <span
          key={i}
          className="widget-konfety__kus"
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
  );
}
