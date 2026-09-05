// Stranka /duely — seznam duelu a dialog „Vyzvat na duel".
// Duel je nejvetsi adrenalin v aplikaci: vyzvy pro me pulzuji nahore,
// pod nimi otevrene rodinne vyzvy, rozehrane duely a historie s vysledky.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Duel } from '@questor/sdilene';
import { vysledekProHrace } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import { najdiAktivniProfil, predmetyProfilu, type Profil } from '../stav/profilySlice';
import { ikonaPredmetu, nazevPredmetu, seradPredmety } from '../data/predmety';
import { rozdelDuely } from './engine';
import { duelovyKlient, souperVDuelu, zbyvaDoVyprseni } from './pomocne';
import './Duely.css';

const POCTY: (5 | 10 | 20)[] = [5, 10, 20];

export default function Duely() {
  const duely = pouzijStav((s) => s.duely);
  const otevreneDuely = pouzijStav((s) => s.otevreneDuely);
  const profil = pouzijStav((s) => najdiAktivniProfil(s));
  const [dialogOtevreny, setDialogOtevreny] = useState(false);

  // Cerstve vyzvy pri prichodu na stranku (tiche, offline-first).
  useEffect(() => {
    void import('../sync/sync')
      .then((m) => m.synchronizuj('rucne'))
      .catch(() => {});
  }, []);

  // Cas se bere pri kazdem prepoctu (zmena dat = cerstve „ted"): duel po
  // vyprsi spadne do historie s kontumaci i bez uspesneho syncu.
  const rozdelene = useMemo(
    () => rozdelDuely(duely, otevreneDuely, profil?.id ?? '', new Date().toISOString()),
    [duely, otevreneDuely, profil?.id],
  );

  if (!profil) return null;

  const nicSeNedeje =
    rozdelene.vyzvyProMe.length === 0 &&
    rozdelene.otevrene.length === 0 &&
    rozdelene.naTahu.length === 0 &&
    rozdelene.cekameNaSoupere.length === 0 &&
    rozdelene.cekaNaPrijeti.length === 0 &&
    rozdelene.historie.length === 0;

  return (
    <section className="duely">
      <div className="duely__hlava">
        <h1>⚔️ Duely</h1>
        <button
          type="button"
          className="tlacitko tlacitko--zlate"
          onClick={() => setDialogOtevreny(true)}
        >
          ⚔️ Vyzvat na duel
        </button>
      </div>

      {nicSeNedeje && (
        <div className="panel duely__prazdno">
          <p className="duely__prazdno-titulek">Aréna je zatím prázdná.</p>
          <p>
            Vyzvi někoho z rodiny na duel — oba dostanete stejné otázky a vyhrává rychlejší
            a přesnější. Slabší hráč dostává férový bonus času.
          </p>
          <p className="duely__prazdno-pozn">
            Duely potřebují připojenou rodinu (rodinný kód v <Link to="/nastaveni">Nastavení</Link>).
          </p>
        </div>
      )}

      {rozdelene.vyzvyProMe.length > 0 && (
        <SekceDuelu titulek="🔥 Výzvy pro tebe" zvyraznena>
          {rozdelene.vyzvyProMe.map((d) => (
            <DuelKarta key={d.id} duel={d} profilId={profil.id} varianta="vyzva" />
          ))}
        </SekceDuelu>
      )}

      {rozdelene.otevrene.length > 0 && (
        <SekceDuelu titulek="🏟️ Otevřené výzvy rodiny">
          {rozdelene.otevrene.map((d) => (
            <DuelKarta key={d.id} duel={d} profilId={profil.id} varianta="otevrena" />
          ))}
        </SekceDuelu>
      )}

      {(rozdelene.naTahu.length > 0 ||
        rozdelene.cekameNaSoupere.length > 0 ||
        rozdelene.cekaNaPrijeti.length > 0) && (
        <SekceDuelu titulek="⚡ Rozehrané">
          {rozdelene.naTahu.map((d) => (
            <DuelKarta key={d.id} duel={d} profilId={profil.id} varianta="na-tahu" />
          ))}
          {rozdelene.cekameNaSoupere.map((d) => (
            <DuelKarta key={d.id} duel={d} profilId={profil.id} varianta="ceka-souper" />
          ))}
          {rozdelene.cekaNaPrijeti.map((d) => (
            <DuelKarta key={d.id} duel={d} profilId={profil.id} varianta="ceka-prijeti" />
          ))}
        </SekceDuelu>
      )}

      {rozdelene.historie.length > 0 && (
        <SekceDuelu titulek="📜 Historie">
          {rozdelene.historie.map((d) => (
            <DuelKarta key={d.id} duel={d} profilId={profil.id} varianta="historie" />
          ))}
        </SekceDuelu>
      )}

      {dialogOtevreny && (
        <DialogNovehoDuelu profil={profil} zavri={() => setDialogOtevreny(false)} />
      )}
    </section>
  );
}

