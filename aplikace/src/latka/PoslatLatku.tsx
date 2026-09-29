// „Poslat látku" — povolený profil (Matěj) pošle fotky zápisků nebo
// dokumenty; zpracovatel u správce z nich udělá učivo, otázky a lekci.
// Stránka ukazuje i stav poslaných zásilek s odkazy na hotové lekce.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LIMITY_MATERIALU,
  POPIS_STAVU_MATERIALU,
  type Material,
  type StavMaterialu,
} from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { aktivniPredmetProfilu, najdiAktivniProfil, predmetyProfilu } from '../stav/profilySlice';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import { nactiSyncNastaveni } from '../sync/klient';
import { kdyRelativne } from '../admin/admin';
import { jeObrazek, nactiMojiLatku, posliLatku, pripravFotku, zapamatujPovoleni } from './latka';
import './PoslatLatku.css';

const IKONA_STAVU: Record<StavMaterialu, string> = {
  ceka: '⏳',
  zpracovava: '⚙️',
  hotovo: '✅',
  chyba: '⚠️',
  vraceno: '↩️',
};

interface VybranySoubor {
  id: number;
  soubor: File;
  nahled: string | null;
}

function formatVelikost(bajty: number): string {
  if (bajty < 1024 * 1024) return `${Math.max(1, Math.round(bajty / 1024))} kB`;
  return `${(bajty / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export default function PoslatLatku() {
  const profil = pouzijStav((s) => najdiAktivniProfil(s));
  const nastaveni = useMemo(() => nactiSyncNastaveni(), []);
  const syncZapnuty = !!nastaveni.url && !!nastaveni.token;

  const [smi, setSmi] = useState<boolean | null>(null);
  const [materialy, setMaterialy] = useState<Material[]>([]);
  const [predmetId, setPredmetId] = useState<string>(() => (profil ? aktivniPredmetProfilu(profil) ?? '' : ''));
  const [poznamka, setPoznamka] = useState('');
  const [soubory, setSoubory] = useState<VybranySoubor[]>([]);
  const [stavOdeslani, setStavOdeslani] = useState<'nic' | 'pripravuji' | 'nahravam'>('nic');
  const [prubeh, setPrubeh] = useState(0);
  const [chyba, setChyba] = useState<string | null>(null);
  const [uspech, setUspech] = useState(false);
  const citac = useRef(0);
  const synchronizovano = useRef(false);

  const nactiSeznam = useCallback(async () => {
    if (!profil || !syncZapnuty) return;
    try {
      const moje = await nactiMojiLatku(nastaveni, profil.id);
      setSmi(moje.smiNahravat);
      zapamatujPovoleni(profil.id, moje.smiNahravat);
      setMaterialy(moje.materialy);
      // Hotové zpracování = na serveru je novější obsah → stáhnout hned,
      // ať odkaz „Otevřít lekci" vede na existující lekci.
      if (!synchronizovano.current && moje.materialy.some((m) => m.stav === 'hotovo')) {
        synchronizovano.current = true;
        void import('../sync/sync').then((s) => s.synchronizuj('rucne'));
      }
    } catch {
      setSmi((s) => s ?? false);
    }
  }, [profil, syncZapnuty, nastaveni]);

  useEffect(() => {
    void nactiSeznam();
  }, [nactiSeznam]);

  // Uvolnění náhledů při odchodu ze stránky.
  useEffect(
    () => () => {
      for (const s of soubory) if (s.nahled) URL.revokeObjectURL(s.nahled);
    },
    [],
  );

  if (!profil) return null;

  if (!syncZapnuty) {
    return (
      <section className="latka">
        <h1>📤 Poslat látku</h1>
        <p className="panel">
          Posílání látky potřebuje připojenou rodinu — rodinný kód vyplníš v{' '}
          <Link to="/nastaveni">Nastavení</Link>.
        </p>
      </section>
    );
  }

  if (smi === false) {
    return (
      <section className="latka">
        <h1>📤 Poslat látku</h1>
        <p className="panel">Posílat látku může jen profil, kterému to povolil správce (táta).</p>
      </section>
    );
  }

  const predmety = predmetyProfilu(profil);
  const celkemBajtu = soubory.reduce((s, f) => s + f.soubor.size, 0);
  const odesilam = stavOdeslani !== 'nic';

  const pridej = (seznam: FileList | null) => {
    if (!seznam) return;
    setChyba(null);
    setUspech(false);
    const nove = [...seznam].map((soubor) => ({
      id: ++citac.current,
      soubor,
      nahled: jeObrazek(soubor) ? URL.createObjectURL(soubor) : null,
    }));
    setSoubory((stare) => {
      const vsechny = [...stare, ...nove];
      if (vsechny.length > LIMITY_MATERIALU.maxSouboru) {
        setChyba(`Najednou jde poslat nejvýš ${LIMITY_MATERIALU.maxSouboru} souborů.`);
        for (const s of vsechny.slice(LIMITY_MATERIALU.maxSouboru)) if (s.nahled) URL.revokeObjectURL(s.nahled);
        return vsechny.slice(0, LIMITY_MATERIALU.maxSouboru);
      }
      return vsechny;
    });
  };

  const odeber = (id: number) => {
    setSoubory((stare) => {
      const odebrany = stare.find((s) => s.id === id);
      if (odebrany?.nahled) URL.revokeObjectURL(odebrany.nahled);
      return stare.filter((s) => s.id !== id);
    });
  };

  const odesli = async () => {
    if (soubory.length === 0 || odesilam) return;
    setChyba(null);
    setUspech(false);
    setStavOdeslani('pripravuji');
    setPrubeh(0);
    try {
      const formular = new FormData();
      formular.set('profilId', profil.id);
      formular.set('profilJmeno', profil.jmeno);
      formular.set('predmetId', predmetId);
      formular.set('poznamka', poznamka.trim());
      for (const vybrany of soubory) {
        const hotovy = jeObrazek(vybrany.soubor) ? await pripravFotku(vybrany.soubor) : vybrany.soubor;
        if (!hotovy) {
          throw new Error(
            `Fotku „${vybrany.soubor.name}" se nepodařilo převést. V iPhonu nastav Fotoaparát → Formáty → Nejkompatibilnější a vyfoť ji znovu.`,
          );
        }
        formular.append('soubory', hotovy, hotovy.name);
      }
      setStavOdeslani('nahravam');
      await posliLatku(nastaveni, formular, setPrubeh);
      for (const s of soubory) if (s.nahled) URL.revokeObjectURL(s.nahled);
      setSoubory([]);
      setPoznamka('');
      setUspech(true);
      await nactiSeznam();
    } catch (e) {
      setChyba(e instanceof Error ? e.message : 'Odeslání se nepovedlo — zkus to znovu.');
    } finally {
      setStavOdeslani('nic');
    }
  };

  return (
    <section className="latka">
      <div className="latka__hlava">
        <h1>📤 Poslat látku</h1>
        <p className="latka__podtitul">
          Vyfoť zápisky ze sešitu (nebo přidej PDF či Word) — do pár hodin z nich bude lekce
          s otázkami v Učit se.
        </p>
      </div>

      <form
        className="panel latka__formular"
        onSubmit={(e) => {
          e.preventDefault();
          void odesli();
        }}
      >
        <label className="latka__pole">
          <span>Předmět</span>
          <select value={predmetId} onChange={(e) => setPredmetId(e.target.value)} disabled={odesilam}>
            {predmety.map((id) => (
              <option key={id} value={id}>
                {ikonaPredmetu(id)} {nazevPredmetu(id)}
              </option>
            ))}
            <option value="">❓ Jiný předmět / nevím</option>
          </select>
        </label>

        <div className="latka__vyber">
          <label className="tlacitko tlacitko--primarni latka__vyber-tlacitko">
            📷 Vyfotit / vybrat fotky
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={odesilam}
              onChange={(e) => {
                pridej(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
          <label className="tlacitko latka__vyber-tlacitko">
            📄 Přidat dokument
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              multiple
              disabled={odesilam}
              onChange={(e) => {
                pridej(e.target.files);
                e.target.value = '';
              }}
            />
          </label>
        </div>

        {soubory.length > 0 && (
          <ul className="latka__soubory">
            {soubory.map((s, i) => (
              <li key={s.id} className="latka__soubor">
                {s.nahled ? (
                  <img src={s.nahled} alt={`Strana ${i + 1}`} className="latka__nahled" />
                ) : (
                  <span className="latka__ikona-souboru" aria-hidden="true">
                    📄
                  </span>
                )}
                <span className="latka__nazev-souboru">{s.soubor.name}</span>
                <button
                  type="button"
                  className="latka__odebrat"
                  aria-label={`Odebrat ${s.soubor.name}`}
                  onClick={() => odeber(s.id)}
                  disabled={odesilam}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {soubory.length > 0 && (
          <p className="latka__pozn">
            {soubory.length} {soubory.length === 1 ? 'soubor' : soubory.length < 5 ? 'soubory' : 'souborů'} ·{' '}
            {formatVelikost(celkemBajtu)} (fotky se před odesláním zmenší)
          </p>
        )}

        <label className="latka__pole">
          <span>Poznámka (nepovinná)</span>
          <textarea
            value={poznamka}
            maxLength={LIMITY_MATERIALU.maxPoznamka}
            rows={3}
            placeholder="Např. v pátek píšeme test z jakosti, nejvíc chci procvičit ISO 9001."
            onChange={(e) => setPoznamka(e.target.value)}
            disabled={odesilam}
          />
        </label>

        {chyba && (
          <p className="latka__chyba" role="alert">
            {chyba}
          </p>
        )}
        {uspech && (
          <p className="latka__uspech" role="status">
            ✅ Posláno! Jakmile bude lekce hotová, uvidíš ji tady dole i v Učit se.
          </p>
        )}

        {stavOdeslani === 'nahravam' && (
          <div className="ukazatel" aria-label="Průběh nahrávání">
            <div style={{ width: `${Math.round(prubeh * 100)}%` }} />
          </div>
        )}

        <button
          type="submit"
          className="tlacitko tlacitko--zlate latka__odeslat"
          disabled={soubory.length === 0 || odesilam}
        >
          {stavOdeslani === 'pripravuji'
            ? 'Připravuji fotky…'
            : stavOdeslani === 'nahravam'
              ? `Nahrávám… ${Math.round(prubeh * 100)} %`
              : '📤 Poslat ke zpracování'}
        </button>
      </form>

      <h2 className="latka__nadpis-seznamu">Moje poslaná látka</h2>
      {materialy.length === 0 ? (
        <p className="latka__pozn">Zatím nic — první zásilka se objeví tady.</p>
      ) : (
        <ul className="latka__seznam">
          {materialy.map((m) => (
            <li key={m.id} className={`panel latka__polozka latka__polozka--${m.stav}`}>
              <div className="latka__polozka-hlava">
                <span className="latka__predmet">
                  {m.predmetId ? `${ikonaPredmetu(m.predmetId)} ${nazevPredmetu(m.predmetId)}` : '❓ Jiný předmět'}
                </span>
                <span className={`latka__stav latka__stav--${m.stav}`}>
                  {IKONA_STAVU[m.stav]} {POPIS_STAVU_MATERIALU[m.stav]}
                </span>
              </div>
              <p className="latka__pozn">
                {kdyRelativne(m.vytvoreno)} · {m.soubory.length}{' '}
                {m.soubory.length === 1 ? 'soubor' : m.soubory.length < 5 ? 'soubory' : 'souborů'}
                {m.poznamka && ` · „${m.poznamka}"`}
              </p>
              {m.zprava && <p className="latka__zprava">{m.zprava}</p>}
              {m.stav === 'hotovo' && m.vysledek && m.vysledek.temata.length > 0 && (
                <div className="latka__odkazy">
                  {m.vysledek.temata.map((t) => (
                    <Link key={`${t.predmetId}:${t.temaId}`} to={`/uceni/${t.temaId}`} className="tlacitko">
                      📖 {t.nazev}
                    </Link>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
