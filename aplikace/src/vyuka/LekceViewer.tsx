// LekceViewer (/uceni/:temaId) — bloky lekce se odkryvaji postupne:
// dalsi blok naskoci po interakci (mini-kviz, widget) nebo tlacitku
// „Pokracovat". Nahore lista postupu, na konci oslava s konfetami a XP
// + tlacitko „Otestuj se z tematu" (standard, 10 otazek, jen tohle tema).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { VyukovyBlok } from '@questor/sdilene';
import { XP_ZA_LEKCI } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { najdiLekci, VYCHOZI_POSTUP_LEKCE, type VysledekDokonceniLekce } from '../stav/vyukaSlice';
import TextBlok from './bloky/TextBlok';
import KlicovePojmy from './bloky/KlicovePojmy';
import ObrazekBlok from './bloky/ObrazekBlok';
import PrikladBlok from './bloky/PrikladBlok';
import KartickyBlok from './bloky/KartickyBlok';
import MiniKvizBlok from './bloky/MiniKvizBlok';
import WidgetBlok from './bloky/WidgetBlok';
import '../testy/testy.css';
import './vyuka.css';

// ---------------------------------------------------------------------------
// Konfety zaveru (CSS castice, stejny princip jako truhla — zadna knihovna)

interface Konfeta {
  dx: number;
  dy: number;
  rot: number;
  zpozdeni: number;
  sirka: number;
  vyska: number;
  barva: string;
}

const BARVY_KONFET = ['var(--akcent)', 'var(--zlata)', 'var(--uspech)', 'var(--info)', 'var(--akcent-svetly)'];

function vygenerujKonfety(pocet: number): Konfeta[] {
  return Array.from({ length: pocet }, (_, i) => ({
    dx: Math.round((Math.random() - 0.5) * 360),
    dy: Math.round(-40 - Math.random() * 200),
    rot: Math.round((Math.random() - 0.5) * 720),
    zpozdeni: Math.random() * 0.35,
    sirka: 6 + Math.round(Math.random() * 6),
    vyska: 8 + Math.round(Math.random() * 8),
    barva: BARVY_KONFET[i % BARVY_KONFET.length],
  }));
}

// ---------------------------------------------------------------------------

const IKONY_BLOKU: Record<VyukovyBlok['typ'], string> = {
  text: '📖',
  'klicove-pojmy': '🔑',
  obrazek: '🖼️',
  priklad: '💼',
  karticky: '🃏',
  'mini-kviz': '🧠',
  widget: '🎮',
};

