// Nastaveni avataru — plnohodnotny editor: zivy nahled, pohlavi, tvar
// obliceje, plet, barva a strih vlasu (vcetne kratkych) a vybava z truhel
// po slotech. Zmeny se drzi v lokalnim navrhu a ulozi az tlacitkem Ulozit
// (akce hraSlice zmenAvatara). Vse ovladatelne klavesnici.
// EXPORT: pouziva stranka Nastaveni (a kdokoli dalsi, kdo chce avatar ladit).
import { useEffect, useRef, useState } from 'react';
import type { AvatarKonfigurace, VybavaDefinice, Vzacnost } from '@questor/sdilene';
import { VYBAVA_KATALOG } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import Avatar from './Avatar';
import './NastaveniAvataru.css';

/** Nabidka barev vlasu. */
export const BARVY_VLASU: { barva: string; nazev: string }[] = [
  { barva: '#6b4a2f', nazev: 'Kaštanová' },
  { barva: '#3e2723', nazev: 'Tmavě hnědá' },
  { barva: '#1f1b24', nazev: 'Půlnoční černá' },
  { barva: '#c1502e', nazev: 'Zrzavá' },
  { barva: '#d9a441', nazev: 'Medová' },
  { barva: '#e8c66b', nazev: 'Blond' },
  { barva: '#f0ead6', nazev: 'Platinová' },
  { barva: '#7c2f3f', nazev: 'Mahagon' },
  { barva: '#d16ba5', nazev: 'Růžová' },
  { barva: '#8b5cf6', nazev: 'Fialová' },
  { barva: '#4f83cc', nazev: 'Modrá' },
  { barva: '#3aa17e', nazev: 'Mátová' },
];

/** Nabidka barev pleti. */
export const BARVY_PLETI: { barva: string; nazev: string }[] = [
  { barva: '#f6d7b8', nazev: 'Světlá' },
  { barva: '#f2c9a0', nazev: 'Béžová' },
  { barva: '#d9a066', nazev: 'Snědá' },
  { barva: '#a9714b', nazev: 'Hnědá' },
  { barva: '#6f4a2f', nazev: 'Tmavá' },
];

const POHLAVI: { id: AvatarKonfigurace['pohlavi']; nazev: string }[] = [
  { id: 'muz', nazev: 'Muž' },
  { id: 'zena', nazev: 'Žena' },
];

const TVARY: { id: AvatarKonfigurace['tvarObliceje']; nazev: string }[] = [
  { id: 'ovalny', nazev: 'Oválný' },
  { id: 'hranaty', nazev: 'Hranatý' },
  { id: 'kulaty', nazev: 'Kulatý' },
];

const STRIHY: { id: AvatarKonfigurace['stylVlasu']; nazev: string }[] = [
  { id: 'kratke', nazev: 'Krátké' },
  { id: 'polodlouhe', nazev: 'Polodlouhé' },
  { id: 'rozpustene', nazev: 'Rozpuštěné' },
  { id: 'culik', nazev: 'Culík' },
  { id: 'vlnite', nazev: 'Vlnité' },
];

const SLOTY: { slot: VybavaDefinice['slot']; nazev: string }[] = [
  { slot: 'hlava', nazev: 'Hlava' },
  { slot: 'oci', nazev: 'Oči' },
  { slot: 'krk', nazev: 'Krk' },
  { slot: 'pozadi', nazev: 'Pozadí' },
];

const NAZVY_VZACNOSTI: Record<Vzacnost, string> = {
  obycejna: 'obyčejná',
  vzacna: 'vzácná',
  epicka: 'epická',
  legendarni: 'legendární',
};

const BARVY_VZACNOSTI: Record<Vzacnost, string> = {
  obycejna: 'var(--text-tlumeny)',
  vzacna: 'var(--info)',
  epicka: 'var(--akcent)',
  legendarni: 'var(--zlata)',
};

/**
 * Sipkova navigace radiogroupu (ARIA vzor radia): sipky presunou fokus na
 * sousedni prepinac a rovnou ho vyberou (kliknou), Home/End skoci na kraj.
 * Pracuje nad DOM skupiny, takze je spolecna pro vsechny radiogroupy editoru.
 */
function navigujRadiem(e: React.KeyboardEvent<HTMLButtonElement>) {
  let posun: 1 | -1 | 0;
  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      posun = 1;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      posun = -1;
      break;
    case 'Home':
    case 'End':
      posun = 0;
      break;
    default:
      return;
  }
  const skupina = e.currentTarget.closest('[role="radiogroup"]');
  if (!skupina) return;
  const radia = Array.from(skupina.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
  if (radia.length === 0) return;
  e.preventDefault();
  let cil: HTMLButtonElement;
  if (e.key === 'Home') {
    cil = radia[0];
  } else if (e.key === 'End') {
    cil = radia[radia.length - 1];
  } else {
    const idx = radia.indexOf(e.currentTarget);
    cil = radia[(idx + posun + radia.length) % radia.length];
  }
  cil.focus();
  cil.click();
}

