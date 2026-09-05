// Avatar — vrstvena SVG postavicka, plne prizpusobitelna: pohlavi, tvar
// obliceje, plet, barva a strih vlasu (vcetne kratkych) + kosmeticka vybava
// z truhel (sloty hlava/oci/krk/pozadi). Vrstvy odzadu dopredu:
// pozadi → vlasy (zadni) → telo → krk → oblicej → rysy → vlasy (predni)
// → vybava krk → vybava oci → vybava hlava. Diky poradi sedi vybava na
// vsech 5 strihu obou pohlavi (cepice kryje temeno, dlouhe vlasy prirozene
// koukaji zpod ni zadni vrstvou).
import { useId } from 'react';
import type { AvatarKonfigurace } from '@questor/sdilene';
import './Avatar.css';

interface AvatarProps {
  konfigurace: AvatarKonfigurace;
  /** Velikost v px (ctverec). Default 96. */
  velikost?: number;
  /** Jemne vznaseni (hodi se na velky avatar). */
  animovany?: boolean;
}

// ---------------------------------------------------------------------------
// Geometrie obliceje — sirka pulky hlavy podle tvaru (kvuli usim a ofine).

const TVARY_OBLICEJE: Record<AvatarKonfigurace['tvarObliceje'], { cesta: string; usiX: number }> = {
  ovalny: {
    cesta:
      'M100 50 C80 50 68 66 68 88 C68 110 81 124 100 124 C119 124 132 110 132 88 C132 66 120 50 100 50 Z',
    usiX: 31,
  },
  hranaty: {
    cesta:
      'M100 52 C82 52 70 62 70 80 L70 96 C70 114 82 124 100 124 C118 124 130 114 130 96 L130 80 C130 62 118 52 100 52 Z',
    usiX: 29,
  },
  kulaty: {
    cesta:
      'M100 53 C81 53 67 68 67 89 C67 109 81 124 100 124 C119 124 133 109 133 89 C133 68 119 53 100 53 Z',
    usiX: 32,
  },
};

// ---------------------------------------------------------------------------
// Pozadi — vychozi vesmir + varianty z vybavy (slot pozadi).