export default function LekceViewer() {
  const { temaId } = useParams<{ temaId: string }>();
  const navigate = useNavigate();

  const vyuky = pouzijStav((s) => s.vyuky);
  const banky = pouzijStav((s) => s.banky);
  const postup = pouzijStav((s) => (temaId ? s.postupLekci[temaId] : undefined)) ?? VYCHOZI_POSTUP_LEKCE;
  const dokonciBlok = pouzijStav((s) => s.dokonciBlok);
  const dokonciLekci = pouzijStav((s) => s.dokonciLekci);
  const zacniLekciZnovu = pouzijStav((s) => s.zacniLekciZnovu);
  const zacniTest = pouzijStav((s) => s.zacniTest);

  const nalez = useMemo(() => (temaId ? najdiLekci(vyuky, temaId) : null), [vyuky, temaId]);

  // Oslava po dokonceni v TEHLE navsteve (konfety + XP); null = zadna.
  const [oslava, setOslava] = useState<(VysledekDokonceniLekce & { konfety: Konfeta[] }) | null>(null);

  const bloky = nalez?.lekce.bloky ?? [];
  const pocetDokoncenych = Math.min(postup.dokonceneBloky.length, bloky.length);
  const hotovo = bloky.length > 0 && pocetDokoncenych >= bloky.length;
  // Viditelne bloky: dokoncene + prvni nedokonceny (frontier).
  const viditelnych = hotovo ? bloky.length : pocetDokoncenych + 1;

  // Plynule najeti na nove odkryty blok (ne pri prvnim vykresleni).
  const prvniVykresleni = useRef(true);
  useEffect(() => {
    if (prvniVykresleni.current) {
      prvniVykresleni.current = false;
      return;
    }
    const cil = document.getElementById(oslava || hotovo ? 'lekce-zaver' : `lekce-blok-${pocetDokoncenych}`);
    cil?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [pocetDokoncenych, hotovo, oslava]);

  if (!temaId || !nalez) {
    return (
      <section className="lekce">
        <div className="panel lekce__nenalezena">
          <h1>Lekce nenalezena</h1>
          <p>Pro tohle téma zatím žádná lekce není. Mrkni na přehled, co se dá učit.</p>
          <Link to="/uceni" className="tlacitko tlacitko--primarni">← Zpět na přehled</Link>
        </div>
      </section>
    );
  }

  const { predmetId, lekce } = nalez;
  const banka = banky[predmetId];
  const nazevTematu = banka?.temata.find((t) => t.id === temaId)?.nazev ?? lekce.nazev;
  const maOtazkyTematu = banka?.otazky.some((o) => o.temaId === temaId) ?? false;

  const dokonciAktualniBlok = (index: number) => {
    if (index !== pocetDokoncenych || hotovo) return; // jen frontier, jen jednou
    dokonciBlok(temaId, index);
    if (index === bloky.length - 1) {
      const vysledek = dokonciLekci(temaId);
      setOslava({ ...vysledek, konfety: vysledek.xp > 0 ? vygenerujKonfety(36) : [] });
    }
  };

  // Novy pruchod: vynuluje dokoncene bloky (XP 1x denne hlida dokonciLekci);
  // na prvni blok najede scroll efekt vyse (pocetDokoncenych klesne na 0).
  const projdiZnovu = () => {
    setOslava(null);
    zacniLekciZnovu(temaId);
  };

  const otestujSe = () => {
    const povedlo = zacniTest({
      predmetId,
      rezim: 'standard',
      pocetOtazek: 10,
      temataId: [temaId],
    });
    if (povedlo) navigate('/test');
  };

  return (
    <section className="lekce" aria-label={`Lekce ${lekce.nazev}`}>
      {/* Lista postupu nahore */}
      <div className="lekce__hlavicka panel">
        <Link to="/uceni" className="lekce__zpet" aria-label="Zpět na přehled učení">←</Link>
        <div className="lekce__hlavicka-texty">
          <h1 className="lekce__nazev">{lekce.nazev}</h1>
          <span className="lekce__tema stitek">{nazevTematu}</span>
        </div>
        <div className="lekce__postup">
          <span className="lekce__postup-cisla">
            {pocetDokoncenych}/{bloky.length}
          </span>
          <div
            className={`ukazatel${hotovo ? ' ukazatel--zlaty' : ''}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={bloky.length}
            aria-valuenow={pocetDokoncenych}
          >
            <div style={{ width: `${(pocetDokoncenych / Math.max(1, bloky.length)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Bloky lekce — odkryvaji se postupne */}
      <div className="lekce__bloky">
        {bloky.slice(0, viditelnych).map((blok, index) => {
          const jeFrontier = !hotovo && index === pocetDokoncenych;
          const posledniBlok = index === bloky.length - 1;
          return (
            <div
              key={index}
              id={`lekce-blok-${index}`}
              className={`panel lekce__blok${jeFrontier ? ' lekce__blok--aktivni animace-naskoceni' : ' lekce__blok--hotovy'}`}
            >
              <div className="lekce__blok-znak" aria-hidden="true">
                {jeFrontier ? IKONY_BLOKU[blok.typ] : '✓'}
              </div>
              <TeloBloku blok={blok} onInterakce={() => dokonciAktualniBlok(index)} />
              {jeFrontier && blok.typ !== 'mini-kviz' && blok.typ !== 'widget' && (
                <button
                  type="button"
                  className={`tlacitko ${posledniBlok ? 'tlacitko--zlate' : 'tlacitko--primarni'} lekce__pokracovat`}
                  onClick={() => dokonciAktualniBlok(index)}
                >
                  {posledniBlok ? '🏁 Dokončit lekci' : 'Pokračovat ↓'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Zaver — oslava + otestuj se */}
      {hotovo && (
        <div id="lekce-zaver" className="panel lekce__zaver animace-naskoceni">
          {oslava && oslava.konfety.length > 0 && (
            <div className="lekce__konfety" aria-hidden="true">
              {oslava.konfety.map((k, i) => (
                <span
                  key={i}
                  className="lekce__konfeta"
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
          <div className="lekce__zaver-znak animace-pop" aria-hidden="true">🎓</div>
          <h2 className="lekce__zaver-titulek">Lekce dokončená!</h2>
          {oslava ? (
            oslava.xp > 0 ? (
              <div className="lekce__zaver-xp animace-pop">+{oslava.xp} XP</div>
            ) : (
              <p className="lekce__zaver-pozn">
                XP za tuhle lekci už dnes máš — zítra si můžeš přijít pro dalších +{XP_ZA_LEKCI}.
              </p>
            )
          ) : (
            <p className="lekce__zaver-pozn">
              Tuhle lekci už máš prošlou. Projdi si ji klidně znovu — XP za ni padá 1× denně.
            </p>
          )}
          <div className="lekce__zaver-akce">
            {maOtazkyTematu && (
              <button type="button" className="tlacitko tlacitko--zlate" onClick={otestujSe}>
                ⚔️ Otestuj se z tématu
              </button>
            )}
            <button type="button" className="tlacitko" onClick={projdiZnovu}>
              🔁 Projít znovu
            </button>
            <Link to="/uceni" className="tlacitko">
              ← Zpět na přehled
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}

/** Vykresli obsah bloku dle typu; interaktivni bloky hlasi splneni pres onInterakce. */
function TeloBloku({ blok, onInterakce }: { blok: VyukovyBlok; onInterakce: () => void }) {
  switch (blok.typ) {
    case 'text':
      return <TextBlok blok={blok} />;
    case 'klicove-pojmy':
      return <KlicovePojmy blok={blok} />;
    case 'obrazek':
      return <ObrazekBlok blok={blok} />;
    case 'priklad':
      return <PrikladBlok blok={blok} />;
    case 'karticky':
      return <KartickyBlok blok={blok} />;
    case 'mini-kviz':
      return <MiniKvizBlok otazka={blok.otazka} onZodpovezeno={onInterakce} />;
    case 'widget':
      return <WidgetBlok blok={blok} onSplneno={onInterakce} />;
  }
}
