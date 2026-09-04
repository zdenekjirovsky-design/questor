// Průběh testu — VLASTNÍ agent APP-TESTY.
// Jedna otázka na obrazovku, celá karta možnosti je tlačítko, okamžitá zpětná
// vazba (mimo režim zkouška), tenký progress + combo nahoře, plovoucí „+XP“.
// Klávesy: 1–4 / A–D vybírají, Enter potvrzuje / posouvá dál.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { comboNasobic } from '@questor/sdilene';
import type { Otazka, RezimTestu, TestKonfigurace } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { ikonaPredmetu, nazevPredmetu, seradPredmety } from '../data/predmety';
import {
  aktualniOtazka,
  fazeTestu,
  planovanyPocetOtazek,
  zbyvajiciCasMs,
  type OdpovedHodnota,
  type TestStav,
} from '../testy/engine';
import { NAZVY_REZIMU, POPISY_REZIMU } from '../testy/popisky';
import { jeVstupniPole } from '../testy/komponenty/klavesy';
import VyberOtazka from '../testy/komponenty/VyberOtazka';
import MultiOtazka from '../testy/komponenty/MultiOtazka';
import AnoNeOtazka from '../testy/komponenty/AnoNeOtazka';
import DoplneniOtazka from '../testy/komponenty/DoplneniOtazka';
import PrirazovaniOtazka from '../testy/komponenty/PrirazovaniOtazka';
import '../testy/testy.css';

export default function Test() {
  const aktualniTest = pouzijStav((s) => s.aktualniTest);
  if (!aktualniTest) return <RychlyStart />;
  return <PrubehTestu key={aktualniTest.zacatek} stav={aktualniTest} />;
}

// ---------------------------------------------------------------------------
// Rychlý start — když nikdo nepřišel z Domů (přímá navigace na /test)

const POCTY: (5 | 10 | 20)[] = [5, 10, 20];
const REZIMY: RezimTestu[] = ['rozcvicka', 'standard', 'hardcore', 'adaptivni', 'zkouska'];

