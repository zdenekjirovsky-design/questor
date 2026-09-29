// Admin účet — přehled rodiny pro rodiče: postup všech profilů po předmětech
// a tématech (lekce, zvládnuté otázky, úspěšnost, slabá témata), streaky,
// týdenní XP, poslední testy a duely. Stránka /admin běží MIMO profilovou
// bránu; data bere z GET /api/admin/prehled s admin kódem (admin.ts).
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  POPIS_STAVU_MATERIALU,
  type FrontaMaterialu,
  type Material,
  type PrehledPredmetu,
  type PrehledProfilu,
  type PrehledRodiny,
  type PrehledTestu,
  type StavMaterialu,
} from '@questor/sdilene';
import Avatar from '../hra/Avatar';
import { ikonaPredmetu, nazevPredmetu } from '../data/predmety';
import { ChybaSyncu, nactiSyncNastaveni } from '../sync/klient';
import {
  kdyRelativne,
  nactiAdminKod,
  nastavPovoleniLatky,
  procenta,
  slabaTemata,
  smazAdminKod,
  smazLatku,
  stahniFrontuLatky,
  stahniPrehledRodiny,
  ulozAdminKod,
  vratLatku,
} from './admin';
import './AdminPrehled.css';

function popisChyby(chyba: unknown): string {
  const status = chyba instanceof ChybaSyncu ? chyba.status : undefined;
  if (status === 401 || status === 403) return 'Admin kód neplatí — zkontroluj ho a zkus to znovu.';
  if (status === 404) return 'Server přehled ještě nezná — je potřeba ho aktualizovat.';
  if (status === 429) return 'Server má teď moc požadavků — zkus to za minutu.';
  return 'Server se nepodařilo zastihnout — zkontroluj připojení.';
}

function jeDnes(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const ted = new Date();
  return d.toDateString() === ted.toDateString();
}

function formatTyden(pondeli: string): string {
  const [, m, d] = pondeli.split('-');
  return `${Number(d)}. ${Number(m)}.`;
}

function formatDelku(ms: number): string {
  if (ms <= 0) return '';
  const minuty = Math.round(ms / 60_000);
  return minuty < 1 ? '< 1 min' : `${minuty} min`;
}

// ---------------------------------------------------------------------------

