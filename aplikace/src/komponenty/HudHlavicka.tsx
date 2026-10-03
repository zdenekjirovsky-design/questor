// HUD v hlavičce: mini avatar (klik = menu profilů), chip aktivní studijní
// banky (klik = menu bank profilu, přepnutí okamžitě), level + animovaný XP
// bar, streak plamínek. Plamínek pohasíná, dokud dnes nebyla aktivita;
// ledová varianta, když streak zachránilo zmrazení.
//
// Menu profilů: přepnutí na profil bez PINu je na jeden klik; profil s PINem
// se přepíná přes odhlášení (PIN se zadává na obrazovce výběru profilu).
//
// Mobil (≤ 760 px, viz HudHlavicka.css a DESIGN.md › Mobil): obě menu jsou
// position: fixed pod hlavičkou (horní hrana se měří z tlačítka při otevření),
// scrollem stránky se NEzavírá (gesta blokuje překryv, scroll window tam bývá
// jen systémový/programový — zavřel by menu hned po otevření; na desktopu
// a tabletu se scrollem zavírá) a stav „Načítám postup…" je jen odznak
// ☁️ na avataru — nic asynchronního nesmí měnit šířku řádku HUD.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
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

// ---------------------------------------------------------------------------
// Spolecne chovani rozbalovacich menu (ciste funkce — testy v hudHlavicka.test)

/** Minimalni cil udalosti (window); v testech staci podvrh. */
export interface CilUdalostiMenu {
  addEventListener(typ: string, posluchac: (e: Event) => void, volby?: AddEventListenerOptions): void;
  removeEventListener(typ: string, posluchac: (e: Event) => void): void;
}

/**
 * Zavirani otevreneho menu: Escape a (pri `zavirejPriScrollu`) JAKYKOLI
 * scroll stranky (kolecko, klavesy, dotyk na tabletu). Na desktopu/tabletu je
 * menu absolutni v hlavicce, ktera neni sticky — bez zavreni by odjelo se
 * strankou z obrazovky a pruhledny fixni prekryv by spolkl dalsi tuknuti.
 * Scroll uvnitr seznamu bank na window nebubla, takze listovani menu nezavre.
 * Na mobilu (≤ 760 px) se scrollem NEzavira: menu je fixni a gesta pres
 * stranku blokuje prekryv (touch-action: none), takze scroll window tam je
 * skoro jen systemovy/programovy (vraceni stranky po zavreni klavesnice
 * v iOS, plynuly posun) a zavrel by menu hned po otevreni. Vraci uklid.
 */
export function prihlasZavireniMenu(
  cil: CilUdalostiMenu,
  zavri: () => void,
  zavirejPriScrollu = true,
): () => void {
  const naKlavesu = (e: Event) => {
    if ((e as KeyboardEvent).key === 'Escape') zavri();
  };
  const naScroll = () => zavri();
  cil.addEventListener('keydown', naKlavesu);
  if (zavirejPriScrollu) cil.addEventListener('scroll', naScroll, { passive: true });
  return () => {
    cil.removeEventListener('keydown', naKlavesu);
    if (zavirejPriScrollu) cil.removeEventListener('scroll', naScroll);
  };
}

/** Zavirat menu scrollem stranky? Jen mimo mobilni rozvrzeni (≤ 760 px). */
function zavirejMenuPriScrollu(): boolean {
  return !window.matchMedia?.('(max-width: 760px)').matches;
}

/** Odstup menu pod tlacitkem — shodny s desktopovym top: calc(100% + 8px). */
export const ODSTUP_MENU_PX = 8;

/**
 * Horni hrana menu na mobilu (position: fixed) = spodek tlacitka v okamziku
 * otevreni + odstup. Pevna hodnota nestaci: hlavicka neni sticky a stranka
 * muze byt trochu odscrollovana. Nesmyslny vstup → null (plati CSS fallback).
 */
export function horniHranaMenu(spodekTlacitka: number): number | null {
  if (!Number.isFinite(spodekTlacitka)) return null;
  return Math.round(spodekTlacitka + ODSTUP_MENU_PX);
}

