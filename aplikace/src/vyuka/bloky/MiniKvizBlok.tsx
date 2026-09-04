// Mini-kviz — inline kontrola pochopeni uprostred lekce. ZNOVUPOUZIVA
// komponenty typu otazek z testy/ (zadna duplikace UI) a vyhodnocovaci
// logiku enginu. Po odpovedi ukaze vysvetleni; ZADNE XP (to davaji az testy).
import { useState } from 'react';
import type { Otazka } from '@questor/sdilene';
import { vyhodnotOdpoved, type OdpovedHodnota } from '../../testy/engine';
import VyberOtazka from '../../testy/komponenty/VyberOtazka';
import MultiOtazka from '../../testy/komponenty/MultiOtazka';
import AnoNeOtazka from '../../testy/komponenty/AnoNeOtazka';
import DoplneniOtazka from '../../testy/komponenty/DoplneniOtazka';
import PrirazovaniOtazka from '../../testy/komponenty/PrirazovaniOtazka';

interface Props {
  otazka: Otazka;
  /** Zavola se po zodpovezeni (spravne i spatne) — odemyka dalsi blok lekce. */
  onZodpovezeno: () => void;
}

function TeloOtazky({
  otazka,
  odeslana,
  spravne,
  onOdpoved,
}: {
  otazka: Otazka;
  odeslana: OdpovedHodnota | null;
  spravne: boolean | null;
  onOdpoved: (hodnota: OdpovedHodnota) => void;
}) {
  switch (otazka.typ) {
    case 'vyber':
      return (
        <VyberOtazka otazka={otazka} odeslana={odeslana} zobrazVyhodnoceni onOdpoved={onOdpoved} />
      );
    case 'multi':
      return (
        <MultiOtazka otazka={otazka} odeslana={odeslana} zobrazVyhodnoceni onOdpoved={onOdpoved} />
      );
    case 'anone':
      return (
        <AnoNeOtazka otazka={otazka} odeslana={odeslana} zobrazVyhodnoceni onOdpoved={onOdpoved} />
      );
    case 'doplneni':
      return (
        <DoplneniOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni
          spravne={spravne}
          onOdpoved={onOdpoved}
        />
      );
    case 'prirazovani':
      return (
        <PrirazovaniOtazka
          otazka={otazka}
          odeslana={odeslana}
          zobrazVyhodnoceni
          onOdpoved={onOdpoved}
        />
      );
  }
}

export default function MiniKvizBlok({ otazka, onZodpovezeno }: Props) {
  const [odeslana, setOdeslana] = useState<OdpovedHodnota | null>(null);
  const [spravne, setSpravne] = useState<boolean | null>(null);

  const odpovez = (hodnota: OdpovedHodnota) => {
    if (odeslana) return;
    const vysledek = vyhodnotOdpoved(otazka, hodnota);
    setOdeslana(hodnota);
    setSpravne(vysledek);
    onZodpovezeno();
  };

  return (
    <div className="mini-kviz">
      <div className="mini-kviz__titulek">
        <span aria-hidden="true">🧠</span> Rychlá kontrola — bez XP, jen pro tebe
      </div>
      <h3 className="mini-kviz__zadani">{otazka.zadani}</h3>
      <TeloOtazky otazka={otazka} odeslana={odeslana} spravne={spravne} onOdpoved={odpovez} />
      {odeslana && (
        <div
          className={`feedback animace-naskoceni ${spravne ? 'feedback--spravne' : 'feedback--spatne'}`}
        >
          <div className="feedback__titulek">
            {spravne ? 'Správně!' : 'Tahle ti ještě uteče. Mrkni proč:'}
          </div>
          <div>{otazka.vysvetleni}</div>
        </div>
      )}
    </div>
  );
}
