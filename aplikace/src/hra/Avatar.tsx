// Avatar — SVG postavička s DLOUHÝMI vlasy. Vlasy jsou výchozí a neodstranitelné:
// konfigurace mění jen jejich barvu (a později doplňky z truhel). Záměr, ne bug.
import { useId } from 'react';
import type { AvatarKonfigurace } from '@questor/sdilene';
import './Avatar.css';

interface AvatarProps {
  konfigurace: AvatarKonfigurace;
  /** Velikost v px (čtverec). Default 96. */
  velikost?: number;
  /** Jemné vznášení (hodí se na velký avatar). */
  animovany?: boolean;
}

export default function Avatar({ konfigurace, velikost = 96, animovany = false }: AvatarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const idPozadi = `av-pozadi-${uid}`;
  const idStin = `av-stin-${uid}`;
  const idOrez = `av-orez-${uid}`;
  const vlasy = konfigurace.barvaVlasu;

  return (
    <svg
      className={animovany ? 'avatar avatar--vznasejici' : 'avatar'}
      width={velikost}
      height={velikost}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Avatar s dlouhými vlasy"
    >
      <defs>
        <radialGradient id={idPozadi} cx="35%" cy="25%" r="90%">
          <stop offset="0%" stopColor="var(--pozadi-panel-2)" />
          <stop offset="60%" stopColor="var(--pozadi-panel)" />
          <stop offset="100%" stopColor="var(--pozadi)" />
        </radialGradient>
        <linearGradient id={idStin} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </linearGradient>
        <clipPath id={idOrez}>
          <circle cx="60" cy="60" r="57" />
        </clipPath>
      </defs>

      {/* Pozadí — vesmír Noční akademie */}
      <circle cx="60" cy="60" r="57" fill={`url(#${idPozadi})`} stroke="var(--okraj)" strokeWidth="2" />
      <g fill="var(--text)" opacity="0.55">
        <circle cx="22" cy="30" r="1.3" />
        <circle cx="96" cy="22" r="1" />
        <circle cx="104" cy="52" r="1.4" />
        <circle cx="16" cy="68" r="1" />
        <circle cx="90" cy="86" r="1.1" />
        <circle cx="30" cy="14" r="0.9" />
      </g>

      <g clipPath={`url(#${idOrez})`}>
        {/* Vlasy — zadní vrstva: dlouhé, padají přes ramena až dolů */}
        <path
          d={
            'M60 12 C34 12 24 32 26 54 C27 72 22 88 18 104 ' +
            'C28 114 42 112 46 102 L46 58 C46 46 51 38 60 38 ' +
            'C69 38 74 46 74 58 L74 102 C78 112 92 114 102 104 ' +
            'C98 88 93 72 94 54 C96 32 86 12 60 12 Z'
          }
          fill={vlasy}
        />
        {/* Tělo / mikina */}
        <path
          d="M40 118 L40 100 C40 88 48 82 60 82 C72 82 80 88 80 100 L80 118 Z"
          fill="var(--akcent)"
        />
        <path
          d="M40 118 L40 100 C40 88 48 82 60 82 C72 82 80 88 80 100 L80 118 Z"
          fill={`url(#${idStin})`}
        />
        {/* Obličej */}
        <circle cx="60" cy="52" r="17" fill="#f2c9a0" />
        {/* Ofina — přes čelo, patří k dlouhým vlasům */}
        <path
          d="M42 47 C42 28 78 28 78 47 C72 40 68 42 63 38 C58 44 48 40 42 47 Z"
          fill={vlasy}
        />
        {/* Lesk vlasů */}
        <path
          d="M34 34 C38 24 48 18 58 17 C46 22 40 28 37 40 Z"
          fill="rgba(255,255,255,0.25)"
        />
        {/* Oči */}
        <circle cx="53.5" cy="53" r="2" fill="#2c2440" />
        <circle cx="66.5" cy="53" r="2" fill="#2c2440" />
        <circle cx="54.2" cy="52.3" r="0.6" fill="#ffffff" />
        <circle cx="67.2" cy="52.3" r="0.6" fill="#ffffff" />
        {/* Tvářičky */}
        <ellipse cx="50" cy="58.5" rx="2.6" ry="1.5" fill="var(--chyba)" opacity="0.3" />
        <ellipse cx="70" cy="58.5" rx="2.6" ry="1.5" fill="var(--chyba)" opacity="0.3" />
        {/* Úsměv */}
        <path
          d="M55 61 Q60 65 65 61"
          stroke="#2c2440"
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        {/* Stín na vlasech (hloubka) */}
        <path
          d="M74 58 L74 102 C78 112 92 114 102 104 C98 88 93 72 94 54 C95 42 92 30 84 22 C90 32 90 44 88 56 C86 72 88 88 90 100 C84 104 78 102 76 96 L76 58 Z"
          fill="rgba(0,0,0,0.18)"
        />
      </g>
    </svg>
  );
}
