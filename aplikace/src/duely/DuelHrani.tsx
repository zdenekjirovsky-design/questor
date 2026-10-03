// Stranka /duel/:id — cely zivot duelu z pohledu hrace:
// intro VS (handicap ferovosti + pravidla) → hrani (limit NA OTAZKU
// s viditelnym odpoctem, bez zpetne vazby, power-upy, prubezne jen MOJE
// skore) → „Cekame na soupere" → dramaticke odhaleni vysledku.
// Mobil: nova otazka zacina vzdy v zornem poli (navrat na hlavicku duelu)
// a ťuknuti tesne po zobrazeni otazky se ignoruji (testy/ochranaKliku.ts,
// cela sekce vc. power-upu) — dvoji ťuknuti nesmi naslepo odpovedet na
// dalsi otazku ani spotrebovat power-up.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Duel, Otazka, PowerupTyp } from '@questor/sdilene';
import { POWERUP_INFO, POWERUP_TYPY } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import Avatar from '../hra/Avatar';
import VyberOtazka from '../testy/komponenty/VyberOtazka';
import MultiOtazka from '../testy/komponenty/MultiOtazka';
import AnoNeOtazka from '../testy/komponenty/AnoNeOtazka';
import DoplneniOtazka from '../testy/komponenty/DoplneniOtazka';
import PrirazovaniOtazka from '../testy/komponenty/PrirazovaniOtazka';
import type { OdpovedHodnota } from '../testy/engine';
import { pouzijOchranuKliku } from '../testy/pouzijOchranuKliku';
import { pouzijNavratNaZacatek } from '../testy/posun';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import { expirujDuel, MAX_BONUS_BODY } from '@questor/sdilene';
import {
  bonusTedVPrubehu,
  casOtazkyMs,
  jeDokoncenyDuel,
  muzePouzitPowerup,
  otazkyDuelu,
  type DuelPrubeh,
} from './engine';
import {
  duelovyKlient,
  IKONY_POWERUPU,
  popisHandicapu,
  sekundyOtazky,
  souperVDuelu,
  zbyvaDoVyprseni,
} from './pomocne';
import DuelVysledek from './DuelVysledek';
import '../testy/testy.css';
import './Duely.css';

export default function DuelHrani() {
  const { id } = useParams<{ id: string }>();
  const duel = pouzijStav((s) => s.duely.find((d) => d.id === id));
  const profilId = pouzijStav((s) => s.aktivniProfilId);

  if (!duel || !profilId) {
    return (
      <section>
        <h1>Duel</h1>
        <p className="panel">
          Tenhle duel tu není — možná se ještě nestáhl ze serveru.{' '}
          <Link to="/duely">Zpět na duely</Link>
        </p>
      </section>
    );
  }

  if (jeDokoncenyDuel(duel)) return <DuelVysledek duel={duel} profilId={profilId} />;
  // Lina expirace i tady: duel po 24h terminu se UZ NEHRAJE (server by
  // vysledek odmitl) — ukaze se rovnou kontumacni vysledek, i offline.
  const poExpiraci = expirujDuel(duel, new Date().toISOString());
  if (jeDokoncenyDuel(poExpiraci)) return <DuelVysledek duel={poExpiraci} profilId={profilId} />;
  if (duel.vysledky[profilId]) return <CekaniNaSoupere duel={duel} profilId={profilId} />;
  // Duel odkazem (proOdkaz) hraje vyzyvatel i pred prijetim hosta — handicap
  // je fixne 1.0 od zalozeni (kontrakt serveru), cekat na hosta nemusi.
  if (!duel.souper && !duel.proOdkaz) {
    return (
      <section className="duel-hrani">
        <h1>⚔️ Duel</h1>
        <div className="panel duely__prazdno">
          <p className="duely__prazdno-titulek">📣 Výzva letí do rodiny…</p>
          <p>
            Hrát můžeš, až výzvu někdo přijme — teprve pak se férově zamknou bonusy za rychlost obou
            hráčů. ({zbyvaDoVyprseni(duel.vyprsi, Date.now())})
          </p>
          <Link to="/duely" className="tlacitko">
            Zpět na duely
          </Link>
        </div>
      </section>
    );
  }
  return <HraniMePulky duel={duel} profilId={profilId} />;
}

// ---------------------------------------------------------------------------
// Cekani na soupere (moje pulka odehrana)