function Pozadi({ pozadiId, uid }: { pozadiId: string | undefined; uid: string }) {
  const idGrad = `av-poz-${uid}`;
  switch (pozadiId) {
    case 'mesto-v-noci':
      return (
        <g>
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#141a3d" />
              <stop offset="100%" stopColor="#1c1040" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="200" height="200" fill={`url(#${idGrad})`} />
          <circle cx="152" cy="38" r="13" fill="#f0ead6" opacity="0.85" />
          <circle cx="147" cy="34" r="3" fill="#d9d2ba" opacity="0.5" />
          {/* Silueta mrakodrapu */}
          <g fill="#0b0918">
            <rect x="4" y="112" width="30" height="88" />
            <rect x="38" y="92" width="26" height="108" />
            <rect x="68" y="120" width="24" height="80" />
            <rect x="108" y="104" width="28" height="96" />
            <rect x="140" y="126" width="24" height="74" />
            <rect x="168" y="98" width="30" height="102" />
          </g>
          {/* Rozsvicena okna */}
          <g fill="var(--zlata)" opacity="0.8">
            <rect x="10" y="120" width="4" height="5" />
            <rect x="22" y="132" width="4" height="5" />
            <rect x="44" y="100" width="4" height="5" />
            <rect x="54" y="116" width="4" height="5" />
            <rect x="44" y="140" width="4" height="5" />
            <rect x="74" y="128" width="4" height="5" />
            <rect x="114" y="112" width="4" height="5" />
            <rect x="126" y="130" width="4" height="5" />
            <rect x="146" y="134" width="4" height="5" />
            <rect x="174" y="106" width="4" height="5" />
            <rect x="186" y="122" width="4" height="5" />
            <rect x="174" y="144" width="4" height="5" />
          </g>
        </g>
      );
    case 'hory':
      return (
        <g>
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0e1630" />
              <stop offset="100%" stopColor="#2a2254" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="200" height="200" fill={`url(#${idGrad})`} />
          <circle cx="48" cy="42" r="14" fill="#f0ead6" opacity="0.9" />
          <path d="M-10 168 L52 92 L110 168 Z" fill="#221c44" />
          <path d="M52 92 L64 108 L52 114 L40 108 Z" fill="#e8e6f5" opacity="0.9" />
          <path d="M70 178 L138 84 L206 178 Z" fill="#2d2454" />
          <path d="M138 84 L152 104 L138 110 L124 104 Z" fill="#f2f0fa" />
          <path d="M-10 200 L44 140 L120 200 Z" fill="#191536" />
          <rect x="0" y="178" width="200" height="22" fill="#141128" />
        </g>
      );
    case 'neonova-zed':
      return (
        <g>
          <rect x="0" y="0" width="200" height="200" fill="#161020" />
          {/* Naznak cihel */}
          <g stroke="#221a30" strokeWidth="1.5">
            <line x1="0" y1="40" x2="200" y2="40" />
            <line x1="0" y1="80" x2="200" y2="80" />
            <line x1="0" y1="130" x2="200" y2="130" />
            <line x1="0" y1="170" x2="200" y2="170" />
            <line x1="60" y1="40" x2="60" y2="80" />
            <line x1="150" y1="0" x2="150" y2="40" />
            <line x1="100" y1="130" x2="100" y2="170" />
          </g>
          {/* Neonove trubice se zari */}
          <rect x="14" y="56" width="172" height="10" rx="5" fill="#ff2fa0" opacity="0.22" />
          <rect x="18" y="59" width="164" height="4" rx="2" fill="#ff2fa0" />
          <rect x="14" y="146" width="172" height="10" rx="5" fill="#22d3ee" opacity="0.22" />
          <rect x="18" y="149" width="164" height="4" rx="2" fill="#22d3ee" />
          <rect x="150" y="24" width="10" height="150" rx="5" fill="var(--akcent)" opacity="0.18" transform="rotate(18 155 99)" />
          <rect x="153" y="28" width="4" height="142" rx="2" fill="var(--akcent-svetly)" opacity="0.8" transform="rotate(18 155 99)" />
        </g>
      );
    case 'stadion':
      return (
        <g>
          <defs>
            <linearGradient id={idGrad} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d1126" />
              <stop offset="100%" stopColor="#1b2247" />
            </linearGradient>
          </defs>
          <rect x="0" y="0" width="200" height="200" fill={`url(#${idGrad})`} />
          {/* Svetelne stozary */}
          <g>
            <rect x="38" y="46" width="4" height="60" fill="#2c2f52" />
            <rect x="26" y="34" width="28" height="14" rx="4" fill="#3a3e68" />
            <circle cx="33" cy="41" r="3" fill="var(--zlata)" opacity="0.9" />
            <circle cx="41" cy="41" r="3" fill="var(--zlata)" opacity="0.9" />
            <circle cx="49" cy="41" r="3" fill="var(--zlata)" opacity="0.9" />
            <path d="M26 48 L54 48 L84 130 L6 130 Z" fill="#f5e9c8" opacity="0.07" />
            <rect x="158" y="46" width="4" height="60" fill="#2c2f52" />
            <rect x="146" y="34" width="28" height="14" rx="4" fill="#3a3e68" />
            <circle cx="153" cy="41" r="3" fill="var(--zlata)" opacity="0.9" />
            <circle cx="161" cy="41" r="3" fill="var(--zlata)" opacity="0.9" />
            <circle cx="169" cy="41" r="3" fill="var(--zlata)" opacity="0.9" />
            <path d="M146 48 L174 48 L194 130 L116 130 Z" fill="#f5e9c8" opacity="0.07" />
          </g>
          {/* Tribuny */}
          <rect x="0" y="106" width="200" height="12" fill="#2a2f56" />
          <rect x="0" y="118" width="200" height="12" fill="#232848" />
          <rect x="0" y="130" width="200" height="10" fill="#2a2f56" />
          {/* Travnik */}
          <ellipse cx="100" cy="206" rx="130" ry="68" fill="#1d4d35" />
          <ellipse cx="100" cy="206" rx="92" ry="46" fill="none" stroke="#eef5ee" strokeWidth="2" opacity="0.3" />
        </g>
      );
    default:
      // Vychozi vesmir Nocni akademie
      return (
        <g>
          <defs>
            <radialGradient id={idGrad} cx="35%" cy="25%" r="90%">
              <stop offset="0%" stopColor="var(--pozadi-panel-2)" />
              <stop offset="60%" stopColor="var(--pozadi-panel)" />
              <stop offset="100%" stopColor="var(--pozadi)" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="200" height="200" fill={`url(#${idGrad})`} />
          <g fill="var(--text)" opacity="0.55">
            <circle cx="37" cy="50" r="2.1" />
            <circle cx="160" cy="37" r="1.6" />
            <circle cx="173" cy="87" r="2.3" />
            <circle cx="27" cy="113" r="1.6" />
            <circle cx="150" cy="143" r="1.8" />
            <circle cx="50" cy="23" r="1.5" />
            <circle cx="103" cy="16" r="1.3" />
            <circle cx="18" cy="160" r="1.4" />
          </g>
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// Vlasy — zadni vrstva (za telem a hlavou) a predni vrstva (ofina/strih).

function VlasyZadni({ styl, barva }: { styl: AvatarKonfigurace['stylVlasu']; barva: string }) {
  switch (styl) {
    case 'kratke':
      return null;
    case 'polodlouhe':
      return (
        <g fill={barva}>
          <path
            d={
              'M100 44 C70 44 58 66 60 94 C61 110 58 122 54 132 ' +
              'C66 142 82 140 88 132 L88 96 C88 82 92 74 100 74 ' +
              'C108 74 112 82 112 96 L112 132 C118 140 134 142 146 132 ' +
              'C142 122 139 110 140 94 C142 66 130 44 100 44 Z'
            }
          />
          <path
            d="M140 94 C141 110 144 122 146 132 C140 137 132 138 126 135 C132 126 134 112 133 96 C133 78 128 62 118 52 C132 58 139 74 140 94 Z"
            fill="rgba(0,0,0,0.18)"
          />
        </g>
      );
    case 'rozpustene':
      return (
        <g fill={barva}>
          <path
            d={
              'M100 42 C64 42 50 70 54 104 C56 130 50 152 44 170 ' +
              'C62 184 84 182 90 170 L90 92 C90 78 94 70 100 70 ' +
              'C106 70 110 78 110 92 L110 170 C116 182 138 184 156 170 ' +
              'C150 152 144 130 146 104 C150 70 136 42 100 42 Z'
            }
          />
          <path
            d="M146 104 C144 130 150 152 156 170 C148 176 138 178 130 175 C136 158 140 136 138 110 C136 84 130 62 118 50 C138 60 148 80 146 104 Z"
            fill="rgba(0,0,0,0.18)"
          />
        </g>
      );
    case 'culik':
      return (
        <g fill={barva}>
          {/* Tesne stazene vlasy — tenky lem nad temenem */}
          <path
            d={
              'M100 44 C74 44 62 62 64 88 C64 94 66 98 68 100 ' +
              'C66 78 80 60 100 60 C120 60 134 78 132 100 ' +
              'C134 98 136 94 136 88 C138 62 126 44 100 44 Z'
            }
          />
          {/* Culik za pravou stranou hlavy */}
          <path
            d={
              'M130 74 C146 80 154 100 150 124 C147 142 138 158 126 166 ' +
              'C135 148 140 130 138 114 C136 96 130 86 122 82 Z'
            }
          />
          <path
            d="M150 124 C147 142 138 158 126 166 C132 152 136 138 136 124 C142 124 147 124 150 124 Z"
            fill="rgba(0,0,0,0.18)"
          />
        </g>
      );
    case 'vlnite':
      return (
        <g fill={barva}>
          <path
            d={
              'M100 42 C64 42 48 70 54 102 C46 116 58 126 50 140 ' +
              'C42 154 56 162 48 176 C64 188 84 184 90 172 L90 92 ' +
              'C90 78 94 70 100 70 C106 70 110 78 110 92 L110 172 ' +
              'C116 184 136 188 152 176 C144 162 158 154 150 140 ' +
              'C142 126 154 116 146 102 C152 70 136 42 100 42 Z'
            }
          />
          <path
            d="M146 102 C154 116 142 126 150 140 C158 154 144 162 152 176 C146 180 138 182 131 181 C138 166 128 158 136 144 C144 130 132 122 140 106 C142 88 136 64 120 50 C138 60 148 80 146 102 Z"
            fill="rgba(0,0,0,0.16)"
          />
        </g>
      );
  }
}

function VlasyPredni({ styl, barva }: { styl: AvatarKonfigurace['stylVlasu']; barva: string }) {
  const lesk = (
    <path d="M78 56 C84 48 92 45 99 45 C89 50 82 56 78 66 Z" fill="rgba(255,255,255,0.25)" />
  );
  switch (styl) {
    case 'kratke':
      return (
        <g fill={barva}>
          {/* Kratky strih — kryje temeno, konci nad usima */}
          <path
            d={
              'M67 90 C63 56 82 44 100 44 C118 44 137 56 133 90 ' +
              'C133 76 128 68 122 64 C112 72 88 72 78 64 ' +
              'C72 68 67 76 67 90 Z'
            }
          />
          {/* Kotlety */}
          <path d="M67 84 C66 94 67 100 71 104 L71 84 Z" />
          <path d="M133 84 C134 94 133 100 129 104 L129 84 Z" />
          {lesk}
        </g>
      );
    case 'polodlouhe':
    case 'rozpustene':
      return (
        <g fill={barva}>
          {/* Ofina */}
          <path
            d={
              'M68 88 C64 56 82 44 100 44 C118 44 136 56 132 88 ' +
              'C128 70 122 74 114 62 C104 74 88 72 82 64 ' +
              'C74 70 70 78 68 88 Z'
            }
          />
          {lesk}
        </g>
      );
    case 'culik':
      return (
        <g fill={barva}>
          {/* Hladce sceslo dozadu — plynula linie bez ofiny */}
          <path
            d={
              'M68 84 C66 52 134 52 132 84 ' +
              'C128 66 116 58 100 58 C84 58 72 66 68 84 Z'
            }
          />
          {/* Gumicka — v predni vrstve na korenu ohonu, vedle obliceje,
              aby ji zadny tvar obliceje nezakryl */}
          <ellipse cx="136" cy="84" rx="4.5" ry="6.5" fill="var(--zlata)" transform="rotate(45 136 84)" />
          {lesk}
        </g>
      );
    case 'vlnite':
      return (
        <g fill={barva}>
          <path
            d={
              'M68 88 C64 56 82 44 100 44 C118 44 136 56 132 88 ' +
              'C126 74 120 78 114 64 C108 76 92 74 84 64 ' +
              'C76 72 71 78 68 88 Z'
            }
          />
          {lesk}
        </g>
      );
  }
}

// ---------------------------------------------------------------------------
// Vybava — sloty krk, oci, hlava. Kresli se pres vlasy (hlava) / pres oblicej
// (oci) / pres telo (krk), takze sedi na vsechny strihy i tvary obliceje.

function VybavaKrk({ id }: { id: string | undefined }) {
  switch (id) {
    case 'sluchatka':
      return (
        <g>
          <path d="M74 146 C74 168 126 168 126 146" stroke="#2b2b3d" strokeWidth="7" fill="none" strokeLinecap="round" />
          <rect x="64" y="136" width="15" height="22" rx="6" fill="#2b2b3d" />
          <rect x="121" y="136" width="15" height="22" rx="6" fill="#2b2b3d" />
          <circle cx="71.5" cy="147" r="4" fill="var(--akcent)" />
          <circle cx="128.5" cy="147" r="4" fill="var(--akcent)" />
        </g>
      );
    case 'sala':
      return (
        <g>
          <path
            d="M77 136 C85 148 115 148 123 136 L123 152 C114 162 86 162 77 152 Z"
            fill="#c0392b"
          />
          <path d="M92 156 L92 188 C92 193 107 193 107 188 L107 156 Z" fill="#c0392b" />
          <path d="M92 178 L107 178 L107 188 C107 193 92 193 92 188 Z" fill="#96271c" />
          <path d="M77 144 C86 154 114 154 123 144 L123 149 C114 158 86 158 77 149 Z" fill="#96271c" opacity="0.7" />
        </g>
      );
    case 'retizek':
      return (
        <g>
          <path
            d="M80 140 C88 156 112 156 120 140"
            stroke="var(--zlata)"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray="5 3"
          />
          <circle cx="100" cy="153" r="4.5" fill="var(--zlata)" />
        </g>
      );
    case 'medaile-borce':
      return (
        <g>
          <path d="M88 138 L97 138 L103 158 L94 160 Z" fill="#c0392b" />
          <path d="M112 138 L103 138 L97 158 L106 160 Z" fill="#e8e6f0" />
          <circle cx="100" cy="164" r="9" fill="var(--zlata)" stroke="#b8860b" strokeWidth="1.5" />
          <path d="M100 158 L102 162.5 L106.5 162.5 L103 165.5 L104.5 170 L100 167 L95.5 170 L97 165.5 L93.5 162.5 L98 162.5 Z" fill="#b8860b" />
        </g>
      );
    default:
      return null;
  }
}

function VybavaOci({ id, uid }: { id: string | undefined; uid: string }) {
  const idZrcadlo = `av-pilotky-${uid}`;
  switch (id) {
    case 'bryle-cerne':
      return (
        <g>
          <line x1="70" y1="89" x2="78" y2="88" stroke="#14121f" strokeWidth="3" />
          <line x1="130" y1="89" x2="122" y2="88" stroke="#14121f" strokeWidth="3" />
          <rect x="76" y="83" width="20" height="15" rx="6" fill="#14121f" />
          <rect x="104" y="83" width="20" height="15" rx="6" fill="#14121f" />
          <path d="M96 88 L104 88" stroke="#14121f" strokeWidth="3" />
          <path d="M79 86 C82 84 86 84 89 86" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
          <path d="M107 86 C110 84 114 84 117 86" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" fill="none" />
        </g>
      );
    case 'pilotky':
      return (
        <g>
          <defs>
            <linearGradient id={idZrcadlo} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#bfd7ea" />
              <stop offset="55%" stopColor="#6c8fb5" />
              <stop offset="100%" stopColor="#40587a" />
            </linearGradient>
          </defs>
          <line x1="70" y1="88" x2="78" y2="87" stroke="var(--zlata)" strokeWidth="2" />
          <line x1="130" y1="88" x2="122" y2="87" stroke="var(--zlata)" strokeWidth="2" />
          <path
            d="M77 85 C77 82 96 82 96 85 C96 96 90 102 85 100 C80 98 77 92 77 85 Z"
            fill={`url(#${idZrcadlo})`}
            stroke="var(--zlata)"
            strokeWidth="1.6"
          />
          <path
            d="M123 85 C123 82 104 82 104 85 C104 96 110 102 115 100 C120 98 123 92 123 85 Z"
            fill={`url(#${idZrcadlo})`}
            stroke="var(--zlata)"
            strokeWidth="1.6"
          />
          <path d="M96 85 C98 83 102 83 104 85" stroke="var(--zlata)" strokeWidth="2" fill="none" />
        </g>
      );
    case '3d-bryle':
      return (
        <g>
          <line x1="70" y1="89" x2="77" y2="88" stroke="#f5f5f0" strokeWidth="3" />
          <line x1="130" y1="89" x2="123" y2="88" stroke="#f5f5f0" strokeWidth="3" />
          <rect x="76" y="83" width="48" height="15" rx="3" fill="#f5f5f0" />
          <rect x="80" y="86" width="16" height="9" rx="1.5" fill="#e0413d" opacity="0.8" />
          <rect x="104" y="86" width="16" height="9" rx="1.5" fill="#2f6fd6" opacity="0.8" />
        </g>
      );
    case 'monokl':
      return (
        <g>
          <circle cx="113" cy="92" r="9" fill="rgba(255,255,255,0.1)" stroke="var(--zlata)" strokeWidth="2.5" />
          <path d="M118 100 C123 110 117 118 121 128" stroke="var(--zlata)" strokeWidth="1.5" fill="none" />
          <path d="M108 88 C110 86 113 86 115 87" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" fill="none" />
        </g>
      );
    default:
      return null;
  }
}

function VybavaHlava({ id }: { id: string | undefined }) {
  switch (id) {
    case 'ksiltovka-dozadu':
      return (
        <g>
          {/* Ksilt dozadu (vpravo za hlavou) */}
          <path d="M129 58 C142 48 158 51 161 62 C151 57 141 59 132 66 Z" fill="#96271c" />
          {/* Koruna cepice */}
          <path d="M64 76 C64 50 82 40 100 40 C118 40 136 50 136 76 C124 65 76 65 64 76 Z" fill="#c14444" />
          <path d="M100 40 C118 40 136 50 136 76 C130 70 118 66 108 65 C110 55 106 45 100 40 Z" fill="rgba(0,0,0,0.15)" />
          <path d="M84 44 C90 41 96 40 100 40 C94 46 90 54 89 63 C82 63 74 65 68 69 C70 57 76 48 84 44 Z" fill="rgba(255,255,255,0.14)" />
          <circle cx="100" cy="41" r="3" fill="#96271c" />
        </g>
      );
    case 'celenka':
      return (
        <g>
          <path d="M68 66 C80 56 120 56 132 66 L132 76 C120 66 80 66 68 76 Z" fill="var(--akcent-svetly)" />
          <path d="M68 72 C80 62 120 62 132 72 L132 76 C120 66 80 66 68 76 Z" fill="rgba(0,0,0,0.2)" />
        </g>
      );
    case 'piratsky-satek':
      return (
        <g>
          <path
            d="M64 78 C64 48 82 38 100 38 C118 38 136 48 136 78 C132 70 126 66 120 68 C110 60 90 60 80 68 C74 66 68 70 64 78 Z"
            fill="#8e2f3c"
          />
          <path d="M64 78 C76 68 124 68 136 78 L136 84 C124 74 76 74 64 84 Z" fill="#6d1f2c" />
          {/* Uzel a cipy vzadu */}
          <path d="M134 74 C144 70 150 76 146 84 C142 79 138 77 134 78 Z" fill="#6d1f2c" />
          <path d="M144 82 L156 90 L146 92 Z" fill="#8e2f3c" />
          <path d="M145 88 L152 100 L142 96 Z" fill="#6d1f2c" />
          {/* Puntiky */}
          <g fill="rgba(255,255,255,0.5)">
            <circle cx="84" cy="52" r="1.8" />
            <circle cx="100" cy="46" r="1.8" />
            <circle cx="116" cy="52" r="1.8" />
            <circle cx="92" cy="60" r="1.8" />
            <circle cx="108" cy="60" r="1.8" />
          </g>
        </g>
      );
    case 'koruna':
      return (
        <g>
          <path
            d="M76 58 L124 58 L120 38 L109 51 L100 32 L91 51 L80 38 Z"
            fill="var(--zlata)"
            stroke="#b8860b"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <rect x="76" y="56" width="48" height="6" rx="2" fill="var(--zlata)" stroke="#b8860b" strokeWidth="1" />
          <circle cx="88" cy="52" r="2.4" fill="var(--chyba)" />
          <circle cx="100" cy="47" r="2.6" fill="var(--akcent)" />
          <circle cx="112" cy="52" r="2.4" fill="var(--info)" />
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Avatar

export default function Avatar({ konfigurace, velikost = 96, animovany = false }: AvatarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const idOrez = `av-orez-${uid}`;
  const idStin = `av-stin-${uid}`;
  const { pohlavi, tvarObliceje, barvaPleti, barvaVlasu, stylVlasu } = konfigurace;
  // Fail-safe pro poskozena persistovana data (rucni zasah do localStorage):
  // neznamy tvar spadne na ovalny, chybejici vybava na prazdnou. Avatar je
  // v HUD na kazde strance, takze jedno vadne pole nesmi polozit celou aplikaci.
  const tvar = TVARY_OBLICEJE[tvarObliceje] ?? TVARY_OBLICEJE.ovalny;
  const vybava = konfigurace.vybava ?? {};

  // Silueta tela: muz ma sirsi ramena, zena uzsi s jemnym spadem.
  const cestaTela =
    pohlavi === 'muz'
      ? 'M50 200 L50 174 C50 152 70 142 100 142 C130 142 150 152 150 174 L150 200 Z'
      : 'M58 200 L58 176 C58 155 76 147 100 147 C124 147 142 155 142 176 L142 200 Z';

  return (
    <svg
      className={animovany ? 'avatar avatar--vznasejici' : 'avatar'}
      width={velikost}
      height={velikost}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Avatar postavicky"
    >
      <defs>
        <linearGradient id={idStin} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
        </linearGradient>
        <clipPath id={idOrez}>
          <circle cx="100" cy="100" r="95" />
        </clipPath>
      </defs>

      <g clipPath={`url(#${idOrez})`}>
        <Pozadi pozadiId={vybava.pozadi} uid={uid} />

        {/* Vlasy — zadni vrstva (dlouhe strihy, culik) */}
        <VlasyZadni styl={stylVlasu} barva={barvaVlasu} />

        {/* Telo / mikina */}
        <path d={cestaTela} fill="var(--akcent)" />
        <path d={cestaTela} fill={`url(#${idStin})`} />
        {/* Limec */}
        <path
          d={pohlavi === 'muz' ? 'M84 144 C90 152 110 152 116 144' : 'M86 148 C92 156 108 156 114 148'}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />

        {/* Krk */}
        <rect x="90" y="112" width="20" height="36" rx="9" fill={barvaPleti} />
        <path d="M90 118 C94 124 106 124 110 118 L110 112 L90 112 Z" fill="rgba(0,0,0,0.16)" />

        {/* Usi */}
        <ellipse cx={100 - tvar.usiX} cy="92" rx="5" ry="8" fill={barvaPleti} />
        <ellipse cx={100 + tvar.usiX} cy="92" rx="5" ry="8" fill={barvaPleti} />

        {/* Oblicej */}
        <path d={tvar.cesta} fill={barvaPleti} />

        {/* Oboci — muz vyraznejsi, zena jemnejsi */}
        <path
          d="M80 82 C84 79.5 90 79.5 93 82"
          stroke="#3d3352"
          strokeWidth={pohlavi === 'muz' ? 3 : 2}
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M107 82 C110 79.5 116 79.5 120 82"
          stroke="#3d3352"
          strokeWidth={pohlavi === 'muz' ? 3 : 2}
          strokeLinecap="round"
          fill="none"
        />

        {/* Oci */}
        <circle cx="87" cy="92" r="3.2" fill="#2c2440" />
        <circle cx="113" cy="92" r="3.2" fill="#2c2440" />
        <circle cx="88.2" cy="90.8" r="1" fill="#ffffff" />
        <circle cx="114.2" cy="90.8" r="1" fill="#ffffff" />
        {pohlavi === 'zena' && (
          <g stroke="#2c2440" strokeWidth="1.3" strokeLinecap="round">
            <path d="M82.5 89 L80 87" />
            <path d="M117.5 89 L120 87" />
          </g>
        )}

        {/* Tvare */}
        <ellipse cx="81" cy="101" rx="4.2" ry="2.4" fill="var(--chyba)" opacity="0.28" />
        <ellipse cx="119" cy="101" rx="4.2" ry="2.4" fill="var(--chyba)" opacity="0.28" />

        {/* Usmev */}
        <path
          d="M91 106 Q100 113 109 106"
          stroke="#2c2440"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />

        {/* Vlasy — predni vrstva (strih) */}
        <VlasyPredni styl={stylVlasu} barva={barvaVlasu} />

        {/* Vybava — krk, oci, hlava (v tomhle poradi vrstvami nahoru) */}
        <VybavaKrk id={vybava.krk} />
        <VybavaOci id={vybava.oci} uid={uid} />
        <VybavaHlava id={vybava.hlava} />
      </g>

      {/* Ramecek */}
      <circle cx="100" cy="100" r="95" fill="none" stroke="var(--okraj)" strokeWidth="3" />
    </svg>
  );
}
