// Domovská stránka — herní dashboard. VLASTNÍ agent APP-HRA.
// HUD je v hlavičce (App.tsx); tady: velké HRÁT, denní questy, čekající truhly,
// výzvy od táty a mini statistiky. Vše bez scrollu na 1080p.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RezimTestu, TestKonfigurace, TruhlaTyp } from '@questor/sdilene';
import { KARTY_VELIKANI, stavLevelu } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { ikonaPredmetu, nazevPredmetu, seradPredmety } from '../data/predmety';
import TruhlaOdmena from '../hra/TruhlaOdmena';
import './Domu.css';
import '../vyuka/vyuka.css';

const REZIMY: { id: RezimTestu; nazev: string; emoji: string; popis: string }[] = [
  { id: 'rozcvicka', nazev: 'Rozcvička', emoji: '🌤️', popis: 'Lehké otázky na rozjezd (1–2)' },
  { id: 'standard', nazev: 'Standard', emoji: '⚔️', popis: 'Vyvážený mix obtížností (2–4)' },
  { id: 'hardcore', nazev: 'Hardcore', emoji: '🔥', popis: 'Jen to nejtěžší (4–5)' },
  { id: 'adaptivni', nazev: 'Adaptivní', emoji: '🧠', popis: 'Obtížnost se přizpůsobuje tobě' },
  { id: 'zkouska', nazev: 'Zkouška', emoji: '🎓', popis: 'Na ostro — vyhodnocení až na konci' },
];

const POCTY: (5 | 10 | 20)[] = [5, 10, 20];

const IKONY_QUESTU: Record<string, string> = {
  odpovez: '✏️',
  uspesnost: '🎯',
  obtiznost: '🏋️',
  tema: '📚',
  bezchyby: '💎',
};

const NAZVY_TRUHEL: Record<TruhlaTyp, string> = {
  bronzova: 'bronzová',
  stribrna: 'stříbrná',
  zlata: 'zlatá',
};

/** Volá akci testového enginu (testySlice) bez tvrdé závislosti na jeho typu. */
function spustTest(konfigurace: TestKonfigurace, vyzvaId?: string): boolean {
  const stav = pouzijStav.getState() as unknown as {
    zacniTest?: (k: TestKonfigurace, vyzvaId?: string) => void;
  };
  if (!stav.zacniTest) return false;
  stav.zacniTest(konfigurace, vyzvaId);
  return true;
}

