// Statistiky — nahoře globální gamifikační řádek (level, XP, streak, sbírka
// — identita je jedna) a rekordy; pod tím přepínač studijní banky (výchozí
// aktivní) a K NÍ filtrované panely: témata (úspěšnost + zvládnutí), týdenní
// XP (z průběžného agregátu per banka) a poslední testy banky.
import { useMemo, useState } from 'react';
import type { RezimTestu } from '@questor/sdilene';
import { denZData, pondeliTydne, stavLevelu } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { aktivniPredmetProfilu, najdiAktivniProfil, predmetyProfilu } from '../stav/profilySlice';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import { testyBanky, tydenniXpBanky } from './statistikyVypocty';
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
  const tydenniXpTestuPodleBank = pouzijStav((s) => s.tydenniXpTestuPodleBank);
  const profil = pouzijStav((s) => najdiAktivniProfil(s));

  const level = stavLevelu(progres.xp);

  // Přepínač studijní banky — banky PROFILU v pořadí registru, výchozí AKTIVNÍ.
  const predmety = useMemo(() => predmetyProfilu(profil), [profil]);
  const aktivniPredmet = aktivniPredmetProfilu(profil);
  const [vybranyTab, setVybranyTab] = useState<string | null>(null);
  const vybranyPredmet =
    vybranyTab && predmety.includes(vybranyTab) ? vybranyTab : (aktivniPredmet ?? predmety[0] ?? null);

  // Posledních 8 týdnů pro sloupcový graf — XP z testů VYBRANÉ banky
  // (průběžný agregát z hraSlice; globální týdenní XP zůstává v rekordech).
  const tydenniXpVybrane = useMemo(
    () => tydenniXpBanky(tydenniXpTestuPodleBank, vybranyPredmet),
    [tydenniXpTestuPodleBank, vybranyPredmet],
  );
  const tydny = useMemo(() => {
    const tentoTyden = pondeliTydne(denZData(new Date()));
    const vysledek: { pondeli: string; xp: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(`${tentoTyden}T12:00:00`);
      d.setDate(d.getDate() - i * 7);
      const klic = denZData(d);
      vysledek.push({ pondeli: klic, xp: tydenniXpVybrane[klic] ?? 0 });
    }
    return vysledek;
  }, [tydenniXpVybrane]);
  const maxTydenniXp = Math.max(1, ...tydny.map((t) => t.xp));

  // Poslední testy VYBRANÉ banky (podle konfigurace.predmetId).
  const historieBanky = useMemo(
    () => testyBanky(historieTestu, vybranyPredmet),
    [historieTestu, vybranyPredmet],
  );

  // Statistiky po tématech vybraného předmětu.
  const temata = useMemo(() => {
    const banka = vybranyPredmet ? banky[vybranyPredmet] : undefined;
    if (!banka) return [] as TemaStatistika[];
    const mapa = new Map<string, TemaStatistika & { spravne: number; celkem: number; otazek: number; zvladnuto: number }>();
    for (const tema of banka.temata) {
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
    return [...mapa.values()].map((t) => ({
      id: t.id,
      nazev: t.nazev,
      uspesnost: t.celkem > 0 ? t.spravne / t.celkem : null,
      zvladnuti: t.otazek > 0 ? t.zvladnuto / t.otazek : 0,
    }));
  }, [banky, vybranyPredmet, progres.statistikyOtazek]);

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

      {/* Globální gamifikační řádek — level, XP, streak, sbírka jsou JEDNY
          napříč všemi bankami (identita hráče se přepínáním banky nemění). */}
      <div className="panel statistiky__globalni">
        <div className="statistiky__rekordy-mrizka statistiky__globalni-mrizka">
          <div className="statistiky__rekord">
            <span className="statistiky__rekord-ikona" aria-hidden="true">🏅</span>
            <span className="statistiky__rekord-hodnota">{level.level}</span>
            <span className="statistiky__rekord-popis">Level</span>
          </div>
          <div className="statistiky__rekord">
            <span className="statistiky__rekord-ikona" aria-hidden="true">⭐</span>
            <span className="statistiky__rekord-hodnota">{progres.xp}</span>
            <span className="statistiky__rekord-popis">Celkem XP</span>
          </div>
          <div className="statistiky__rekord">
            <span className="statistiky__rekord-ikona" aria-hidden="true">🔥</span>
            <span className="statistiky__rekord-hodnota">{progres.streak.aktualni} dní</span>
            <span className="statistiky__rekord-popis">Streak</span>
          </div>
          <div className="statistiky__rekord">
            <span className="statistiky__rekord-ikona" aria-hidden="true">🃏</span>
            <span className="statistiky__rekord-hodnota">{progres.sbirka.karty.length}</span>
            <span className="statistiky__rekord-popis">Sbírka karet</span>
          </div>
        </div>
      </div>

      {/* Přepínač studijní banky — všechno níž je filtrované na vybranou. */}
      {predmety.length > 1 && (
        <div className="statistiky__taby statistiky__prepinac" role="tablist" aria-label="Studijní banky">
          {predmety.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={id === vybranyPredmet}
              className={
                id === vybranyPredmet
                  ? 'statistiky__tab statistiky__tab--aktivni'
                  : 'statistiky__tab'
              }
              onClick={() => setVybranyTab(id)}
            >
              <span aria-hidden="true">{ikonaPredmetu(id)}</span>{' '}
              {nazevPredmetu(id, banky[id]?.nazev)}
              {id === aktivniPredmet && <span aria-hidden="true"> ●</span>}
            </button>
          ))}
        </div>
      )}
      {predmety.length === 1 && vybranyPredmet && (
        <p className="statistiky__tema-predmet">
          <span aria-hidden="true">{ikonaPredmetu(vybranyPredmet)}</span>{' '}
          {nazevPredmetu(vybranyPredmet, banky[vybranyPredmet]?.nazev)}
        </p>
      )}

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

        {/* Týdenní XP vybrané banky (průběžný agregát per banka) */}
        <div className="panel statistiky__tydny">
          <h2>Týdenní XP z testů</h2>
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

        {/* Témata vybrané banky */}
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

        {/* Historie testů vybrané banky */}
        <div className="panel statistiky__historie">
          <h2>Poslední testy</h2>
          {historieBanky.length === 0 ? (
            <p className="statistiky__prazdno">
              {historieTestu.length === 0
                ? 'Ještě žádný test. Tak na co čekáš? 😉'
                : 'Z téhle banky zatím žádný test v poslední historii.'}
            </p>
          ) : (
            /* Obal s overflow-x: auto — na úzké obrazovce scrolluje tabulka
               uvnitř panelu, stránka se do šířky nehýbe. */
            <div className="statistiky__tabulka-obal">
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
                {historieBanky.map((v) => (
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