/** Roving tabindex: Tab vstoupi do skupiny jen na vybrany prvek (bez vyberu na prvni). */
function tabIndexRadia(vybrano: boolean, index: number, nejakyVybran: boolean): 0 | -1 {
  return vybrano || (!nejakyVybran && index === 0) ? 0 : -1;
}

export function NastaveniAvataru() {
  const avatar = pouzijStav((s) => s.progres.avatar);
  const vlastnenaVybava = pouzijStav((s) => s.progres.vlastnenaVybava);
  const zmenAvatara = pouzijStav((s) => s.zmenAvatara);

  const [navrh, setNavrh] = useState<AvatarKonfigurace>(avatar);
  const [ulozeno, setUlozeno] = useState(false);
  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (casovac.current) clearTimeout(casovac.current);
    },
    [],
  );

  // Kdyz se avatar ve store zmeni mimo editor (typicky „Smazat lokalni
  // postup" na teze strance Nastaveni), navrh se srovna se store. Bez toho
  // by editor dal ukazoval pred-resetovou konfiguraci a Ulozit by zapsal
  // avatara s vybavou, kterou hrac uz nevlastni.
  useEffect(() => {
    setNavrh(avatar);
  }, [avatar]);

  const zmen = (cast: Partial<AvatarKonfigurace>) => {
    setUlozeno(false);
    setNavrh((n) => ({ ...n, ...cast }));
  };

  const prepniVybavu = (polozka: VybavaDefinice) => {
    setUlozeno(false);
    setNavrh((n) => {
      const vybava = { ...n.vybava };
      if (vybava[polozka.slot] === polozka.id) {
        delete vybava[polozka.slot];
      } else {
        vybava[polozka.slot] = polozka.id;
      }
      return { ...n, vybava };
    });
  };

  const uloz = () => {
    zmenAvatara(navrh);
    setUlozeno(true);
    if (casovac.current) clearTimeout(casovac.current);
    casovac.current = setTimeout(() => setUlozeno(false), 2500);
  };

  const neulozeno = JSON.stringify(navrh) !== JSON.stringify(avatar);

  // Palety mohou (napr. po migraci starych dat) obsahovat barvu mimo nabidku —
  // pak roving tabindex spadne na prvni prvek skupiny, at je skupina dosazitelna.
  const pletVPalete = BARVY_PLETI.some((b) => b.barva === navrh.barvaPleti);
  const vlasyVPalete = BARVY_VLASU.some((b) => b.barva === navrh.barvaVlasu);

  return (
    <div className="nastaveni-avataru panel">
      {/* Zivy nahled + ulozeni */}
      <div className="nastaveni-avataru__nahled">
        <Avatar konfigurace={navrh} velikost={200} animovany />
        <button
          type="button"
          className="tlacitko tlacitko--primarni nastaveni-avataru__ulozit"
          onClick={uloz}
          disabled={!neulozeno && !ulozeno}
        >
          Uložit avatara
        </button>
        <span className="nastaveni-avataru__stav" role="status">
          {ulozeno ? 'Uloženo ✓' : neulozeno ? 'Neuložené změny' : ''}
        </span>
      </div>

      <div className="nastaveni-avataru__volby">
        {/* Pohlavi */}
        <div className="nastaveni-avataru__sekce">
          <h3>Postava</h3>
          <div className="nastaveni-avataru__karty" role="radiogroup" aria-label="Pohlaví postavy">
            {POHLAVI.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={navrh.pohlavi === p.id}
                tabIndex={navrh.pohlavi === p.id ? 0 : -1}
                onKeyDown={navigujRadiem}
                className={
                  navrh.pohlavi === p.id
                    ? 'nastaveni-avataru__karta nastaveni-avataru__karta--vybrana'
                    : 'nastaveni-avataru__karta'
                }
                onClick={() => zmen({ pohlavi: p.id })}
              >
                <Avatar konfigurace={{ ...navrh, pohlavi: p.id }} velikost={64} />
                <span>{p.nazev}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tvar obliceje */}
        <div className="nastaveni-avataru__sekce">
          <h3>Tvar obličeje</h3>
          <div className="nastaveni-avataru__karty" role="radiogroup" aria-label="Tvar obličeje">
            {TVARY.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={navrh.tvarObliceje === t.id}
                tabIndex={navrh.tvarObliceje === t.id ? 0 : -1}
                onKeyDown={navigujRadiem}
                className={
                  navrh.tvarObliceje === t.id
                    ? 'nastaveni-avataru__karta nastaveni-avataru__karta--vybrana'
                    : 'nastaveni-avataru__karta'
                }
                onClick={() => zmen({ tvarObliceje: t.id })}
              >
                <Avatar konfigurace={{ ...navrh, tvarObliceje: t.id }} velikost={64} />
                <span>{t.nazev}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Plet */}
        <div className="nastaveni-avataru__sekce">
          <h3>Pleť</h3>
          <div className="nastaveni-avataru__barvy" role="radiogroup" aria-label="Barva pleti">
            {BARVY_PLETI.map((b, i) => (
              <button
                key={b.barva}
                type="button"
                role="radio"
                aria-checked={navrh.barvaPleti === b.barva}
                tabIndex={tabIndexRadia(navrh.barvaPleti === b.barva, i, pletVPalete)}
                onKeyDown={navigujRadiem}
                aria-label={b.nazev}
                title={b.nazev}
                className={
                  navrh.barvaPleti === b.barva
                    ? 'nastaveni-avataru__barva nastaveni-avataru__barva--vybrana'
                    : 'nastaveni-avataru__barva'
                }
                style={{ background: b.barva }}
                onClick={() => zmen({ barvaPleti: b.barva })}
              >
                <span className="nastaveni-avataru__fajfka">
                  {navrh.barvaPleti === b.barva ? '✓' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Barva vlasu */}
        <div className="nastaveni-avataru__sekce">
          <h3>Barva vlasů</h3>
          <div className="nastaveni-avataru__barvy" role="radiogroup" aria-label="Barva vlasů">
            {BARVY_VLASU.map((b, i) => (
              <button
                key={b.barva}
                type="button"
                role="radio"
                aria-checked={navrh.barvaVlasu === b.barva}
                tabIndex={tabIndexRadia(navrh.barvaVlasu === b.barva, i, vlasyVPalete)}
                onKeyDown={navigujRadiem}
                aria-label={b.nazev}
                title={b.nazev}
                className={
                  navrh.barvaVlasu === b.barva
                    ? 'nastaveni-avataru__barva nastaveni-avataru__barva--vybrana'
                    : 'nastaveni-avataru__barva'
                }
                style={{ background: b.barva }}
                onClick={() => zmen({ barvaVlasu: b.barva })}
              >
                <span className="nastaveni-avataru__fajfka">
                  {navrh.barvaVlasu === b.barva ? '✓' : ''}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Strih vlasu */}
        <div className="nastaveni-avataru__sekce">
          <h3>Střih vlasů</h3>
          <div className="nastaveni-avataru__karty" role="radiogroup" aria-label="Střih vlasů">
            {STRIHY.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={navrh.stylVlasu === s.id}
                tabIndex={navrh.stylVlasu === s.id ? 0 : -1}
                onKeyDown={navigujRadiem}
                className={
                  navrh.stylVlasu === s.id
                    ? 'nastaveni-avataru__karta nastaveni-avataru__karta--vybrana'
                    : 'nastaveni-avataru__karta'
                }
                onClick={() => zmen({ stylVlasu: s.id })}
              >
                <Avatar konfigurace={{ ...navrh, stylVlasu: s.id }} velikost={64} />
                <span>{s.nazev}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Vybava po slotech */}
        <div className="nastaveni-avataru__sekce">
          <h3>Výbava</h3>
          <p className="nastaveni-avataru__pozn">
            Kosmetické kousky padají z truhel. Kliknutím nasadíš, dalším kliknutím sundáš.
          </p>
          {SLOTY.map(({ slot, nazev }) => (
            <div key={slot} className="nastaveni-avataru__slot">
              <h4>{nazev}</h4>
              <div className="nastaveni-avataru__karty">
                {VYBAVA_KATALOG.filter((v) => v.slot === slot).map((v) => {
                  const vlastnena = vlastnenaVybava.includes(v.id);
                  const nasazena = navrh.vybava[slot] === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={nasazena}
                      disabled={!vlastnena}
                      title={vlastnena ? v.popis : `${v.nazev} — najdeš v truhle`}
                      className={[
                        'nastaveni-avataru__karta',
                        'nastaveni-avataru__vybava',
                        nasazena ? 'nastaveni-avataru__karta--vybrana' : '',
                        vlastnena ? '' : 'nastaveni-avataru__vybava--nevlastnena',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ '--barva-vzacnosti': BARVY_VZACNOSTI[v.vzacnost] } as React.CSSProperties}
                      onClick={() => prepniVybavu(v)}
                    >
                      <span className="nastaveni-avataru__vybava-nahled">
                        <Avatar
                          konfigurace={{ ...navrh, vybava: { ...navrh.vybava, [slot]: v.id } }}
                          velikost={64}
                        />
                      </span>
                      <span>{v.nazev}</span>
                      <span
                        className="nastaveni-avataru__vzacnost"
                        style={{ color: BARVY_VZACNOSTI[v.vzacnost] }}
                      >
                        {NAZVY_VZACNOSTI[v.vzacnost]}
                      </span>
                      {!vlastnena && (
                        <span className="nastaveni-avataru__truhla-pozn">najdeš v truhle</span>
                      )}
                      {vlastnena && nasazena && (
                        <span className="nastaveni-avataru__truhla-pozn">nasazeno</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default NastaveniAvataru;