export default function AdminPrehled() {
  const navigate = useNavigate();
  const url = nactiSyncNastaveni().url;
  const [kod, setKod] = useState<string | null>(() => nactiAdminKod());
  const [prehled, setPrehled] = useState<PrehledRodiny | null>(null);
  const [nacitam, setNacitam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [fronta, setFronta] = useState<FrontaMaterialu | null>(null);

  // Fronta látky je doplněk — její selhání (např. starší server) přehled nerozbije.
  const nactiFrontu = useCallback(
    async (k: string) => {
      try {
        setFronta(await stahniFrontuLatky(url, k));
      } catch {
        setFronta(null);
      }
    },
    [url],
  );

  const nacti = useCallback(
    async (k: string) => {
      setNacitam(true);
      setChyba(null);
      try {
        const [p] = await Promise.all([stahniPrehledRodiny(url, k), nactiFrontu(k)]);
        setPrehled(p);
      } catch (e) {
        setChyba(popisChyby(e));
        if (e instanceof ChybaSyncu && (e.status === 401 || e.status === 403)) {
          smazAdminKod();
          setKod(null);
        }
      } finally {
        setNacitam(false);
      }
    },
    [url, nactiFrontu],
  );

  useEffect(() => {
    if (kod && url && !prehled) void nacti(kod);
    // nacti zamerne jen pri startu / po prihlaseni — obnova je tlacitkem
  }, [kod, url, prehled, nacti]);

  // Po přihlášení formulářem je přehled hotový, fronta se dočte zvlášť.
  useEffect(() => {
    if (kod && url && prehled && !fronta) void nactiFrontu(kod);
  }, [kod, url, prehled, fronta, nactiFrontu]);

  const odhlas = () => {
    smazAdminKod();
    setKod(null);
    setPrehled(null);
    setFronta(null);
    setChyba(null);
  };

  const akceLatky = async (akce: () => Promise<unknown>) => {
    if (!kod) return;
    setChyba(null);
    try {
      await akce();
    } catch (e) {
      setChyba(e instanceof Error ? e.message : 'Akce se nepovedla.');
    }
    await nactiFrontu(kod);
  };

  const prepniPovoleni = (profilId: string, povolit: boolean) => {
    if (!kod || !fronta) return;
    const dalsi = povolit
      ? [...new Set([...fronta.povoleneProfily, profilId])]
      : fronta.povoleneProfily.filter((id) => id !== profilId);
    void akceLatky(() => nastavPovoleniLatky(url, kod, dalsi));
  };

  if (!url) {
    return (
      <div className="rozvrzeni admin">
        <div className="panel admin-prihlaseni">
          <h1>🛡️ Přehled rodiny</h1>
          <p>
            Aplikace nezná adresu rodinného serveru. Vyplň ji v Nastavení → Připojení a pak se
            vrať sem.
          </p>
          <button type="button" className="tlacitko" onClick={() => navigate('/')}>
            ← Zpět do aplikace
          </button>
        </div>
      </div>
    );
  }

  if (!kod) {
    return (
      <AdminPrihlaseni
        url={url}
        chybaZvenku={chyba}
        zpet={() => navigate('/')}
        onPrihlaseno={(k, p) => {
          ulozAdminKod(k);
          setPrehled(p);
          setKod(k);
          setChyba(null);
        }}
      />
    );
  }

  const profily = prehled?.profily ?? [];

  return (
    <div className="rozvrzeni admin">
      <header className="admin__hlava">
        <div>
          <h1>🛡️ Přehled rodiny</h1>
          <p className="admin__podtitul">
            {prehled ? `Aktualizováno ${kdyRelativne(prehled.vygenerovano)}` : 'Načítám přehled…'}
          </p>
        </div>
        <div className="admin__akce">
          <button
            type="button"
            className="tlacitko tlacitko--primarni"
            disabled={nacitam}
            onClick={() => void nacti(kod)}
          >
            {nacitam ? 'Načítám…' : '↻ Obnovit'}
          </button>
          <button type="button" className="tlacitko" onClick={() => navigate('/')}>
            ← Do aplikace
          </button>
          <button type="button" className="tlacitko" onClick={odhlas}>
            Odhlásit
          </button>
        </div>
      </header>

      {chyba && (
        <p className="admin__chyba" role="alert">
          {chyba}
        </p>
      )}

      {prehled && (
        <div className="admin__souhrn">
          <span>👥 {profily.length} {profily.length === 1 ? 'profil' : profily.length < 5 ? 'profily' : 'profilů'}</span>
          <span>🟢 {profily.filter((p) => jeDnes(p.posledniAktivita)).length} aktivní dnes</span>
          <span>📖 {profily.reduce((s, p) => s + p.lekceHotovo, 0)} lekcí hotovo</span>
          <span>📝 {profily.reduce((s, p) => s + p.dokonceneTesty, 0)} testů</span>
        </div>
      )}

      {prehled && fronta && (
        <SekceLatky
          fronta={fronta}
          onVratit={(m) => {
            if (
              window.confirm(
                'Vrátit obsah do verze před zpracováním? Otázky a lekce z této látky z aplikace zmizí.',
              )
            ) {
              void akceLatky(() => vratLatku(url, kod, m.id));
            }
          }}
          onSmazat={(m) => {
            if (window.confirm('Smazat zásilku i její soubory? Obsah už zveřejněný v aplikaci zůstane.')) {
              void akceLatky(() => smazLatku(url, kod, m.id));
            }
          }}
        />
      )}

      {prehled && profily.length === 0 && (
        <div className="panel">
          Zatím tu nikdo není — profily se objeví, jakmile si je rodina založí s rodinným kódem.
        </div>
      )}

      {profily.map((p, i) => (
        <KartaProfilu
          key={p.profilId}
          profil={p}
          poradi={i}
          smiPosilatLatku={fronta ? fronta.povoleneProfily.includes(p.profilId) : null}
          onPrepniLatku={(povolit) => prepniPovoleni(p.profilId, povolit)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AdminPrihlaseni({
  url,
  chybaZvenku,
  zpet,
  onPrihlaseno,
}: {
  url: string;
  chybaZvenku: string | null;
  zpet: () => void;
  onPrihlaseno: (kod: string, prehled: PrehledRodiny) => void;
}) {
  const [kod, setKod] = useState('');
  const [overuji, setOveruji] = useState(false);
  const [chyba, setChyba] = useState<string | null>(chybaZvenku);

  const prihlas = async () => {
    const k = kod.trim();
    if (!k) return;
    setOveruji(true);
    setChyba(null);
    try {
      onPrihlaseno(k, await stahniPrehledRodiny(url, k));
    } catch (e) {
      setChyba(popisChyby(e));
    } finally {
      setOveruji(false);
    }
  };

  return (
    <div className="rozvrzeni admin">
      <form
        className="panel admin-prihlaseni animace-naskoceni"
        onSubmit={(e) => {
          e.preventDefault();
          void prihlas();
        }}
      >
        <h1>🛡️ Přehled rodiny</h1>
        <p>
          Admin účet pro rodiče: postup všech profilů — lekce, testy, zvládnutá témata, streaky
          i duely. Přihlas se admin kódem serveru.
        </p>
        <label className="admin-prihlaseni__pole">
          <span>Admin kód</span>
          <input
            type="password"
            autoComplete="current-password"
            value={kod}
            onChange={(e) => setKod(e.target.value)}
            autoFocus
          />
        </label>
        {chyba && (
          <p className="admin__chyba" role="alert">
            {chyba}
          </p>
        )}
        <div className="admin-prihlaseni__akce">
          <button
            type="submit"
            className="tlacitko tlacitko--primarni"
            disabled={overuji || !kod.trim()}
          >
            {overuji ? 'Ověřuji…' : 'Přihlásit'}
          </button>
          <button type="button" className="tlacitko" onClick={zpet}>
            ← Zpět
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------

function KartaProfilu({
  profil,
  poradi,
  smiPosilatLatku,
  onPrepniLatku,
}: {
  profil: PrehledProfilu;
  poradi: number;
  /** null = fronta látky se nenačetla (přepínač se neukáže). */
  smiPosilatLatku: boolean | null;
  onPrepniLatku: (povolit: boolean) => void;
}) {
  const [otevreny, setOtevreny] = useState<string | null>(null);
  const maxXp = Math.max(1, ...profil.tydenniXp.map((t) => t.xp));
  const styl = {
    '--barva-profilu': profil.barva ?? 'var(--akcent)',
    animationDelay: `${poradi * 60}ms`,
  } as CSSProperties;

  return (
    <article className="panel admin-profil animace-naskoceni" style={styl}>
      <div className="admin-profil__hlava">
        {profil.avatar ? (
          <Avatar konfigurace={profil.avatar} velikost={64} />
        ) : (
          <span className="admin-profil__inicial" aria-hidden="true">
            {profil.jmeno.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="admin-profil__identita">
          <h2>{profil.jmeno}</h2>
          <p className="admin-profil__aktivita">
            {profil.maProgres
              ? `Naposledy ${kdyRelativne(profil.posledniAktivita)}`
              : 'Zatím bez postupu na serveru'}
          </p>
          {smiPosilatLatku !== null && (
            <label className="admin-profil__latka">
              <input
                type="checkbox"
                checked={smiPosilatLatku}
                onChange={(e) => onPrepniLatku(e.target.checked)}
              />
              📤 Smí posílat látku
            </label>
          )}
        </div>
        <div className="admin-profil__level">
          <span className="admin-profil__lvl">LVL {profil.level.level}</span>
          <div className="ukazatel ukazatel--zlaty" aria-hidden="true">
            <div style={{ width: `${Math.round(profil.level.procento * 100)}%` }} />
          </div>
          <span className="admin-profil__xp">{profil.xp} XP</span>
        </div>
      </div>

      <div className="admin-profil__cisla">
        <Cislo ikona="🔥" hodnota={profil.streak.aktualni} popis={`streak · rekord ${profil.streak.nejdelsi}`} />
        <Cislo ikona="📖" hodnota={profil.lekceHotovo} popis="lekcí hotovo" />
        <Cislo ikona="📝" hodnota={profil.dokonceneTesty} popis="testů" />
        {profil.duely && (
          <Cislo
            ikona="⚔️"
            hodnota={`${profil.duely.vyhry}:${profil.duely.prohry}`}
            popis={profil.duely.remizy > 0 ? `duely · ${profil.duely.remizy}× remíza` : 'duely výhry:prohry'}
          />
        )}
      </div>

      <div className="admin-profil__tydny-blok">
        <p className="admin-profil__popisek">XP za posledních 6 týdnů</p>
        <div className="admin-profil__tydny">
          {profil.tydenniXp.map((t) => (
            <div key={t.tyden} className="admin-profil__tyden" title={`${t.xp} XP`}>
              <span className="admin-profil__tyden-xp">{t.xp > 0 ? t.xp : ''}</span>
              <div className="admin-profil__sloupec-obal">
                <div
                  className="admin-profil__sloupec"
                  style={{ height: `${Math.max(t.xp > 0 ? 4 : 0, Math.round((t.xp / maxXp) * 100))}%` }}
                />
              </div>
              <span className="admin-profil__tyden-den">{formatTyden(t.tyden)}</span>
            </div>
          ))}
        </div>
      </div>

      {profil.predmety.length > 0 ? (
        <div className="admin-profil__predmety">
          {profil.predmety.map((p) => (
            <RadekPredmetu
              key={p.predmetId}
              predmet={p}
              otevreny={otevreny === p.predmetId}
              prepni={() => setOtevreny((o) => (o === p.predmetId ? null : p.predmetId))}
            />
          ))}
        </div>
      ) : (
        <p className="admin-profil__prazdno">Zatím žádný předmět s aktivitou.</p>
      )}

      {profil.posledniTesty.length > 0 && <PosledniTesty testy={profil.posledniTesty} />}

      {profil.duely && profil.duely.tituly.length > 0 && (
        <p className="admin-profil__tituly">🏆 {profil.duely.tituly.join(' · ')}</p>
      )}
    </article>
  );
}

function Cislo({ ikona, hodnota, popis }: { ikona: string; hodnota: number | string; popis: string }) {
  return (
    <div className="admin-cislo">
      <span className="admin-cislo__hodnota">
        <span aria-hidden="true">{ikona}</span> {hodnota}
      </span>
      <span className="admin-cislo__popis">{popis}</span>
    </div>
  );
}

function Metrika({
  popis,
  hodnota,
  podil,
  zlata = false,
}: {
  popis: string;
  hodnota: string;
  podil: number;
  zlata?: boolean;
}) {
  return (
    <div className="admin-metrika">
      <div className="admin-metrika__radek">
        <span>{popis}</span>
        <strong>{hodnota}</strong>
      </div>
      <div className={`ukazatel ${zlata ? 'ukazatel--zlaty' : ''}`} aria-hidden="true">
        <div style={{ width: `${Math.round(Math.min(1, Math.max(0, podil)) * 100)}%` }} />
      </div>
    </div>
  );
}

function RadekPredmetu({
  predmet,
  otevreny,
  prepni,
}: {
  predmet: PrehledPredmetu;
  otevreny: boolean;
  prepni: () => void;
}) {
  const slaba = slabaTemata(predmet.temata).slice(0, 3);
  const testyText =
    predmet.testu > 0
      ? `${predmet.testu} ${predmet.testu === 1 ? 'test' : predmet.testu < 5 ? 'testy' : 'testů'} · naposledy ${kdyRelativne(predmet.posledniTest)}`
      : 'zatím žádný test';

  return (
    <section className={`admin-predmet ${predmet.aktivni ? 'admin-predmet--aktivni' : ''}`}>
      <button type="button" className="admin-predmet__hlava" onClick={prepni} aria-expanded={otevreny}>
        <span className="admin-predmet__ikona" aria-hidden="true">
          {ikonaPredmetu(predmet.predmetId)}
        </span>
        <span className="admin-predmet__nazev">{nazevPredmetu(predmet.predmetId, predmet.nazev)}</span>
        {predmet.aktivni && <span className="stitek admin-predmet__stitek">aktivní</span>}
        {!predmet.studuje && <span className="stitek">mimo jeho banky</span>}
        <span className="admin-predmet__sipka" aria-hidden="true">
          {otevreny ? '▴' : '▾'}
        </span>
      </button>

      <div className="admin-predmet__metriky">
        <Metrika
          popis="Lekce"
          hodnota={`${predmet.lekceHotovo}/${predmet.lekceCelkem}`}
          podil={predmet.lekceCelkem > 0 ? predmet.lekceHotovo / predmet.lekceCelkem : 0}
        />
        <Metrika
          popis="Zvládnuto"
          hodnota={`${predmet.zvladnuto}/${predmet.otazekCelkem}`}
          podil={predmet.otazekCelkem > 0 ? predmet.zvladnuto / predmet.otazekCelkem : 0}
          zlata
        />
        <Metrika popis="Úspěšnost" hodnota={procenta(predmet.uspesnost)} podil={predmet.uspesnost ?? 0} />
      </div>

      <p className="admin-predmet__pozn">
        {testyText} · vyzkoušeno {predmet.otazekZodpovezeno} z {predmet.otazekCelkem} otázek
      </p>

      {slaba.length > 0 && (
        <div className="admin-predmet__slaba">
          <span>⚠️ Procvičit:</span>
          {slaba.map((t) => (
            <span key={t.temaId} className="admin-predmet__chip">
              {t.nazev} · {procenta(t.uspesnost)}
            </span>
          ))}
        </div>
      )}

      {otevreny && (
        <div className="admin-temata">
          <table>
            <thead>
              <tr>
                <th scope="col">Téma</th>
                <th scope="col">Lekce</th>
                <th scope="col">Zvládnuto</th>
                <th scope="col">Úspěšnost</th>
              </tr>
            </thead>
            <tbody>
              {predmet.temata.map((t) => (
                <tr key={t.temaId}>
                  <th scope="row">{t.nazev}</th>
                  <td
                    data-popis={t.maLekci ? 'Lekce' : undefined}
                    title={t.lekceHotova ? 'hotová' : t.lekceRozpracovana ? 'rozpracovaná' : 'nezačatá'}
                  >
                    {!t.maLekci ? '' : t.lekceHotova ? '✅' : t.lekceRozpracovana ? '◐' : '—'}
                  </td>
                  <td data-popis="Zvládnuto">
                    {t.zvladnuto}/{t.otazekCelkem}
                  </td>
                  <td data-popis="Úspěšnost">
                    {procenta(t.uspesnost)}
                    {t.odpovedi > 0 && <span className="admin-temata__pocet"> ({t.odpovedi})</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="admin-temata__legenda">
            ✅ lekce hotová · ◐ rozpracovaná · — nezačatá · v závorce počet odpovědí
          </p>
        </div>
      )}
    </section>
  );
}

function PosledniTesty({ testy }: { testy: PrehledTestu[] }) {
  return (
    <details className="admin-testy">
      <summary>Poslední testy ({testy.length})</summary>
      <ul>
        {testy.map((t) => (
          <li key={t.id}>
            <span aria-hidden="true">{ikonaPredmetu(t.predmetId)}</span>
            <span className="admin-testy__predmet">{nazevPredmetu(t.predmetId, t.nazevPredmetu)}</span>
            <strong className={t.uspesnost >= 0.7 ? 'admin-testy__dobre' : 'admin-testy__slabe'}>
              {procenta(t.uspesnost)}
            </strong>
            <span className="admin-testy__detail">
              {t.pocetOtazek} ot. {formatDelku(t.delkaMs) && `· ${formatDelku(t.delkaMs)}`} · +{t.ziskaneXp} XP
              {t.zVyzvy && ' · 🎯 výzva'}
            </span>
            <span className="admin-testy__kdy">{kdyRelativne(t.konec)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------

const IKONA_STAVU_LATKY: Record<StavMaterialu, string> = {
  ceka: '⏳',
  zpracovava: '⚙️',
  hotovo: '✅',
  chyba: '⚠️',
  vraceno: '↩️',
};

function SekceLatky({
  fronta,
  onVratit,
  onSmazat,
}: {
  fronta: FrontaMaterialu;
  onVratit: (m: Material) => void;
  onSmazat: (m: Material) => void;
}) {
  const cekajici = fronta.materialy.filter((m) => m.stav === 'ceka' || m.stav === 'zpracovava').length;
  return (
    <section className="panel admin-latka">
      <h2>
        📤 Látka ke zpracování{' '}
        {cekajici > 0 && <span className="stitek admin-predmet__stitek">{cekajici} čeká</span>}
      </h2>
      {fronta.materialy.length === 0 ? (
        <p className="admin-latka__pozn">
          Zatím nic neposláno. Kdo smí látku posílat, nastavíš u profilu níže.
        </p>
      ) : (
        <ul className="admin-latka__seznam">
          {fronta.materialy.slice(0, 12).map((m) => (
            <li key={m.id} className="admin-latka__polozka">
              <div className="admin-latka__radek">
                <strong>{m.profilJmeno}</strong>
                <span>
                  {m.predmetId ? `${ikonaPredmetu(m.predmetId)} ${nazevPredmetu(m.predmetId)}` : '❓ jiný předmět'}
                </span>
                <span className="admin-latka__pozn">
                  {m.soubory.length} {m.soubory.length === 1 ? 'soubor' : m.soubory.length < 5 ? 'soubory' : 'souborů'} ·{' '}
                  {kdyRelativne(m.vytvoreno)}
                </span>
                <span className={`admin-latka__stav admin-latka__stav--${m.stav}`}>
                  {IKONA_STAVU_LATKY[m.stav]} {POPIS_STAVU_MATERIALU[m.stav]}
                </span>
              </div>
              {m.poznamka && <p className="admin-latka__text">„{m.poznamka}"</p>}
              {m.zprava && <p className="admin-latka__text">{m.zprava}</p>}
              <div className="admin-latka__akce">
                {m.stav === 'hotovo' && m.vysledek?.publikace.some((p) => p.zVerze !== null) && (
                  <button type="button" className="tlacitko" onClick={() => onVratit(m)}>
                    ↩️ Vrátit změnu
                  </button>
                )}
                <button type="button" className="tlacitko" onClick={() => onSmazat(m)}>
                  🗑 Smazat
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
