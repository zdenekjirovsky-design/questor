// HOSTOVSKY rezim duelu odkazem (faze 2) — cela obrazovka mimo aplikaci:
// host otevrel odkaz #duel=<id>.<kod>, zada JEN jmeno (zadny profil, zadny
// rodinny kod) a hraje IDENTICKOU sadu otazek stejnym duelovym enginem jako
// rodina — handicap 1.0, BEZ power-upu (host je nema), bez prubezne zpetne
// vazby, s odpoctem na otazku. Vysledek jde hostovskym endpointem; stav se
// drzi lokalne (vc. kodu), takze navrat pres tentyz odkaz ukaze vysledek.
// Rezim NEZAKLADA profil a NESAHA na rodinny sync (sync/sync.ts se tu
// neimportuje); obsah bank ma webova aplikace bundlovany.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Duel, Otazka } from '@questor/sdilene';
import { expirujDuel, hostProfilId, vysledekProHrace } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import { ChybaSyncu } from '../sync/klient';
import { vyhodnotOdpoved, type OdpovedHodnota } from '../testy/engine';
import {
  limitOtazkyPrubehu,
  odpovezVPrubehu,
  odstartujPrubeh,
  otazkyDuelu,
  timeoutVPrubehu,
  vysledekZPrubehu,
  vytvorDuelPrubeh,
  zbyvaMsVPrubehu,
  type DuelPrubeh,
} from './engine';
import { formatujCelkovyCas, formatujOdpocet, zbyvaDoVyprseni } from './pomocne';
import { TeloOtazkyDuelu } from './DuelHrani';
import {
  nactiHostStav,
  obnovHostDuel,
  odesliHostVysledek,
  prijmiPozvanku,
  ulozHostStav,
  vychoziHostStav,
  vytvorHostKlienta,
  type HostPozvanka,
  type HostUlozenyStav,
} from './host';
import '../testy/testy.css';
import './Duely.css';

