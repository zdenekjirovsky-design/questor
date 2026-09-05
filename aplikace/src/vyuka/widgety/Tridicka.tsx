// Třídička — drag & drop třídění položek do kategorií.
// Myš: přetáhni štítek do kategorie. Dotyk/klávesnice: klikni štítek → klikni
// kategorii. Na dotykovém zařízení (pointer: coarse) se drag & drop vypíná
// (HTML5 DnD na dotyku nefunguje) a widget jede čistě v režimu klik-klik.
// Špatně = zatřesení a návrat, správně = pop; vše roztříděno =
// konfety + onSplneno.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TridickaParametry } from '@questor/sdilene';
import { hashRetezce, vytvorNahodu } from '@questor/sdilene';
import { jeDotykoveZarizeni } from './dotyk';
import {
  tridickaHotovo,
  vytvorTridickaStav,
  zamichej,
  zaradPolozku,
  type TridickaStav,
} from './logika';
import Konfety from './Konfety';
import './Tridicka.css';

interface Props {
  parametry: TridickaParametry;
  onSplneno: () => void;
}

export default function Tridicka({ parametry, onSplneno }: Props) {
  // Dotykove zarizeni: drag & drop vypnuty, plati rezim klik-klik.
  const dotykove = useMemo(() => jeDotykoveZarizeni(), []);

  // Zamíchané pořadí zásobníku — deterministické podle obsahu, aby se
  // při re-renderu nepřeskupovalo.
  const uvodniPoradi = useMemo(() => {
    const nahoda = vytvorNahodu(hashRetezce(`tridicka:${parametry.zadani}:${parametry.polozky.length}`));
    return zamichej(parametry.polozky.map((_, i) => i), nahoda);
  }, [parametry]);

  const [stav, setStav] = useState<TridickaStav>(() =>
    vytvorTridickaStav(parametry.polozky.length, uvodniPoradi),
  );
  const [vybrana, setVybrana] = useState<number | null>(null);
  const [trese, setTrese] = useState<string | null>(null); // kategorieId se zatřesením
  const [spatnaPolozka, setSpatnaPolozka] = useState<number | null>(null);
  const tahana = useRef<number | null>(null);
  const [pretahovanaNad, setPretahovanaNad] = useState<string | null>(null);
  const splnenoHlaseno = useRef(false);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (casovac.current) clearTimeout(casovac.current);
    },
    [],
  );

  const hotovo = tridickaHotovo(stav);

  const zkusZaradit = (indexPolozky: number, kategorieId: string) => {
    if (hotovo) return;
    const { stav: novy, spravne } = zaradPolozku(stav, indexPolozky, kategorieId, parametry.polozky);
    setStav(novy);
    setVybrana(null);
    if (!spravne) {
      setTrese(kategorieId);
      setSpatnaPolozka(indexPolozky);
      if (casovac.current) clearTimeout(casovac.current);
      casovac.current = setTimeout(() => {
        setTrese(null);
        setSpatnaPolozka(null);
      }, 450);
      return;
    }
    if (tridickaHotovo(novy) && !splnenoHlaseno.current) {
      splnenoHlaseno.current = true;
      onSplneno();
    }
  };

  const klikniPolozku = (index: number) => {
    setVybrana((v) => (v === index ? null : index));
  };

  const klikniKategorii = (kategorieId: string) => {
    if (vybrana === null) return;
    zkusZaradit(vybrana, kategorieId);
  };

  return (
    <div className="tridicka">
      <p className="tridicka__zadani">{parametry.zadani}</p>

      {!hotovo && (
        <div
          className="tridicka__zasobnik"
          role="group"
          aria-label="Položky k roztřídění — vyber položku a pak kategorii"
        >
          {stav.zbyva.map((index) => (
            <button
              key={index}
              type="button"
              draggable={!dotykove}
              className={[
                'tridicka__polozka',
                vybrana === index ? 'tridicka__polozka--vybrana' : '',
                spatnaPolozka === index ? 'tridicka__polozka--spatne' : '',
              ].join(' ')}
              aria-pressed={vybrana === index}
              onClick={() => klikniPolozku(index)}
              onDragStart={(e) => {
                tahana.current = index;
                setVybrana(index);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(index));
              }}
              onDragEnd={() => {
                tahana.current = null;
                setPretahovanaNad(null);
              }}
            >
              {parametry.polozky[index].text}
            </button>
          ))}
        </div>
      )}

      <div className="tridicka__kategorie">
        {parametry.kategorie.map((kat) => (
          <div
            key={kat.id}
            className={[
              'tridicka__kos',
              pretahovanaNad === kat.id ? 'tridicka__kos--nad' : '',
              trese === kat.id ? 'tridicka__kos--trese' : '',
              vybrana !== null ? 'tridicka__kos--cil' : '',
            ].join(' ')}
            onDragOver={(e) => {
              // Kos je platnym cilem jen pro tazenou polozku zasobniku —
              // externi drag (obrazek, soubor, text z jineho okna) se ignoruje.
              if (tahana.current === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setPretahovanaNad(kat.id);
            }}
            onDragLeave={() => setPretahovanaNad((n) => (n === kat.id ? null : n))}
            onDrop={(e) => {
              e.preventDefault();
              setPretahovanaNad(null);
              // Prazdny payload (getData vraci '' u cizich dragu) NENI index 0.
              const surova = e.dataTransfer.getData('text/plain');
              const zData = surova === '' ? Number.NaN : Number(surova);
              const index = Number.isInteger(zData) ? zData : tahana.current;
              if (index !== null && index !== undefined) zkusZaradit(index, kat.id);
              tahana.current = null;
            }}
          >
            <button
              type="button"
              className="tridicka__kos-hlavicka"
              onClick={() => klikniKategorii(kat.id)}
              disabled={hotovo}
              aria-label={`Kategorie ${kat.nazev}${vybrana !== null ? ' — zařadit vybranou položku sem' : ''}`}
            >
              {kat.nazev}
              <span className="tridicka__kos-pocet">
                {(stav.zarazeno[kat.id] ?? []).length}
              </span>
            </button>
            <div className="tridicka__kos-obsah">
              {(stav.zarazeno[kat.id] ?? []).map((index) => (
                <span key={index} className="tridicka__polozka tridicka__polozka--zarazena animace-pop">
                  {parametry.polozky[index].text}
                </span>
              ))}
              {(stav.zarazeno[kat.id] ?? []).length === 0 && (
                <span className="tridicka__kos-prazdny" aria-hidden="true">
                  {dotykove ? 'Klepni na položku a pak sem…' : 'Přetáhni sem…'}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="tridicka__paticka" aria-live="polite">
        {hotovo ? (
          <div className="tridicka__oslava animace-pop">
            <Konfety />
            <span className="tridicka__oslava-titul">Roztříděno! 🎉</span>
            <span className="tridicka__oslava-detail">
              {stav.chyby === 0
                ? 'Bez jediné chyby — paráda.'
                : `Chyb cestou: ${stav.chyby}. Příště to dáš čistě.`}
            </span>
          </div>
        ) : (
          <span className="tridicka__zbyva">
            Zbývá roztřídit: {stav.zbyva.length} z {parametry.polozky.length}
          </span>
        )}
      </div>
    </div>
  );
}
