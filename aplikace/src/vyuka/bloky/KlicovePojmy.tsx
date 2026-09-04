// Klicove pojmy — mrizka karet pojmu s definicemi.
import type { VyukovyBlokKlicovePojmy } from '@questor/sdilene';

export default function KlicovePojmy({ blok }: { blok: VyukovyBlokKlicovePojmy }) {
  return (
    <div className="pojmy">
      <div className="pojmy__titulek">
        <span aria-hidden="true">🔑</span> Klíčové pojmy
      </div>
      <dl className="pojmy__mrizka">
        {blok.polozky.map((p, i) => (
          <div className="pojmy__karta" key={i} style={{ '--i': i } as React.CSSProperties}>
            <dt>{p.pojem}</dt>
            <dd>{p.definice}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