/** Inline styl menu: CSS promenna --hud-menu-top (pouziva ji jen mobilni CSS). */
function stylMenu(horniHrana: number | null): CSSProperties | undefined {
  if (horniHrana === null) return undefined;
  return { '--hud-menu-top': `${horniHrana}px` } as CSSProperties;
}

function MenuProfilu({ zavri, horniHrana }: { zavri: () => void; horniHrana: number | null }) {
  const profily = pouzijStav((s) => s.profily);
  const aktivniProfilId = pouzijStav((s) => s.aktivniProfilId);
  const prepniProfil = pouzijStav((s) => s.prepniProfil);
  const odhlasProfil = pouzijStav((s) => s.odhlasProfil);

  useEffect(() => prihlasZavireniMenu(window, zavri, zavirejMenuPriScrollu()), [zavri]);

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
      <div className="hud__menu" role="menu" aria-label="Profily" style={stylMenu(horniHrana)}>
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

function MenuBank({
  profil,
  zavri,
  horniHrana,
}: {
  profil: Profil;
  zavri: () => void;
  horniHrana: number | null;
}) {
  const prepniAktivniPredmet = pouzijStav((s) => s.prepniAktivniPredmet);
  const banky = pouzijStav((s) => s.banky);
  const aktivni = aktivniPredmetProfilu(profil);
  const predmety = predmetyProfilu(profil);

  useEffect(() => prihlasZavireniMenu(window, zavri, zavirejMenuPriScrollu()), [zavri]);

  return (
    <>
      <div className="hud__menu-prekryv" onClick={zavri} aria-hidden="true" />
      <div
        className="hud__menu hud__menu--banky"
        role="menu"
        aria-label="Studijní banky"
        style={stylMenu(horniHrana)}
      >
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
  const [horniHrana, setHorniHrana] = useState<number | null>(null);
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
        onClick={(e) => {
          setHorniHrana(horniHranaMenu(e.currentTarget.getBoundingClientRect().bottom));
          setMenuOtevrene((o) => !o);
        }}
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
      {menuOtevrene && (
        <MenuBank profil={profil} zavri={() => setMenuOtevrene(false)} horniHrana={horniHrana} />
      )}
    </div>
  );
}

export default function HudHlavicka() {
  const progres = pouzijStav((s) => s.progres);
  const zmrazeniPouzitoDen = pouzijStav((s) => s.zmrazeniPouzitoDen);
  const profily = pouzijStav((s) => s.profily);
  const aktivniProfilId = pouzijStav((s) => s.aktivniProfilId);
  const [menuOtevrene, setMenuOtevrene] = useState(false);
  const [horniHranaMenuProfilu, setHorniHranaMenuProfilu] = useState<number | null>(null);
  const aktivniProfil = profily.find((p) => p.id === aktivniProfilId) ?? null;
  // Neblokujici stav „Nacitam postup…" behem pullu postupu po aktivaci
  // profilu (LWW sync pres zarizeni) — hra bezi dal, zadny spinner pres appku.
  // Treti argument (server snapshot) jen kvuli renderu v testech.
  const stavSyncu = useSyncExternalStore(pripojSeKeStavuSyncu, stavSynchronizace, stavSynchronizace);

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
          onClick={(e) => {
            setHorniHranaMenuProfilu(horniHranaMenu(e.currentTarget.getBoundingClientRect().bottom));
            setMenuOtevrene((o) => !o);
          }}
        >
          <Avatar konfigurace={progres.avatar} velikost={40} />
        </button>
        {/* Mobil: stav pullu jako odznak v rohu avatara — nezabírá místo
            v řádku HUD (text níže je tam jen pro čtečky). Na desktopu skrytý. */}
        {stavSyncu.nacitamPostup && (
          <span className="hud__nacitam-odznak" title="Načítám postup…" aria-hidden="true">
            ☁️
          </span>
        )}
        {menuOtevrene && (
          <MenuProfilu zavri={() => setMenuOtevrene(false)} horniHrana={horniHranaMenuProfilu} />
        )}
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
