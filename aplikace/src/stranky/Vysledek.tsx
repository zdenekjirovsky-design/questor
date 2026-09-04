// Vyhodnocení testu + truhla — VLASTNÍ agent APP-TESTY.
// Truhlu (EVENT s animací otevírání) renderuje komponenta TruhlaOdmena z hra/.
import { Link, useNavigate } from 'react-router-dom';
import type { OdpovedZaznam } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import TruhlaOdmena from '../hra/TruhlaOdmena';
import { NAZVY_REZIMU } from '../testy/popisky';
import '../testy/testy.css';

interface RozpisTematu {
  temaId: string;
  nazev: string;
  spravne: number;
  celkem: number;
}

function rozpisPoTematech(
  odpovedi: OdpovedZaznam[],
  temata: { id: string; nazev: string }[],
): RozpisTematu[] {
  const mapa = new Map<string, RozpisTematu>();
  for (const o of odpovedi) {
    const radek = mapa.get(o.temaId) ?? {
      temaId: o.temaId,
      nazev: temata.find((t) => t.id === o.temaId)?.nazev ?? o.temaId,
      spravne: 0,
      celkem: 0,
    };
    radek.celkem += 1;
    if (o.spravne) radek.spravne += 1;
    mapa.set(o.temaId, radek);
  }
  return [...mapa.values()].sort((a, b) => b.celkem - a.celkem);
}

function slovoOtazky(pocet: number): string {
  if (pocet === 1) return 'otázka';
  if (pocet >= 2 && pocet <= 4) return 'otázky';
  return 'otázek';
}

export default function Vysledek() {
  const navigate = useNavigate();
  const vysledek = pouzijStav((s) => s.posledniVysledek);
  const banka = pouzijStav((s) =>
    s.posledniVysledek ? s.banky[s.posledniVysledek.konfigurace.predmetId] : undefined,
  );
  const zacniTest = pouzijStav((s) => s.zacniTest);

  if (!vysledek) {
    return (
      <section>
        <h1>Výsledek</h1>
        <p className="panel">
          Žádný dokončený test tu zatím není. <Link to="/">Pojď si jeden dát!</Link>
        </p>
      </section>
    );
  }

  const procenta = Math.round(vysledek.uspesnost * 100);
  const spravnych = vysledek.odpovedi.filter((o) => o.spravne).length;
  const rozpis = rozpisPoTematech(vysledek.odpovedi, banka?.temata ?? []);
  const trvaniMs = Date.parse(vysledek.konec) - Date.parse(vysledek.zacatek);
  const trvani = Number.isFinite(trvaniMs) && trvaniMs > 0 ? Math.round(trvaniMs / 1000) : null;

  const hratZnovu = () => {
    if (zacniTest(vysledek.konfigurace)) navigate('/test');
  };

  return (
    <section aria-label="Výsledek testu">
      <div className="panel vysledek-hero animace-naskoceni">
        <div className="stitek">{NAZVY_REZIMU[vysledek.konfigurace.rezim]}</div>
        <div className={`vysledek-hero__cislo${procenta >= 70 ? ' vysledek-hero__cislo--zlate' : ''}`}>
          {procenta} %
        </div>
        <p>
          {spravnych} z {vysledek.odpovedi.length} {slovoOtazky(vysledek.odpovedi.length)} správně
          {vysledek.konfigurace.rezim === 'zkouska' &&
            vysledek.odpovedi.length < vysledek.konfigurace.pocetOtazek &&
            ' (nestihnuté se počítají jako chyba)'}
        </p>

        <div className="vysledek-statistiky">
          <div className="panel vysledek-stat">
            <div className="vysledek-hero__cislo--zlate vysledek-stat__hodnota">
              +{vysledek.ziskaneXp} XP
            </div>
            <div className="vysledek-stat__popis">získané zkušenosti</div>
          </div>
          <div className="panel vysledek-stat">
            <div className="vysledek-stat__hodnota">🔥 ×{vysledek.nejdelsiCombo}</div>
            <div className="vysledek-stat__popis">nejdelší combo</div>
          </div>
          {trvani !== null && (
            <div className="panel vysledek-stat">
              <div className="vysledek-stat__hodnota">
                {Math.floor(trvani / 60)}:{String(trvani % 60).padStart(2, '0')}
              </div>
              <div className="vysledek-stat__popis">čas testu</div>
            </div>
          )}
        </div>

        {vysledek.truhla && (
          <div className="vysledek-truhla">
            <TruhlaOdmena typ={vysledek.truhla} />
          </div>
        )}

        <div className="vysledek-akce">
          <button type="button" className="tlacitko tlacitko--zlate" onClick={hratZnovu}>
            ⚔️ Hrát znovu
          </button>
          <Link to="/" className="tlacitko tlacitko--primarni">
            Domů
          </Link>
        </div>
      </div>

      {rozpis.length > 0 && (
        <div className="panel" style={{ marginTop: 20 }}>
          <h2>Jak ti šla témata</h2>
          {rozpis.map((radek) => (
            <div key={radek.temaId} className="vysledek-tema">
              <span className="vysledek-tema__nazev">{radek.nazev}</span>
              <div className={`ukazatel${radek.spravne === radek.celkem ? ' ukazatel--zlaty' : ''}`}>
                <div style={{ width: `${(radek.spravne / radek.celkem) * 100}%` }} />
              </div>
              <span className="vysledek-tema__pomer">
                {radek.spravne}/{radek.celkem}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
