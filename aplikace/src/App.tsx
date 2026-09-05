// Kostra aplikace — routing a hlavička. Tenhle soubor je „zmrazený“:
// stránky se mění ve svých souborech, ne tady.
// Výjimka po dohodě (lokální profily): bez aktivního profilu se místo
// aplikace ukáže výběr profilu (VyberProfilu) — brána celé aplikace.
// Výjimka po dohodě (duely): routy /duely a /duel/:id, položka Duely
// v navigaci s indikátorem čekajících výzev (DuelyIndikator).
import { NavLink, Route, Routes } from 'react-router-dom';
import { pouzijStav } from './stav/store';
import VyberProfilu from './profily/VyberProfilu';
import HudHlavicka from './komponenty/HudHlavicka';
import Domu from './stranky/Domu';
import Test from './stranky/Test';
import Vysledek from './stranky/Vysledek';
import Sbirka from './stranky/Sbirka';
import Statistiky from './stranky/Statistiky';
import Nastaveni from './stranky/Nastaveni';
import Uceni from './vyuka/Uceni';
import LekceViewer from './vyuka/LekceViewer';
import Duely from './duely/Duely';
import DuelHrani from './duely/DuelHrani';
import DuelyIndikator from './duely/DuelyIndikator';
import './App.css';

const odkazy = [
  { cesta: '/', text: 'Domů' },
  { cesta: '/uceni', text: 'Učit se' },
  { cesta: '/duely', text: 'Duely' },
  { cesta: '/sbirka', text: 'Sbírka' },
  { cesta: '/statistiky', text: 'Statistiky' },
  { cesta: '/nastaveni', text: 'Nastavení' },
];

export default function App() {
  const aktivniProfilId = pouzijStav((s) => s.aktivniProfilId);

  // Brána profilů: bez aktivního profilu se ukáže výběr (jako na streamovacích
  // službách). Osobní data neaktivních profilů drží stav/profilySlice.ts.
  if (!aktivniProfilId) {
    return <VyberProfilu />;
  }

  return (
    <div className="rozvrzeni">
      <header className="hlavicka">
        <div className="hlavicka__logo">
          <span className="hlavicka__erb">⚜️</span> QUESTOR
        </div>
        <nav className="hlavicka__nav">
          {odkazy.map((o) => (
            <NavLink
              key={o.cesta}
              to={o.cesta}
              end={o.cesta === '/'}
              className={({ isActive }) => (isActive ? 'nav-odkaz nav-odkaz--aktivni' : 'nav-odkaz')}
            >
              <span className="nav-odkaz__text">
                {o.text}
                {o.cesta === '/duely' && <DuelyIndikator />}
              </span>
            </NavLink>
          ))}
        </nav>
        <HudHlavicka />
      </header>
      <main className="obsah">
        <Routes>
          <Route path="/" element={<Domu />} />
          <Route path="/uceni" element={<Uceni />} />
          <Route path="/uceni/:temaId" element={<LekceViewer />} />
          <Route path="/test" element={<Test />} />
          <Route path="/vysledek" element={<Vysledek />} />
          <Route path="/duely" element={<Duely />} />
          <Route path="/duel/:id" element={<DuelHrani />} />
          <Route path="/sbirka" element={<Sbirka />} />
          <Route path="/statistiky" element={<Statistiky />} />
          <Route path="/nastaveni" element={<Nastaveni />} />
        </Routes>
      </main>
    </div>
  );
}
