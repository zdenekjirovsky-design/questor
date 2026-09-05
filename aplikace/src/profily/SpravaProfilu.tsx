// Sprava profilu v Nastaveni: prejmenovani a PIN (po overeni) AKTIVNIHO
// profilu, mazani libovolneho profilu s dvojitym potvrzenim + opsanim jmena.
// Posledni profil smazat nejde (aplikace by nemela koho hrat).
import { useState } from 'react';
import { pouzijStav } from '../stav/store';
import { MAX_DELKA_JMENA, type Profil } from '../stav/profilySlice';
import { jePinPodporovan, jePlatnyPin, overPin, zahashujPin } from './pin';
import './SpravaProfilu.css';

// ---------------------------------------------------------------------------
// PIN sekce aktivniho profilu (zmena / zruseni po overeni, nastaveni noveho)

function PinSekce({ profil }: { profil: Profil }) {
  const nastavPinProfilu = pouzijStav((s) => s.nastavPinProfilu);
  const [soucasny, setSoucasny] = useState('');
  const [novy, setNovy] = useState('');
  const [zprava, setZprava] = useState<{ ok: boolean; text: string } | null>(null);
  const [pracuji, setPracuji] = useState(false);

  const hotovo = (ok: boolean, text: string) => {
    setZprava({ ok, text });
    if (ok) {
      setSoucasny('');
      setNovy('');
    }
  };

  const overSoucasny = async (): Promise<boolean> => {
    if (!profil.pinHash) return true;
    if (!(await overPin(soucasny, profil.id, profil.pinHash))) {
      hotovo(false, 'Současný PIN nesedí.');
      return false;
    }
    return true;
  };

  const zmenPin = async () => {
    if (pracuji) return;
    if (!jePlatnyPin(novy)) {
      hotovo(false, 'Nový PIN má 4–6 číslic.');
      return;
    }
    setPracuji(true);
    try {
      if (!(await overSoucasny())) return;
      nastavPinProfilu(profil.id, await zahashujPin(novy, profil.id));
      hotovo(true, profil.pinHash ? 'PIN změněn. ✅' : 'PIN nastaven. ✅');
    } catch {
      // crypto.subtle chybi v nezabezpecenem kontextu — bez catch by hash
      // spadl tise (unhandled rejection) a uzivatel by nevidel zadnou chybu.
      hotovo(false, 'Práce s PINem tady nejde — otevři aplikaci přes zabezpečené připojení (https).');
    } finally {
      setPracuji(false);
    }
  };

  const zrusPin = async () => {
    if (pracuji) return;
    setPracuji(true);
    try {
      if (!(await overSoucasny())) return;
      nastavPinProfilu(profil.id, undefined);
      hotovo(true, 'PIN zrušen — profil je bez zámku.');
    } catch {
      hotovo(false, 'Práce s PINem tady nejde — otevři aplikaci přes zabezpečené připojení (https).');
    } finally {
      setPracuji(false);
    }
  };

  if (!jePinPodporovan()) {
    return (
      <div className="sprava-profilu__pin">
        <h3>{profil.pinHash ? 'Změna PINu' : 'Nastavit PIN'}</h3>
        <p className="sprava-profilu__napoveda">
          PIN vyžaduje zabezpečené připojení (https) — tady ho nejde nastavit, měnit ani ověřit.
        </p>
      </div>
    );
  }

  return (
    <div className="sprava-profilu__pin">
      <h3>{profil.pinHash ? 'Změna PINu' : 'Nastavit PIN'}</h3>
      <p className="sprava-profilu__napoveda">
        PIN je jemný zámek soukromí na tomhle počítači — 4 až 6 číslic.
      </p>
      <div className="sprava-profilu__radek">
        {profil.pinHash && (
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            placeholder="Současný PIN"
            aria-label="Současný PIN"
            value={soucasny}
            onChange={(e) => {
              setSoucasny(e.target.value.replace(/[^0-9]/g, ''));
              setZprava(null);
            }}
          />
        )}
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          placeholder="Nový PIN"
          aria-label="Nový PIN"
          value={novy}
          onChange={(e) => {
            setNovy(e.target.value.replace(/[^0-9]/g, ''));
            setZprava(null);
          }}
        />
        <button
          type="button"
          className="tlacitko tlacitko--primarni"
          disabled={pracuji}
          onClick={() => void zmenPin()}
        >
          {profil.pinHash ? 'Změnit PIN' : 'Nastavit PIN'}
        </button>
        {profil.pinHash && (
          <button type="button" className="tlacitko" disabled={pracuji} onClick={() => void zrusPin()}>
            Zrušit PIN
          </button>
        )}
      </div>
      {zprava && (
        <p
          className={
            zprava.ok
              ? 'sprava-profilu__zprava sprava-profilu__zprava--ok'
              : 'sprava-profilu__zprava sprava-profilu__zprava--chyba'
          }
          role="status"
        >
          {zprava.text}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mazani profilu: dvojite potvrzeni + opsani jmena profilu

function MazaniProfilu({ profil, posledni }: { profil: Profil; posledni: boolean }) {
  const smazProfil = pouzijStav((s) => s.smazProfil);
  const [krok, setKrok] = useState<0 | 1 | 2>(0);
  const [opsaneJmeno, setOpsaneJmeno] = useState('');

  if (posledni) {
    return (
      <span className="sprava-profilu__napoveda">Poslední profil smazat nejde.</span>
    );
  }

  if (krok === 0) {
    return (
      <button type="button" className="tlacitko tlacitko--nebezpecne" onClick={() => setKrok(1)}>
        Smazat…
      </button>
    );
  }

  if (krok === 1) {
    return (
      <span className="sprava-profilu__radek">
        <span className="sprava-profilu__varovani">
          Opravdu? Smaže XP, sbírku, statistiky i postup lekcí profilu {profil.jmeno}.
        </span>
        <button type="button" className="tlacitko" onClick={() => setKrok(0)}>
          Zpět
        </button>
        <button
          type="button"
          className="tlacitko tlacitko--nebezpecne"
          onClick={() => setKrok(2)}
        >
          Ano, pokračovat
        </button>
      </span>
    );
  }

  return (
    <span className="sprava-profilu__radek">
      <input
        type="text"
        placeholder={`Napiš „${profil.jmeno}"`}
        aria-label={`Pro smazání napiš jméno profilu ${profil.jmeno}`}
        value={opsaneJmeno}
        onChange={(e) => setOpsaneJmeno(e.target.value)}
      />
      <button
        type="button"
        className="tlacitko"
        onClick={() => {
          setKrok(0);
          setOpsaneJmeno('');
        }}
      >
        Zpět
      </button>
      <button
        type="button"
        className="tlacitko tlacitko--nebezpecne"
        disabled={opsaneJmeno.trim() !== profil.jmeno}
        onClick={() => smazProfil(profil.id)}
      >
        Smazat navždy
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cela sekce Profily

export default function SpravaProfilu() {
  const profily = pouzijStav((s) => s.profily);
  const aktivniProfilId = pouzijStav((s) => s.aktivniProfilId);
  const prejmenujProfil = pouzijStav((s) => s.prejmenujProfil);
  const [noveJmeno, setNoveJmeno] = useState<string | null>(null);

  const aktivni = profily.find((p) => p.id === aktivniProfilId) ?? null;

  const ulozJmeno = () => {
    if (!aktivni || noveJmeno === null) return;
    if (prejmenujProfil(aktivni.id, noveJmeno)) setNoveJmeno(null);
  };

  return (
    <div className="panel nastaveni-formular sprava-profilu">
      {aktivni && (
        <>
          <div className="sprava-profilu__pin">
            <h3>Jméno profilu</h3>
            <div className="sprava-profilu__radek">
              <span className="sprava-profilu__tecka" style={{ background: aktivni.barva }} aria-hidden="true" />
              <input
                type="text"
                maxLength={MAX_DELKA_JMENA}
                aria-label="Jméno aktivního profilu"
                value={noveJmeno ?? aktivni.jmeno}
                onChange={(e) => setNoveJmeno(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') ulozJmeno();
                }}
              />
              <button
                type="button"
                className="tlacitko tlacitko--primarni"
                disabled={noveJmeno === null || !noveJmeno.trim() || noveJmeno === aktivni.jmeno}
                onClick={ulozJmeno}
              >
                Přejmenovat
              </button>
            </div>
          </div>
          <PinSekce profil={aktivni} />
        </>
      )}

      <div className="sprava-profilu__pin">
        <h3>Všechny profily</h3>
        <p className="sprava-profilu__napoveda">
          Jméno a PIN upravíš po přepnutí na daný profil (avatar v hlavičce).
        </p>
        <ul className="sprava-profilu__seznam">
          {profily.map((profil) => (
            <li key={profil.id} className="sprava-profilu__polozka">
              <span className="sprava-profilu__tecka" style={{ background: profil.barva }} aria-hidden="true" />
              <span className="sprava-profilu__jmeno">
                {profil.jmeno}
                {profil.pinHash && <span aria-label="s PINem"> 🔒</span>}
                {profil.id === aktivniProfilId && (
                  <span className="stitek sprava-profilu__stitek">aktivní</span>
                )}
              </span>
              <MazaniProfilu profil={profil} posledni={profily.length <= 1} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
