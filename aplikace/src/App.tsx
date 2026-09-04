// Kostra aplikace — routing a hlavička. Tenhle soubor je „zmrazený“:
// stránky se mění ve svých souborech, ne tady.
import { NavLink, Route, Routes } from 'react-router-dom';
import HudHlavicka from './komponenty/HudHlavicka';
import Domu from './stranky/Domu';
import Test from './stranky/Test';
import Vysledek from './stranky/Vysledek';
import Sbirka from './stranky/Sbirka';
import Statistiky from './stranky/Statistiky';
import Nastaveni from './stranky/Nastaveni';
import './App.css';

const odkazy = [
  { cesta: '/', text: 'Domů' },
  { cesta: '/sbirka', text: 'Sbírka' },
  { cesta: '/statistiky', text: 'Statistiky' },
  { cesta: '/nastaveni', text: 'Nastavení' },
];

export default function App() {
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
              {o.text}
            </NavLink>
          ))}
        </nav>
        <HudHlavicka />
      </header>
      <main className="obsah">
        <Routes>
          <Route path="/" element={<Domu />} />
          <Route path="/test" element={<Test />} />
          <Route path="/vysledek" element={<Vysledek />} />
          <Route path="/sbirka" element={<Sbirka />} />
          <Route path="/statistiky" element={<Statistiky />} />
          <Route path="/nastaveni" element={<Nastaveni />} />
        </Routes>
      </main>
    </div>
  );
}
