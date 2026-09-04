// Statistiky — rekordy, týdenní XP graf, témata a historie testů. VLASTNÍ agent APP-HRA.
import { useMemo } from 'react';
import type { RezimTestu } from '@questor/sdilene';
import { denZData, pondeliTydne, stavLevelu } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import './Statistiky.css';

const NAZVY_REZIMU: Record<RezimTestu, string> = {
  rozcvicka: 'Rozcvička',
  standard: 'Standard',
  hardcore: 'Hardcore',
  adaptivni: 'Adaptivní',
  zkouska: 'Zkouška',
};

function procenta(x: number): string {
  return `${Math.round(x * 100)} %`;
}

function formatujCas(ms: number): string {
  const s = Math.round(ms / 1000);
  const min = Math.floor(s / 60);
  const zbytek = s % 60;
  return `${min}:${String(zbytek).padStart(2, '0')}`;
}

function formatujDatum(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${d.getMonth() + 1}.`;
}

interface TemaStatistika {
  id: string;
  nazev: string;
  uspesnost: number | null;
  zvladnuti: number;
}

export default function Statistiky() {
  const progres = pouzijStav((s) => s.progres);
  const banky = pouzijStav((s) => s.banky);
  const historieTestu = pouzijStav((s) => s.historieTestu);

  const level = stavLevelu(progres.xp);

  // Posledních 8 týdnů pro sloupcový graf.
  const tydny = useMemo(() => {
    const tentoTyden = pondeliTydne(denZData(new Date()));
    const vysledek: { pondeli: string; xp: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(`${tentoTyden}T12:00:00`);
      d.setDate(d.getDate() - i * 7);
      const klic = denZData(d);
      vysledek.push({ pondeli: klic, xp: progres.rekordy.tydenniXp[klic] ?? 0 });
    }
    return vysledek;
  }, [progres.rekordy.tydenniXp]);
  const maxTydenniXp = Math.max(1, ...tydny.map((t) => t.xp));

  // Statistiky po tématech (napříč bankami, dedup podle id tématu).
  const temata = useMemo(() => {
    const mapa = new Map<string, TemaStatistika & { spravne: number; celkem: number; otazek: number; zvladnuto: number }>();
    for (const banka of Object.values(banky)) {
      for (const tema of banka.temata) {
        if (!mapa.has(tema.id)) {
          mapa.set(tema.id, {
            id: tema.id,
            nazev: tema.nazev,
            uspesnost: null,
            zvladnuti: 0,
            spravne: 0,
            celkem: 0,
            otazek: 0,
            zvladnuto: 0,
          });
        }
      }
      for (const otazka of banka.otazky) {
        const t = mapa.get(otazka.temaId);
        if (!t) continue;
        t.otazek += 1;
        const stat = progres.statistikyOtazek[otazka.id];
        if (stat) {
          t.spravne += stat.spravneCelkem;
          t.celkem += stat.spravneCelkem + stat.spatneCelkem;
          if (stat.box >= 3) t.zvladnuto += 1;
        }
      }
    }
    return [...mapa.values()].map((t) => ({
      id: t.id,
      nazev: t.nazev,
      uspesnost: t.celkem > 0 ? t.spravne / t.celkem : null,
      zvladnuti: t.otazek > 0 ? t.zvladnuto / t.otazek : 0,
    }));
  }, [banky, progres.statistikyOtazek]);

  const rekordy: { popis: string; hodnota: string; ikona: string }[] = [
    { popis: 'Nejlepší úspěšnost', hodnota: procenta(progres.rekordy.nejlepsiUspesnost), ikona: '🎯' },
    { popis: 'Nejdelší combo', hodnota: `×${progres.rekordy.nejdelsiCombo}`, ikona: '⚡' },
    {
      popis: 'Nejrychlejší bezchybný',
      hodnota:
        progres.rekordy.nejrychlejsiBezchybnyMs !== null
          ? formatujCas(progres.rekordy.nejrychlejsiBezchybnyMs)
          : '—',
      ikona: '⏱️',
    },
    { popis: 'Nejdelší streak', hodnota: `${progres.streak.nejdelsi} dní`, ikona: '🔥' },
    { popis: 'Dokončené testy', hodnota: String(progres.dokonceneTesty), ikona: '📝' },
    { popis: 'Celkem XP', hodnota: `${progres.xp} (lvl ${level.level})`, ikona: '⭐' },
  ];

  return (
    <section className="statistiky">
      <h1>Statistiky</h1>

      <div className="statistiky__mrizka">
        {/* Rekordy */}
        <div className="panel statistiky__rekordy">
          <h2>Rekordy</h2>
          <div className="statistiky__rekordy-mrizka">
            {rekordy.map((r) => (
              <div key={r.popis} className="statistiky__rekord">
                <span className="statistiky__rekord-ikona" aria-hidden="true">{r.ikona}</span>
                <span className="statistiky__rekord-hodnota">{r.hodnota}</span>
                <span className="statistiky__rekord-popis">{r.popis}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Týdenní XP */}
        <div className="panel statistiky__tydny">
          <h2>Týdenní XP</h2>
          <div className="statistiky__graf" role="img" aria-label="Sloupcový graf XP za posledních 8 týdnů">
            {tydny.map((t, i) => (
              <div key={t.pondeli} className="statistiky__sloupec-blok">
                <span className="statistiky__sloupec-hodnota">{t.xp > 0 ? t.xp : ''}</span>
                <div
                  className={
                    i === tydny.length - 1
                      ? 'statistiky__sloupec statistiky__sloupec--aktualni'
                      : 'statistiky__sloupec'
                  }
                  style={{ height: `${Math.max(4, Math.round((t.xp / maxTydenniXp) * 100))}%` }}
                  title={`Týden od ${formatujDatum(`${t.pondeli}T12:00:00`)}: ${t.xp} XP`}
                />
                <span className="statistiky__sloupec-popis">{formatujDatum(`${t.pondeli}T12:00:00`)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Témata */}
        <div className="panel statistiky__temata">
          <h2>Témata</h2>
          {temata.length === 0 && (
            <p className="statistiky__prazdno">Zatím žádná data — banka otázek se teprve načte.</p>
          )}
          {temata.map((t) => (
            <div key={t.id} className="statistiky__tema">
              <div className="statistiky__tema-hlava">
                <span className="statistiky__tema-nazev">{t.nazev}</span>
                <span className="statistiky__tema-cisla">
                  úspěšnost {t.uspesnost !== null ? procenta(t.uspesnost) : '—'} · zvládnutí{' '}
                  {procenta(t.zvladnuti)}
                </span>
              </div>
              <div className="ukazatel statistiky__tema-bar" title={`Úspěšnost odpovědí: ${t.uspesnost !== null ? procenta(t.uspesnost) : 'zatím nic'}`}>
                <div style={{ width: `${Math.round((t.uspesnost ?? 0) * 100)}%` }} />
              </div>
              <div className="ukazatel ukazatel--zlaty statistiky__tema-bar" title={`Zvládnutí tématu (otázky v boxu 3+): ${procenta(t.zvladnuti)}`}>
                <div style={{ width: `${Math.round(t.zvladnuti * 100)}%` }} />
              </div>
            </div>
          ))}
          {temata.length > 0 && (
            <p className="statistiky__legenda">
              <span className="statistiky__legenda-fialova" /> úspěšnost odpovědí ·{' '}
              <span className="statistiky__legenda-zlata" /> zvládnutí (Leitner box 3+)
            </p>
          )}
        </div>

        {/* Historie testů */}
        <div className="panel statistiky__historie">
          <h2>Poslední testy</h2>
          {historieTestu.length === 0 ? (
            <p className="statistiky__prazdno">Ještě žádný test. Tak na co čekáš? 😉</p>
          ) : (
            <table className="statistiky__tabulka">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Režim</th>
                  <th>Otázek</th>
                  <th>Úspěšnost</th>
                  <th>XP</th>
                  <th>Combo</th>
                </tr>
              </thead>
              <tbody>
                {historieTestu.map((v) => (
                  <tr key={v.id}>
                    <td>{formatujDatum(v.konec)}</td>
                    <td>{NAZVY_REZIMU[v.konfigurace.rezim]}</td>
                    <td>{v.odpovedi.length}</td>
                    <td
                      className={
                        v.uspesnost >= 0.7
                          ? 'statistiky__uspesnost--dobra'
                          : v.uspesnost < 0.5
                            ? 'statistiky__uspesnost--slaba'
                            : ''
                      }
                    >
                      {procenta(v.uspesnost)}
                    </td>
                    <td className="statistiky__xp">+{v.ziskaneXp}</td>
                    <td>×{v.nejdelsiCombo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}
