// LekceViewer (/uceni/:temaId) — bloky lekce se odkryvaji postupne:
// dalsi blok naskoci po interakci (mini-kviz, widget) nebo tlacitku
// „Pokracovat". Nahore lista postupu, na konci oslava s konfetami a XP
// + tlacitko „Otestuj se z tematu" (standard, 10 otazek, jen tohle tema).
//
// Posun stranky: JEN po vlastni akci studenta (Pokracovat / Dokoncit lekci /
// Projit znovu, na desktopu i odpoved v mini-kvizu a splneny widget — najede
// na dalsi blok jako drive). Zmena postupu ze synchronizace ani nova verze
// obsahu stranku NEPOSOUVAJI. Na mobilu (≤ 760 px) mini-kviz ani widget
// NEPOSOUVAJI — vysvetleni a oslava zustanou videt, dalsi blok jen naskoci
// pod nimi (pod nimi nenapadne „Pokracovat ↓", ktere posune az na klepnuti).
// Verze lekce: do prvni akce studenta se bere nejnovejsi (pri startu chodi
// bundle → IndexedDB → server rychle po sobe); po prvni akci se lekce
// zafixuje a novejsi verzi jen nabidne lista (zadna vymena pod rukama).
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
import { chovaniPosunu } from '../testy/posun';
import { klicBloku, stejnyObsahLekce, zarovnaniBloku } from './lekceLogika';
import '../testy/testy.css';
import './vyuka.css';

// ---------------------------------------------------------------------------
// Posun stranky na blok

type NalezLekce = NonNullable<ReturnType<typeof najdiLekci>>;

/** Pozadavek na posun plati jen kratce po klepnuti (pak ho zmena postupu ze site uz nespusti). */
const PLATNOST_POSUNU_MS = 1500;

function jeMobil(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
}

/** Skutecna vyska prilepene listy → CSS promenna pro scroll-margin-top bloku (mobil). */
function zapisVyskuListy(lista: HTMLElement): void {
  const vyska = Math.round(lista.getBoundingClientRect().height);
  if (vyska > 0) lista.parentElement?.style.setProperty('--lekce-lista', `${vyska}px`);
}

