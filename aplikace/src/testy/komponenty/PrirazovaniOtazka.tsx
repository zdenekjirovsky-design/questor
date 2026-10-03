// Přiřazovací otázka — klikací párování: vyber vlevo → vyber vpravo.
// Pravá strana je zamíchaná (deterministicky podle id otázky). Správně je
// jen test, kde sedí VŠECHNY páry.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { OtazkaPrirazovani } from '@questor/sdilene';
import type { OdpovedHodnota, ParovaniOdpoved } from '../engine';
import { posunPodListou } from '../posun';
import { jeVstupniPole } from './klavesy';
import { zamichaneIndexy } from './michani';

/** Mobil = sloupce pod sebou (testy.css), jen tam se stránka posouvá sama. */
function sloupcePodSebou(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 760;
}

interface Props {
  otazka: OtazkaPrirazovani;
  odeslana: OdpovedHodnota | null;
  zobrazVyhodnoceni: boolean;
  onOdpoved(hodnota: OdpovedHodnota): void;
}

export default function PrirazovaniOtazka({
  otazka,
  odeslana,
  zobrazVyhodnoceni,
  onOdpoved,
}: Props) {
  const zamceno = odeslana !== null;
  const pravePoradi = useMemo(
    () => zamichaneIndexy(`prirazovani:${otazka.id}`, otazka.pary.length),
    [otazka],
  );
  const [vybranyLevy, setVybranyLevy] = useState<number | null>(null);
  const [pary, setPary] = useState<ParovaniOdpoved[]>([]);

  const zobrazenePary = zamceno && odeslana?.typ === 'prirazovani' ? odeslana.pary : pary;

  const parLeveho = (levy: number) => zobrazenePary.find((p) => p.levy === levy);
  const parPraveho = (pravy: number) => zobrazenePary.find((p) => p.pravy === pravy);

  const klikniLevy = (levy: number) => {
    if (zamceno) return;
    if (parLeveho(levy)) {
      setPary((stare) => stare.filter((p) => p.levy !== levy));
      setVybranyLevy(levy);
      return;
    }
    setVybranyLevy((stary) => (stary === levy ? null : levy));
  };

  const klikniPravy = (pravy: number) => {
    if (zamceno) return;
    const existujici = parPraveho(pravy);
    if (existujici) {
      setPary((stare) => stare.filter((p) => p.pravy !== pravy));
      return;
    }
    if (vybranyLevy === null) return;
    setPary((stare) => [...stare, { levy: vybranyLevy, pravy }]);
    setVybranyLevy(null);
  };

  const vsechnoSparovano = pary.length === otazka.pary.length;

  const odesli = () => {
    if (!vsechnoSparovano) return;
    onOdpoved({ typ: 'prirazovani', pary });
  };

  useEffect(() => {
    if (zamceno) return;
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        odesli();
      }
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  });

  /** Pořadové číslo páru (1, 2, …) pro vizuální spojení levé a pravé strany. */
  const cisloParu = (par: ParovaniOdpoved | undefined): number | null => {
    if (!par) return null;
    const index = zobrazenePary.indexOf(par);
    return index === -1 ? null : index + 1;
  };

  const tridaLeveho = (levy: number): string => {
    const tridy = ['moznost'];
    const par = parLeveho(levy);
    if (zamceno && zobrazVyhodnoceni && par) {
      tridy.push(par.levy === par.pravy ? 'moznost--spravne' : 'moznost--spatne');
    } else if (vybranyLevy === levy) {
      tridy.push('moznost--vybrana');
    } else if (par) {
      tridy.push('moznost--vybrana');
    }
    return tridy.join(' ');
  };

  const tridaPraveho = (pravy: number): string => {
    const tridy = ['moznost'];
    const par = parPraveho(pravy);
    if (zamceno && zobrazVyhodnoceni && par) {
      tridy.push(par.levy === par.pravy ? 'moznost--spravne' : 'moznost--spatne');
    } else if (par) {
      tridy.push('moznost--vybrana');
    }
    return tridy.join(' ');
  };

  // Na mobilu jsou sloupce pod sebou — po vyberu pojmu se protejsky
  // (nadpis s pripominkou + seznam) doroluji do zorneho pole, ale JEN kdyz
  // nejsou cele videt (block 'nearest' = co nejmensi posun; scroll-margin
  // pocita se spodni listou, safe-area i prilepenou hlavickou lekce).
  // Po sparovani se pohled vrati na dalsi nesparovany pojem (nebo na
  // Potvrdit), at student nemusi pokazde rucne nahoru.
  const pravySloupec = useRef<HTMLDivElement | null>(null);
  const levaTlacitka = useRef<(HTMLButtonElement | null)[]>([]);
  const akce = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (vybranyLevy === null || zamceno || !sloupcePodSebou()) return;
    posunPodListou(pravySloupec.current);
  }, [vybranyLevy, zamceno]);

  const predchoziPocetParu = useRef(0);
  useEffect(() => {
    const pribylPar = pary.length > predchoziPocetParu.current;
    predchoziPocetParu.current = pary.length;
    if (!pribylPar || zamceno || !sloupcePodSebou()) return;
    const dalsi = otazka.pary.findIndex((_, levy) => !pary.some((p) => p.levy === levy));
    posunPodListou(dalsi === -1 ? akce.current : levaTlacitka.current[dalsi]);
  }, [pary, zamceno, otazka.pary]);

  return (
    <div>
      <p className="parovani__napoveda">
        Klepni na pojem a pak na jeho protějšek. Klepnutím na hotový pár ho zrušíš.
      </p>
      <div className="parovani" role="group" aria-label="Párování pojmů">
        <div className="parovani__sloupec">
          <p className="parovani__nadpis">Pojmy</p>
          <div className="moznosti">
          {otazka.pary.map((par, levy) => (
            <button
              key={levy}
              ref={(prvek) => {
                levaTlacitka.current[levy] = prvek;
              }}
              type="button"
              className={tridaLeveho(levy)}
              disabled={zamceno}
              onClick={() => klikniLevy(levy)}
            >
              {cisloParu(parLeveho(levy)) !== null && (
                <span className="parovani__cislo">{cisloParu(parLeveho(levy))}</span>
              )}
              <span>{par.levy}</span>
            </button>
          ))}
          </div>
        </div>
        <div className="parovani__sloupec" ref={pravySloupec}>
          <p className="parovani__nadpis">
            Protějšky
            {/* Připomínka výběru. Prázdný stav se na desktopu nezobrazuje;
                na mobilu drží místo (testy.css), aby seznam protějšků
                neposkakoval pod prstem při výběru a spárování. */}
            {!zamceno && (
              <span
                className={`parovani__vybrano${vybranyLevy === null ? ' parovani__vybrano--prazdne' : ''}`}
              >
                {vybranyLevy !== null ? (
                  <>
                    Vybráno: <strong>{otazka.pary[vybranyLevy].levy}</strong> → klepni na protějšek
                  </>
                ) : (
                  'Nejdřív klepni na pojem výše.'
                )}
              </span>
            )}
          </p>
          <div className="moznosti">
          {pravePoradi.map((pravy) => (
            <button
              key={pravy}
              type="button"
              className={tridaPraveho(pravy)}
              disabled={zamceno}
              onClick={() => klikniPravy(pravy)}
            >
              {cisloParu(parPraveho(pravy)) !== null && (
                <span className="parovani__cislo">{cisloParu(parPraveho(pravy))}</span>
              )}
              <span>{otazka.pary[pravy].pravy}</span>
            </button>
          ))}
          </div>
        </div>
      </div>
      {!zamceno && (
        <div className="parovani__akce" ref={akce}>
          <button
            type="button"
            className="tlacitko tlacitko--primarni"
            disabled={!vsechnoSparovano}
            onClick={odesli}
          >
            <span>
              Potvrdit<span className="napoveda-klavesy"> (Enter)</span>
            </span>
          </button>
          {!vsechnoSparovano && (
            <span className="parovani__napoveda">
              Spárováno {pary.length} z {otazka.pary.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
