// Nastavení — VLASTNÍ agent APP-TESTY (sekce Připojení a Data);
// sekci Vzhled dodává komponenta NastaveniAvataru z hra/ (agent APP-HRA),
// sekci Profily komponenta SpravaProfilu z profily/ (agent PROFILY).
import { useState, useSyncExternalStore } from 'react';
import { pouzijStav } from '../stav/store';
import {
  nactiSyncNastaveni,
  ulozSyncNastaveni,
  vytvorKlienta,
  type SyncNastaveni,
} from '../sync/klient';
import { pripojSeKeStavuSyncu, stavSynchronizace, synchronizuj } from '../sync/sync';
import NastaveniAvataru from '../hra/NastaveniAvataru';
import PridatNaPlochu from '../komponenty/PridatNaPlochu';
import SpravaProfilu from '../profily/SpravaProfilu';
import '../testy/testy.css';

export default function Nastaveni() {
  const [nastaveni, setNastaveni] = useState<SyncNastaveni>(() => nactiSyncNastaveni());
  const [ulozeno, setUlozeno] = useState(false);
  const [zkouska, setZkouska] = useState<{ ok: boolean; text: string } | null>(null);
  const [zkousim, setZkousim] = useState(false);
  const stavSyncu = useSyncExternalStore(pripojSeKeStavuSyncu, stavSynchronizace);
  const resetujProgres = pouzijStav((s) => s.resetujProgres);

  const uloz = () => {
    ulozSyncNastaveni(nastaveni);
    setUlozeno(true);
    setTimeout(() => setUlozeno(false), 2500);
    void synchronizuj('rucne');
  };

  const vyzkousej = async () => {
    setZkousim(true);
    setZkouska(null);
    try {
      const odpoved = await vytvorKlienta(nastaveni).zdravi();
      setZkouska({ ok: true, text: `Server běží (verze ${odpoved.verze}). ✅` });
    } catch (chyba) {
      setZkouska({
        ok: false,
        text: `Nepodařilo se připojit: ${chyba instanceof Error ? chyba.message : 'neznámá chyba'}`,
      });
    } finally {
      setZkousim(false);
    }
  };

  const smazPostup = () => {
    const jistota = window.confirm(
      'Opravdu smazat celý postup aktivního profilu? Přijdeš o XP, streak, sbírku i statistiky. Tohle nejde vrátit.',
    );
    if (!jistota) return;
    // Akci garantuje hraSlice; guard kvůli souběžnému vývoji slices.
    resetujProgres?.();
  };

  const posledniSync = stavSyncu.posledniUspech
    ? new Date(stavSyncu.posledniUspech).toLocaleString('cs-CZ')
    : 'zatím nikdy';

  return (
    <section aria-label="Nastavení">
      <h1>Nastavení</h1>

      <div className="nastaveni-sekce">
        <h2>Připojení</h2>
        <div className="panel nastaveni-formular">
          <p className="nastaveni-stav">
            Rodinný kód propojí zařízení rodiny: profily, jejich PINy, studijní banky i herní
            postup (XP, streak, sbírka, statistiky) se synchronizují přes server. Postup lekcí
            a historie testů zatím zůstávají na každém zařízení zvlášť. Bez kódu běží aplikace
            čistě lokálně.
          </p>
          <div className="nastaveni-pole">
            <label htmlFor="sync-url">Adresa serveru</label>
            <input
              id="sync-url"
              type="text"
              value={nastaveni.url}
              placeholder="http://localhost:8787"
              onChange={(e) => setNastaveni({ ...nastaveni, url: e.target.value })}
            />
          </div>
          <div className="nastaveni-pole">
            <label htmlFor="sync-token">Rodinný kód</label>
            <input
              id="sync-token"
              type="password"
              value={nastaveni.token}
              autoComplete="off"
              placeholder="Bez kódu běží aplikace jen lokálně"
              onChange={(e) => setNastaveni({ ...nastaveni, token: e.target.value })}
            />
          </div>
          <div className="nastaveni-akce">
            <button type="button" className="tlacitko tlacitko--primarni" onClick={uloz}>
              Uložit
            </button>
            <button type="button" className="tlacitko" disabled={zkousim} onClick={vyzkousej}>
              {zkousim ? 'Zkouším…' : 'Vyzkoušet'}
            </button>
            <button
              type="button"
              className="tlacitko"
              disabled={stavSyncu.bezi}
              onClick={() => void synchronizuj('rucne')}
            >
              {stavSyncu.bezi ? 'Synchronizuji…' : 'Synchronizovat teď'}
            </button>
            {ulozeno && <span className="nastaveni-stav nastaveni-stav--ok">Uloženo ✅</span>}
          </div>
          {zkouska && (
            <p className={`nastaveni-stav ${zkouska.ok ? 'nastaveni-stav--ok' : 'nastaveni-stav--chyba'}`}>
              {zkouska.text}
            </p>
          )}
          <p className="nastaveni-stav">
            Poslední úspěšný sync: {posledniSync}
            {stavSyncu.veFronte > 0 && ` · ve frontě čeká ${stavSyncu.veFronte}`}
            {stavSyncu.posledniChyba && !stavSyncu.bezi && ' · server je teď offline (hra jede dál)'}
          </p>
        </div>
      </div>

      <div className="nastaveni-sekce">
        <h2>Profily</h2>
        <SpravaProfilu />
      </div>

      <PridatNaPlochu />{/* sekce „Aplikace v telefonu" — jen ve webové verzi */}

      <div className="nastaveni-sekce">
        <h2>Vzhled</h2>
        <NastaveniAvataru />
      </div>

      <div className="nastaveni-sekce">
        <h2>Data</h2>
        <div className="panel nastaveni-formular">
          <p className="nastaveni-stav">
            Smaže XP, streak, questy, sbírku i statistiky otázek AKTIVNÍHO profilu v tomhle
            počítači. Ostatní profily a banky otázek zůstanou.
          </p>
          <div className="nastaveni-akce">
            <button type="button" className="tlacitko tlacitko--nebezpecne" onClick={smazPostup}>
              Smazat lokální postup
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