export default function HostDuel({
  pozvanka,
  ukonci,
}: {
  pozvanka: HostPozvanka;
  ukonci(): void;
}) {
  // Ulozeny stav ma prednost (navrat pres tentyz odkaz); kod bere z odkazu.
  const [stav, setStav] = useState<HostUlozenyStav>(() => {
    const ulozeny = nactiHostStav(pozvanka.duelId);
    return ulozeny ? { ...ulozeny, kod: pozvanka.kod } : vychoziHostStav(pozvanka);
  });
  const [nacitam, setNacitam] = useState(true);
  /** Neplatny odkaz (403) — konecna, dal se nehraje. */
  const [fatalni, setFatalni] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [pracuji, setPracuji] = useState(false);

  const klient = useMemo(() => vytvorHostKlienta(), []);
  const hostId = hostProfilId(pozvanka.duelId);
  const maProfily = pouzijStav((s) => s.profily.length > 0);
  const banka = pouzijStav((s) => (stav.duel ? s.banky[stav.duel.predmetId] : undefined));

  const aktualizuj = useCallback((zmena: Partial<HostUlozenyStav>) => {
    setStav((s) => {
      const novy = { ...s, ...zmena };
      ulozHostStav(novy);
      return novy;
    });
  }, []);

  // Po lokalnim pokroku (prijeti, hrani) uz GET z mountu stav neprepisuje.
  const lokalniPokrok = useRef(false);

  const zpracujChybuSite = useCallback((ch: unknown, vychozi: string) => {
    if (ch instanceof ChybaSyncu && ch.status === 403) {
      setFatalni('Odkaz na duel není platný. Zkontroluj, že máš zkopírovanou celou adresu.');
    } else {
      setChyba(vychozi);
    }
  }, []);

  // Nacteni stavu duelu ze serveru pri prichodu pres odkaz.
  useEffect(() => {
    let aktivni = true;
    obnovHostDuel(klient, stav)
      .then((novy) => {
        if (!aktivni || lokalniPokrok.current) return;
        setStav(novy);
      })
      .catch((ch) => {
        if (!aktivni) return;
        // Bez lokalniho duelu neni co hrat — chybu ukazat; s ulozenym duelem
        // se pokracuje z lokalniho stavu (napr. kratkodoby vypadek site).
        if (!stav.duel || (ch instanceof ChybaSyncu && ch.status === 403)) {
          zpracujChybuSite(ch, 'Duel se nepodařilo načíst — zkontroluj připojení a obnov stránku.');
        }
      })
      .finally(() => {
        if (aktivni) setNacitam(false);
      });
    return () => {
      aktivni = false;
    };
    // Zamerne jen pri prichodu — dalsi obnovy ridi tlacitko / odeslani.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klient]);

  const obnov = useCallback(async () => {
    setPracuji(true);
    setChyba(null);
    try {
      const novy = await obnovHostDuel(klient, stav);
      setStav(novy);
    } catch (ch) {
      zpracujChybuSite(ch, 'Nepodařilo se načíst čerstvý stav — zkus to za chvíli.');
    } finally {
      setPracuji(false);
    }
  }, [klient, stav, zpracujChybuSite]);

  const prijmi = useCallback(
    async (jmeno: string) => {
      setPracuji(true);
      setChyba(null);
      try {
        lokalniPokrok.current = true;
        const novy = await prijmiPozvanku(klient, stav, jmeno);
        setStav(novy);
      } catch (ch) {
        if (ch instanceof ChybaSyncu && ch.status === 409) {
          // 409 nemusi znamenat cizi prijeti: kdyz se ztratila odpoved na MOJE
          // prijeti (timeout), server hosta uz zna — obnova stavu to pozna
          // podle jmenoPokus (obnovHostDuel) a pokracuje se bez chyby.
          try {
            const novy = await obnovHostDuel(klient, { ...stav, jmenoPokus: jmeno });
            setStav(novy);
            if (novy.jmeno === null) {
              setChyba(
                'Duel se nepodařilo přijmout — odkaz už možná někdo použil, nebo duel vypršel.',
              );
            }
          } catch {
            setChyba('Duel se nepodařilo přijmout — odkaz už možná někdo použil, nebo duel vypršel.');
          }
        } else {
          zpracujChybuSite(ch, 'Přijetí se nepodařilo — zkontroluj připojení a zkus to znovu.');
        }
      } finally {
        setPracuji(false);
      }
    },
    [klient, stav, zpracujChybuSite],
  );

  // Odeslani dokonceneho vysledku (po dohrani, po reloadu i rucni opakovani).
  const odesilamRef = useRef(false);
  const odesli = useCallback(
    async (aktualni: HostUlozenyStav) => {
      if (odesilamRef.current || !aktualni.vysledek || aktualni.odeslano) return;
      odesilamRef.current = true;
      setPracuji(true);
      setChyba(null);
      try {
        const novy = await odesliHostVysledek(klient, aktualni);
        setStav(novy);
      } catch (ch) {
        if (ch instanceof ChybaSyncu && ch.status === 409) {
          // Vysledek uz na serveru je, nebo duel vyprsel/skoncil — dalsi
          // opakovani nema smysl (plati prvni pokus); pravdu ukaze GET.
          try {
            const cerstvy = await obnovHostDuel(klient, { ...aktualni, odeslano: true });
            setStav(cerstvy);
          } catch {
            aktualizuj({ odeslano: true });
          }
        } else {
          zpracujChybuSite(ch, 'Výsledek se nepodařilo odeslat — zkontroluj připojení a zkus to znovu.');
        }
      } finally {
        odesilamRef.current = false;
        setPracuji(false);
      }
    },
    [klient, aktualizuj, zpracujChybuSite],
  );

  // Nedoslany vysledek z ulozeneho stavu (reload po dohrani) odeslat sam.
  useEffect(() => {
    if (stav.vysledek && !stav.odeslano && !fatalni) void odesli(stav);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stav.vysledek, stav.odeslano]);

  const odpovez = useCallback(
    (hodnota: OdpovedHodnota | null, casMs: number) => {
      lokalniPokrok.current = true;
      setStav((s) => {
        const prubeh = s.prubeh;
        const otazky = s.duel ? otazkyDuelu(s.duel, pouzijStav.getState().banky[s.duel.predmetId]) : null;
        const otazka = prubeh && !prubeh.dokonceno ? otazky?.[prubeh.index] : undefined;
        if (!prubeh || !otazka) return s;
        const ted = new Date();
        const novyPrubeh =
          hodnota === null
            ? timeoutVPrubehu(prubeh, otazka, ted.getTime())
            : odpovezVPrubehu(prubeh, otazka, vyhodnotOdpoved(otazka, hodnota), casMs, ted.getTime());
        const novy: HostUlozenyStav = {
          ...s,
          prubeh: novyPrubeh,
          vysledek: novyPrubeh.dokonceno ? vysledekZPrubehu(novyPrubeh, ted.toISOString()) : s.vysledek,
        };
        ulozHostStav(novy);
        return novy;
      });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Vetve obrazovek

  // Lina expirace plati i pro hosta — po terminu se uz nehraje (server by
  // vysledek stejne odmitl); kontumacni stav se ukaze i offline.
  const duelTed = stav.duel ? expirujDuel(stav.duel, new Date().toISOString()) : null;
  const duelSkoncil = duelTed !== null && (duelTed.stav === 'hotovy' || duelTed.stav === 'vyprsely');
  const odkazPouzityJinym = duelTed !== null && stav.jmeno === null && duelTed.host !== undefined;
  const konecnaObrazovka = fatalni !== null || stav.odeslano || duelSkoncil || odkazPouzityJinym;

  let obsah: React.ReactNode;
  if (fatalni) {
    obsah = (
      <div className="panel duely__prazdno duel-cekani">
        <p className="duely__prazdno-titulek">Tenhle odkaz nefunguje</p>
        <p>{fatalni}</p>
      </div>
    );
  } else if (!stav.duel) {
    obsah = (
      <div className="panel duely__prazdno duel-cekani">
        {nacitam ? (
          <p className="duely__prazdno-titulek">Načítám duel…</p>
        ) : (
          <>
            <p className="duely__prazdno-titulek">Duel se nepodařilo načíst</p>
            {chyba && <p>{chyba}</p>}
            <button type="button" className="tlacitko tlacitko--primarni" disabled={pracuji} onClick={() => void obnov()}>
              Zkusit znovu
            </button>
          </>
        )}
      </div>
    );
  } else {
    const duel = duelTed as Duel;
    const dokonceny = duelSkoncil;
    if (dokonceny && stav.jmeno === null) {
      obsah = (
        <div className="panel duely__prazdno duel-cekani">
          <p className="duely__prazdno-titulek">
            {duel.stav === 'vyprsely' ? '⌛ Duel už vypršel' : 'Duel je už dohraný'}
          </p>
          <p>
            {duel.stav === 'vyprsely'
              ? 'Odkaz platil 24 hodin od založení duelu. Řekni si o novou výzvu!'
              : 'Odkaz už někdo použil a duel se dohrál bez tebe. Řekni si o novou výzvu!'}
          </p>
        </div>
      );
    } else if (dokonceny) {
      obsah = <HostVysledek duel={duel} hostId={hostId} jmeno={stav.jmeno ?? duel.host?.jmeno ?? 'Ty'} />;
    } else if (stav.vysledek && stav.odeslano) {
      obsah = (
        <HostCekani
          duel={duel}
          mojeBody={duel.vysledky[hostId]?.body ?? stav.vysledek.body}
          pracuji={pracuji}
          chyba={chyba}
          obnov={() => void obnov()}
        />
      );
    } else if (stav.vysledek && !stav.odeslano) {
      obsah = (
        <div className="panel duely__prazdno duel-cekani">
          <div className="duel-cekani__hodiny animace-pop" aria-hidden="true">📨</div>
          <p className="duely__prazdno-titulek">Odesílám výsledek…</p>
          <p>
            Tvoje skóre <strong className="duel-cekani__body">{stav.vysledek.body} b</strong> se
            odesílá na server.
          </p>
          {chyba && <p className="duely__karta-chyba">{chyba}</p>}
          {chyba && (
            <button type="button" className="tlacitko tlacitko--primarni" disabled={pracuji} onClick={() => void odesli(stav)}>
              Odeslat znovu
            </button>
          )}
        </div>
      );
    } else if (stav.jmeno === null) {
      // Kontrola obsahu JESTE PRED spalenim jednorazoveho odkazu: banky ma web
      // bundlovane, ale na server se nahravaji PUTem bez redeploye webu.
      // Kdyz bundl banku predmetu nezna, nebo je starsi nez verze banky duelu
      // (duel.verzeBanky z GET), duel by po prijeti nesel odehrat — a odkaz
      // uz by byl first-wins spotrebovany.
      const obsahChybi = !banka || (duel.verzeBanky !== undefined && banka.verze < duel.verzeBanky);
      if (duel.host) {
        obsah = (
          <div className="panel duely__prazdno duel-cekani">
            <p className="duely__prazdno-titulek">Odkaz už někdo použil</p>
            <p>
              Za hosta už hraje <strong>{duel.host.jmeno}</strong> — odkaz je jednorázový. Řekni si
              o vlastní výzvu!
            </p>
          </div>
        );
      } else if (obsahChybi) {
        obsah = (
          <div className="panel duely__prazdno duel-cekani">
            <p className="duely__prazdno-titulek">Tahle verze aplikace duel neumí</p>
            <p>
              Otázky duelu jsou novější než obsah téhle webové aplikace. Duel jsi{' '}
              <strong>nepřijal(a)</strong> — odkaz zůstává platný. Zkus ho otevřít znovu později,
              nebo si řekni o novou výzvu.
            </p>
          </div>
        );
      } else {
        obsah = (
          <HostPozvankaForm duel={duel} pracuji={pracuji} chyba={chyba} prijmi={(jmeno) => void prijmi(jmeno)} />
        );
      }
    } else if (!banka) {
      obsah = (
        <div className="panel duely__prazdno duel-cekani">
          <p className="duely__prazdno-titulek">Načítám otázky…</p>
        </div>
      );
    } else {
      const otazky = otazkyDuelu(duel, banka);
      if (!otazky) {
        obsah = (
          <div className="panel duely__prazdno duel-cekani">
            <p className="duely__prazdno-titulek">Otázky duelu se nepodařilo najít</p>
            <p>
              Tahle verze aplikace nezná otázky duelu (obsah je starší). Obnov stránku — a když to
              nepomůže, řekni si o novou výzvu.
            </p>
          </div>
        );
      } else if (!stav.prubeh || !stav.prubeh.zahajeno) {
        obsah = (
          <HostIntro
            duel={duel}
            jmeno={stav.jmeno}
            onStart={() => {
              lokalniPokrok.current = true;
              aktualizuj({
                prubeh: odstartujPrubeh(
                  stav.prubeh ?? vytvorDuelPrubeh(duel, hostId, new Date().toISOString()),
                  Date.now(),
                ),
              });
            }}
          />
        );
      } else {
        const otazka = otazky[stav.prubeh.index];
        obsah = otazka ? (
          <HostOtazka prubeh={stav.prubeh} otazka={otazka} onOdpoved={odpovez} />
        ) : null;
      }
    }
  }

  return (
    <div className="host-duel">
      <header className="host-duel__hlava">
        <div className="host-duel__logo">
          <span aria-hidden="true">⚜️</span> QUESTOR{' '}
          <span className="stitek duely__stitek-host">duel odkazem</span>
        </div>
        {maProfily && !stav.prubeh?.zahajeno && (
          <button type="button" className="host-duel__zpet" onClick={ukonci}>
            Zpět do aplikace
          </button>
        )}
      </header>
      {obsah}
      {konecnaObrazovka && (
        <div className="host-duel__pata">
          <button type="button" className="tlacitko" onClick={ukonci}>
            {maProfily ? 'Přejít na výběr profilů' : 'Prozkoumat aplikaci QUESTOR'}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pozvanka — jmeno a prijeti (zadny profil, zadny rodinny kod)

function HostPozvankaForm({
  duel,
  pracuji,
  chyba,
  prijmi,
}: {
  duel: Duel;
  pracuji: boolean;
  chyba: string | null;
  prijmi(jmeno: string): void;
}) {
  const [jmeno, setJmeno] = useState('');
  const ciste = jmeno.trim();
  const platne = ciste.length >= 1 && ciste.length <= 24;
  const odesli = () => {
    if (platne && !pracuji) prijmi(ciste);
  };
  return (
    <div className="panel duel-intro animace-naskoceni">
      <div className="duel-intro__obor">
        {ikonaPredmetu(duel.predmetId)} {nazevPredmetu(duel.predmetId)} · {duel.pocetOtazek} otázek
      </div>
      <p className="duely__prazdno-titulek host-duel__vyzva">
        ⚔️ <strong>{duel.vyzyvatel.jmeno}</strong> tě vyzývá na duel v{' '}
        <strong>{nazevPredmetu(duel.predmetId)}</strong>!
      </p>
      <p className="duely__prazdno-pozn">
        Oba hrajete stejné otázky na čas — bez aplikace, bez registrace. Stačí jméno.{' '}
        ({zbyvaDoVyprseni(duel.vyprsi, Date.now())})
      </p>
      <form
        className="host-duel__formular"
        onSubmit={(e) => {
          e.preventDefault();
          odesli();
        }}
      >
        <label className="host-duel__pole">
          Tvoje jméno
          <input
            type="text"
            autoComplete="off"
            maxLength={24}
            value={jmeno}
            onChange={(e) => setJmeno(e.target.value)}
            placeholder="např. Ondra"
          />
        </label>
        {chyba && (
          <p className="duely__karta-chyba" role="alert">
            {chyba}
          </p>
        )}
        <button type="submit" className="tlacitko tlacitko--zlate duel-intro__start" disabled={!platne || pracuji}>
          {pracuji ? 'Přijímám…' : '⚔️ Přijmout a hrát'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intro VS hosta — pravidla BEZ power-upu (host je nema), handicap 1.0

function HostIntro({ duel, jmeno, onStart }: { duel: Duel; jmeno: string; onStart(): void }) {
  return (
    <div className="panel duel-intro animace-naskoceni">
      <div className="duel-intro__obor">
        {ikonaPredmetu(duel.predmetId)} {nazevPredmetu(duel.predmetId)} · {duel.pocetOtazek} otázek
      </div>
      <div className="duel-intro__vs">
        <div className="duel-intro__hrac animace-naskoceni">
          <div className="duel-intro__silueta" aria-hidden="true">
            {jmeno.slice(0, 1).toUpperCase()}
          </div>
          <div className="duel-intro__jmeno">{jmeno}</div>
        </div>
        <div className="duel-intro__blesk" aria-hidden="true">VS</div>
        <div className="duel-intro__hrac animace-naskoceni">
          <div className="duel-intro__silueta" aria-hidden="true">
            {duel.vyzyvatel.jmeno.slice(0, 1).toUpperCase()}
          </div>
          <div className="duel-intro__jmeno">{duel.vyzyvatel.jmeno}</div>
        </div>
      </div>
      <ul className="duel-intro__pravidla">
        <li>Oba hrajete <strong>úplně stejné otázky</strong> ve stejném pořadí.</li>
        <li>Každá otázka má <strong>časový limit</strong> — správně = 100 b + bonus za rychlost.</li>
        <li>Špatně nebo pozdě = 0 b. Hraje se jen jednou, bez druhého pokusu.</li>
        <li>Výsledek uvidíš hned po dohrání obou hráčů.</li>
      </ul>
      <button type="button" className="tlacitko tlacitko--zlate duel-intro__start" onClick={onStart}>
        ⚔️ Do boje!
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jedna otazka hosta — stejny engine a telo otazky jako rodina, ale BEZ
// power-upu (zadna lista; duelSchema by je hostovi stejne odmitlo).
// Exportovane kvuli testum (power-upy v hostovskem rezimu nesmi byt videt).

export function HostOtazka({
  prubeh,
  otazka,
  onOdpoved,
}: {
  prubeh: DuelPrubeh;
  otazka: Otazka;
  onOdpoved(hodnota: OdpovedHodnota | null, casMs: number): void;
}) {
  // Viditelny odpocet — tikat staci 10× za sekundu.
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTed(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  const timeoutProIndex = useRef(-1);
  const zbyva = zbyvaMsVPrubehu(prubeh, otazka, ted);
  useEffect(() => {
    if (zbyva > 0 || prubeh.dokonceno) return;
    if (timeoutProIndex.current === prubeh.index) return;
    timeoutProIndex.current = prubeh.index;
    onOdpoved(null, Number.MAX_SAFE_INTEGER);
  }, [zbyva, prubeh.index, prubeh.dokonceno, onOdpoved]);

  const limit = limitOtazkyPrubehu(prubeh, otazka);
  const podil = Math.max(0, Math.min(1, zbyva / Math.max(1, limit)));
  const dochazi = zbyva <= 5000;

  return (
    <section
      className="duel-hrani"
      aria-label={`Duel — otázka ${prubeh.index + 1} z ${prubeh.pocetOtazek}`}
    >
      <div className="duel-hlavicka">
        <span className="test-pocitadlo">
          {prubeh.index + 1}/{prubeh.pocetOtazek}
        </span>
        <div className="duel-odpocet">
          <div
            className={`duel-odpocet__bar${dochazi ? ' duel-odpocet__bar--dochazi' : ''}`}
            role="progressbar"
            aria-label="Zbývající čas"
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.round(zbyva)}
          >
            <div style={{ width: `${podil * 100}%` }} />
          </div>
          <span className={`duel-odpocet__cas${dochazi ? ' duel-odpocet__cas--dochazi' : ''}`}>
            ⏳ {formatujOdpocet(zbyva)}
          </span>
        </div>
        <span className="duel-skore">
          {prubeh.body} b
          {prubeh.posledniBody > 0 && (
            <span className="xp-let duel-skore__let" key={prubeh.index}>
              +{prubeh.posledniBody} b
            </span>
          )}
        </span>
      </div>

      <div className="panel test-otazka" key={prubeh.index}>
        <div className="test-meta">
          <span className="stitek">Obtížnost {otazka.obtiznost}/5</span>
        </div>
        <h2 className="test-zadani">{otazka.zadani}</h2>
        <TeloOtazkyDuelu
          key={otazka.id}
          otazka={otazka}
          skryteMoznosti={[]}
          onOdpoved={(hodnota) => onOdpoved(hodnota, Date.now() - prubeh.zacatekOtazkyMs)}
        />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cekani na vyzyvatele (moje pulka odehrana a odeslana)

function HostCekani({
  duel,
  mojeBody,
  pracuji,
  chyba,
  obnov,
}: {
  duel: Duel;
  mojeBody: number;
  pracuji: boolean;
  chyba: string | null;
  obnov(): void;
}) {
  return (
    <div className="panel duely__prazdno duel-cekani">
      <div className="duel-cekani__hodiny animace-pop" aria-hidden="true">⏳</div>
      <p className="duely__prazdno-titulek">Odehráno! Čekáme na soupeře…</p>
      <p>
        Tvoje skóre <strong className="duel-cekani__body">{mojeBody} b</strong> je zapečetěné.{' '}
        {duel.vyzyvatel.jmeno} má čas do vypršení duelu ({zbyvaDoVyprseni(duel.vyprsi, Date.now())}).
        Výsledek se odhalí, až dohrají oba — vrať se sem přes stejný odkaz.
      </p>
      {chyba && <p className="duely__karta-chyba">{chyba}</p>}
      <button type="button" className="tlacitko tlacitko--primarni" disabled={pracuji} onClick={obnov}>
        {pracuji ? 'Načítám…' : '🔄 Zkontrolovat výsledek'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vysledek hosta — srovnani obou pulek (bez trofeji a avataru rodiny)

function HostVysledek({ duel, hostId, jmeno }: { duel: Duel; hostId: string; jmeno: string }) {
  const muj = duel.vysledky[hostId];
  const souperuv = duel.vysledky[duel.vyzyvatel.profilId];
  const vysledek = vysledekProHrace(duel.vitezProfilId ?? null, hostId);
  const mojeOdpovedi = new Map((muj?.odpovedi ?? []).map((o) => [o.otazkaId, o]));
  const souperovyOdpovedi = new Map((souperuv?.odpovedi ?? []).map((o) => [o.otazkaId, o]));

  return (
    <>
      <div className="panel duel-vysledek duel-vysledek--odhaleni animace-naskoceni">
        <div className="duel-intro__obor">
          {ikonaPredmetu(duel.predmetId)} {nazevPredmetu(duel.predmetId)} · {duel.pocetOtazek} otázek
        </div>
        <div className="duel-vysledek__vs">
          <div className={`duel-vysledek__hrac${vysledek === 'vyhra' ? ' duel-vysledek__hrac--vitez' : ''}`}>
            <div className="duel-intro__silueta" aria-hidden="true">
              {jmeno.slice(0, 1).toUpperCase()}
            </div>
            <div className="duel-intro__jmeno">{jmeno}</div>
            <div className="duel-vysledek__body">{muj?.body ?? 0}</div>
            {muj ? (
              <div className="duel-vysledek__cas">⏱ {formatujCelkovyCas(muj.celkovyCasMs)}</div>
            ) : (
              <div className="duel-vysledek__cas">nehráno</div>
            )}
          </div>
          <div className="duel-intro__blesk" aria-hidden="true">VS</div>
          <div className={`duel-vysledek__hrac${vysledek === 'prohra' ? ' duel-vysledek__hrac--vitez' : ''}`}>
            <div className="duel-intro__silueta" aria-hidden="true">
              {duel.vyzyvatel.jmeno.slice(0, 1).toUpperCase()}
            </div>
            <div className="duel-intro__jmeno">{duel.vyzyvatel.jmeno}</div>
            <div className="duel-vysledek__body">{souperuv?.body ?? 0}</div>
            {souperuv ? (
              <div className="duel-vysledek__cas">⏱ {formatujCelkovyCas(souperuv.celkovyCasMs)}</div>
            ) : (
              <div className="duel-vysledek__cas">nehráno</div>
            )}
          </div>
        </div>
        <div className="duel-vysledek__verdikt animace-pop">
          {vysledek === 'vyhra' && (
            <>
              <div className="duel-vysledek__titulek duel-vysledek__titulek--vyhra">🏆 VÍTĚZSTVÍ!</div>
              <p>
                {duel.stav === 'vyprsely' && !souperuv
                  ? 'Soupeř nestihl odehrát do 24 hodin — výhra kontumačně. I tak se počítá!'
                  : 'Přesnost + rychlost = neporazitelná kombinace.'}
              </p>
            </>
          )}
          {vysledek === 'prohra' && (
            <>
              <div className="duel-vysledek__titulek">Tentokrát to nevyšlo.</div>
              <p>{duel.vyzyvatel.jmeno} byl(a) tentokrát lepší. Mrkni níž, kde se duel zlomil.</p>
            </>
          )}
          {vysledek === 'remiza' && (
            <>
              <div className="duel-vysledek__titulek">🤝 Remíza!</div>
              <p>Naprosto vyrovnaný souboj.</p>
            </>
          )}
        </div>
      </div>

      {(muj || souperuv) && duel.otazkyIds.length > 0 && (
        <div className="panel duel-osa animace-naskoceni">
          <h2>Otázka po otázce</h2>
          <p className="duel-osa__legenda">⚡ = správně a rychleji než soupeř</p>
          <div className="duel-osa__tabulka">
            <div className="duel-osa__radek duel-osa__radek--hlava">
              <span>#</span>
              <span>{jmeno}</span>
              <span>{duel.vyzyvatel.jmeno}</span>
            </div>
            {duel.otazkyIds.map((otazkaId, i) => {
              const moje = mojeOdpovedi.get(otazkaId);
              const jeho = souperovyOdpovedi.get(otazkaId);
              const rychlejsiMoje = !!moje?.spravne && (!jeho?.spravne || moje.casMs < jeho.casMs);
              const rychlejsiJeho = !!jeho?.spravne && (!moje?.spravne || jeho.casMs < moje.casMs);
              return (
                <div key={otazkaId} className="duel-osa__radek">
                  <span className="duel-osa__cislo">{i + 1}</span>
                  <BunkaHosta odpoved={moje} rychlejsi={rychlejsiMoje} />
                  <BunkaHosta odpoved={jeho} rychlejsi={rychlejsiJeho} />
                </div>
              );
            })}
            <div className="duel-osa__radek duel-osa__radek--soucet">
              <span>Σ</span>
              <span>{muj ? `${muj.body} b · ${formatujCelkovyCas(muj.celkovyCasMs)}` : '—'}</span>
              <span>
                {souperuv ? `${souperuv.body} b · ${formatujCelkovyCas(souperuv.celkovyCasMs)}` : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BunkaHosta({
  odpoved,
  rychlejsi,
}: {
  odpoved: { spravne: boolean; casMs: number } | undefined;
  rychlejsi: boolean;
}) {
  if (!odpoved) return <span className="duel-osa__bunka duel-osa__bunka--chybi">—</span>;
  const sekundy = (odpoved.casMs / 1000).toFixed(1).replace('.', ',');
  return (
    <span
      className={`duel-osa__bunka ${odpoved.spravne ? 'duel-osa__bunka--spravne' : 'duel-osa__bunka--spatne'}`}
    >
      {odpoved.spravne ? '✓' : '✗'} {sekundy} s{rychlejsi ? ' ⚡' : ''}
    </span>
  );
}