function CekaniNaSoupere({ duel, profilId }: { duel: Duel; profilId: string }) {
  const muj = duel.vysledky[profilId];
  const souper = souperVDuelu(duel, profilId);
  // Duel odkazem: dokud host odkaz neotevre, souper neexistuje — ceka se na
  // hosta (jmeno zna duel az po prijeti, stitek „host" nosi seznam duelu).
  const popisSoupere = souper
    ? `${souper.jmeno}${duel.proOdkaz ? ' (host)' : ''} má čas do vypršení duelu`
    : duel.proOdkaz
      ? 'Čekáme, až host otevře tvůj odkaz — má čas do vypršení duelu'
      : 'Soupeř má čas do vypršení duelu';
  return (
    <section className="duel-hrani">
      <h1>⚔️ Duel</h1>
      <div className="panel duely__prazdno duel-cekani">
        <div className="duel-cekani__hodiny animace-pop" aria-hidden="true">⏳</div>
        <p className="duely__prazdno-titulek">Odehráno! Čekáme na soupeře…</p>
        <p>
          Tvoje skóre <strong className="duel-cekani__body">{muj?.body ?? 0} b</strong> je zapečetěné.
          {' '}{popisSoupere}
          {' '}({zbyvaDoVyprseni(duel.vyprsi, Date.now())}). Výsledek se odhalí, až dohrají oba.
        </p>
        <Link to="/duely" className="tlacitko tlacitko--primarni">
          Zpět na duely
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Hrani me pulky (intro → otazky)

function HraniMePulky({ duel, profilId }: { duel: Duel; profilId: string }) {
  const prubeh = pouzijStav((s) => s.aktualniDuel);
  const zacniDuelAkce = pouzijStav((s) => s.zacniDuelAkce);
  const pridejDuel = pouzijStav((s) => s.pridejDuel);
  const mojeJmeno = pouzijStav(
    (s) => s.profily.find((p) => p.id === profilId)?.jmeno ?? 'Hráč',
  );
  // Banka se nacita ASYNC po startu (bundle/IndexedDB/server) — na banku se
  // ceka a zalozeni prubehu se zkousi znovu s kazdou zmenou banky (napr.
  // sync prave stahl novejsi verzi se znamymi otazkami).
  const banka = pouzijStav((s) => s.banky[duel.predmetId]);
  const [nejdeHrat, setNejdeHrat] = useState(false);
  const [nejdePrijmout, setNejdePrijmout] = useState(false);

  // ANTI-CHEAT serveru: adresat cilene vyzvy dostava sadu otazek az s
  // prijetim (GET ji zatajuje) — prazdne otazkyIds tady znamenaji „nejdriv
  // vyzvu prijmi online". Prijeti se zkusi samo; offline padne na hlasku.
  const sadaChybi = duel.otazkyIds.length === 0;
  const prijimamRef = useRef(false);
  useEffect(() => {
    if (!sadaChybi || prijimamRef.current) return;
    prijimamRef.current = true;
    const klient = duelovyKlient();
    if (!klient) {
      setNejdePrijmout(true);
      prijimamRef.current = false;
      return;
    }
    klient
      .prijmiDuelNaServeru(duel.id, { profilId, jmeno: mojeJmeno })
      .then((prijaty) => pridejDuel(prijaty))
      .catch(() => setNejdePrijmout(true))
      .finally(() => {
        prijimamRef.current = false;
      });
  }, [sadaChybi, duel.id, profilId, mojeJmeno, pridejDuel]);

  const patriDuelu = prubeh !== null && prubeh.duelId === duel.id;
  useEffect(() => {
    if (patriDuelu || !banka || sadaChybi) return;
    setNejdeHrat(!zacniDuelAkce(duel.id));
  }, [patriDuelu, banka, sadaChybi, duel.id, zacniDuelAkce]);

  // Lokalni banka je starsi nez duel: jednou zkusit plny sync (stahne vyssi
  // verzi banky) — efekt vyse pak zalozeni prubehu zopakuje sam. Driv to
  // mimochodem obstaral plny sync pri kazdem otevreni stranky Duely, ta ale
  // ted obnovuje jen seznam duelu (duely/obnoveni.ts).
  const bankaObnovovana = useRef(false);
  useEffect(() => {
    if (!nejdeHrat || bankaObnovovana.current) return;
    bankaObnovovana.current = true;
    void import('../sync/sync')
      .then((m) => m.synchronizuj('rucne'))
      .catch(() => {});
  }, [nejdeHrat]);

  // Lokalni banka predmetu duelu CHYBI uplne (chunk bundlu i startovni sync
  // selhaly na slabe siti, predmet jen na serveru): az dobehne nacteni
  // obsahu a banka porad neni, jednou zkusit plny sync — jinak by
  // „Nacitam otazky…" viselo bez spoustece. Sdili ref s vetvi vyse, takze
  // sync probehne nejvys jednou na mount.
  useEffect(() => {
    if (banka || sadaChybi || bankaObnovovana.current) return;
    let zruseno = false;
    // Selhani nacteni obsahu (i chunku nacteniObsahu) sync nesmi zablokovat —
    // chyba se spolkne PRED kontrolou banky.
    void import('../data/nacteniObsahu')
      .then((m) => m.nactiObsahPriStartu())
      .catch(() => {})
      .then(() => {
        if (zruseno || bankaObnovovana.current || pouzijStav.getState().banky[duel.predmetId]) return;
        bankaObnovovana.current = true;
        return import('../sync/sync').then((m) => m.synchronizuj('rucne'));
      })
      .catch(() => {});
    return () => {
      zruseno = true;
    };
  }, [banka, sadaChybi, duel.predmetId]);

  if (sadaChybi) {
    return (
      <section className="duel-hrani">
        <h1>⚔️ Duel</h1>
        {nejdePrijmout ? (
          <p className="panel">
            Otázky duelu se odemknou přijetím výzvy — to potřebuje připojení k rodině.
            Zkontroluj internet (a rodinný kód v <Link to="/nastaveni">Nastavení</Link>)
            a zkus to znovu. <Link to="/duely">Zpět na duely</Link>
          </p>
        ) : (
          <p className="panel">Přijímám výzvu…</p>
        )}
      </section>
    );
  }
  if (!banka) {
    return (
      <section className="duel-hrani">
        <h1>⚔️ Duel</h1>
        <p className="panel">Načítám otázky…</p>
      </section>
    );
  }
  if (nejdeHrat) {
    return (
      <section className="duel-hrani">
        <h1>⚔️ Duel</h1>
        <p className="panel">
          Lokální banka otázek nezná otázky tohohle duelu (je starší). Připoj se k internetu,
          ať se banka stáhne, a zkus to znovu. <Link to="/duely">Zpět na duely</Link>
        </p>
      </section>
    );
  }
  if (!patriDuelu || !prubeh) return null;
  if (!prubeh.zahajeno) return <IntroVS duel={duel} profilId={profilId} />;
  return <OtazkaDuelu duel={duel} prubeh={prubeh} />;
}

// ---------------------------------------------------------------------------
// Intro VS — nastup hracu, handicap ferovosti, pravidla

function IntroVS({ duel, profilId }: { duel: Duel; profilId: string }) {
  const odstartuj = pouzijStav((s) => s.odstartujDuelAkce);
  const mujAvatar = pouzijStav((s) => s.progres.avatar);
  const souper = souperVDuelu(duel, profilId);
  const souperuvAvatar = pouzijStav((s) =>
    souper ? s.dataProfilu[souper.profilId]?.progres.avatar : undefined,
  );
  const mojeJmeno = pouzijStav(
    (s) => s.profily.find((p) => p.id === profilId)?.jmeno ?? 'Ty',
  );
  const handicap = popisHandicapu(duel, profilId);
  // U duelu odkazem pred prijetim hosta souper jeste neexistuje — misto „???"
  // se ukaze neutralni „Host" (jmeno zada host az pri otevreni odkazu).
  const jmenoSoupere = souper?.jmeno ?? (duel.proOdkaz ? 'Host' : '???');

  return (
    <section className="duel-hrani">
      <div className="panel duel-intro animace-naskoceni">
        <div className="duel-intro__obor">
          {ikonaPredmetu(duel.predmetId)} {nazevPredmetu(duel.predmetId)} · {duel.pocetOtazek} otázek
        </div>
        <div className="duel-intro__vs">
          <div className="duel-intro__hrac animace-naskoceni">
            <Avatar konfigurace={mujAvatar} velikost={84} />
            <div className="duel-intro__jmeno">{mojeJmeno}</div>
            {handicap.muj > 1 && (
              <div className="duel-intro__bonus">⚡ rychlost ×{handicap.muj.toFixed(2).replace('.', ',')}</div>
            )}
          </div>
          <div className="duel-intro__blesk" aria-hidden="true">VS</div>
          <div className="duel-intro__hrac animace-naskoceni">
            {souperuvAvatar ? (
              <Avatar konfigurace={souperuvAvatar} velikost={84} />
            ) : (
              <div className="duel-intro__silueta" aria-hidden="true">
                {jmenoSoupere.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="duel-intro__jmeno">
              {jmenoSoupere}
              {duel.proOdkaz && <span className="stitek duely__stitek-host">host</span>}
            </div>
            {handicap.souperuv > 1 && (
              <div className="duel-intro__bonus">
                ⚡ rychlost ×{handicap.souperuv.toFixed(2).replace('.', ',')}
              </div>
            )}
          </div>
        </div>
        {handicap.text && <p className="duel-intro__handicap">{handicap.text}</p>}
        <ul className="duel-intro__pravidla">
          <li>Oba hrajete <strong>úplně stejné otázky</strong> ve stejném pořadí.</li>
          <li>
            Na odpověď máš <strong>neomezený čas</strong> — správně = 100 b + až 50 b za rychlost
            (čím dřív, tím víc).
          </li>
          <li>Špatně = 0 b. Vysvětlení uvidíš až po duelu.</li>
          <li>Power-upy z truhel smíš použít každý <strong>jednou za duel</strong>.</li>
        </ul>
        <button
          type="button"
          className="tlacitko tlacitko--zlate duel-intro__start"
          onClick={odstartuj}
        >
          ⚔️ Do boje!
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Jedna otazka duelu

function OtazkaDuelu({ duel, prubeh }: { duel: Duel; prubeh: DuelPrubeh }) {
  const banka = pouzijStav((s) => s.banky[duel.predmetId]);
  const odpovezAkce = pouzijStav((s) => s.odpovezVDueluAkce);
  const otazky = useMemo(() => otazkyDuelu(duel, banka), [duel, banka]);
  const otazka = otazky?.[prubeh.index] ?? null;
  const hlavickaRef = useRef<HTMLDivElement | null>(null);
  pouzijNavratNaZacatek(hlavickaRef, prubeh.index);
  const ochranaKliku = pouzijOchranuKliku(prubeh.index);

  if (!otazka) return null;

  // Cas pro bonus je syrovy od zobrazeni otazky (casOtazkyMs) — ochranna
  // prodleva ho neposouva, server i starsi klienti pocitaji stejne.
  const odpovez = (hodnota: OdpovedHodnota) => {
    odpovezAkce(hodnota, casOtazkyMs(prubeh, Date.now()));
  };

  // Ochrana kliku na CELE sekci: navrat na zacatek otazky muze pod prst
  // druheho ťuknuti posunout listu power-upu (power-up v prvnich ms nove
  // otazky nema legitimni pouziti; klik z klavesnice projde).
  return (
    <section
      className="duel-hrani"
      aria-label={`Duel — otázka ${prubeh.index + 1} z ${prubeh.pocetOtazek}`}
      onClickCapture={ochranaKliku}
    >
      <div className="duel-hlavicka" ref={hlavickaRef}>
        <span className="test-pocitadlo">
          {prubeh.index + 1}/{prubeh.pocetOtazek}
        </span>
        <MeridloRychlosti prubeh={prubeh} otazka={otazka} />
        <span className="duel-skore">
          {prubeh.body} b
          {prubeh.posledniBody > 0 && (
            <span className="xp-let duel-skore__let" key={prubeh.index}>
              +{prubeh.posledniBody} b
            </span>
          )}
        </span>
      </div>

      <PowerupLista prubeh={prubeh} otazka={otazka} />

      <div className="panel test-otazka" key={prubeh.index}>
        <div className="test-meta">
          <span className="stitek">Obtížnost {otazka.obtiznost}/5</span>
          {prubeh.stitAktivni && <span className="stitek duel-stitek-stitu">🛡️ Štít aktivní</span>}
          {prubeh.powerupAktualniOtazky === 'zmrazeni-casu' && (
            <span className="stitek duel-stitek-stitu">🧊 10 s zdarma</span>
          )}
        </div>
        <h2 className="test-zadani">{otazka.zadani}</h2>
        <TeloOtazkyDuelu
          key={otazka.id}
          otazka={otazka}
          skryteMoznosti={prubeh.skryteMoznosti}
          onOdpoved={odpovez}
        />
      </div>
    </section>
  );
}

/**
 * Měřidlo rychlosti: stopky aktuální otázky a pruh bonusu, který by hráč
 * dostal za správnou odpověď právě teď. Časový limit není — pruh jen
 * plynule klesá. Sdílí ho rodinný duel i host (HostDuel).
 */
export function MeridloRychlosti({ prubeh, otazka }: { prubeh: DuelPrubeh; otazka: Otazka }) {
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setTed(Date.now()), 200);
    return () => clearInterval(interval);
  }, []);
  const bonus = bonusTedVPrubehu(prubeh, otazka, ted);
  return (
    <div className="duel-odpocet">
      <div
        className="duel-odpocet__bar"
        role="meter"
        aria-label="Bonus za rychlost"
        aria-valuemin={0}
        aria-valuemax={MAX_BONUS_BODY}
        aria-valuenow={bonus}
      >
        <div style={{ width: `${(bonus / MAX_BONUS_BODY) * 100}%` }} />
      </div>
      {/* Cisla v rezervovane sirce (Duely.css) — pruh bonusu necuka. */}
      <span className="duel-odpocet__cas">
        ⏱️{' '}
        <span className="duel-odpocet__cislo duel-odpocet__cislo--cas">
          {sekundyOtazky(casOtazkyMs(prubeh, ted))}
        </span>{' '}
        s · ⚡{' '}
        <span className="duel-odpocet__cislo duel-odpocet__cislo--bonus">+{bonus}</span> b
      </span>
    </div>
  );
}

function PowerupLista({ prubeh, otazka }: { prubeh: DuelPrubeh; otazka: Otazka }) {
  const powerupy = pouzijStav((s) => s.progres.powerupy);
  const pouzij = pouzijStav((s) => s.pouzijPowerupAkce);
  const [aktivovany, setAktivovany] = useState<PowerupTyp | null>(null);

  return (
    <div className="duel-powerupy" role="group" aria-label="Power-upy">
      {POWERUP_TYPY.map((typ) => {
        const kusu = powerupy?.[typ] ?? 0;
        const lze = kusu > 0 && muzePouzitPowerup(prubeh, typ, otazka);
        const pouzityTed = aktivovany === typ && prubeh.pouzitePowerupy.includes(typ);
        return (
          <button
            key={typ}
            type="button"
            className={`duel-powerup${pouzityTed ? ' duel-powerup--aktivovany' : ''}`}
            disabled={!lze}
            title={`${POWERUP_INFO[typ].nazev} — ${POWERUP_INFO[typ].popis}`}
            aria-label={`${POWERUP_INFO[typ].nazev} (${kusu} kusů)`}
            onClick={() => {
              if (pouzij(typ)) setAktivovany(typ);
            }}
          >
            <span className="duel-powerup__ikona" aria-hidden="true">
              {IKONY_POWERUPU[typ]}
            </span>
            <span className="duel-powerup__nazev">{POWERUP_INFO[typ].nazev}</span>
            <span className="duel-powerup__pocet">×{kusu}</span>
          </button>
        );
      })}
    </div>
  );
}

// Export: telo otazky sdili rodinne hrani (OtazkaDuelu) i hostovsky rezim
// duelu odkazem (HostDuel) — obe strany hraji IDENTICKE otazky stejnym UI.
export function TeloOtazkyDuelu({
  otazka,
  skryteMoznosti,
  onOdpoved,
}: {
  otazka: Otazka;
  skryteMoznosti: number[];
  onOdpoved(hodnota: OdpovedHodnota): void;
}) {
  // Bez prubezne zpetne vazby (jako rezim zkouska): odeslana=null, po
  // odpovedi se rovnou premontuje dalsi otazka (key = id otazky).
  switch (otazka.typ) {
    case 'vyber':
      return (
        <VyberOtazka
          otazka={otazka}
          odeslana={null}
          zobrazVyhodnoceni={false}
          skryteIndexy={skryteMoznosti}
          onOdpoved={onOdpoved}
        />
      );
    case 'multi':
      return (
        <MultiOtazka otazka={otazka} odeslana={null} zobrazVyhodnoceni={false} onOdpoved={onOdpoved} />
      );
    case 'anone':
      return (
        <AnoNeOtazka otazka={otazka} odeslana={null} zobrazVyhodnoceni={false} onOdpoved={onOdpoved} />
      );
    case 'doplneni':
      return (
        <DoplneniOtazka
          otazka={otazka}
          odeslana={null}
          zobrazVyhodnoceni={false}
          spravne={null}
          onOdpoved={onOdpoved}
        />
      );
    case 'prirazovani':
      return (
        <PrirazovaniOtazka
          otazka={otazka}
          odeslana={null}
          zobrazVyhodnoceni={false}
          onOdpoved={onOdpoved}
        />
      );
  }
}
