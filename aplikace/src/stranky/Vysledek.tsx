// Vyhodnocení testu + truhla — VLASTNÍ agent APP-TESTY.
// Truhlu (EVENT s animací otevírání) renderuje komponenta TruhlaOdmena z hra/.
// Výsledek KOLA bleskovek (jeKoloBleskovek) má vlastní podobu: tempo, výpis
// chyb se správně doplněným zněním a opravné kolo (VysledekBlesku níže).
// Běžný test, který se jen počítá jako bleskovky (id `blesk-test-…`: aspoň
// polovina otázek blesková), má výsledek běžný — jen s poznámkou, když
// truhlu nedostal, protože dnešní dávku už vybralo jiné kolo.
import { Link, useNavigate } from 'react-router-dom';
import { denZData } from '@questor/sdilene';
import type { BankaOtazek, OdpovedZaznam, TestVysledek } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { pouzijObsahNacten } from '../data/pouzijObsahNacten';
import TruhlaOdmena from '../hra/TruhlaOdmena';
import { NAZVY_REZIMU } from '../testy/popisky';
import {
  chybyBlesku,
  duvodBezTruhly,
  jeKoloBleskovek,
  jeOpravaBlesku,
  konfiguraceDalsihoKola,
  rozdelZadani,
  tempoZaMinutu,
} from '../testy/blesk';
import BleskZneni from '../testy/BleskZneni';
import '../testy/testy.css';
import '../testy/blesk.css';

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

/** Panel „Jak ti šla témata“ — sdílí ho výsledek testu i bleskovek. */
function RozpisTemat({ rozpis }: { rozpis: RozpisTematu[] }) {
  if (rozpis.length === 0) return null;
  return (
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
  );
}

