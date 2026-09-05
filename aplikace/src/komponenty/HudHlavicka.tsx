// HUD v hlavičce: mini avatar (klik = menu profilů), chip aktivní studijní
// banky (klik = menu bank profilu, přepnutí okamžitě), level + animovaný XP
// bar, streak plamínek. Plamínek pohasíná, dokud dnes nebyla aktivita;
// ledová varianta, když streak zachránilo zmrazení.
//
// Menu profilů: přepnutí na profil bez PINu je na jeden klik; profil s PINem
// se přepíná přes odhlášení (PIN se zadává na obrazovce výběru profilu).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { denZData, stavLevelu } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { pripojSeKeStavuSyncu, stavSynchronizace } from '../sync/sync';
import {
  aktivniPredmetProfilu,
  predmetyProfilu,
  type Profil,
} from '../stav/profilySlice';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import Avatar from '../hra/Avatar';
import './HudHlavicka.css';

function MenuProfilu({ zavri }: { zavri: () => void }) {
  const profily = pouzijStav((s) => s.profily);
  const aktivniProfilId = pouzijStav((s) => s.aktivniProfilId);
  const prepniProfil = pouzijStav((s) => s.prepniProfil);
  const odhlasProfil = pouzijStav((s) => s.odhlasProfil);

  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zavri();
    };
    window.addEventListener('keydown', naKlavesu);
    return () => window.removeEventListener('keydown', naKlavesu);
  }, [zavri]);

  const prepni = (profil: Profil) => {
    zavri();
    if (profil.id === aktivniProfilId) return;
    if (profil.pinHash) {
      // PIN se overuje na obrazovce vyberu — odhlaseni ji ukaze.
      odhlasProfil();
    } else {
      prepniProfil(profil.id);
    }
  };

  return (
    <>
      {/* Prekryv na zavreni kliknutim mimo menu. */}
      <div className="hud__menu-prekryv" onClick={zavri} aria-hidden="true" />
      <div className="hud__menu" role="menu" aria-label="Profily">
        {profily.map((profil) => (
          <button
            key={profil.id}
            type="button"
            role="menuitem"
            className={
              profil.id === aktivniProfilId
                ? 'hud__menu-polozka hud__menu-polozka--aktivni'
                : 'hud__menu-polozka'
            }
            onClick={() => prepni(profil)}
          >
            <span className="hud__menu-tecka" style={{ background: profil.barva }} aria-hidden="true" />
            <span className="hud__menu-jmeno">{profil.jmeno}</span>
            {profil.pinHash && (
              <span className="hud__menu-zamek" aria-label="Profil s PINem">
                🔒
              </span>
            )}
            {profil.id === aktivniProfilId && <span aria-hidden="true">✓</span>}
          </button>
        ))}
        <div className="hud__menu-oddelovac" role="separator" />
        <button
          type="button"
          role="menuitem"
          className="hud__menu-polozka"
          onClick={() => {
            zavri();
            odhlasProfil();
          }}
        >
          <span aria-hidden="true">👋</span>
          <span className="hud__menu-jmeno">Odhlásit profil</span>
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chip aktivni studijni banky + menu prepinani bank profilu

function MenuBank({ profil, zavri }: { profil: Profil; zavri: () => void }) {
  const prepniAktivniPredmet = pouzijStav((s) => s.prepniAktivniPredmet);
  const banky = pouzijStav((s) => s.banky);
  const aktivni = aktivniPredmetProfilu(profil);
  const predmety = predmetyProfilu(profil);

  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zavri();
    };
    window.addEventListener('keydown', naKlavesu);
    return () => window.removeEventListener('keydown', naKlavesu);
  }, [zavri]);

  return (
    <>
      <div className="hud__menu-prekryv" onClick={zavri} aria-hidden="true" />
      <div className="hud__menu hud__menu--banky" role="menu" aria-label="Studijní banky">
        {predmety.map((id) => (
          <button
            key={id}
            type="button"
            role="menuitem"
            className={
              id === aktivni ? 'hud__menu-polozka hud__menu-polozka--aktivni' : 'hud__menu-polozka'
            }
            onClick={() => {
              zavri();
              prepniAktivniPredmet(id);
            }}
          >
            <span aria-hidden="true">{ikonaPredmetu(id)}</span>
            <span className="hud__menu-jmeno">{nazevPredmetu(id, banky[id]?.nazev)}</span>
            {id === aktivni && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}

function ChipBanky({ profil }: { profil: Profil }) {
  const [menuOtevrene, setMenuOtevrene] = useState(false);
  const banky = pouzijStav((s) => s.banky);
  const aktivni = aktivniPredmetProfilu(profil);
  if (!aktivni) return null;
  const nazev = nazevPredmetu(aktivni, banky[aktivni]?.nazev);

  return (
    <div className="hud__banka">
      <button
        type="button"
        className="hud__banka-chip"
        title={`Studuješ: ${nazev} — přepnout banku`}
        aria-label={`Aktivní studijní banka ${nazev} — otevřít menu bank`}
        aria-haspopup="menu"
        aria-expanded={menuOtevrene}
        onClick={() => setMenuOtevrene((o) => !o)}
      >
        {/* key = aktivni banka: po přepnutí obsah chipu „popne" (animace). */}
        <span className="hud__banka-obsah animace-pop" key={aktivni}>
          <span className="hud__banka-ikona" aria-hidden="true">
            {ikonaPredmetu(aktivni)}
          </span>
          <span className="hud__banka-nazev">{nazev}</span>
        </span>
        <span className="hud__banka-sipka" aria-hidden="true">▾</span>
      </button>
      {menuOtevrene && <MenuBank profil={profil} zavri={() => setMenuOtevrene(false)} />}
    </div>
  );
}

export default function HudHlavicka() {
  const progres = pouzijStav((s) => s.progres);
  const zmrazeniPouzitoDen = pouzijStav((s) => s.zmrazeniPouzitoDen);
  const profily = pouzijStav((s) => s.profily);
  const aktivniProfilId = pouzijStav((s) => s.aktivniProfilId);
  const [menuOtevrene, setMenuOtevrene] = useState(false);
  const aktivniProfil = profily.find((p) => p.id === aktivniProfilId) ?? null;
  // Neblokujici stav „Nacitam postup…" behem pullu postupu po aktivaci
  // profilu (LWW sync pres zarizeni) — hra bezi dal, zadny spinner pres appku.
  const stavSyncu = useSyncExternalStore(pripojSeKeStavuSyncu, stavSynchronizace);

  const level = stavLevelu(progres.xp);
  const dnes = denZData(new Date());
  const aktivniDnes = progres.streak.posledniDen === dnes;
  const ledovy = zmrazeniPouzitoDen === dnes;

  // Pulz XP baru při přírůstku XP.
  const predchoziXp = useRef(progres.xp);
  const [pulz, setPulz] = useState(false);
  useEffect(() => {
    if (progres.xp > predchoziXp.current) {
      setPulz(true);
      const t = setTimeout(() => setPulz(false), 700);
      predchoziXp.current = progres.xp;
      return () => clearTimeout(t);
    }
    predchoziXp.current = progres.xp;
  }, [progres.xp]);

  const tridaPlaminku = [
    'hud__plaminek',
    !aktivniDnes ? 'hud__plaminek--pohasly' : '',
    ledovy ? 'hud__plaminek--ledovy' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="hud-hlavicka">
      <div className="hud__profil">
        <button
          type="button"
          className="hud__avatar-tlacitko"
          style={aktivniProfil ? { borderColor: aktivniProfil.barva } : undefined}
          title={aktivniProfil ? `Profil: ${aktivniProfil.jmeno} — přepnout` : 'Profily'}
          aria-label={
            aktivniProfil ? `Profil ${aktivniProfil.jmeno} — otevřít menu profilů` : 'Menu profilů'
          }
          aria-haspopup="menu"
          aria-expanded={menuOtevrene}
          onClick={() => setMenuOtevrene((o) => !o)}
        >
          <Avatar konfigurace={progres.avatar} velikost={40} />
        </button>
        {menuOtevrene && <MenuProfilu zavri={() => setMenuOtevrene(false)} />}
      </div>
      {aktivniProfil && <ChipBanky profil={aktivniProfil} />}
      {stavSyncu.nacitamPostup && (
        <span className="hud__nacitam" role="status">
          ☁️ Načítám postup…
        </span>
      )}
      <div className="hud__level-blok" title={`${progres.xp} XP celkem`}>
        <div className="hud__level-radek">
          <span className="hud__level">LVL {level.level}</span>
          <span className="hud__xp-text">
            {level.xpVLevelu}/{level.xpNaDalsiLevel} XP
          </span>
        </div>
        <div className={pulz ? 'ukazatel ukazatel--zlaty hud__xp-bar hud__xp-bar--pulz' : 'ukazatel ukazatel--zlaty hud__xp-bar'}>
          <div style={{ width: `${Math.round(level.procento * 100)}%` }} />
        </div>
      </div>
      <div
        className={tridaPlaminku}
        title={
          ledovy
            ? `Streak ${progres.streak.aktualni} dní — zachráněno zmrazením ❄️`
            : aktivniDnes
              ? `Streak ${progres.streak.aktualni} dní — dnes splněno!`
              : `Streak ${progres.streak.aktualni} dní — dnes ještě nic. Dokonči test!`
        }
      >
        <span className="hud__plaminek-ikona" aria-hidden="true">
          {ledovy ? '🧊' : '🔥'}
        </span>
        <span className="hud__plaminek-cislo">{progres.streak.aktualni}</span>
      </div>
    </div>
  );
}
