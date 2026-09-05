// Vysledkova obrazovka hotoveho duelu — dramaticke odhaleni:
// nastup hracu → napocitani skore proti sobe → vitezna fanfara s konfetami
// (nebo povzbuzeni porazenemu), pak casova osa po otazkach (kdo rychleji
// spravne), celkove casy a oslava novych titulu z trofejni vitriny.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Duel, OdpovedDuelu } from '@questor/sdilene';
import { vysledekProHrace, type VysledekUcastnika } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import Avatar from '../hra/Avatar';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import { formatujCelkovyCas, souperVDuelu } from './pomocne';
import './Duely.css';

/** Plynule napocitani cisla od 0 k cili (drama count-up). */
function usePocitadlo(cil: number, bezi: boolean, trvaniMs = 1100): number {
  const [hodnota, setHodnota] = useState(0);
  useEffect(() => {
    if (!bezi) return;
    if (cil <= 0) {
      setHodnota(0);
      return;
    }
    const start = performance.now();
    let ram = 0;
    const krok = (ted: number) => {
      const podil = Math.min(1, (ted - start) / trvaniMs);
      // ease-out — konec napocitani zpomali (napeti pred odhalenim).
      setHodnota(Math.round(cil * (1 - Math.pow(1 - podil, 3))));
      if (podil < 1) ram = requestAnimationFrame(krok);
    };
    ram = requestAnimationFrame(krok);
    return () => cancelAnimationFrame(ram);
  }, [cil, bezi, trvaniMs]);
  return bezi ? hodnota : 0;
}

const BARVY_KONFET = [
  'var(--zlata)',
  'var(--akcent)',
  'var(--akcent-svetly)',
  'var(--uspech)',
  'var(--info)',
];

interface Konfeta {
  dx: number;
  dy: number;
  rot: number;
  barva: string;
  zpozdeni: number;
}

function vygenerujKonfety(pocet: number): Konfeta[] {
  return Array.from({ length: pocet }, (_, i) => ({
    dx: Math.round((Math.random() - 0.5) * 420),
    dy: Math.round(-80 - Math.random() * 220),
    rot: Math.round((Math.random() - 0.5) * 720),
    barva: BARVY_KONFET[i % BARVY_KONFET.length],
    zpozdeni: Math.random() * 0.2,
  }));
}

type Faze = 'nastup' | 'skore' | 'odhaleni';

