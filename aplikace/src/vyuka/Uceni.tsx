// Prehled uceni (/uceni) — predmety a jejich lekce jako karty s kruhovym
// ukazatelem postupu + doporuceni „pokracuj tady" (prvni nedokoncena lekce).
// ZADNE zamykani — student si muze otevrit kteroukoli lekci (svoboda volby).
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { Lekce, VyukaPredmetu } from '@questor/sdilene';
import { XP_ZA_LEKCI } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import type { PostupLekce } from '../stav/vyukaSlice';
import { aktivniPredmetProfilu, najdiAktivniProfil, predmetyProfilu } from '../stav/profilySlice';
import { ikonaPredmetu, nazevPredmetu, seradPredmety } from '../data/predmety';
import './vyuka.css';

// ---------------------------------------------------------------------------

/** Kruhovy ukazatel postupu (SVG prstenec). */
export function KruhovyUkazatel({ procento, hotovo }: { procento: number; hotovo: boolean }) {
  const r = 26;
  const obvod = 2 * Math.PI * r;
  const podil = Math.max(0, Math.min(1, procento));
  return (
    <span className={`kruh${hotovo ? ' kruh--hotovo' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle className="kruh__pozadi" cx="32" cy="32" r={r} fill="none" strokeWidth="6" />
        <circle
          className="kruh__postup"
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={obvod}
          strokeDashoffset={obvod * (1 - podil)}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="kruh__hodnota">{hotovo ? '✓' : `${Math.round(podil * 100)} %`}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------

interface LekceSouhrn {
  predmetId: string;
  nazevPredmetu: string;
  lekce: Lekce;
  dokoncenychBloku: number;
  celkemBloku: number;
  hotovo: boolean;
  zacata: boolean;
}

function souhrnLekce(
  vyuka: VyukaPredmetu,
  nazevPredmetu: string,
  lekce: Lekce,
  postup: PostupLekce | undefined,
): LekceSouhrn {
  const celkem = lekce.bloky.length;
  const dokonceno = Math.min(postup?.dokonceneBloky.length ?? 0, celkem);
  return {
    predmetId: vyuka.predmetId,
    nazevPredmetu,
    lekce,
    dokoncenychBloku: dokonceno,
    celkemBloku: celkem,
    hotovo: celkem > 0 && dokonceno >= celkem,
    zacata: dokonceno > 0,
  };
}

const POPISKY_OBSAHU: { typ: string; ikona: string; nazev: string }[] = [
  { typ: 'obrazek', ikona: '🖼️', nazev: 'obrázek' },
  { typ: 'karticky', ikona: '🃏', nazev: 'kartičky' },
  { typ: 'mini-kviz', ikona: '🧠', nazev: 'kvíz' },
  { typ: 'widget', ikona: '🎮', nazev: 'hra' },
];

export default function Uceni() {
  const vyuky = pouzijStav((s) => s.vyuky);
  const banky = pouzijStav((s) => s.banky);
  const postupLekci = pouzijStav((s) => s.postupLekci);
  const profil = pouzijStav((s) => najdiAktivniProfil(s));

  // Sekce per předmět: JEN studijní banky profilu, které výuku opravdu mají,
  // v pořadí registru předmětů (../data/predmety.ts) — AKTIVNÍ banka první.
  const predmety = useMemo(() => {
    const bankyProfilu = predmetyProfilu(profil);
    const aktivni = aktivniPredmetProfilu(profil);
    const serazene = seradPredmety(Object.keys(vyuky)).filter((id) => bankyProfilu.includes(id));
    if (aktivni && serazene.includes(aktivni)) {
      serazene.splice(serazene.indexOf(aktivni), 1);
      serazene.unshift(aktivni);
    }
    return serazene.map((predmetId) => {
      const vyuka = vyuky[predmetId];
      const nazev = nazevPredmetu(predmetId, banky[predmetId]?.nazev);
      const lekce = vyuka.lekce
        .slice()
        .sort((a, b) => a.poradi - b.poradi)
        .map((l) => souhrnLekce(vyuka, nazev, l, postupLekci[l.temaId]));
      return { predmetId, nazev, ikona: ikonaPredmetu(predmetId), lekce };
    });
  }, [vyuky, banky, postupLekci, profil]);

  const vsechnyLekce = predmety.flatMap((p) => p.lekce);
  const dokoncenych = vsechnyLekce.filter((l) => l.hotovo).length;
  // Doporuceni: prvni rozdelana lekce; kdyz zadna neni, prvni nezacata.
  // Aktivni banka je v seznamu prvni, takze doporuceni miri nejdriv do ni.
  const doporucena =
    vsechnyLekce.find((l) => l.zacata && !l.hotovo) ?? vsechnyLekce.find((l) => !l.hotovo) ?? null;

  if (vsechnyLekce.length === 0) {
    return (
      <section className="uceni">
        <h1 className="uceni__titulek">Učit se</h1>
        <div className="panel uceni__prazdno">
          <span className="uceni__prazdno-znak" aria-hidden="true">📚</span>
          <p>
            Zatím tu žádné lekce nejsou. Výuka se stáhne ze serveru, jakmile ji táta nahraje —
            nebo přijde s aktualizací aplikace.
          </p>
          <Link to="/" className="tlacitko tlacitko--primarni">← Zpět domů</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="uceni">
      <div className="uceni__hlava">
        <h1 className="uceni__titulek">Učit se</h1>
        <span className="stitek">
          {dokoncenych}/{vsechnyLekce.length} lekcí · +{XP_ZA_LEKCI} XP za lekci
        </span>
      </div>

      {/* Doporuceni — pokracuj tady */}
      {doporucena && (
        <Link
          to={`/uceni/${doporucena.lekce.temaId}`}
          className="panel uceni__doporuceni animace-naskoceni"
        >
          <KruhovyUkazatel
            procento={doporucena.celkemBloku > 0 ? doporucena.dokoncenychBloku / doporucena.celkemBloku : 0}
            hotovo={false}
          />
          <div className="uceni__doporuceni-texty">
            <span className="uceni__doporuceni-stitek">
              {doporucena.zacata ? '▶ Pokračuj tady' : '✨ Začni tady'}
            </span>
            <span className="uceni__doporuceni-nazev">{doporucena.lekce.nazev}</span>
            <span className="uceni__doporuceni-predmet">{doporucena.nazevPredmetu}</span>
          </div>
          <span className="uceni__doporuceni-sipka" aria-hidden="true">→</span>
        </Link>
      )}

      {/* Predmety a lekce */}
      {predmety.map((predmet) => (
        <div key={predmet.predmetId} className="uceni__predmet">
          <h2 className="uceni__predmet-nazev">
            <span aria-hidden="true">{predmet.ikona}</span> {predmet.nazev}
          </h2>
          <div className="uceni__mrizka">
            {predmet.lekce.map((l) => {
              const obsah = POPISKY_OBSAHU.filter((p) =>
                l.lekce.bloky.some((b) => b.typ === p.typ),
              );
              return (
                <Link
                  key={l.lekce.temaId}
                  to={`/uceni/${l.lekce.temaId}`}
                  className={`panel uceni__karta${l.hotovo ? ' uceni__karta--hotova' : ''}`}
                >
                  <div className="uceni__karta-hlava">
                    <KruhovyUkazatel
                      procento={l.celkemBloku > 0 ? l.dokoncenychBloku / l.celkemBloku : 0}
                      hotovo={l.hotovo}
                    />
                    <div className="uceni__karta-texty">
                      <span className="uceni__karta-poradi">Lekce {l.lekce.poradi + 1}</span>
                      <span className="uceni__karta-nazev">{l.lekce.nazev}</span>
                    </div>
                  </div>
                  <div className="uceni__karta-pata">
                    <span className="uceni__karta-bloky">
                      {l.hotovo
                        ? 'Dokončeno ✓'
                        : l.zacata
                          ? `${l.dokoncenychBloku}/${l.celkemBloku} bloků`
                          : `${l.celkemBloku} bloků`}
                    </span>
                    <span className="uceni__karta-obsah" aria-hidden="true">
                      {obsah.map((p) => (
                        <span key={p.typ} title={p.nazev}>{p.ikona}</span>
                      ))}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
