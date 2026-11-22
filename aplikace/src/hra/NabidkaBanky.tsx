// Karta „Nová banka“ na Domů — nabídne profilu banku, která se hodí k tomu,
// co už studuje (registr předmětů: `nabidnoutK`). Zavíratelná: „Teď ne“
// nabídku pro profil skryje (localStorage, viz nabidkaBankyLogika.ts).
// Po přidání karta zůstane a nabídne rovnou vyzkoušení (bleskovky / lekce).
// Kdy se nabízí, rozhoduje čistá funkce bankaKNabidnuti.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { pouzijStav } from '../stav/store';
import { najdiAktivniProfil, predmetyProfilu } from '../stav/profilySlice';
import { metadataPredmetu } from '../data/predmety';
import { maBleskovky } from '../testy/blesk';
import { bankaKNabidnuti, nactiSkryteNabidky, skryjNabidku } from './nabidkaBankyLogika';

export default function NabidkaBanky() {
  const profil = pouzijStav((s) => najdiAktivniProfil(s));
  const banky = pouzijStav((s) => s.banky);
  const vyuky = pouzijStav((s) => s.vyuky);
  const pridejPredmetProfilu = pouzijStav((s) => s.pridejPredmetProfilu);
  const profilId = profil?.id ?? null;

  // Skryté nabídky se čtou z úložiště při změně profilu a znovu po „Teď ne“
  // (počitadlo `skryto` jen vynutí nové přečtení; kde zápis do úložiště
  // selže, pamatuje si skrytí modul nabidkaBankyLogika).
  const [skryto, setSkryto] = useState(0);
  const skryte = useMemo(
    () => (profilId ? nactiSkryteNabidky(profilId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `skryto` je záměrně jen spouštěč
    [profilId, skryto],
  );

  // Právě přidaná banka — karta zůstane a nabídne ji vyzkoušet. Patří
  // k profilu, který ji přidal (přepnutí profilu ji schová).
  const [pridana, setPridana] = useState<{ profilId: string; predmetId: string } | null>(null);

  if (!profil || !profilId) return null;

  const pridanaTed = pridana && pridana.profilId === profilId ? pridana.predmetId : null;
  if (pridanaTed) {
    const meta = metadataPredmetu(pridanaTed);
    if (!meta) return null;
    const maLekce = (vyuky[pridanaTed]?.lekce.length ?? 0) > 0;
    return (
      <div className="panel domu-nabidka domu-nabidka--pridana" role="status">
        <span className="domu-nabidka__znak" aria-hidden="true">{meta.ikona}</span>
        <div className="domu-nabidka__texty">
          <span className="domu-nabidka__titulek">{meta.nazev} je mezi tvými bankami ✓</span>
          <span className="domu-nabidka__popis">
            Najdeš ji v Učit se i při volbě testu; aktivní banku přepneš chipem vedle avatara.
          </span>
        </div>
        <div className="domu-nabidka__akce">
          {maBleskovky(banky[pridanaTed]) ? (
            <Link
              to={`/blesk?predmet=${encodeURIComponent(pridanaTed)}`}
              className="tlacitko tlacitko--zlate"
            >
              {/* Jeden flex prvek (gap .tlacitko by jinak rozšířil mezeru). */}
              <span>
                <span className="znak-blesku" aria-hidden="true">⚡</span> Zkusit bleskovky
              </span>
            </Link>
          ) : (
            maLekce && (
              <Link to="/uceni" className="tlacitko tlacitko--primarni">
                📖 Učit se
              </Link>
            )
          )}
          <button type="button" className="tlacitko" onClick={() => setPridana(null)}>
            Zavřít
          </button>
        </div>
      </div>
    );
  }

  const nabidka = bankaKNabidnuti({
    predmetyProfilu: predmetyProfilu(profil),
    nacteneBanky: banky,
    skryte,
  });
  if (!nabidka) return null;

  const pridej = () => {
    if (pridejPredmetProfilu(nabidka.id)) setPridana({ profilId, predmetId: nabidka.id });
  };

  const tedNe = () => {
    skryjNabidku(profilId, nabidka.id);
    setSkryto((n) => n + 1);
  };

  return (
    <div className="panel domu-nabidka" role="region" aria-label="Nabídka nové banky">
      <span className="domu-nabidka__znak" aria-hidden="true">{nabidka.ikona}</span>
      <div className="domu-nabidka__texty">
        <span className="domu-nabidka__titulek">Nová banka: {nabidka.nazev}</span>
        <span className="domu-nabidka__popis">
          {nabidka.popisNabidky ?? 'Hodí se k tomu, co už studuješ.'}
        </span>
      </div>
      <div className="domu-nabidka__akce">
        <button type="button" className="tlacitko tlacitko--primarni" onClick={pridej}>
          Přidat mezi moje banky
        </button>
        <button
          type="button"
          className="tlacitko"
          title="Banku si kdykoli přidáš v Nastavení → Studijní banky"
          onClick={tedNe}
        >
          Teď ne
        </button>
      </div>
    </div>
  );
}