/** Plynule najede na blok: mobil = zacatek pod listou, desktop = stred (viz zarovnaniBloku). */
function najedNa(cil: HTMLElement, lista: HTMLElement | null): void {
  const mobil = jeMobil();
  if (lista) zapisVyskuListy(lista);
  cil.scrollIntoView({
    behavior: chovaniPosunu(), // plynule, pokud si student nevyzadal omezeni pohybu
    block: zarovnaniBloku({
      mobil,
      vyskaBloku: cil.getBoundingClientRect().height,
      vyskaOkna: window.innerHeight,
      vyskaListy: (lista?.getBoundingClientRect().height ?? 0) + 16,
    }),
  });
}

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

  const aktualni = useMemo(() => (temaId ? najdiLekci(vyuky, temaId) : null), [vyuky, temaId]);

  // Zafixovana verze lekce — vznika prvni akci studenta v teto navsteve
  // (do te doby se bere nejnovejsi). Novejsi verzi pak jen nabidne lista.
  const [fixace, setFixace] = useState<{ temaId: string; nalez: NalezLekce } | null>(null);
  const [odlozenaVerze, setOdlozenaVerze] = useState<NalezLekce['lekce'] | null>(null);
  const platnaFixace = fixace !== null && fixace.temaId === temaId ? fixace : null;
  const nalez = platnaFixace?.nalez ?? aktualni;
  const novaVerze = useMemo(
    () =>
      platnaFixace !== null &&
      aktualni !== null &&
      !stejnyObsahLekce(aktualni.lekce, platnaFixace.nalez.lekce),
    [platnaFixace, aktualni],
  );
  const nabidnoutVerzi = novaVerze && aktualni !== null && aktualni.lekce !== odlozenaVerze;

  // Oslava po dokonceni v TEHLE navsteve (konfety + XP); null = zadna.
  const [oslava, setOslava] = useState<(VysledekDokonceniLekce & { konfety: Konfeta[] }) | null>(null);

  const bloky = useMemo(() => nalez?.lekce.bloky ?? [], [nalez]);
  const klice = useMemo(() => bloky.map((blok, i) => klicBloku(blok, i)), [bloky]);
  const pocetDokoncenych = Math.min(postup.dokonceneBloky.length, bloky.length);
  const hotovo = bloky.length > 0 && pocetDokoncenych >= bloky.length;
  // Viditelne bloky: dokoncene + prvni nedokonceny (frontier).
  const viditelnych = hotovo ? bloky.length : pocetDokoncenych + 1;

  // Vyska prilepene listy pro scroll-margin-top bloku (mobil: lista se
  // zalamuje do dvou i tri radku podle delky nazvu).
  const listaRef = useRef<HTMLDivElement | null>(null);
  const maLekci = nalez !== null;
  useEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    zapisVyskuListy(lista);
    if (typeof ResizeObserver === 'undefined') return;
    const pozorovatel = new ResizeObserver(() => zapisVyskuListy(lista));
    pozorovatel.observe(lista);
    return () => pozorovatel.disconnect();
  }, [maLekci]);

  // Plynule najeti na nove odkryty blok — JEN kdyz o nej student pozadal
  // klepnutim (cas klepnuti v refu). Zmena postupu ze site (pull z jineho
  // zarizeni, obnoveny tab, pozde nacteny obsah) nic neposune.
  const pozadavekPosunu = useRef<number | null>(null);
  useEffect(() => {
    const cas = pozadavekPosunu.current;
    if (cas === null) return;
    pozadavekPosunu.current = null;
    if (Date.now() - cas > PLATNOST_POSUNU_MS) return;
    const cil = document.getElementById(oslava || hotovo ? 'lekce-zaver' : `lekce-blok-${pocetDokoncenych}`);
    if (cil) najedNa(cil, listaRef.current);
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

  // posun = stranka najede na dalsi blok: tlacitko „Pokracovat ↓“ / „Dokoncit
  // lekci“ vzdy, mini-kviz a widget jen na desktopu (jako drive); na mobilu
  // hlasi splneni BEZ posunu (dal az nenapadne „Pokracovat ↓“ pod blokem).
  const dokonciAktualniBlok = (index: number, posun: boolean) => {
    if (index !== pocetDokoncenych || hotovo) return; // jen frontier, jen jednou
    if (!platnaFixace) setFixace({ temaId, nalez });
    if (posun) pozadavekPosunu.current = Date.now();
    dokonciBlok(temaId, index);
    if (index === bloky.length - 1) {
      const vysledek = dokonciLekci(temaId);
      setOslava({ ...vysledek, konfety: vysledek.xp > 0 ? vygenerujKonfety(36) : [] });
    }
  };

  // Novy pruchod: vynuluje dokoncene bloky (XP 1x denne hlida dokonciLekci);
  // na prvni blok najede scroll efekt vyse (pocetDokoncenych klesne na 0).
  // Novy pruchod jede vzdy nad nejnovejsi verzi lekce.
  const projdiZnovu = () => {
    pozadavekPosunu.current = Date.now();
    if (aktualni) setFixace({ temaId, nalez: aktualni });
    setOslava(null);
    zacniLekciZnovu(temaId);
  };

  const nactiNovouVerzi = () => {
    if (aktualni) setFixace({ temaId, nalez: aktualni });
  };

  // Nenapadne „Pokracovat ↓“ pod splnenym mini-kvizem / widgetem (jen mobil,
  // CSS) — posune az na klepnuti, vysvetleni a oslava zatim zustanou videt.
  const najedNaDalsi = () => {
    const cil = document.getElementById(hotovo ? 'lekce-zaver' : `lekce-blok-${pocetDokoncenych}`);
    if (cil) najedNa(cil, listaRef.current);
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
      <div className="lekce__hlavicka panel" ref={listaRef}>
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
        {/* Nova verze lekce behem navstevy — jen nabidka, nic se nevymeni samo.
            Absolutne pod listou, takze nic v lekci neposune. */}
        {nabidnoutVerzi && (
          <div className="lekce__aktualizace" role="status">
            <span className="lekce__aktualizace-text">Lekce dostala novou verzi.</span>
            <button type="button" className="tlacitko tlacitko--primarni" onClick={nactiNovouVerzi}>
              Načíst
            </button>
            <button type="button" className="tlacitko" onClick={() => setOdlozenaVerze(aktualni?.lekce ?? null)}>
              Teď ne
            </button>
          </div>
        )}
      </div>

      {/* Bloky lekce — odkryvaji se postupne */}
      <div className="lekce__bloky">
        {bloky.slice(0, viditelnych).map((blok, index) => {
          const jeFrontier = !hotovo && index === pocetDokoncenych;
          const posledniBlok = index === bloky.length - 1;
          const interaktivni = blok.typ === 'mini-kviz' || blok.typ === 'widget';
          return (
            <div
              key={klice[index]}
              id={`lekce-blok-${index}`}
              className={`panel lekce__blok${jeFrontier ? ' lekce__blok--aktivni animace-naskoceni' : ' lekce__blok--hotovy'}`}
            >
              <div className="lekce__blok-znak" aria-hidden="true">
                {jeFrontier ? IKONY_BLOKU[blok.typ] : '✓'}
              </div>
              <TeloBloku
                blok={blok}
                aktivni={jeFrontier}
                onInterakce={() => dokonciAktualniBlok(index, !jeMobil())}
              />
              {jeFrontier && !interaktivni && (
                <button
                  type="button"
                  className={`tlacitko ${posledniBlok ? 'tlacitko--zlate' : 'tlacitko--primarni'} lekce__pokracovat`}
                  onClick={() => dokonciAktualniBlok(index, true)}
                >
                  {posledniBlok ? '🏁 Dokončit lekci' : 'Pokračovat ↓'}
                </button>
              )}
              {interaktivni && index === pocetDokoncenych - 1 && (
                <button type="button" className="tlacitko lekce__dal" onClick={najedNaDalsi}>
                  {hotovo ? 'Na závěr lekce ↓' : 'Pokračovat ↓'}
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
function TeloBloku({
  blok,
  aktivni,
  onInterakce,
}: {
  blok: VyukovyBlok;
  /** Frontier blok (jen ten smi vzit fokus). */
  aktivni: boolean;
  onInterakce: () => void;
}) {
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
      return <MiniKvizBlok otazka={blok.otazka} autoFocus={aktivni} onZodpovezeno={onInterakce} />;
    case 'widget':
      return <WidgetBlok blok={blok} onSplneno={onInterakce} />;
  }
}
