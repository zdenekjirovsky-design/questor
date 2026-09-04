// Priklad z praxe — zadani + rozklikavaci reseni (odkryje se tlacitkem).
import { useState } from 'react';
import type { VyukovyBlokPriklad } from '@questor/sdilene';
import { MiniMarkdown } from './TextBlok';

export default function PrikladBlok({ blok }: { blok: VyukovyBlokPriklad }) {
  const [odkryto, setOdkryto] = useState(false);
  return (
    <div className="priklad">
      <div className="priklad__titulek">
        <span aria-hidden="true">💼</span> Příklad z praxe
      </div>
      <div className="priklad__zadani">
        <MiniMarkdown text={blok.zadani} />
      </div>
      {odkryto ? (
        <div className="priklad__reseni animace-naskoceni">
          <div className="priklad__reseni-titulek">Řešení</div>
          <MiniMarkdown text={blok.reseni} />
        </div>
      ) : (
        <button
          type="button"
          className="tlacitko priklad__odkryt"
          onClick={() => setOdkryto(true)}
        >
          💡 Ukázat řešení
        </button>
      )}
    </div>
  );
}
