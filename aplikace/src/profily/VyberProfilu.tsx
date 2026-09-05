// Vyber profilu — celoobrazovkova brana (App.tsx ji ukaze, kdyz neni aktivni
// profil): velke hrave karty profilu s avatarem a jmenem, „+ Novy profil".
// PIN je jen MEKKA ochrana soukromi v domacnosti: overuje se lokalne
// (SHA-256 se soli id profilu), 3 spatne pokusy = 30 s pauza.
import { useEffect, useMemo, useRef, useState } from 'react';
import { VYCHOZI_AVATAR } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { BARVY_PROFILU, MAX_DELKA_JMENA, vytvorIdProfilu, type Profil } from '../stav/profilySlice';
import { jePinPodporovan, jePlatnyPin, overPin, zahashujPin, zaznamenejPokus, zbyvaPauzaMs } from './pin';
import Avatar from '../hra/Avatar';
import './VyberProfilu.css';

// ---------------------------------------------------------------------------
// PIN dialog (odemknuti profilu)

function PinDialog({ profil, onOdemceno, onZpet }: {
  profil: Profil;
  onOdemceno: () => void;
  onZpet: () => void;
}) {
  const [pin, setPin] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [overuji, setOveruji] = useState(false);
  const [pauzaMs, setPauzaMs] = useState(() => zbyvaPauzaMs(profil.id));
  const vstup = useRef<HTMLInputElement>(null);

  // Odpocet pauzy po 3 spatnych pokusech.
  useEffect(() => {
    if (pauzaMs <= 0) return;
    const casovac = setInterval(() => setPauzaMs(zbyvaPauzaMs(profil.id)), 500);
    return () => clearInterval(casovac);
  }, [pauzaMs, profil.id]);

  useEffect(() => {
    vstup.current?.focus();
  }, []);

  const potvrd = async () => {
    if (overuji || zbyvaPauzaMs(profil.id) > 0 || !profil.pinHash) return;
    if (!jePlatnyPin(pin)) {
      setChyba('PIN má 4–6 číslic.');
      return;
    }
    setOveruji(true);
    try {
      const ok = await overPin(pin, profil.id, profil.pinHash);
      zaznamenejPokus(profil.id, ok);
      if (ok) {
        onOdemceno();
        return;
      }
      setPin('');
      const pauza = zbyvaPauzaMs(profil.id);
      setPauzaMs(pauza);
      setChyba(pauza > 0 ? null : 'Špatný PIN, zkus to znovu.');
    } catch {
      // crypto.subtle chybi v nezabezpecenem kontextu (http mimo localhost) —
      // bez catch by slo o tichy unhandled rejection a dialog by „zamrzl".
      setChyba('PIN tady nejde ověřit — otevři aplikaci přes zabezpečené připojení (https).');
    } finally {
      setOveruji(false);
    }
  };

  const zamceno = pauzaMs > 0;

  return (
    <form
      className="panel vyber-profilu__dialog"
      role="dialog"
      aria-label={`PIN profilu ${profil.jmeno}`}
      onSubmit={(e) => {
        e.preventDefault();
        void potvrd();
      }}
    >
      <h2>
        <span className="vyber-profilu__zamek" aria-hidden="true">🔒</span> {profil.jmeno}
      </h2>
      <p className="vyber-profilu__napoveda">Zadej PIN profilu.</p>
      <input
        ref={vstup}
        className="vyber-profilu__pin-vstup"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        disabled={zamceno}
        aria-label="PIN"
        onChange={(e) => {
          setPin(e.target.value.replace(/[^0-9]/g, ''));
          setChyba(null);
        }}
      />
      {zamceno ? (
        <p className="vyber-profilu__chyba" role="status">
          3 špatné pokusy. Zkus to za {Math.ceil(pauzaMs / 1000)} s.
        </p>
      ) : (
        chyba && (
          <p className="vyber-profilu__chyba" role="alert">
            {chyba}
          </p>
        )
      )}
      <div className="vyber-profilu__dialog-akce">
        <button type="button" className="tlacitko" onClick={onZpet}>
          Zpět
        </button>
        <button
          type="submit"
          className="tlacitko tlacitko--primarni"
          disabled={zamceno || overuji || pin.length < 4}
        >
          Odemknout
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Formular noveho profilu

function NovyProfilFormular({ prvni, onZpet }: { prvni: boolean; onZpet: () => void }) {
  const vytvorProfil = pouzijStav((s) => s.vytvorProfil);
  const [jmeno, setJmeno] = useState('');
  const [barva, setBarva] = useState<string>(BARVY_PROFILU[0]);
  const [pin, setPin] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [zakladam, setZakladam] = useState(false);
  const pinPodporovan = jePinPodporovan();

  const zaloz = async () => {
    if (zakladam) return;
    const cistne = jmeno.trim();
    if (!cistne) {
      setChyba('Vyplň jméno profilu.');
      return;
    }
    if (pin && !jePlatnyPin(pin)) {
      setChyba('PIN má 4–6 číslic (nebo ho nech prázdný).');
      return;
    }
    setZakladam(true);
    try {
      if (pin) {
        // Sul PIN hashe je id profilu — id se vygeneruje PREDEM a hash se
        // pocita JESTE PRED zalozenim: kdyz hash selze (crypto.subtle chybi
        // v nezabezpecenem kontextu), profil nevznikne a uzivatel vidi chybu
        // misto profilu, ktery tise zustal bez zamku.
        const id = vytvorIdProfilu();
        const hash = await zahashujPin(pin, id);
        vytvorProfil(cistne, barva, hash, id);
      } else {
        vytvorProfil(cistne, barva);
      }
      // Zalozeni profil rovnou aktivuje — App.tsx branu sam schova.
    } catch {
      setChyba('PIN se nepodařilo nastavit — otevři aplikaci přes zabezpečené připojení (https), nebo založ profil bez PINu.');
    } finally {
      setZakladam(false);
    }
  };

  return (
    <form
      className="panel vyber-profilu__dialog"
      role="dialog"
      aria-label="Nový profil"
      onSubmit={(e) => {
        e.preventDefault();
        void zaloz();
      }}
    >
      <h2>{prvni ? 'Vytvoř si profil' : 'Nový profil'}</h2>
      {prvni && (
        <p className="vyber-profilu__napoveda">
          Každý, kdo tu hraje, má vlastní postup, XP i sbírku. Žádný e-mail — všechno zůstává v
          tomhle počítači.
        </p>
      )}
      <label className="vyber-profilu__pole">
        Jméno
        <input
          type="text"
          value={jmeno}
          maxLength={MAX_DELKA_JMENA}
          placeholder="Třeba Máma nebo Kuba"
          autoFocus
          onChange={(e) => {
            setJmeno(e.target.value);
            setChyba(null);
          }}
        />
      </label>
      <fieldset className="vyber-profilu__barvy">
        <legend>Barva</legend>
        {BARVY_PROFILU.map((b) => (
          <button
            key={b}
            type="button"
            className={
              b === barva
                ? 'vyber-profilu__barva vyber-profilu__barva--vybrana'
                : 'vyber-profilu__barva'
            }
            style={{ background: b }}
            aria-label={`Barva ${b}`}
            aria-pressed={b === barva}
            onClick={() => setBarva(b)}
          />
        ))}
      </fieldset>
      {pinPodporovan ? (
        <label className="vyber-profilu__pole">
          PIN (nepovinný, 4–6 číslic)
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            placeholder="Bez PINu je profil bez zámku"
            onChange={(e) => {
              setPin(e.target.value.replace(/[^0-9]/g, ''));
              setChyba(null);
            }}
          />
        </label>
      ) : (
        <p className="vyber-profilu__napoveda">
          PIN vyžaduje zabezpečené připojení (https) — na tomhle připojení bude profil bez zámku.
        </p>
      )}
      {chyba && (
        <p className="vyber-profilu__chyba" role="alert">
          {chyba}
        </p>
      )}
      <div className="vyber-profilu__dialog-akce">
        {!prvni && (
          <button type="button" className="tlacitko" onClick={onZpet}>
            Zpět
          </button>
        )}
        <button type="submit" className="tlacitko tlacitko--zlate" disabled={zakladam}>
          {zakladam ? 'Zakládám…' : 'Hrát!'}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Vlastni obrazovka vyberu

export default function VyberProfilu() {
  const profily = pouzijStav((s) => s.profily);
  const dataProfilu = pouzijStav((s) => s.dataProfilu);
  const prepniProfil = pouzijStav((s) => s.prepniProfil);

  const [pinProfilId, setPinProfilId] = useState<string | null>(null);
  const [novyOtevreny, setNovyOtevreny] = useState(false);

  const pinProfil = useMemo(
    () => profily.find((p) => p.id === pinProfilId) ?? null,
    [profily, pinProfilId],
  );

  const vyberProfil = (profil: Profil) => {
    if (profil.pinHash) {
      setPinProfilId(profil.id);
    } else {
      prepniProfil(profil.id);
    }
  };

  const zadneProfily = profily.length === 0;

  return (
    <div className="vyber-profilu">
      <div className="vyber-profilu__logo" aria-hidden="true">
        <span className="vyber-profilu__erb">⚜️</span> QUESTOR
      </div>

      {pinProfil ? (
        <PinDialog
          profil={pinProfil}
          onOdemceno={() => {
            prepniProfil(pinProfil.id);
            setPinProfilId(null);
          }}
          onZpet={() => setPinProfilId(null)}
        />
      ) : novyOtevreny || zadneProfily ? (
        <NovyProfilFormular prvni={zadneProfily} onZpet={() => setNovyOtevreny(false)} />
      ) : (
        <>
          <h1 className="vyber-profilu__nadpis">Kdo dnes hraje?</h1>
          <div className="vyber-profilu__karty">
            {profily.map((profil, i) => {
              const avatar = dataProfilu[profil.id]?.progres.avatar ?? VYCHOZI_AVATAR;
              return (
                <button
                  key={profil.id}
                  type="button"
                  className="vyber-profilu__karta"
                  style={{ ['--barva-profilu' as string]: profil.barva, animationDelay: `${i * 60}ms` }}
                  onClick={() => vyberProfil(profil)}
                >
                  <span className="vyber-profilu__avatar">
                    <Avatar konfigurace={avatar} velikost={104} />
                  </span>
                  <span className="vyber-profilu__jmeno">
                    {profil.pinHash && (
                      <span className="vyber-profilu__zamek" aria-label="Profil s PINem">
                        🔒
                      </span>
                    )}
                    {profil.jmeno}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="vyber-profilu__karta vyber-profilu__karta--novy"
              style={{ animationDelay: `${profily.length * 60}ms` }}
              onClick={() => setNovyOtevreny(true)}
            >
              <span className="vyber-profilu__plus" aria-hidden="true">
                +
              </span>
              <span className="vyber-profilu__jmeno">Nový profil</span>
            </button>
          </div>
          <p className="vyber-profilu__napoveda">
            Každý profil má vlastní postup, XP a sbírku. Přepneš se kdykoli kliknutím na avatara
            v hlavičce.
          </p>
        </>
      )}
    </div>
  );
}
