// Domovská stránka — herní dashboard. VLASTNÍ agent APP-HRA.
// HUD je v hlavičce (App.tsx); tady: velké HRÁT, denní questy, čekající truhly,
// výzvy od táty a mini statistiky. Vše bez scrollu na 1080p.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RezimTestu, TestKonfigurace, TruhlaTyp } from '@questor/sdilene';
import { KARTY_VELIKANI, stavLevelu } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import TruhlaOdmena from '../hra/TruhlaOdmena';
import './Domu.css';

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
  const [rezim, setRezim] = useState<RezimTestu>('standard');
  const [pocet, setPocet] = useState<5 | 10 | 20>(10);
  const [vybranaTemata, setVybranaTemata] = useState<string[]>([]);
  const [otviranaTruhla, setOtviranaTruhla] = useState<TruhlaTyp | null>(null);
  const [truhlaOtevrena, setTruhlaOtevrena] = useState(false);

  const predmetId = Object.keys(banky)[0] ?? 'ekonomika-podnikani';
  const temata = useMemo(
    () => (banky[predmetId]?.temata ?? []).slice().sort((a, b) => a.poradi - b.poradi),
    [banky, predmetId],
  );

  const prepniTema = (id: string) => {
    setVybranaTemata((v) => (v.includes(id) ? v.filter((t) => t !== id) : [...v, id]));
  };

  const zacni = (konfigurace: TestKonfigurace, vyzvaId?: string) => {
    spustTest(konfigurace, vyzvaId);
    navigate('/test');
  };

  const zacniZVolby = () => {
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
            onClick={() => setVolbaOtevrena(true)}
          >
            ▶ HRÁT
          </button>
        </div>

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