export default function Vysledek() {
  const navigate = useNavigate();
  const vysledek = pouzijStav((s) => s.posledniVysledek);
  const banka = pouzijStav((s) =>
    s.posledniVysledek ? s.banky[s.posledniVysledek.konfigurace.predmetId] : undefined,
  );
  const zacniTest = pouzijStav((s) => s.zacniTest);
  const historieTestu = pouzijStav((s) => s.historieTestu);

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

  if (jeKoloBleskovek(vysledek)) {
    return <VysledekBlesku vysledek={vysledek} banka={banka} />;
  }

  // Běžný test s převahou bleskových otázek dává truhlu jen z denní dávky
  // sdílené s bleskovkami — když ji dnes už dalo jiné kolo, řekne proč tu
  // truhla není (jinak by to po dobrém výsledku vypadalo jako chyba).
  const truhlaUzByla =
    duvodBezTruhly(vysledek, historieTestu, denZData(new Date())) === 'uz-byla';

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
        {truhlaUzByla && (
          <p className="vysledek-blesk__pozn">
            Truhlu za rychlé doplňovačky dnes už máš — testy z nich ji dávají jednou denně,
            stejně jako bleskovky.
          </p>
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

      <RozpisTemat rozpis={rozpis} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Výsledek kola bleskovek

/** Proč kolo nedalo truhlu (null = dalo, nebo už to není dnešní výsledek). */
function poznamkaKTruhle(
  vysledek: TestVysledek,
  historieTestu: TestVysledek[],
  dnes: string,
): string | null {
  switch (duvodBezTruhly(vysledek, historieTestu, dnes)) {
    case 'oprava':
      return 'Opravné kolo truhlu nedává — XP a zvládnutí otázek se počítají dál.';
    case 'uz-byla':
      return 'Dnešní truhlu už máš — tohle kolo byl trénink navíc.';
    case 'malo':
      return 'Na truhlu je potřeba aspoň 50 % — dnešní truhla pořád čeká.';
    default:
      return null;
  }
}

function VysledekBlesku({
  vysledek,
  banka,
}: {
  vysledek: TestVysledek;
  banka: BankaOtazek | undefined;
}) {
  const navigate = useNavigate();
  const zacniBlesk = pouzijStav((s) => s.zacniBlesk);
  const zacniBleskOpravu = pouzijStav((s) => s.zacniBleskOpravu);
  const historieTestu = pouzijStav((s) => s.historieTestu);
  // Po studeném startu (reload, obnovený tab) banka chvíli chybí — do
  // doběhnutí načítání se nesmí tvrdit, že otázky „v bance nejsou“, a místo
  // pro „Oprav si chyby“ se drží, aby tlačítka po načtení neposkočila.
  const obsahNacten = pouzijObsahNacten();
  const bankaSeNacita = banka === undefined && !obsahNacten;

  const oprava = jeOpravaBlesku(vysledek);
  const procenta = Math.round(vysledek.uspesnost * 100);
  const spravnych = vysledek.odpovedi.filter((o) => o.spravne).length;
  const tempo = tempoZaMinutu(vysledek.odpovedi);
  const temata = banka?.temata ?? [];
  const rozpis = rozpisPoTematech(vysledek.odpovedi, temata);
  // Chyby s texty dohledanými v bance; do opravného kola jdou jen ty, které
  // banka pořád zná. Dokud se banka načítá, počet je odhad ze všech chyb.
  const chyby = chybyBlesku(vysledek, banka);
  const kOprave = chyby.flatMap((ch) => (ch.otazka ? [ch.otazka.id] : []));
  const pocetKOprave = bankaSeNacita ? chyby.length : kOprave.length;
  const poznamka = poznamkaKTruhle(vysledek, historieTestu, denZData(new Date()));

  const opravChyby = () => {
    if (zacniBleskOpravu(vysledek.konfigurace.predmetId, kOprave)) navigate('/test');
  };

  const dalsiKolo = () => {
    // Stejná banka, témata i délka (po opravném kole podle kola, ze kterého
    // vzniklo); když kolo nejde spustit (banka zmizela nebo se teprve
    // načítá), start bleskovek nabídne, co jde.
    navigate(zacniBlesk(konfiguraceDalsihoKola(vysledek, historieTestu)) ? '/test' : '/blesk');
  };

  return (
    <section aria-label="Výsledek bleskovek">
      <div className="panel vysledek-hero animace-naskoceni">
        <div className="stitek blesk-stitek">
          {oprava ? '⚡ Bleskovky — oprava chyb' : '⚡ Bleskovky'}
        </div>
        <div className={`vysledek-hero__cislo${procenta >= 70 ? ' vysledek-hero__cislo--zlate' : ''}`}>
          {procenta} %
        </div>
        <p>
          {spravnych} z {vysledek.odpovedi.length} {slovoOtazky(vysledek.odpovedi.length)} správně
          {chyby.length === 0 && ' — bez jediné chyby! 💎'}
        </p>

        <div className="vysledek-statistiky">
          <div className="panel vysledek-stat">
            <div className="vysledek-hero__cislo--zlate vysledek-stat__hodnota">
              +{vysledek.ziskaneXp} XP
            </div>
            <div className="vysledek-stat__popis">získané zkušenosti</div>
          </div>
          {tempo !== null && (
            <div className="panel vysledek-stat">
              <div className="vysledek-stat__hodnota">⚡ {tempo}</div>
              <div className="vysledek-stat__popis">za minutu</div>
            </div>
          )}
          <div className="panel vysledek-stat">
            <div className="vysledek-stat__hodnota">🔥 ×{vysledek.nejdelsiCombo}</div>
            <div className="vysledek-stat__popis">nejdelší combo</div>
          </div>
        </div>

        {vysledek.truhla && (
          <div className="vysledek-truhla">
            <TruhlaOdmena typ={vysledek.truhla} />
          </div>
        )}
        {poznamka && <p className="vysledek-blesk__pozn">{poznamka}</p>}

        <div className="vysledek-akce">
          {pocetKOprave > 0 && (
            <button
              type="button"
              className="tlacitko tlacitko--zlate"
              disabled={bankaSeNacita}
              onClick={opravChyby}
            >
              🔁 Oprav si chyby ({pocetKOprave})
            </button>
          )}
          <button
            type="button"
            className={`tlacitko ${pocetKOprave > 0 ? 'tlacitko--primarni' : 'tlacitko--zlate'}`}
            onClick={dalsiKolo}
          >
            {/* Jeden flex prvek (gap .tlacitko by jinak rozšířil mezeru). */}
            <span>
              <span className="znak-blesku" aria-hidden="true">⚡</span> Další kolo
            </span>
          </button>
          <Link to="/" className="tlacitko">
            Domů
          </Link>
        </div>
      </div>

      {chyby.length > 0 && (
        <div className="panel blesk-chyby">
          <h2>Tyhle ti utekly</h2>
          {chyby.map((chyba) => {
            const otazka = chyba.otazka;
            if (!otazka) {
              return (
                <div key={chyba.otazkaId} className="blesk-chyba">
                  <p className="blesk-chyba__vysvetleni">
                    {bankaSeNacita
                      ? 'Načítám znění otázky…'
                      : 'Tahle otázka už v bance není — do opravného kola se nedostane.'}
                  </p>
                </div>
              );
            }
            const spravnyText = otazka.moznosti[otazka.spravna] ?? '';
            return (
              <div key={chyba.otazkaId} className="blesk-chyba">
                <p className="blesk-chyba__zneni">
                  {rozdelZadani(otazka.zadani) ? (
                    <strong className="blesk-zneni">
                      <BleskZneni zadani={otazka.zadani} doplneno={spravnyText} stav="text" />
                    </strong>
                  ) : (
                    <>
                      <span className="blesk-chyba__zadani">{otazka.zadani} </span>
                      <strong className="blesk-zneni blesk-policko--text">{spravnyText}</strong>
                    </>
                  )}
                </p>
                <p className="blesk-chyba__vysvetleni">{otazka.vysvetleni}</p>
                <span className="stitek blesk-chyba__tema">
                  {temata.find((t) => t.id === otazka.temaId)?.nazev ?? otazka.temaId}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <RozpisTemat rozpis={rozpis} />
    </section>
  );
}
