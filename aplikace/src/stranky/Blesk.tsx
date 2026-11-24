// Start bleskovek (/blesk) — VLASTNÍ agent APP-TESTY. Líná stránka (App.tsx).
// Bleskovky = rychlý dril nad otázkami s krátkými možnostmi (hlavně pravopis:
// doplň i/y). Tady se volí banka (jen banky profilu s aspoň MIN_BLESKOVYCH
// bleskovými otázkami; předvolená aktivní), témata (čipy, víc najednou;
// výchozí „Vše“ = míchané kolo — doporučené) se zvládnutím a délka 10 / 20.
// Parametry /blesk?predmet=<id>&tema=<temaId> předvyberou. Po „⚡ Spustit“
// se kolo založí a stránka přesměruje na /test (replace — Zpět nevede zpátky
// sem). Rozehraný test z dřívějška (i z jiné banky) start NEUNÁŠÍ: jen se
// nabídne k pokračování a nové kolo ho nahradí.
// Čisté výpočty jsou v testy/blesk.ts a testy/bleskStart.ts.
import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { denZData } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { aktivniPredmetProfilu, najdiAktivniProfil, predmetyProfilu } from '../stav/profilySlice';
import { ikonaPredmetu, nazevPredmetu, PREDMETY, type PredmetMetadata } from '../data/predmety';
import { pouzijObsahNacten } from '../data/pouzijObsahNacten';
import {
  bleskoveOtazky,
  bylaDnesTruhlaZBlesku,
  maBleskovky,
  MIN_BLESKOVYCH,
  POCTY_BLESK,
  temataBlesku,
  zvladnutiOtazek,
  type PocetBlesk,
  type TemaBlesku,
} from '../testy/blesk';
import {
  bankaSTematemBlesku,
  bankySBleskovkami,
  platnaTemata,
  pocetDostupnychOtazek,
  prepniTemaVyberu,
  rozehranyTest,
  slovyBleskoveOtazky,
  temataProKolo,
  vychoziBankaBlesku,
} from '../testy/bleskStart';
import './Blesk.css';

function procenta(podil: number): string {
  return `${Math.round(podil * 100)} %`;
}

/**
 * Přátelský prázdný stav: žádná banka profilu bleskovky nenabízí. Když je má
 * banka, kterou profil zatím nestuduje (`kPridani`), rovnou ji nabídne
 * k přidání — po přidání se start ukáže sám.
 */