export default function Domu() {
  const navigate = useNavigate();
  const progres = pouzijStav((s) => s.progres);
  const cekajiciTruhly = pouzijStav((s) => s.cekajiciTruhly);
  const vyzvy = pouzijStav((s) => s.vyzvy);
  const banky = pouzijStav((s) => s.banky);
  const vyuky = pouzijStav((s) => s.vyuky);
  const postupLekci = pouzijStav((s) => s.postupLekci);
  const obnovDenniQuesty = pouzijStav((s) => s.obnovDenniQuesty);

  // Denní obnova questů při zobrazení dashboardu + při změně dne za běhu
  // (aplikace otevřená přes půlnoc): minutový interval a návrat do popředí.
  // Akce je pro stejný den idempotentní, takže časté volání nevadí.
  useEffect(() => {
    obnovDenniQuesty();
    const interval = setInterval(obnovDenniQuesty, 60_000);
    const priNavratu = () => {
      if (!document.hidden) obnovDenniQuesty();
    };
    document.addEventListener('visibilitychange', priNavratu);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', priNavratu);
    };
  }, [obnovDenniQuesty]);

  const [volbaOtevrena, setVolbaOtevrena] = useState(false);
  const [krokVolby, setKrokVolby] = useState<'predmet' | 'volby'>('predmet');
  const [predmetId, setPredmetId] = useState<string | null>(null);
  const [rezim, setRezim] = useState<RezimTestu>('standard');
  const [pocet, setPocet] = useState<5 | 10 | 20>(10);
  const [vybranaTemata, setVybranaTemata] = useState<string[]>([]);
  const [otviranaTruhla, setOtviranaTruhla] = useState<TruhlaTyp | null>(null);
  const [truhlaOtevrena, setTruhlaOtevrena] = useState(false);

  // Predmety s reálně přítomnou bankou otázek (bundle/IndexedDB/server),
  // seřazené podle registru (../data/predmety.ts).
  const dostupnePredmety = useMemo(() => seradPredmety(Object.keys(banky)), [banky]);

  const otevriVolbu = () => {
    if (dostupnePredmety.length === 1) {
      // Jediný předmět — krok volby předmětu nemá co nabídnout, přeskočí se.
      setPredmetId(dostupnePredmety[0]);
      setKrokVolby('volby');
    } else {
      setKrokVolby('predmet');
    }
    setVolbaOtevrena(true);
  };

  const vyberPredmet = (id: string) => {
    if (id !== predmetId) setVybranaTemata([]);
    setPredmetId(id);
    setKrokVolby('volby');
  };

  const temata = useMemo(
    () =>
      ((predmetId && banky[predmetId]?.temata) || [])
        .slice()
        .sort((a, b) => a.poradi - b.poradi),
    [banky, predmetId],
  );

  // Klávesnice modalu: Escape zavře; v kroku předmětu vybírají 1–9.
  useEffect(() => {
    if (!volbaOtevrena) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setVolbaOtevrena(false);
        return;
      }
      if (krokVolby !== 'predmet') return;
      const cislo = Number.parseInt(e.key, 10);
      if (cislo >= 1 && cislo <= Math.min(9, dostupnePredmety.length)) {
        e.preventDefault();
        vyberPredmet(dostupnePredmety[cislo - 1]);
      }
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [volbaOtevrena, krokVolby, dostupnePredmety, predmetId]);

  const prepniTema = (id: string) => {
    setVybranaTemata((v) => (v.includes(id) ? v.filter((t) => t !== id) : [...v, id]));
  };

  const zacni = (konfigurace: TestKonfigurace, vyzvaId?: string) => {
    spustTest(konfigurace, vyzvaId);
    navigate('/test');
  };

  const zacniZVolby = () => {
    if (!predmetId) return;
    zacni({
      predmetId,
      rezim,
      pocetOtazek: pocet,
      temataId:
        vybranaTemata.length === 0 || vybranaTemata.length === temata.length
          ? undefined
          : vybranaTemata,
    });
  };

  // Temata, ktera maji lekci — v konfiguraci testu se znaci ikonou
  // (kontrakt VYUKA.md: propojeni vyuka → test v miste volby temat).
  const temataSLekci = useMemo(
    () => new Set(Object.values(vyuky).flatMap((v) => v.lekce.map((l) => l.temaId))),
    [vyuky],
  );

  // Souhrn vyuky pro dlazdici „Ucit se".
  const lekceSouhrn = useMemo(() => {
    const vsechny = Object.values(vyuky).flatMap((v) => v.lekce);
    const dokoncene = vsechny.filter((l) => {
      const p = postupLekci[l.temaId];
      return p !== undefined && p.dokonceneBloky.length >= l.bloky.length && l.bloky.length > 0;
    }).length;
    return { celkem: vsechny.length, dokoncene };
  }, [vyuky, postupLekci]);

  const level = stavLevelu(progres.xp);
  const velikaniZiskani = progres.sbirka.karty.filter((id) =>
    KARTY_VELIKANI.some((k) => k.id === id),
  ).length;
  const aktivniVyzvy = vyzvy.filter((v) => v.stav !== 'dokoncena');
  const splnenoQuestu = progres.questy.filter((q) => q.splneno).length;

  return (
    <section className="domu">
      <div className="domu__sloupec-hlavni">
        {/* Hero — velké HRÁT */}
        <div className="panel domu__hero">
          <div className="domu__hero-texty">
            <h1 className="domu__pozdrav">Připraven na výpravu?</h1>
            <p className="domu__podtitul">
              {progres.streak.aktualni > 0
                ? `Streak ${progres.streak.aktualni} dní běží. Neztrať ho!`
                : 'Dokonči dnes aspoň jeden test a zapal si plamínek. 🔥'}
            </p>
          </div>
          <button
            type="button"
            className="tlacitko tlacitko--zlate domu__hrat"
            onClick={otevriVolbu}
          >
            ▶ HRÁT
          </button>
        </div>

        {/* Dlaždice „Učit se" — vede na /uceni */}
        <Link to="/uceni" className="panel domu-uceni">
          <span className="domu-uceni__znak" aria-hidden="true">📖</span>
          <span className="domu-uceni__texty">
            <span className="domu-uceni__titulek">Učit se</span>
            <span className="domu-uceni__popis">
              {lekceSouhrn.celkem === 0
                ? 'Interaktivní lekce — obrázky, kartičky, hry. Brzy tu budou!'
                : lekceSouhrn.dokoncene >= lekceSouhrn.celkem
                  ? `Všech ${lekceSouhrn.celkem} lekcí dokončeno. Zopakuj si, co chceš.`
                  : `${lekceSouhrn.dokoncene}/${lekceSouhrn.celkem} lekcí dokončeno — pokračuj ve výpravě za věděním.`}
            </span>
            {lekceSouhrn.celkem > 0 && (
              <span className="ukazatel domu-uceni__bar">
                <span
                  style={{ width: `${Math.round((lekceSouhrn.dokoncene / lekceSouhrn.celkem) * 100)}%` }}
                />
              </span>
            )}
          </span>
          <span className="domu-uceni__sipka" aria-hidden="true">→</span>
        </Link>

        {/* Denní questy */}
        <div className="panel domu__questy">
          <div className="domu__questy-hlava">
            <h2>Denní questy</h2>
            <span className="stitek">{splnenoQuestu}/{progres.questy.length || 3} splněno</span>
          </div>
          {progres.questy.length === 0 && (
            <p className="domu__prazdno">Questy se chystají… dokonči první test.</p>
          )}
          <div className="domu__questy-mrizka">
            {progres.questy.map((q) => (
              <div
                key={q.id}
                className={q.splneno ? 'domu__quest domu__quest--splneny' : 'domu__quest'}
              >
                {q.splneno && (
                  <span className="domu__quest-jiskry" aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <i key={i} style={{ '--i': i } as React.CSSProperties} />
                    ))}
                  </span>
                )}
                <div className="domu__quest-radek">
                  <span className="domu__quest-ikona" aria-hidden="true">
                    {q.splneno ? '✅' : (IKONY_QUESTU[q.sablona] ?? '⭐')}
                  </span>
                  <span className="domu__quest-popis">{q.popis}</span>
                  <span className="domu__quest-xp">+{q.odmenaXp} XP</span>
                </div>
                <div className="ukazatel domu__quest-bar">
                  <div style={{ width: `${Math.round((q.postup / q.cil) * 100)}%` }} />
                </div>
                <div className="domu__quest-postup">
                  {q.splneno ? 'Splněno!' : `${q.postup}/${q.cil}`}
                </div>
              </div>
            ))}
          </div>
          {progres.questy.length >= 3 && splnenoQuestu === progres.questy.length && (
            <p className="domu__questy-bonus animace-pop">
              Všechny questy hotové — bronzová truhla navíc je tvoje! 🎉
            </p>
          )}
        </div>
      </div>

      <div className="domu__sloupec-vedlejsi">
        {/* Výzvy od táty */}
        {aktivniVyzvy.length > 0 && (
          <div className="panel domu__vyzvy">
            <h2>Výzva od táty</h2>
            {aktivniVyzvy.map((v) => (
              <div key={v.id} className="domu__vyzva">
                <p className="domu__vyzva-zprava">„{v.zprava}“</p>
                <div className="domu__vyzva-detaily">
                  {REZIMY.find((r) => r.id === v.konfigurace.rezim)?.nazev ?? v.konfigurace.rezim}
                  {' · '}
                  {v.konfigurace.pocetOtazek} otázek
                  {v.cilovaUspesnost !== undefined &&
                    ` · cíl ${Math.round(v.cilovaUspesnost * 100)} %`}
                </div>
                <button
                  type="button"
                  className="tlacitko tlacitko--primarni domu__vyzva-tlacitko"
                  onClick={() => zacni(v.konfigurace, v.id)}
                >
                  Do toho!
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Čekající truhly */}
        {cekajiciTruhly.length > 0 && (
          <div className="panel domu__truhly">
            <h2>Truhly k otevření</h2>
            <div className="domu__truhly-rada">
              {cekajiciTruhly.map((typ, i) => (
                <button
                  key={`${typ}-${i}`}
                  type="button"
                  className={`domu__truhla-chip domu__truhla-chip--${typ}`}
                  title={`Otevřít ${NAZVY_TRUHEL[typ]} truhlu`}
                  onClick={() => {
                    setTruhlaOtevrena(false);
                    setOtviranaTruhla(typ);
                  }}
                >
                  <span className="domu__truhla-chip-vicko" />
                  <span className="domu__truhla-chip-zamek" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mini statistiky */}
        <div className="panel domu__statistiky">
          <h2>Ve zkratce</h2>
          <div className="domu__stat-mrizka">
            <div className="domu__stat">
              <div className="domu__stat-hodnota">{level.level}</div>
              <div className="domu__stat-popis">Level</div>
            </div>
            <div className="domu__stat">
              <div className="domu__stat-hodnota">{progres.dokonceneTesty}</div>
              <div className="domu__stat-popis">Testů</div>
            </div>
            <div className="domu__stat">
              <div className="domu__stat-hodnota">{velikaniZiskani}/{KARTY_VELIKANI.length}</div>
              <div className="domu__stat-popis">Velikáni</div>
            </div>
            <div className="domu__stat">
              <div className="domu__stat-hodnota">{progres.streak.nejdelsi}</div>
              <div className="domu__stat-popis">Nejdelší streak</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal — volba testu */}
      {volbaOtevrena && (
        <div className="domu__pozadi-modalu" onClick={() => setVolbaOtevrena(false)}>
          <div
            className="panel domu__modal animace-naskoceni"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Volba testu"
          >
            <div className="domu__modal-hlava">
              <h2>Nová výprava</h2>
              <button
                type="button"
                className="domu__modal-zavrit"
                onClick={() => setVolbaOtevrena(false)}
                aria-label="Zavřít"
              >
                ✕
              </button>
            </div>

            {krokVolby === 'predmet' && (
              <>
                <h3 className="domu__modal-nadpis">
                  Předmět{' '}
                  <span className="domu__modal-pozn">(klávesy 1–{Math.min(9, Math.max(1, dostupnePredmety.length))})</span>
                </h3>
                {dostupnePredmety.length === 0 && (
                  <p className="domu__prazdno">
                    Zatím tu není žádná banka otázek. Připoj se k serveru v{' '}
                    <Link to="/nastaveni">Nastavení</Link>, nebo počkej na aktualizaci aplikace.
                  </p>
                )}
                <div className="domu__predmety">
                  {dostupnePredmety.map((id, i) => (
                    <button
                      key={id}
                      type="button"
                      className={
                        id === predmetId ? 'domu__predmet domu__predmet--vybrany' : 'domu__predmet'
                      }
                      onClick={() => vyberPredmet(id)}
                    >
                      <span className="domu__predmet-ikona" aria-hidden="true">
                        {ikonaPredmetu(id)}
                      </span>
                      <span className="domu__predmet-nazev">
                        {nazevPredmetu(id, banky[id]?.nazev)}
                      </span>
                      {i < 9 && (
                        <span className="domu__predmet-klavesa" aria-hidden="true">
                          {i + 1}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {krokVolby === 'volby' && predmetId && (
              <>
                <div className="domu__modal-predmet">
                  <span className="domu__modal-predmet-ikona" aria-hidden="true">
                    {ikonaPredmetu(predmetId)}
                  </span>
                  <span className="domu__modal-predmet-nazev">
                    {nazevPredmetu(predmetId, banky[predmetId]?.nazev)}
                  </span>
                  {dostupnePredmety.length > 1 && (
                    <button
                      type="button"
                      className="tlacitko domu__modal-predmet-zmenit"
                      onClick={() => setKrokVolby('predmet')}
                    >
                      ← Změnit předmět
                    </button>
                  )}
                </div>

                <h3 className="domu__modal-nadpis">Režim</h3>
                <div className="domu__rezimy">
                  {REZIMY.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className={rezim === r.id ? 'domu__rezim domu__rezim--vybrany' : 'domu__rezim'}
                      onClick={() => setRezim(r.id)}
                    >
                      <span className="domu__rezim-emoji" aria-hidden="true">{r.emoji}</span>
                      <span className="domu__rezim-nazev">{r.nazev}</span>
                      <span className="domu__rezim-popis">{r.popis}</span>
                    </button>
                  ))}
                </div>

                <h3 className="domu__modal-nadpis">Počet otázek</h3>
                <div className="domu__pocty">
                  {POCTY.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={pocet === p ? 'domu__pocet domu__pocet--vybrany' : 'domu__pocet'}
                      onClick={() => setPocet(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                {temata.length > 0 && (
                  <>
                    <h3 className="domu__modal-nadpis">
                      Témata{' '}
                      <span className="domu__modal-pozn">
                        ({vybranaTemata.length === 0 ? 'všechna' : `${vybranaTemata.length} vybráno`})
                      </span>
                    </h3>
                    <div className="domu__temata">
                      {temata.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className={
                            vybranaTemata.includes(t.id)
                              ? 'domu__tema domu__tema--vybrane'
                              : 'domu__tema'
                          }
                          onClick={() => prepniTema(t.id)}
                        >
                          {t.nazev}
                          {temataSLekci.has(t.id) && (
                            <span title="K tématu je lekce v Učit se" aria-label="(má lekci)"> 📖</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  className="tlacitko tlacitko--zlate domu__modal-start"
                  onClick={zacniZVolby}
                >
                  Jdeme na to!
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal — otevírání čekající truhly */}
      {otviranaTruhla && (
        <div
          className="domu__pozadi-modalu"
          onClick={() => truhlaOtevrena && setOtviranaTruhla(null)}
        >
          <div className="panel domu__modal domu__modal--truhla" onClick={(e) => e.stopPropagation()}>
            <TruhlaOdmena typ={otviranaTruhla} onOtevreno={() => setTruhlaOtevrena(true)} />
            {truhlaOtevrena && (
              <button
                type="button"
                className="tlacitko tlacitko--primarni domu__modal-start"
                onClick={() => setOtviranaTruhla(null)}
              >
                Pokračovat
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
