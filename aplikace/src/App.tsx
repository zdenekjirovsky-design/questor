// Kostra aplikace — routing a hlavička. Tenhle soubor je „zmrazený“:
// stránky se mění ve svých souborech, ne tady.
// Výjimka po dohodě (lokální profily): bez aktivního profilu se místo
// aplikace ukáže výběr profilu (VyberProfilu) — brána celé aplikace.
// Výjimka po dohodě (duely): routy /duely a /duel/:id, položka Duely
// v navigaci s indikátorem čekajících výzev (DuelyIndikator).
// Výjimka po dohodě (duel odkazem, fáze 2): hash #duel=<id>.<kod> má přednost
// před profilovou bránou — host hraje BEZ profilu (duely/HostDuel), po
// dohrání se vrací na výběr profilů. Hash se po přečtení čistí (host.ts);
// pozvánka vložená do UŽ otevřeného tabu (jen změna fragmentu, prohlížeč
// stránku nereloadne) se chytá posluchačem hashchange níže.
import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { pouzijStav } from './stav/store';
import HostDuel from './duely/HostDuel';
import { pozvankaZeStartu, zpracujHashPozvanky } from './duely/host';
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
  // Hostovská pozvánka z odkazu (#duel=…) má přednost přede vším — host hraje
  // bez profilu a rodinného kódu; pozvankaZeStartu je memoizovaná a hash čistí.
  const [hostPozvanka, setHostPozvanka] = useState(() => pozvankaZeStartu());

  // Nova pozvanka vlozena do tehoz tabu: navigace lisici se JEN fragmentem
  // stranku nereloadne, takze pozvankaZeStartu ji nikdy neuvidi. Posluchac
  // hashchange ji zpracuje a hash hned vycisti (kod hosta nesmi zustat
  // v adresnim radku, historii ani na screenshotu).
  useEffect(() => {
    const zpracuj = () => {
      const pozvanka = zpracujHashPozvanky(window.location.hash ?? '');
      if (!pozvanka) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setHostPozvanka(pozvanka);
    };
    window.addEventListener('hashchange', zpracuj);
    return () => window.removeEventListener('hashchange', zpracuj);
  }, []);

  if (hostPozvanka) {
    // key: nova pozvanka (jiny duel/kod) musi HostDuel REMOUNTOVAT — vnitrni
    // stav komponenty se inicializuje jen jednou a jinak by zustal stary duel.
    return (
      <HostDuel
        key={`${hostPozvanka.duelId}.${hostPozvanka.kod}`}
        pozvanka={hostPozvanka}
        ukonci={() => setHostPozvanka(null)}
      />
    );
  }

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