function SekceDuelu({
  titulek,
  zvyraznena,
  children,
}: {
  titulek: string;
  zvyraznena?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`duely__sekce${zvyraznena ? ' duely__sekce--zvyraznena' : ''}`}>
      <h2 className="duely__sekce-titulek">{titulek}</h2>
      <div className="duely__mrizka">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Karta duelu

type VariantaKarty = 'vyzva' | 'otevrena' | 'na-tahu' | 'ceka-souper' | 'ceka-prijeti' | 'historie';

function DuelKarta({
  duel,
  profilId,
  varianta,
}: {
  duel: Duel;
  profilId: string;
  varianta: VariantaKarty;
}) {
  const navigate = useNavigate();
  const pridejDuel = pouzijStav((s) => s.pridejDuel);
  const jmenoProfilu = pouzijStav(
    (s) => s.profily.find((p) => p.id === s.aktivniProfilId)?.jmeno ?? 'Já',
  );
  const [prijimam, setPrijimam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const souper = souperVDuelu(duel, profilId);
  const jmenoSoupere =
    varianta === 'otevrena'
      ? duel.vyzyvatel.jmeno
      : (souper?.jmeno ?? 'kdokoli z rodiny');
  const zbyva = zbyvaDoVyprseni(duel.vyprsi, Date.now());

  // Prijeti OTEVRENE vyzvy jde jen online — server pri nem zmrazi handicap
  // ferovosti obou hracu (kontrakt POST /api/duely/:id/prijmout).
  const prijmiOtevrenou = async () => {
    const klient = duelovyKlient();
    if (!klient) {
      setChyba('Přijetí potřebuje připojení rodiny (Nastavení).');
      return;
    }
    setPrijimam(true);
    setChyba(null);
    try {
      const prijaty = await klient.prijmiDuelNaServeru(duel.id, {
        profilId,
        jmeno: jmenoProfilu,
      });
      pridejDuel(prijaty);
      navigate(`/duel/${prijaty.id}`);
    } catch {
      setChyba('Výzvu se nepodařilo přijmout — možná ji už vzal někdo jiný. Zkus obnovit.');
    } finally {
      setPrijimam(false);
    }
  };

  const mujV = duel.vysledky[profilId];
  const souperuvV = souper ? duel.vysledky[souper.profilId] : undefined;
  const vysledek =
    varianta === 'historie' ? vysledekProHrace(duel.vitezProfilId ?? null, profilId) : null;

  return (
    <div
      className={`panel duely__karta duely__karta--${varianta}`}
      role={varianta === 'historie' ? 'button' : undefined}
      tabIndex={varianta === 'historie' ? 0 : undefined}
      onClick={varianta === 'historie' ? () => navigate(`/duel/${duel.id}`) : undefined}
      onKeyDown={
        varianta === 'historie'
          ? (e) => {
              if (e.key === 'Enter') navigate(`/duel/${duel.id}`);
            }
          : undefined
      }
    >
      <div className="duely__karta-hlava">
        <span className="duely__karta-obor">
          {ikonaPredmetu(duel.predmetId)} {nazevPredmetu(duel.predmetId)}
        </span>
        {vysledek === null ? (
          <span className="stitek">{zbyva}</span>
        ) : (
          <span className={`stitek duely__vysledek-stitek duely__vysledek-stitek--${vysledek}`}>
            {vysledek === 'vyhra' ? '🏆 Výhra' : vysledek === 'prohra' ? 'Prohra' : '🤝 Remíza'}
          </span>
        )}
      </div>

      <div className="duely__karta-souper">
        {varianta === 'otevrena' ? (
          <>Vyzývá <strong>{jmenoSoupere}</strong> — kdokoli z rodiny</>
        ) : varianta === 'vyzva' ? (
          <><strong>{jmenoSoupere}</strong> tě vyzývá na duel!</>
        ) : (
          <>proti: <strong>{jmenoSoupere}</strong></>
        )}
      </div>

      <div className="duely__karta-detaily">
        {duel.pocetOtazek} otázek
        {duel.temataId ? ` · ${duel.temataId.length} témat` : ' · celá banka'}
        {mujV && ` · moje skóre ${mujV.body} b`}
        {vysledek !== null && souperuvV && souper && ` · ${souper.jmeno} ${souperuvV.body} b`}
        {vysledek !== null && souper && !souperuvV && ` · ${souper.jmeno} nehrál(a)`}
      </div>

      {varianta === 'vyzva' && (
        <button
          type="button"
          className="tlacitko tlacitko--zlate duely__karta-akce"
          onClick={() => navigate(`/duel/${duel.id}`)}
        >
          ⚔️ Přijmout a hrát
        </button>
      )}
      {varianta === 'na-tahu' && (
        <button
          type="button"
          className="tlacitko tlacitko--primarni duely__karta-akce"
          onClick={() => navigate(`/duel/${duel.id}`)}
        >
          ▶ Hrát svoji půlku
        </button>
      )}
      {varianta === 'otevrena' && (
        <button
          type="button"
          className="tlacitko tlacitko--primarni duely__karta-akce"
          disabled={prijimam}
          onClick={() => void prijmiOtevrenou()}
        >
          {prijimam ? 'Přijímám…' : '⚔️ Přijmout výzvu'}
        </button>
      )}
      {varianta === 'ceka-souper' && (
        <div className="duely__karta-stav">⏳ Odehráno — čekáme na soupeře…</div>
      )}
      {varianta === 'ceka-prijeti' && (
        <div className="duely__karta-stav">📣 Čeká, až výzvu někdo z rodiny přijme…</div>
      )}
      {chyba && <div className="duely__karta-chyba">{chyba}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog „Vyzvat na duel"

function DialogNovehoDuelu({ profil, zavri }: { profil: Profil; zavri: () => void }) {
  const navigate = useNavigate();
  const banky = pouzijStav((s) => s.banky);
  const profily = pouzijStav((s) => s.profily);
  const pridejDuel = pouzijStav((s) => s.pridejDuel);

  // Obor: jen studijni banky MEHO profilu s realne pritomnou bankou otazek.
  const dostupnePredmety = useMemo(() => {
    const moje = predmetyProfilu(profil);
    return seradPredmety(Object.keys(banky)).filter((id) => moje.includes(id));
  }, [banky, profil]);

  const [predmetId, setPredmetId] = useState<string | null>(dostupnePredmety[0] ?? null);
  const [vybranaTemata, setVybranaTemata] = useState<string[]>([]);
  const [pocet, setPocet] = useState<5 | 10 | 20>(10);
  /** null = „kdokoli z rodiny" (otevrena vyzva). */
  const [souperId, setSouperId] = useState<string | null>(null);
  const [zakladam, setZakladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const souperi = profily.filter((p) => p.id !== profil.id);
  const temata = useMemo(
    () =>
      ((predmetId && banky[predmetId]?.temata) || []).slice().sort((a, b) => a.poradi - b.poradi),
    [banky, predmetId],
  );

  useEffect(() => {
    const zpracuj = (e: KeyboardEvent) => {
      if (e.key === 'Escape') zavri();
    };
    window.addEventListener('keydown', zpracuj);
    return () => window.removeEventListener('keydown', zpracuj);
  }, [zavri]);

  const vyzvi = async () => {
    if (!predmetId) return;
    const klient = duelovyKlient();
    if (!klient) {
      setChyba('Duely potřebují připojenou rodinu — vyplň rodinný kód v Nastavení.');
      return;
    }
    setZakladam(true);
    setChyba(null);
    try {
      const souper = souperi.find((p) => p.id === souperId);
      const duel = await klient.vytvorDuel({
        predmetId,
        pocetOtazek: pocet,
        ...(vybranaTemata.length > 0 && vybranaTemata.length < temata.length
          ? { temataId: vybranaTemata }
          : {}),
        vyzyvatelProfilId: profil.id,
        vyzyvatelJmeno: profil.jmeno,
        ...(souper ? { souperProfilId: souper.id, souperJmeno: souper.jmeno } : {}),
      });
      pridejDuel(duel);
      zavri();
      // Vyzyvatel muze hrat hned (u cilene vyzvy); otevrena ceka na prijeti.
      navigate(`/duel/${duel.id}`);
    } catch {
      setChyba('Duel se nepodařilo založit — zkontroluj připojení a zkus to znovu.');
    } finally {
      setZakladam(false);
    }
  };

  return (
    <div className="duely__pozadi-modalu" onClick={zavri}>
      <div
        className="panel duely__modal animace-naskoceni"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Vyzvat na duel"
      >
        <div className="duely__modal-hlava">
          <h2>⚔️ Vyzvat na duel</h2>
          <button type="button" className="duely__modal-zavrit" onClick={zavri} aria-label="Zavřít">
            ✕
          </button>
        </div>

        {dostupnePredmety.length === 0 ? (
          <p className="duely__prazdno-pozn">
            Zatím tu není žádná banka otázek — připoj se k serveru v{' '}
            <Link to="/nastaveni">Nastavení</Link>.
          </p>
        ) : (
          <>
            <h3 className="duely__modal-nadpis">Obor</h3>
            <div className="duely__volby">
              {dostupnePredmety.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`duely__volba${id === predmetId ? ' duely__volba--vybrana' : ''}`}
                  onClick={() => {
                    if (id !== predmetId) setVybranaTemata([]);
                    setPredmetId(id);
                  }}
                >
                  {ikonaPredmetu(id)} {nazevPredmetu(id, banky[id]?.nazev)}
                </button>
              ))}
            </div>

            {temata.length > 0 && (
              <>
                <h3 className="duely__modal-nadpis">
                  Témata{' '}
                  <span className="duely__modal-pozn">
                    ({vybranaTemata.length === 0 ? 'všechna' : `${vybranaTemata.length} vybráno`})
                  </span>
                </h3>
                <div className="duely__volby duely__volby--temata">
                  {temata.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`duely__volba${vybranaTemata.includes(t.id) ? ' duely__volba--vybrana' : ''}`}
                      onClick={() =>
                        setVybranaTemata((v) =>
                          v.includes(t.id) ? v.filter((x) => x !== t.id) : [...v, t.id],
                        )
                      }
                    >
                      {t.nazev}
                    </button>
                  ))}
                </div>
              </>
            )}

            <h3 className="duely__modal-nadpis">Počet otázek</h3>
            <div className="duely__volby">
              {POCTY.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`duely__volba${pocet === p ? ' duely__volba--vybrana' : ''}`}
                  onClick={() => setPocet(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <h3 className="duely__modal-nadpis">Soupeř</h3>
            <div className="duely__volby">
              <button
                type="button"
                className={`duely__volba${souperId === null ? ' duely__volba--vybrana' : ''}`}
                onClick={() => setSouperId(null)}
              >
                🏟️ Kdokoli z rodiny
              </button>
              {souperi.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`duely__volba${souperId === p.id ? ' duely__volba--vybrana' : ''}`}
                  onClick={() => setSouperId(p.id)}
                >
                  <span className="duely__volba-tecka" style={{ background: p.barva }} aria-hidden="true" />
                  {p.jmeno}
                </button>
              ))}
            </div>
            {souperi.length === 0 && (
              <p className="duely__modal-pozn">
                V rodině zatím není další profil — výzva „kdokoli z rodiny" počká, až se někdo
                připojí.
              </p>
            )}

            {chyba && <p className="duely__karta-chyba">{chyba}</p>}

            <button
              type="button"
              className="tlacitko tlacitko--zlate duely__modal-start"
              disabled={zakladam || !predmetId}
              onClick={() => void vyzvi()}
            >
              {zakladam ? 'Zakládám duel…' : '⚔️ Vyzvat!'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