export default function DuelVysledek({ duel, profilId }: { duel: Duel; profilId: string }) {
  const mojeJmeno = pouzijStav(
    (s) => s.profily.find((p) => p.id === profilId)?.jmeno ?? 'Ty',
  );
  const mujAvatar = pouzijStav((s) => s.progres.avatar);
  const trofeje = pouzijStav((s) => s.progres.trofeje);
  const noveTituly = pouzijStav((s) => s.noveTituly);
  const oznacTitulyZaVidene = pouzijStav((s) => s.oznacTitulyZaVidene);

  const souper = souperVDuelu(duel, profilId);
  const souperuvAvatar = pouzijStav((s) =>
    souper ? s.dataProfilu[souper.profilId]?.progres.avatar : undefined,
  );

  // Tituly k oslave zachytit pri prvnim renderu, pak oznacit za videne.
  const [titulyKOslave] = useState<string[]>(() => noveTituly);
  useEffect(() => {
    oznacTitulyZaVidene();
  }, [oznacTitulyZaVidene]);

  const muj = duel.vysledky[profilId];
  const souperuv = souper ? duel.vysledky[souper.profilId] : undefined;
  const vysledek: VysledekUcastnika = vysledekProHrace(duel.vitezProfilId ?? null, profilId);

  // Rezie dramatu: nastup → napocitani skore → odhaleni viteze.
  const [faze, setFaze] = useState<Faze>('nastup');
  const [konfety, setKonfety] = useState<Konfeta[]>([]);
  const casovace = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    casovace.current.push(setTimeout(() => setFaze('skore'), 700));
    casovace.current.push(
      setTimeout(() => {
        setFaze('odhaleni');
      }, 2100),
    );
    return () => casovace.current.forEach(clearTimeout);
  }, []);
  useEffect(() => {
    if (faze === 'odhaleni' && vysledek === 'vyhra') setKonfety(vygenerujKonfety(36));
  }, [faze, vysledek]);

  const mojeBody = usePocitadlo(muj?.body ?? 0, faze !== 'nastup');
  const souperovyBody = usePocitadlo(souperuv?.body ?? 0, faze !== 'nastup');

  // Casova osa po otazkach: kdo odpovedel rychleji spravne.
  const mojeOdpovedi = useMemo(() => mapaOdpovedi(muj?.odpovedi), [muj]);
  const souperovyOdpovedi = useMemo(() => mapaOdpovedi(souperuv?.odpovedi), [souperuv]);

  const bilance = souper ? trofeje?.dvojice[souper.profilId] : undefined;

  return (
    <section className="duel-hrani" aria-label="Výsledek duelu">
      <div className={`panel duel-vysledek duel-vysledek--${faze}`}>
        {konfety.length > 0 && (
          <div className="duel-konfety" aria-hidden="true">
            {konfety.map((k, i) => (
              <span
                key={i}
                className="duel-konfeta"
                style={
                  {
                    '--dx': `${k.dx}px`,
                    '--dy': `${k.dy}px`,
                    '--rot': `${k.rot}deg`,
                    '--zpozdeni': `${k.zpozdeni}s`,
                    background: k.barva,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        )}

        <div className="duel-intro__obor">
          {ikonaPredmetu(duel.predmetId)} {nazevPredmetu(duel.predmetId)} · {duel.pocetOtazek} otázek
        </div>

        <div className="duel-vysledek__vs">
          <div
            className={`duel-vysledek__hrac${faze === 'odhaleni' && vysledek === 'vyhra' ? ' duel-vysledek__hrac--vitez' : ''}`}
          >
            <Avatar konfigurace={mujAvatar} velikost={72} />
            <div className="duel-intro__jmeno">{mojeJmeno}</div>
            <div className="duel-vysledek__body">{mojeBody}</div>
            {muj && <div className="duel-vysledek__cas">⏱ {formatujCelkovyCas(muj.celkovyCasMs)}</div>}
            {!muj && <div className="duel-vysledek__cas">nehráno</div>}
          </div>
          <div className="duel-intro__blesk" aria-hidden="true">VS</div>
          <div
            className={`duel-vysledek__hrac${faze === 'odhaleni' && vysledek === 'prohra' ? ' duel-vysledek__hrac--vitez' : ''}`}
          >
            {souperuvAvatar ? (
              <Avatar konfigurace={souperuvAvatar} velikost={72} />
            ) : (
              <div className="duel-intro__silueta" aria-hidden="true">
                {(souper?.jmeno ?? '?').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="duel-intro__jmeno">{souper?.jmeno ?? '???'}</div>
            <div className="duel-vysledek__body">{souperovyBody}</div>
            {souperuv && (
              <div className="duel-vysledek__cas">⏱ {formatujCelkovyCas(souperuv.celkovyCasMs)}</div>
            )}
            {!souperuv && <div className="duel-vysledek__cas">nehráno</div>}
          </div>
        </div>

        {faze === 'odhaleni' && (
          <div className="duel-vysledek__verdikt animace-pop">
            {vysledek === 'vyhra' && (
              <>
                <div className="duel-vysledek__titulek duel-vysledek__titulek--vyhra">
                  🏆 VÍTĚZSTVÍ!
                </div>
                <p>
                  {duel.stav === 'vyprsely' && !souperuv
                    ? 'Soupeř nestihl odehrát do 24 hodin — výhra kontumačně. I tak se počítá!'
                    : muj && souperuv && muj.body === souperuv.body
                      ? 'Stejné body, ale ty jsi byl(a) rychlejší. O vítězi rozhodly vteřiny!'
                      : 'Přesnost + rychlost = neporazitelná kombinace.'}
                </p>
              </>
            )}
            {vysledek === 'prohra' && (
              <>
                <div className="duel-vysledek__titulek">Tentokrát to nevyšlo.</div>
                <p>
                  {souper?.jmeno ?? 'Soupeř'} byl(a) tentokrát lepší. Mrkni na časovou osu, kde se
                  duel zlomil — a vyzvi na odvetu! 💪
                </p>
              </>
            )}
            {vysledek === 'remiza' && (
              <>
                <div className="duel-vysledek__titulek">🤝 Remíza!</div>
                <p>Naprosto vyrovnaný souboj. Odveta to rozsekne.</p>
              </>
            )}
            {bilance && souper && (
              <p className="duel-vysledek__bilance">
                Vzájemná bilance s {souper.jmeno}: {bilance.vyhry}–{bilance.prohry}
                {bilance.remizy > 0 ? `–${bilance.remizy}` : ''}
                {bilance.serieVyher >= 2 ? ` · 🔥 série ${bilance.serieVyher} výher` : ''}
              </p>
            )}
          </div>
        )}

        {faze === 'odhaleni' && titulyKOslave.length > 0 && (
          <div className="duel-tituly animace-pop">
            <div className="duel-tituly__titulek">👑 Nový titul!</div>
            {titulyKOslave.map((titul) => (
              <div key={titul} className="duel-titul">
                {titul}
              </div>
            ))}
            <p className="duel-tituly__pozn">Najdeš ho v trofejní vitríně ve Sbírce.</p>
          </div>
        )}

        {faze === 'odhaleni' && (
          <div className="duel-vysledek__akce">
            <Link to="/duely" className="tlacitko tlacitko--primarni">
              Zpět na duely
            </Link>
            <Link to="/sbirka" className="tlacitko">
              🏆 Trofejní vitrína
            </Link>
          </div>
        )}
      </div>

      {faze === 'odhaleni' && (muj || souperuv) && (
        <div className="panel duel-osa animace-naskoceni">
          <h2>Otázka po otázce</h2>
          <p className="duel-osa__legenda">⚡ = správně a rychleji než soupeř</p>
          <div className="duel-osa__tabulka">
            <div className="duel-osa__radek duel-osa__radek--hlava">
              <span>#</span>
              <span>{mojeJmeno}</span>
              <span>{souper?.jmeno ?? '???'}</span>
            </div>
            {duel.otazkyIds.map((otazkaId, i) => {
              const moje = mojeOdpovedi.get(otazkaId);
              const jeho = souperovyOdpovedi.get(otazkaId);
              return (
                <div key={otazkaId} className="duel-osa__radek">
                  <span className="duel-osa__cislo">{i + 1}</span>
                  <BunkaOdpovedi odpoved={moje} rychlejsi={jeRychlejsiSpravna(moje, jeho)} />
                  <BunkaOdpovedi odpoved={jeho} rychlejsi={jeRychlejsiSpravna(jeho, moje)} />
                </div>
              );
            })}
            <div className="duel-osa__radek duel-osa__radek--soucet">
              <span>Σ</span>
              <span>
                {muj ? `${muj.body} b · ${formatujCelkovyCas(muj.celkovyCasMs)}` : '—'}
              </span>
              <span>
                {souperuv
                  ? `${souperuv.body} b · ${formatujCelkovyCas(souperuv.celkovyCasMs)}`
                  : '—'}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function mapaOdpovedi(odpovedi: OdpovedDuelu[] | undefined): Map<string, OdpovedDuelu> {
  return new Map((odpovedi ?? []).map((o) => [o.otazkaId, o]));
}

/** Spravne a rychleji nez druhy (nebo druhy vubec spravne neodpovedel). */
function jeRychlejsiSpravna(
  moje: OdpovedDuelu | undefined,
  jeho: OdpovedDuelu | undefined,
): boolean {
  if (!moje?.spravne) return false;
  if (!jeho?.spravne) return true;
  return moje.casMs < jeho.casMs;
}

function BunkaOdpovedi({
  odpoved,
  rychlejsi,
}: {
  odpoved: OdpovedDuelu | undefined;
  rychlejsi: boolean;
}) {
  if (!odpoved) return <span className="duel-osa__bunka duel-osa__bunka--chybi">—</span>;
  const sekundy = (odpoved.casMs / 1000).toFixed(1).replace('.', ',');
  return (
    <span
      className={`duel-osa__bunka ${odpoved.spravne ? 'duel-osa__bunka--spravne' : 'duel-osa__bunka--spatne'}`}
    >
      {odpoved.spravne ? '✓' : '✗'} {sekundy} s{rychlejsi ? ' ⚡' : ''}
      {odpoved.pouzityPowerup ? ' ✨' : ''}
    </span>
  );
}
