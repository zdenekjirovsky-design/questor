// Popisovačka — SVG obrázek s pulzujícími hotspoty. Režim „Prozkoumat“:
// klik na bod → bublina s názvem a popisem. Režim „Vyzkoušej se“: widget zadá
// název a hráč klikne na správné místo. Prozkoumání všech bodů → onSplneno.
// SVG se před vykreslením VŽDY sanitizuje (sanitizujSvg ze sdilene).
import { useMemo, useRef, useState } from 'react';
import type { PopisovackaParametry } from '@questor/sdilene';
import { sanitizujSvg } from '@questor/sdilene';
import { extrahujViewBox, pozicniProcenta, zamichej } from './logika';
import Konfety from './Konfety';
import './Popisovacka.css';

interface Props {
  parametry: PopisovackaParametry;
  onSplneno: () => void;
}

type Rezim = 'prozkoumat' | 'zkouseni';

interface Zpetnavazba {
  druh: 'spravne' | 'spatne';
  text: string;
}

export default function Popisovacka({ parametry, onSplneno }: Props) {
  const cisteSvg = useMemo(() => sanitizujSvg(parametry.svg), [parametry.svg]);
  const viewBox = useMemo(() => extrahujViewBox(cisteSvg), [cisteSvg]);
  const pozice = useMemo(
    () => parametry.body.map((b) => pozicniProcenta(b, viewBox)),
    [parametry.body, viewBox],
  );

  const [rezim, setRezim] = useState<Rezim>('prozkoumat');
  const [aktivni, setAktivni] = useState<number | null>(null);
  const [prozkoumane, setProzkoumane] = useState<Set<number>>(new Set());
  const splnenoHlaseno = useRef(false);

  // Zkoušení
  const [poradiZkouseni, setPoradiZkouseni] = useState<number[]>([]);
  const [krokZkouseni, setKrokZkouseni] = useState(0);
  const [zpetnaVazba, setZpetnaVazba] = useState<Zpetnavazba | null>(null);
  const [spatnyBod, setSpatnyBod] = useState<number | null>(null);
  const [uhodnute, setUhodnute] = useState<Set<number>>(new Set());
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vseProzkoumano = prozkoumane.size === parametry.body.length;
  const zkouseniHotovo = rezim === 'zkouseni' && krokZkouseni >= poradiZkouseni.length;
  const hledany = rezim === 'zkouseni' && !zkouseniHotovo ? poradiZkouseni[krokZkouseni] : null;

  const ohlasSplneni = () => {
    if (!splnenoHlaseno.current) {
      splnenoHlaseno.current = true;
      onSplneno();
    }
  };

  const klikniBodProzkoumat = (index: number) => {
    setAktivni((a) => (a === index ? null : index));
    setProzkoumane((stare) => {
      if (stare.has(index)) return stare;
      const nove = new Set(stare).add(index);
      if (nove.size === parametry.body.length) ohlasSplneni();
      return nove;
    });
  };

  const spustZkouseni = () => {
    setRezim('zkouseni');
    setAktivni(null);
    setPoradiZkouseni(zamichej(parametry.body.map((_, i) => i), Math.random));
    setKrokZkouseni(0);
    setUhodnute(new Set());
    setZpetnaVazba(null);
    setSpatnyBod(null);
  };

  const klikniBodZkouseni = (index: number) => {
    if (hledany === null || uhodnute.has(index)) return;
    if (casovac.current) clearTimeout(casovac.current);
    if (index === hledany) {
      setUhodnute((stare) => new Set(stare).add(index));
      setZpetnaVazba({ druh: 'spravne', text: `Přesně tak — ${parametry.body[index].nazev}.` });
      setSpatnyBod(null);
      const dalsi = krokZkouseni + 1;
      setKrokZkouseni(dalsi);
      if (dalsi >= poradiZkouseni.length) ohlasSplneni();
    } else {
      setZpetnaVazba({
        druh: 'spatne',
        text: `Tohle je ${parametry.body[index].nazev}. Zkus to znovu.`,
      });
      setSpatnyBod(index);
      casovac.current = setTimeout(() => setSpatnyBod(null), 450);
    }
  };

  const klikniBod = (index: number) => {
    if (rezim === 'prozkoumat') klikniBodProzkoumat(index);
    else klikniBodZkouseni(index);
  };

  const aktivniBod = aktivni !== null ? parametry.body[aktivni] : null;
  const aktivniPozice = aktivni !== null ? pozice[aktivni] : null;

  return (
    <div className="popisovacka">
      <div className="popisovacka__lista">
        <span className="popisovacka__instrukce" aria-live="polite">
          {rezim === 'prozkoumat' &&
            (vseProzkoumano
              ? 'Vše prozkoumáno! 🎉'
              : 'Klikej na svítící body a zjisti, co je co.')}
          {rezim === 'zkouseni' &&
            (zkouseniHotovo ? (
              'Všechno jsi našel! 🎉'
            ) : (
              <>
                Klikni na:{' '}
                <strong className="popisovacka__hledany">
                  {hledany !== null ? parametry.body[hledany].nazev : ''}
                </strong>
              </>
            ))}
        </span>
        <span className="popisovacka__pocitadlo">
          {rezim === 'prozkoumat'
            ? `${prozkoumane.size} / ${parametry.body.length}`
            : `${Math.min(krokZkouseni, poradiZkouseni.length)} / ${poradiZkouseni.length}`}
        </span>
      </div>

      <div className="popisovacka__scena">
        <div
          className="popisovacka__obrazek"
          // Bezpečné: řetězec prošel sanitizujSvg (whitelist elementů/atributů).
          dangerouslySetInnerHTML={{ __html: cisteSvg }}
        />

        {parametry.body.map((bod, i) => {
          const { levaPct, horniPct } = pozice[i];
          const stavTridy =
            rezim === 'prozkoumat'
              ? prozkoumane.has(i)
                ? 'popisovacka__bod--prozkoumany'
                : ''
              : uhodnute.has(i)
                ? 'popisovacka__bod--prozkoumany'
                : '';
          return (
            <button
              key={i}
              type="button"
              className={[
                'popisovacka__bod',
                stavTridy,
                aktivni === i ? 'popisovacka__bod--aktivni' : '',
                spatnyBod === i ? 'popisovacka__bod--spatne' : '',
              ].join(' ')}
              style={{ left: `${levaPct}%`, top: `${horniPct}%` }}
              onClick={() => klikniBod(i)}
              aria-label={
                rezim === 'prozkoumat'
                  ? `Bod ${i + 1}: ${bod.nazev}`
                  : uhodnute.has(i)
                    ? `Uhodnuto: ${bod.nazev}`
                    : `Neoznačené místo ${i + 1}`
              }
            >
              <span className="popisovacka__bod-jadro" aria-hidden="true">
                {(rezim === 'prozkoumat' && prozkoumane.has(i)) || uhodnute.has(i) ? '✓' : ''}
              </span>
            </button>
          );
        })}

        {rezim === 'prozkoumat' && aktivniBod && aktivniPozice && (
          <div
            className={`popisovacka__bublina ${
              aktivniPozice.horniPct > 55 ? 'popisovacka__bublina--nad' : 'popisovacka__bublina--pod'
            }`}
            style={{
              left: `${Math.min(80, Math.max(20, aktivniPozice.levaPct))}%`,
              ...(aktivniPozice.horniPct > 55
                ? { bottom: `${100 - aktivniPozice.horniPct + 4}%` }
                : { top: `${aktivniPozice.horniPct + 4}%` }),
            }}
            role="status"
          >
            <strong className="popisovacka__bublina-nazev">{aktivniBod.nazev}</strong>
            <span className="popisovacka__bublina-popis">{aktivniBod.popis}</span>
          </div>
        )}

        {((rezim === 'prozkoumat' && vseProzkoumano) || zkouseniHotovo) && <Konfety />}
      </div>

      <div className="popisovacka__paticka" aria-live="polite">
        {rezim === 'prozkoumat' && vseProzkoumano && (
          <div className="popisovacka__oslava animace-pop">
            <span className="popisovacka__oslava-titul">Znáš všechna místa!</span>
            {parametry.body.length >= 2 && (
              <button type="button" className="tlacitko tlacitko--primarni" onClick={spustZkouseni}>
                Vyzkoušej se ✍️
              </button>
            )}
          </div>
        )}
        {rezim === 'zkouseni' && !zkouseniHotovo && zpetnaVazba && (
          <span className={`popisovacka__vazba popisovacka__vazba--${zpetnaVazba.druh}`}>
            {zpetnaVazba.text}
          </span>
        )}
        {zkouseniHotovo && (
          <div className="popisovacka__oslava animace-pop">
            <span className="popisovacka__oslava-titul">Skvěle — našel jsi všechno!</span>
            <button type="button" className="tlacitko" onClick={spustZkouseni}>
              Zkusit znovu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
