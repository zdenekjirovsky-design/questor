// Znění bleskové otázky s místem k doplnění — sdílí průběh bleskovek (velké
// zadání s políčkem) i zpětná vazba a výpis chyb na výsledku (řádkový text
// se zvýrazněným doplněním). Zadání bez podtržítka se vypíše beze změny.
import { rozdelZadani } from './blesk';

/**
 * Stav místa k doplnění:
 *  - 'prazdne' — čeká na odpověď (zvýrazněné políčko),
 *  - 'spravne' — student doplnil správně (zeleně, pop),
 *  - 'oprava'  — po chybě ukazuje správné řešení (zeleně),
 *  - 'text'    — řádkový výpis: doplnění zeleně v běžném textu, bez políčka.
 */
export type StavPolicka = 'prazdne' | 'spravne' | 'oprava' | 'text';

interface Props {
  zadani: string;
  /** Text v místě k doplnění; null = prázdné políčko. */
  doplneno: string | null;
  stav: StavPolicka;
  /**
   * Délka nejdelší možnosti ve znacích — políčko si drží šířku, aby se po
   * doplnění řádek nepřeskládal (nic se nehýbe pod prstem). Jen pro políčko.
   */
  sirkaZnaku?: number;
}

export default function BleskZneni({ zadani, doplneno, stav, sirkaZnaku }: Props) {
  const casti = rozdelZadani(zadani);
  if (!casti) return <>{zadani}</>;
  // Slovo s mezerou se nesmí zalomit kolem políčka („b“ na konci řádku
  // a „[y]lina“ na dalším) — celé slovo drží pohromadě .blesk-slovo.
  const predSlovo = /\S*$/.exec(casti.pred)?.[0] ?? '';
  const poSlovo = /^\S*/.exec(casti.po)?.[0] ?? '';
  const jePole = stav !== 'text';
  return (
    <>
      {casti.pred.slice(0, casti.pred.length - predSlovo.length)}
      <span className="blesk-slovo">
        {predSlovo}
        <span
          className={`blesk-policko blesk-policko--${stav}${jePole ? ' blesk-policko--pole' : ''}`}
          style={
            jePole && sirkaZnaku
              ? { minWidth: `calc(${Math.max(1, sirkaZnaku)} * 0.62em + 0.3em)` }
              : undefined
          }
        >
          {doplneno ?? (
            <>
              {/* Pevná mezera drží účaří políčka stejné jako po doplnění. */}
              <span aria-hidden="true">{' '}</span>
              <span className="blesk-cteni">(doplň)</span>
            </>
          )}
        </span>
        {poSlovo}
      </span>
      {casti.po.slice(poSlovo.length)}
    </>
  );
}
