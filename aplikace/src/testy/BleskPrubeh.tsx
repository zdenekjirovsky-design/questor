// Průběh bleskovek — rychlý dril (VLASTNÍ agent APP-TESTY).
// Velké zadání s políčkem k doplnění, pod ním velká tlačítka možností.
// Správně: políčko se doplní zeleně, vyletí +XP a další otázka naskočí SAMA
// (PRODLEVA_PO_SPRAVNE_MS). Špatně: zatřesení, správně doplněné znění,
// vysvětlení a název tématu — dál až tlačítkem „Rozumím, dál“ (Enter).
// Téma se PŘED odpovědí neukazuje: student má sám poznat, o jaký jev jde.
// Klávesy: 1/2/3 podle pozice a navíc písmeno možnosti (i / y), když je
// jednoznačné. Stav kola drží testový engine (aktualniTest s polem `blesk`);
// čisté kousky ovládání jsou v ./bleskOvladani.ts (testují se bez DOM).
// Mobil: tlačítka přes celou šířku, zpětná vazba po chybě se doroluje do
// zorného pole, nová otázka začíná v zorném poli a ťuknutí těsně po
// zobrazení otázky / zpětné vazby se zahodí (dvojí ťuknutí neodpoví naslepo
// ani nepřeskočí vysvětlení).
// Čtečky obrazovky: jedna trvalá živá oblast čte každou novou otázku
// (naskakuje sama, jinak by se o ní nevidomý nedozvěděl) i zpětnou vazbu.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { comboNasobic } from '@questor/sdilene';
import type { OtazkaVyber } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { aktualniOtazka, fazeTestu, planovanyPocetOtazek, type TestStav } from './engine';
import { maKratkeMoznosti, poradiBleskovychMoznosti, rozdelZadani } from './blesk';
import {
  akceKlavesy,
  fazeBlesku,
  naplanujAutoPosun,
  oznameniBlesku,
  tridyMoznostiBlesku,
  type FazeBlesku,
} from './bleskOvladani';
import { jeVstupniPole } from './komponenty/klavesy';
import { pouzijOchranuKliku } from './pouzijOchranuKliku';
import { posunDoZorneho, pouzijNavratNaZacatek } from './posun';
import BleskZneni from './BleskZneni';
import './testy.css';
import './blesk.css';

/** Délka zadání → menší písmo, ať se dlouhá věta vejde bez scrollu. */
function tridaDelkyZadani(zadani: string): string {
  if (zadani.length > 60) return ' blesk-zadani--dlouhe';
  if (zadani.length > 28) return ' blesk-zadani--stredni';
  return '';
}

/** Fáze aktuální otázky kola: čeká na odpověď / správně / špatně. */
function fazeOtazky(stav: TestStav): FazeBlesku {
  const zaznam =
    fazeTestu(stav) === 'feedback' ? (stav.odpovedi[stav.odpovedi.length - 1] ?? null) : null;
  return fazeBlesku(zaznam ? zaznam.spravne : null);
}