function RychlyStart() {
  const banky = pouzijStav((s) => s.banky);
  const zacniTest = pouzijStav((s) => s.zacniTest);
  const [rezim, setRezim] = useState<RezimTestu>('standard');
  const [pocet, setPocet] = useState<5 | 10 | 20>(10);
  // Predmety s prítomnou bankou, seřazené podle registru (../data/predmety.ts).
  const dostupnePredmety = seradPredmety(Object.keys(banky));
  const [vybranyPredmet, setVybranyPredmet] = useState<string | null>(null);
  // Volba předmětu je PRVNÍ krok; dokud banky nedoběhnou (async načtení při
  // startu) nebo předmět zmizí, spadne výběr na první dostupný.
  const predmetId =
    vybranyPredmet && banky[vybranyPredmet] ? vybranyPredmet : (dostupnePredmety[0] ?? null);

  if (!predmetId) {
    return (
      <section>
        <h1>Test</h1>
        <p className="panel">
          Zatím tu není žádná banka otázek. Připoj se k serveru v{' '}
          <Link to="/nastaveni">Nastavení</Link>, nebo požádej tátu o nahrání učiva.
        </p>
      </section>
    );
  }

  const spust = () => {
    const konfigurace: TestKonfigurace = { predmetId, rezim, pocetOtazek: pocet };
    zacniTest(konfigurace);
  };

  return (
    <section>
      <h1>Nový test</h1>
      <div className="panel rychly-start">
        <div className="rychly-start__radek">
          <span>Předmět</span>
          <div className="rychly-start__volby">
            {dostupnePredmety.map((id) => (
              <button
                key={id}
                type="button"
                className={`tlacitko${id === predmetId ? ' tlacitko--primarni' : ''}`}
                onClick={() => setVybranyPredmet(id)}
              >
                {ikonaPredmetu(id)} {nazevPredmetu(id, banky[id]?.nazev)}
              </button>
            ))}
          </div>
        </div>
        <div className="rychly-start__radek">
          <strong>
            {ikonaPredmetu(predmetId)} {nazevPredmetu(predmetId, banky[predmetId]?.nazev)}
          </strong>
          <span className="parovani__napoveda">Všechna témata · {POPISY_REZIMU[rezim]}</span>
        </div>
        <div className="rychly-start__radek">
          <span>Režim</span>
          <div className="rychly-start__volby">
            {REZIMY.map((r) => (
              <button
                key={r}
                type="button"
                className={`tlacitko${r === rezim ? ' tlacitko--primarni' : ''}`}
                onClick={() => setRezim(r)}
              >
                {NAZVY_REZIMU[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="rychly-start__radek">
          <span>Počet otázek</span>
          <div className="rychly-start__volby">
            {POCTY.map((p) => (
              <button
                key={p}
                type="button"
                className={`tlacitko${p === pocet ? ' tlacitko--primarni' : ''}`}
                onClick={() => setPocet(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="rychly-start__volby">
          <button type="button" className="tlacitko tlacitko--zlate" onClick={spust}>
            ⚔️ Spustit test
          </button>
          <Link to="/" className="tlacitko">
            Zpět domů
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Průběh testu

function formatujCas(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const minuty = Math.floor(s / 60);
  const sekundy = s % 60;
  return `${minuty}:${String(sekundy).padStart(2, '0')}`;
}

function PrubehTestu({ stav }: { stav: TestStav }) {
  const navigate = useNavigate();
  const odpovezAkce = pouzijStav((s) => s.odpovez);
  const dalsiOtazkaAkce = pouzijStav((s) => s.dalsiOtazka);
  const dokonciTestAkce = pouzijStav((s) => s.dokonciTest);
  const temata = pouzijStav((s) => s.banky[stav.konfigurace.predmetId]?.temata) ?? [];

  const jeZkouska = stav.konfigurace.rezim === 'zkouska';
  const faze = fazeTestu(stav);
  const otazka = aktualniOtazka(stav);
  const planovano = planovanyPocetOtazek(stav);
  const posledniOtazka = stav.index + 1 >= stav.otazky.length;

  const [posledniHodnota, setPosledniHodnota] = useState<OdpovedHodnota | null>(null);
  const casStartOtazky = useRef(Date.now());

  useEffect(() => {
    casStartOtazky.current = Date.now();
    setPosledniHodnota(null);
  }, [stav.index]);

  // --- dokončení testu (poslední „Vyhodnotit“ nebo konec zkoušky) ---
  const dokonceno = stav.dokonceno;
  useEffect(() => {
    if (!dokonceno) return;
    dokonciTestAkce();
    navigate('/vysledek');
  }, [dokonceno, dokonciTestAkce, navigate]);

  // --- časomíra zkoušky ---
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    if (!jeZkouska) return;
    const interval = setInterval(() => setTed(Date.now()), 500);
    return () => clearInterval(interval);
  }, [jeZkouska]);
  const zbyva = zbyvajiciCasMs(stav, ted);
  useEffect(() => {
    if (!jeZkouska || zbyva === null || zbyva > 0 || dokonceno) return;
    // Čas vypršel: nezodpovězené otázky se počítají jako špatně (viz engine).
    dokonciTestAkce();
    navigate(stav.odpovedi.length > 0 ? '/vysledek' : '/');
  }, [jeZkouska, zbyva, dokonceno, dokonciTestAkce, navigate, stav.odpovedi.length]);

  const odpovez = useCallback(
    (hodnota: OdpovedHodnota) => {
      const casMs = Date.now() - casStartOtazky.current;
      setPosledniHodnota(hodnota);
      odpovezAkce(hodnota, casMs);
      // Zkouška: žádný feedback, rovnou dál (po poslední otázce engine dokončí).
      if (jeZkouska) dalsiOtazkaAkce();
    },
    [odpovezAkce, dalsiOtazkaAkce, jeZkouska],
  );

  // --- Enter ve fázi feedbacku = Další / Vyhodnotit ---
  useEffect(() => {
    if (faze !== 'feedback' || jeZkouska) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || jeVstupniPole(e.target)) return;
      e.preventDefault();
      dalsiOtazkaAkce();
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [faze, jeZkouska, dalsiOtazkaAkce]);

  if (!otazka || dokonceno) return null;

  const posledniZaznam = stav.odpovedi[stav.odpovedi.length - 1] ?? null;
  const veFeedbacku = faze === 'feedback';
  const spravne = veFeedbacku && posledniZaznam ? posledniZaznam.spravne : null;
  const nasobic = comboNasobic(stav.combo);
  const nazevTematu = temata.find((t) => t.id === otazka.temaId)?.nazev ?? otazka.temaId;

  return (
    <section aria-label={`Test — otázka ${stav.index + 1} z ${planovano}`}>
      <div className="test-hlavicka">
        <span className="test-pocitadlo">
          {Math.min(stav.odpovedi.length + (veFeedbacku ? 0 : 1), planovano)}/{planovano}
        </span>
        <div className="ukazatel" role="progressbar" aria-valuemin={0} aria-valuemax={planovano} aria-valuenow={stav.odpovedi.length}>
          <div style={{ width: `${(stav.odpovedi.length / Math.max(1, planovano)) * 100}%` }} />
        </div>
        {jeZkouska && zbyva !== null ? (
          <span className={`test-casomira${zbyva < 60_000 ? ' test-casomira--dochazi' : ''}`}>
            ⏳ {formatujCas(zbyva)}
          </span>
        ) : (
          <span className={`test-combo${stav.combo >= 1 ? ' test-combo--aktivni' : ''}`}>
            {stav.combo >= 1 ? `🔥 Combo ×${nasobic.toFixed(1)}` : 'Combo ×1.0'}
          </span>
        )}
      </div>

      <div className="panel test-otazka" key={stav.index}>
        {veFeedbacku && stav.posledniXp > 0 && (
          <span className="xp-let" key={`xp-${stav.index}`}>
            +{stav.posledniXp} XP
          </span>
        )}
        <div className="test-meta">
          <span className="stitek">{nazevTematu}</span>
          <span className="stitek">Obtížnost {otazka.obtiznost}/5</span>
          <span className="stitek">{NAZVY_REZIMU[stav.konfigurace.rezim]}</span>
        </div>
        <h2 className="test-zadani">{otazka.zadani}</h2>
        {/* key = id otázky: při další otázce stejného typu se komponenta
            přemontuje a neprotečou do ní rozpracované výběry/páry/text. */}
        <TeloOtazky
          key={otazka.id}
          otazka={otazka}
          odeslana={posledniHodnota}
          zobrazVyhodnoceni={!jeZkouska}
          spravne={spravne}
          onOdpoved={odpovez}
        />
      </div>

      {veFeedbacku && !jeZkouska && posledniZaznam && (
        <div className={`panel feedback ${posledniZaznam.spravne ? 'feedback--spravne' : 'feedback--spatne'}`}>
          <div className="feedback__titulek">
            {posledniZaznam.spravne
              ? stav.combo >= 3
                ? `Správně! ${stav.combo} v řadě — combo ×${nasobic.toFixed(1)}`
                : 'Správně!'
              : 'Tahle ti ještě uteče. Mrkni proč:'}
          </div>
          <div>{otazka.vysvetleni}</div>
          {otazka.zdroj && <div className="feedback__zdroj">Zdroj: {otazka.zdroj}</div>}
          <div className="feedback__akce">
            <button
              type="button"
              className={`tlacitko ${posledniOtazka ? 'tlacitko--zlate' : 'tlacitko--primarni'}`}
              onClick={dalsiOtazkaAkce}
            >
              {posledniOtazka ? 'Vyhodnotit test (Enter)' : 'Další (Enter)'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Výhybka podle typu otázky

interface TeloOtazkyProps {
  otazka: Otazka;
  odeslana: OdpovedHodnota | null;
  zobrazVyhodnoceni: boolean;
  spravne: boolean | null;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

function TeloOtazky({ otazka, odeslana, zobrazVyhodnoceni, spravne, onOdpoved }: TeloOtazkyProps) {
  switch (otazka.typ) {
    case 'vyber':
      return (
        <VyberOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni={zobrazVyhodnoceni}
          onOdpoved={onOdpoved}
        />
      );
    case 'multi':
      return (
        <MultiOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni={zobrazVyhodnoceni}
          onOdpoved={onOdpoved}
        />
      );
    case 'anone':
      return (
        <AnoNeOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni={zobrazVyhodnoceni}
          onOdpoved={onOdpoved}
        />
      );
    case 'doplneni':
      return (
        <DoplneniOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni={zobrazVyhodnoceni}
          spravne={spravne}
          onOdpoved={onOdpoved}
        />
      );
    case 'prirazovani':
      return (
        <PrirazovaniOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni={zobrazVyhodnoceni}
          onOdpoved={onOdpoved}
        />
      );
  }
}
