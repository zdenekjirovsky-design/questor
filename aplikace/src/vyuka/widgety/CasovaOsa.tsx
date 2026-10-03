// Časová osa — horizontální osa s body (rok + název), klik na bod → detail,
// šipky/klávesnice pro posun, linka se plní podle postupu. Prohlédnutí všech
// událostí → onSplneno.
// Posun na bod osy jen VODOROVNĚ uvnitř pásu (stránka se nehýbe). Mobil:
// detail drží výšku nejdelší události (neviditelné rezervy, CasovaOsa.css),
// takže „Později →“ pod ním neposkakuje.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CasovaOsaParametry } from '@questor/sdilene';
import { formatujRok, posunKroku, seradUdalosti, vsechnyKrokyNavstiveny } from './logika';
import { jeVstupniPole } from '../../testy/komponenty/klavesy';
import { chovaniPosunu } from '../../testy/posun';
import './CasovaOsa.css';

interface Props {
  parametry: CasovaOsaParametry;
  onSplneno: () => void;
}

export default function CasovaOsa({ parametry, onSplneno }: Props) {
  const udalosti = useMemo(() => seradUdalosti(parametry.udalosti), [parametry.udalosti]);
  const pocet = udalosti.length;
  const [aktivni, setAktivni] = useState(0);
  const [navstivene, setNavstivene] = useState<Set<number>>(new Set([0]));
  const splnenoHlaseno = useRef(false);
  const koren = useRef<HTMLDivElement | null>(null);
  const tlacitkaBodu = useRef<(HTMLButtonElement | null)[]>([]);
  const pas = useRef<HTMLDivElement | null>(null);

  const hotovo = vsechnyKrokyNavstiveny(navstivene, pocet);

  const prejdiNa = (index: number) => {
    if (index < 0 || index >= pocet) return;
    setAktivni(index);
    // Bod do středu pásu — JEN vodorovně v pásu. scrollIntoView by posunul
    // i celou stránku, když bod není svisle celý vidět (student je dole
    // u tlačítek).
    const bod = tlacitkaBodu.current[index];
    const kontejner = pas.current;
    if (bod && kontejner && typeof kontejner.scrollTo === 'function') {
      const rBod = bod.getBoundingClientRect();
      const rPas = kontejner.getBoundingClientRect();
      kontejner.scrollTo({
        left: kontejner.scrollLeft + (rBod.left - rPas.left) - (kontejner.clientWidth - rBod.width) / 2,
        behavior: chovaniPosunu(),
      });
    }
    if (navstivene.has(index)) return;
    // Splnění se hlásí MIMO updater setState (updater běží při renderu).
    const nove = new Set(navstivene).add(index);
    setNavstivene(nove);
    if (vsechnyKrokyNavstiveny(nove, pocet) && !splnenoHlaseno.current) {
      splnenoHlaseno.current = true;
      onSplneno();
    }
  };

  useEffect(() => {
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!koren.current || !koren.current.contains(document.activeElement)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        prejdiNa(posunKroku(aktivni, pocet, 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prejdiNa(posunKroku(aktivni, pocet, -1));
      }
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  });

  // Naplnění linky: po nejzazší navštívenou událost.
  const nejzazsi = Math.max(...navstivene);
  const naplneniPct = pocet > 1 ? (nejzazsi / (pocet - 1)) * 100 : 100;

  const udalost = udalosti[aktivni];

  return (
    <div className="casova-osa" ref={koren}>
      <div className="casova-osa__pas" ref={pas} role="group" aria-label="Časová osa — události">
        <div className="casova-osa__drha">
          <div className="casova-osa__linka" aria-hidden="true">
            <div className="casova-osa__linka-napln" style={{ width: `${naplneniPct}%` }} />
          </div>
          <div className="casova-osa__body">
            {udalosti.map((u, i) => (
              <button
                key={i}
                ref={(el) => {
                  tlacitkaBodu.current[i] = el;
                }}
                type="button"
                className={[
                  'casova-osa__bod',
                  i === aktivni ? 'casova-osa__bod--aktivni' : '',
                  navstivene.has(i) ? 'casova-osa__bod--navstiveny' : '',
                ].join(' ')}
                onClick={() => prejdiNa(i)}
                aria-current={i === aktivni ? 'true' : undefined}
                aria-label={`${formatujRok(u.rok)} — ${u.nazev}`}
              >
                <span className="casova-osa__tecka" aria-hidden="true" />
                <span className="casova-osa__rok">{formatujRok(u.rok)}</span>
                <span className="casova-osa__nazev">{u.nazev}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="casova-osa__detail-ram">
        {/* Rezervy ostatních událostí (jen mobil, CSS) — výška = nejdelší. */}
        {udalosti.map((u, i) =>
          i === aktivni ? null : (
            <div
              key={`rezerva-${i}`}
              className="casova-osa__detail panel casova-osa__detail--rezerva"
              aria-hidden="true"
            >
              <ObsahUdalosti udalost={u} />
            </div>
          ),
        )}
        <div className="casova-osa__detail panel" key={aktivni}>
          <ObsahUdalosti udalost={udalost} />
        </div>
      </div>

      <div className="casova-osa__ovladani">
        <button
          type="button"
          className="tlacitko"
          onClick={() => prejdiNa(posunKroku(aktivni, pocet, -1))}
          disabled={aktivni === 0}
        >
          ← Dřív
        </button>
        <span className="casova-osa__pocitadlo" aria-live="polite">
          {hotovo ? (
            <span className="casova-osa__hotovo animace-pop">Prošel sis celou osu! ✓</span>
          ) : (
            <>
              Prohlédnuto {navstivene.size} z {pocet}
            </>
          )}
        </span>
        <button
          type="button"
          className={`tlacitko ${aktivni < pocet - 1 ? 'tlacitko--primarni' : ''}`}
          onClick={() => prejdiNa(posunKroku(aktivni, pocet, 1))}
          disabled={aktivni === pocet - 1}
        >
          Později →
        </button>
      </div>
    </div>
  );
}

function ObsahUdalosti({ udalost }: { udalost: CasovaOsaParametry['udalosti'][number] }) {
  return (
    <>
      <div className="casova-osa__detail-rok">{formatujRok(udalost.rok)}</div>
      <h3 className="casova-osa__detail-nazev">{udalost.nazev}</h3>
      <p className="casova-osa__detail-popis">{udalost.popis}</p>
    </>
  );
}