export default function BleskPrubeh({ stav }: { stav: TestStav }) {
  const navigate = useNavigate();
  const dokonciTestAkce = pouzijStav((s) => s.dokonciTest);
  // Názvy témat z banky (po studeném startu chvíli chybí — štítek tématu
  // ve zpětné vazbě pak počká).
  const temata = pouzijStav((s) => s.banky[stav.konfigurace.predmetId]?.temata);

  // Nová otázka začíná v zorném poli: když je hlavička nad okrajem (po
  // dorolování zpětné vazby), vrátí se na ni ještě před vykreslením.
  const hlavickaRef = useRef<HTMLDivElement | null>(null);
  pouzijNavratNaZacatek(hlavickaRef, stav.index);

  // Po poslední otázce: vyhodnocení (truhla, XP, sync) a výsledek.
  const dokonceno = stav.dokonceno;
  useEffect(() => {
    if (!dokonceno) return;
    dokonciTestAkce();
    navigate('/vysledek');
  }, [dokonceno, dokonciTestAkce, navigate]);

  const otazka = aktualniOtazka(stav);
  // Pořadí možností se počítá i pro živou oblast, proto tady (hook před
  // případným návratem null níž).
  const poradi = useMemo(
    () => (otazka && otazka.typ === 'vyber' ? poradiBleskovychMoznosti(otazka) : []),
    [otazka],
  );
  if (!otazka || otazka.typ !== 'vyber' || dokonceno) return null;

  const planovano = planovanyPocetOtazek(stav);
  const faze = fazeOtazky(stav);
  const cisloOtazky = Math.min(stav.odpovedi.length + (faze === 'otazka' ? 1 : 0), planovano);
  const nasobic = comboNasobic(stav.combo);
  const nazevTematu = temata?.find((t) => t.id === otazka.temaId)?.nazev;

  return (
    <section className="blesk" aria-label={`Bleskovky — otázka ${cisloOtazky} z ${planovano}`}>
      <div className="test-hlavicka" ref={hlavickaRef}>
        <span className="test-pocitadlo">
          {cisloOtazky}/{planovano}
        </span>
        <div
          className="ukazatel"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={planovano}
          aria-valuenow={stav.odpovedi.length}
        >
          <div style={{ width: `${(stav.odpovedi.length / Math.max(1, planovano)) * 100}%` }} />
        </div>
        <span className={`test-combo blesk__combo${stav.combo >= 1 ? ' test-combo--aktivni' : ''}`}>
          {stav.combo >= 1 ? `🔥 Combo ×${nasobic.toFixed(1)}` : 'Combo ×1.0'}
        </span>
      </div>

      {/* Živá oblast pro čtečky — trvalá přes celé kolo (NENÍ uvnitř
          přemontovávané otázky): čte novou otázku, „Správně.“ i chybu. */}
      <p className="blesk-cteni" aria-live="polite">
        {oznameniBlesku({
          faze,
          cislo: cisloOtazky,
          celkem: planovano,
          zadani: otazka.zadani,
          moznosti: poradi.map((index) => otazka.moznosti[index] ?? ''),
          spravnyText: otazka.moznosti[otazka.spravna] ?? '',
          vysvetleni: otazka.vysvetleni,
          nazevTematu,
        })}
      </p>

      {/* key = index otázky: komponenta se s každou otázkou montuje znovu,
          takže do nové otázky neproteče výběr, čas ani časovač té minulé. */}
      <BleskOtazka
        key={stav.index}
        stav={stav}
        otazka={otazka}
        poradi={poradi}
        faze={faze}
        nazevTematu={nazevTematu}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Jedna otázka: zadání, možnosti, zpětná vazba

interface BleskOtazkaProps {
  stav: TestStav;
  otazka: OtazkaVyber;
  /** Pořadí možností na obrazovce: pozice → datový index. */
  poradi: number[];
  faze: FazeBlesku;
  /** Název tématu (jen do zpětné vazby po chybě); undefined = banka se ještě načítá. */
  nazevTematu: string | undefined;
}

function BleskOtazka({ stav, otazka, poradi, faze, nazevTematu }: BleskOtazkaProps) {
  const odpovezAkce = pouzijStav((s) => s.odpovez);
  const dalsiOtazkaAkce = pouzijStav((s) => s.dalsiOtazka);

  /** Výsledek odpovědi na tuhle otázku; null = ještě se čeká. */
  const spravne = faze === 'otazka' ? null : faze === 'spravne';
  const posledniOtazka = stav.index + 1 >= stav.otazky.length;
  const pismena = maKratkeMoznosti(otazka);
  const sirkaZnaku = Math.max(...otazka.moznosti.map((m) => Array.from(m.trim()).length));
  const spravnyText = otazka.moznosti[otazka.spravna] ?? '';
  const maMezeru = rozdelZadani(otazka.zadani) !== null;

  /** Datový index možnosti, kterou student zvolil (po obnovení stránky neznámý). */
  const [vybrana, setVybrana] = useState<number | null>(null);
  /** Okamžik zobrazení otázky — čas odpovědi se měří od něj. */
  const zobrazeno = useRef(Date.now());

  // Ťuknutí v prvních ~350 ms po zobrazení otázky se zahodí (dvojí ťuknutí
  // na „Rozumím, dál“ nebo po auto-posunu by odpovědělo naslepo); stejně
  // tak ťuknutí těsně po zobrazení zpětné vazby (dorolovaná pod prst by
  // šla odkliknout bez přečtení) — proto je druhá ochrana klíčovaná fází.
  // Klávesnice ochranou neprochází.
  const ochranaOtazky = pouzijOchranuKliku(stav.index);
  const ochranaVazby = pouzijOchranuKliku(faze);

  const odpovez = useCallback(
    (index: number) => {
      // Fáze se čte ze store v okamžiku stisku — dvě klávesy ve stejném
      // okamžiku nesmí přepsat zvolenou možnost už zodpovězené otázky.
      const aktualni = pouzijStav.getState().aktualniTest;
      if (!aktualni || fazeTestu(aktualni) !== 'otazka') return;
      setVybrana(index);
      odpovezAkce({ typ: 'vyber', vybrana: index }, Date.now() - zobrazeno.current);
    },
    [odpovezAkce],
  );

  // Správně → další otázka naskočí sama (po poslední engine test dokončí).
  // Úklid časovač ruší — odmontování uprostřed prodlevy nic neposune.
  useEffect(() => naplanujAutoPosun(spravne, dalsiOtazkaAkce), [spravne, dalsiOtazkaAkce]);

  // Klávesy: 1/2/3 a písmeno možnosti odpovídají, Enter po chybě pokračuje.
  useEffect(() => {
    const zpracuj = (e: KeyboardEvent) => {
      if (jeVstupniPole(e.target)) return;
      const akce = akceKlavesy(e, { faze, moznosti: otazka.moznosti, poradi });
      if (!akce) return;
      e.preventDefault();
      if (akce.typ === 'odpoved') odpovez(akce.index);
      else dalsiOtazkaAkce();
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [faze, otazka, poradi, odpovez, dalsiOtazkaAkce]);

  // Po chybě plynule dorolovat zpětnou vazbu i s tlačítkem do zorného pole —
  // jen když není celá vidět (scroll-margin v testy.css počítá s fixní
  // spodní lištou na mobilu).
  const vazbaRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (faze === 'spatne') posunDoZorneho(vazbaRef.current);
  }, [faze]);

  return (
    <>
      <div
        className={`panel blesk-otazka blesk-otazka--${faze}`}
        onClickCapture={ochranaOtazky}
      >
        {faze === 'spravne' && stav.posledniXp > 0 && (
          <span className="xp-let">+{stav.posledniXp} XP</span>
        )}
        <div className="blesk-otazka__stitky">
          <span className="stitek blesk-stitek">
            {stav.blesk?.oprava ? '🔁 Oprava chyb' : '⚡ Bleskovky'}
          </span>
        </div>
        <h2 className={`blesk-zadani${tridaDelkyZadani(otazka.zadani)}`}>
          <span className="blesk-zadani__text">
            <BleskZneni
              zadani={otazka.zadani}
              doplneno={faze === 'otazka' ? null : spravnyText}
              stav={faze === 'otazka' ? 'prazdne' : faze === 'spravne' ? 'spravne' : 'oprava'}
              sirkaZnaku={sirkaZnaku}
            />
          </span>
        </h2>
        <div
          className={`blesk-moznosti blesk-moznosti--${poradi.length} ${
            pismena ? 'blesk-moznosti--pismena' : 'blesk-moznosti--slova'
          }`}
          role="group"
          aria-label="Možnosti odpovědi"
        >
          {poradi.map((index, pozice) => (
            <button
              key={index}
              type="button"
              className={tridyMoznostiBlesku(index, { faze, spravna: otazka.spravna, vybrana })}
              disabled={faze !== 'otazka'}
              aria-label={`Odpověď ${pozice + 1}: ${otazka.moznosti[index]}`}
              onClick={() => odpovez(index)}
            >
              <span className="blesk-moznost__klavesa" aria-hidden="true">
                {pozice + 1}
              </span>
              <span className="blesk-moznost__text">{otazka.moznosti[index]}</span>
            </button>
          ))}
        </div>
      </div>

      {faze === 'spatne' && (
        <div
          ref={vazbaRef}
          className="panel feedback feedback--spatne blesk-feedback"
          onClickCapture={ochranaVazby}
        >
          <div className="feedback__titulek">Tahle ti ještě uteče. Mrkni proč:</div>
          <p className="blesk-feedback__spravne">
            <span className="blesk-feedback__popisek">Správně: </span>
            {maMezeru ? (
              <strong className="blesk-zneni">
                <BleskZneni zadani={otazka.zadani} doplneno={spravnyText} stav="text" />
              </strong>
            ) : (
              <strong className="blesk-zneni blesk-policko--text">{spravnyText}</strong>
            )}
          </p>
          <p className="blesk-feedback__vysvetleni">{otazka.vysvetleni}</p>
          {/* Zdroj otázky se tu nevypisuje — bývá to název kapitoly, tedy
              totéž co štítek tématu, a na mobilu by jen přidal řádek. */}
          <div className="blesk-feedback__pata">
            {nazevTematu && (
              <span className="stitek blesk-feedback__tema">Téma: {nazevTematu}</span>
            )}
            <button
              type="button"
              className={`tlacitko ${posledniOtazka ? 'tlacitko--zlate' : 'tlacitko--primarni'} blesk-feedback__dal`}
              onClick={dalsiOtazkaAkce}
            >
              {/* Jeden flex prvek (gap .tlacitko by jinak rozšířil mezeru);
                  „(Enter)“ se na dotyku skrývá — klávesnice tam není. */}
              <span>
                {posledniOtazka ? 'Rozumím, vyhodnotit' : 'Rozumím, dál'}
                <span className="napoveda-klavesy"> (Enter)</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