export function BleskBezBanky({
  kPridani,
  onPridat,
}: {
  kPridani: PredmetMetadata[];
  onPridat(predmetId: string): void;
}) {
  return (
    <section className="blesk-start" aria-label="Bleskovky">
      <h1 className="blesk-start__titulek">⚡ Bleskovky</h1>
      <div className="panel blesk-start__prazdno">
        <span className="blesk-start__prazdno-znak" aria-hidden="true">⚡</span>
        <p>
          Bleskovky jsou rychlý dril pro banky s krátkými odpověďmi — třeba pravopis, kde jen
          doplníš i nebo y. Žádná z tvých bank zatím aspoň {MIN_BLESKOVYCH} takových otázek nemá.
        </p>
        {kPridani.length > 0 && (
          <div className="blesk-start__volby blesk-start__volby--stred">
            {kPridani.map((p) => (
              <button
                key={p.id}
                type="button"
                className="tlacitko tlacitko--primarni"
                onClick={() => onPridat(p.id)}
              >
                {p.ikona} Přidat banku {p.nazev}
              </button>
            ))}
          </div>
        )}
        <div className="blesk-start__volby blesk-start__volby--stred">
          <Link to="/" className="tlacitko">
            ← Zpět domů
          </Link>
          <Link to="/nastaveni" className="tlacitko">
            Studijní banky v Nastavení
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Blesk() {
  const aktualniTest = pouzijStav((s) => s.aktualniTest);
  const banky = pouzijStav((s) => s.banky);
  const statistiky = pouzijStav((s) => s.progres.statistikyOtazek);
  const historieTestu = pouzijStav((s) => s.historieTestu);
  const profil = pouzijStav((s) => najdiAktivniProfil(s));
  const zacniBlesk = pouzijStav((s) => s.zacniBlesk);
  const pridejPredmetProfilu = pouzijStav((s) => s.pridejPredmetProfilu);
  const [parametry] = useSearchParams();

  // Banky chodí po startu async (data/nacteniObsahu.ts) — prázdný stav se
  // smí ukázat až po doběhnutí načítání, ne při studeném startu na /blesk.
  const obsahNacten = pouzijObsahNacten();

  const bankyProfilu = useMemo(() => predmetyProfilu(profil), [profil]);
  const dostupne = useMemo(() => bankySBleskovkami(banky, bankyProfilu), [banky, bankyProfilu]);
  const temataBank = useMemo(() => {
    const mapa: Record<string, TemaBlesku[]> = {};
    for (const id of dostupne) mapa[id] = temataBlesku(banky[id], statistiky);
    return mapa;
  }, [dostupne, banky, statistiky]);

  const pozadovaneTema = parametry.get('tema');
  const [vybranyPredmet, setVybranyPredmet] = useState<string | null>(null);
  const predmetId = vychoziBankaBlesku({
    dostupne,
    vybrana: vybranyPredmet,
    pozadovana: parametry.get('predmet'),
    bankaTematu: bankaSTematemBlesku(dostupne, temataBank, pozadovaneTema),
    aktivni: aktivniPredmetProfilu(profil),
  });

  // Výběr témat patří k bance: dokud student u banky nic nezvolil, platí
  // předvolba z ?tema= (téma, které banka nemá, se tiše zahodí → „Vše“).
  const [vyberTemat, setVyberTemat] = useState<{ predmetId: string; temata: string[] } | null>(null);
  const [pocet, setPocet] = useState<PocetBlesk>(10);
  const [nejdeSpustit, setNejdeSpustit] = useState(false);
  // Přesměrování na /test patří jen kolu, které student spustil TADY.
  const [spusteno, setSpusteno] = useState(false);

  const temata = predmetId ? (temataBank[predmetId] ?? []) : [];
  const vybrana = platnaTemata(
    temata,
    vyberTemat && vyberTemat.predmetId === predmetId
      ? vyberTemat.temata
      : pozadovaneTema
        ? [pozadovaneTema]
        : [],
  );

  // Právě založené kolo → rovnou do něj. Dřív rozehraný test (i nedohrané
  // kolo) sem jen přidá upozornění s „Pokračovat“ — nikdy nepřesměrovává.
  if (spusteno && aktualniTest) return <Navigate to="/test" replace />;
  const rozehrany = rozehranyTest(aktualniTest);

  if (!predmetId) {
    if (!obsahNacten) {
      return (
        <section className="blesk-start" aria-label="Bleskovky">
          <h1 className="blesk-start__titulek">⚡ Bleskovky</h1>
          <p className="panel blesk-start__nacitam">Načítám banky…</p>
        </section>
      );
    }
    const kPridani = PREDMETY.filter(
      (p) => !bankyProfilu.includes(p.id) && maBleskovky(banky[p.id]),
    );
    return <BleskBezBanky kPridani={kPridani} onPridat={pridejPredmetProfilu} />;
  }

  const banka = banky[predmetId];
  const truhlaDnes = bylaDnesTruhlaZBlesku(historieTestu, denZData(new Date()));
  const dostupnychOtazek = pocetDostupnychOtazek(temata, vybrana);
  const zvladnutiVse = zvladnutiOtazek(bleskoveOtazky(banka), statistiky);

  const zmenTemata = (nova: string[]) => {
    setNejdeSpustit(false);
    setVyberTemat({ predmetId, temata: nova });
  };

  const spust = () => {
    // Úspěch nastaví aktualniTest a o přechod na /test se postará
    // přesměrování výše (replace — Zpět z kola nevede zpátky na start).
    const povedlo = zacniBlesk({
      predmetId,
      pocetOtazek: pocet,
      temataId: temataProKolo(temata, vybrana),
    });
    setNejdeSpustit(!povedlo);
    if (povedlo) setSpusteno(true);
  };

  return (
    <section className="blesk-start" aria-label="Bleskovky">
      <div className="blesk-start__hlava">
        <h1 className="blesk-start__titulek">⚡ Bleskovky</h1>
        <p className="blesk-start__popis">
          Rychlý dril: doplň, co chybí. Dvě minuty denně a rozhodneš se za vteřinu.
        </p>
      </div>

      {rozehrany && (
        <div className="panel blesk-start__rozehrany" role="status">
          <p>
            {rozehrany.jeBlesk ? 'Máš rozehrané kolo bleskovek' : 'Máš rozehraný test'} —{' '}
            <span aria-hidden="true">{ikonaPredmetu(rozehrany.predmetId)}</span>{' '}
            {nazevPredmetu(rozehrany.predmetId, banky[rozehrany.predmetId]?.nazev)} (
            {rozehrany.zodpovezeno}/{rozehrany.celkem}). Nové kolo ho ukončí.
          </p>
          <Link to="/test" className="tlacitko">
            Pokračovat v něm
          </Link>
        </div>
      )}

      <div className="panel blesk-start__panel">
        {dostupne.length > 1 ? (
          <>
            <h2 className="blesk-start__nadpis">Banka</h2>
            <div className="blesk-start__volby">
              {dostupne.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`blesk-cip${id === predmetId ? ' blesk-cip--vybrany' : ''}`}
                  aria-pressed={id === predmetId}
                  onClick={() => {
                    setNejdeSpustit(false);
                    setVybranyPredmet(id);
                  }}
                >
                  <span aria-hidden="true">{ikonaPredmetu(id)}</span>
                  <span className="blesk-cip__nazev">{nazevPredmetu(id, banky[id]?.nazev)}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="blesk-start__banka">
            <span aria-hidden="true">{ikonaPredmetu(predmetId)}</span>{' '}
            {nazevPredmetu(predmetId, banka?.nazev)}
          </div>
        )}

        <h2 className="blesk-start__nadpis">
          Témata{' '}
          <span className="blesk-start__pozn">
            ({vybrana.length === 0 ? 'vše, míchané — doporučeno' : `${vybrana.length} vybráno`})
          </span>
        </h2>
        <div className="blesk-start__volby">
          <button
            type="button"
            className={`blesk-cip${vybrana.length === 0 ? ' blesk-cip--vybrany' : ''}`}
            aria-pressed={vybrana.length === 0}
            onClick={() => zmenTemata([])}
          >
            <span className="blesk-cip__nazev">🔀 Vše</span>
            <span
              className={`blesk-cip__zvladnuti${zvladnutiVse >= 0.75 ? ' blesk-cip__zvladnuti--zlate' : ''}`}
              title="Zvládnuto (otázky v Leitnerově boxu 3+)"
            >
              {procenta(zvladnutiVse)}
            </span>
          </button>
          {temata.map((t) => {
            const vybrane = vybrana.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                className={`blesk-cip${vybrane ? ' blesk-cip--vybrany' : ''}`}
                aria-pressed={vybrane}
                title={`${slovyBleskoveOtazky(t.pocet)} · zvládnuto ${procenta(t.zvladnuti)}`}
                onClick={() => zmenTemata(prepniTemaVyberu(vybrana, t.id))}
              >
                <span className="blesk-cip__nazev">{t.nazev}</span>
                <span
                  className={`blesk-cip__zvladnuti${t.zvladnuti >= 0.75 ? ' blesk-cip__zvladnuti--zlate' : ''}`}
                >
                  {procenta(t.zvladnuti)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="blesk-start__legenda">
          Procenta = zvládnuto. Slabé a nové otázky chodí častěji.
        </p>

        <h2 className="blesk-start__nadpis">Délka kola</h2>
        <div className="blesk-start__pocty">
          {POCTY_BLESK.map((p) => (
            <button
              key={p}
              type="button"
              className={`blesk-pocet${pocet === p ? ' blesk-pocet--vybrany' : ''}`}
              aria-pressed={pocet === p}
              onClick={() => setPocet(p)}
            >
              {p}
            </button>
          ))}
        </div>
        {dostupnychOtazek < pocet && (
          <p className="blesk-start__legenda">
            Výběr má jen {slovyBleskoveOtazky(dostupnychOtazek, 'koho')} — kolo bude kratší.
          </p>
        )}

        {/* Pata — na mobilu přilepená nad spodní lištou (Blesk.css). */}
        <div className="blesk-start__pata">
          <p
            className={`blesk-start__truhla${truhlaDnes ? ' blesk-start__truhla--hotova' : ''}`}
          >
            {truhlaDnes ? 'Dnešní truhla už je tvoje ✓' : '🎁 První kolo dne = truhla'}
          </p>
          {nejdeSpustit && (
            <p className="blesk-start__chyba" role="alert">
              Tohle kolo teď spustit nejde — zkus jiný výběr témat.
            </p>
          )}
          <button
            type="button"
            className="tlacitko tlacitko--zlate blesk-start__spustit"
            onClick={spust}
          >
            {/* Jeden flex prvek (gap .tlacitko by jinak rozšířil mezeru). */}
            <span>
              <span className="znak-blesku" aria-hidden="true">⚡</span> Spustit
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
