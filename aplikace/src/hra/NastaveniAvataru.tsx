// Nastavení avataru — výběr barvy dlouhých vlasů. Nůžky tu nevedeme.
// EXPORT: používá stránka Nastavení (a kdokoli další, kdo chce avatar ladit).
import { pouzijStav } from '../stav/store';
import Avatar from './Avatar';
import './NastaveniAvataru.css';

/** Nabídka barev vlasů — vlasy samotné jsou neodstranitelné, mění se JEN barva. */
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

export function NastaveniAvataru() {
  const avatar = pouzijStav((s) => s.progres.avatar);
  const nastavBarvuVlasu = pouzijStav((s) => s.nastavBarvuVlasu);

  return (
    <div className="nastaveni-avataru panel">
      <div className="nastaveni-avataru__nahled">
        <Avatar konfigurace={avatar} velikost={150} animovany />
        <p className="nastaveni-avataru__pozn">
          Dlouhé vlasy jsou tvoje značka — nabízíme barvy, nikdy nůžky. ✂️🚫
        </p>
      </div>
      <div className="nastaveni-avataru__barvy" role="radiogroup" aria-label="Barva vlasů">
        {BARVY_VLASU.map((b) => (
          <button
            key={b.barva}
            type="button"
            role="radio"
            aria-checked={avatar.barvaVlasu === b.barva}
            title={b.nazev}
            className={
              avatar.barvaVlasu === b.barva
                ? 'nastaveni-avataru__barva nastaveni-avataru__barva--vybrana'
                : 'nastaveni-avataru__barva'
            }
            style={{ background: b.barva }}
            onClick={() => nastavBarvuVlasu(b.barva)}
          >
            <span className="nastaveni-avataru__fajfka">
              {avatar.barvaVlasu === b.barva ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default NastaveniAvataru;
