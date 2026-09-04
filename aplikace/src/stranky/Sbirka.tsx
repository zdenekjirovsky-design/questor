// Sbírka karet — Velikáni ekonomie + mistrovské karty témat. VLASTNÍ agent APP-HRA.
// Nezískané karty jsou tmavé siluety („co mi chybí“ táhne víc než „co mám“);
// nové karty se při prvním zobrazení otočí flip animací.
import { useEffect, useState } from 'react';
import type { KartaDefinice, StupenMistrovstvi, Vzacnost } from '@questor/sdilene';
import { KARTY_VELIKANI } from '@questor/sdilene';
import { pouzijStav } from '../stav/store';
import './Sbirka.css';

const NAZVY_VZACNOSTI: Record<Vzacnost, string> = {
  obycejna: 'obyčejná',
  vzacna: 'vzácná',
  epicka: 'epická',
  legendarni: 'legendární',
};

const NAZVY_STUPNU: Record<StupenMistrovstvi, string> = {
  bronz: 'Bronz',
  stribro: 'Stříbro',
  zlato: 'Zlato',
};

const IKONY_STUPNU: Record<StupenMistrovstvi, string> = {
  bronz: '🥉',
  stribro: '🥈',
  zlato: '🥇',
};

function monogram(jmeno: string): string {
  const casti = jmeno.split(' ').filter(Boolean);
  const prvni = casti[0]?.[0] ?? '?';
  const posledni = casti.length > 1 ? (casti[casti.length - 1][0] ?? '') : '';
  return `${prvni}${posledni}`.toUpperCase();
}

interface MistrovskaKarta {
  id: string;
  temaId: string;
  stupen: StupenMistrovstvi;
  nazevTematu: string;
}

export default function Sbirka() {
  const sbirka = pouzijStav((s) => s.progres.sbirka);
  const banky = pouzijStav((s) => s.banky);
  const novaKarty = pouzijStav((s) => s.novaKarty);
  const oznacKartyZaVidene = pouzijStav((s) => s.oznacKartyZaVidene);

  // Karty, které se mají při tomhle zobrazení flipnout — zachytit před oznacenim.
  const [flipKarty] = useState<string[]>(() => novaKarty);
  useEffect(() => {
    oznacKartyZaVidene();
  }, [oznacKartyZaVidene]);

  const [detail, setDetail] = useState<KartaDefinice | null>(null);

  const vlastnene = new Set(sbirka.karty);
  const pocetVelikanu = KARTY_VELIKANI.filter((k) => vlastnene.has(k.id)).length;

  // Mistrovské karty: id ve tvaru tema:<temaId>:<stupen>.
  const nazvyTemat = new Map<string, string>();
  for (const banka of Object.values(banky)) {
    for (const tema of banka.temata) nazvyTemat.set(tema.id, tema.nazev);
  }
  const mistrovske: MistrovskaKarta[] = sbirka.karty
    .filter((id) => id.startsWith('tema:'))
    .map((id) => {
      const casti = id.split(':');
      const stupen = casti[casti.length - 1] as StupenMistrovstvi;
      const temaId = casti.slice(1, -1).join(':');
      return { id, temaId, stupen, nazevTematu: nazvyTemat.get(temaId) ?? temaId };
    });
  const poradiStupnu: Record<StupenMistrovstvi, number> = { zlato: 0, stribro: 1, bronz: 2 };
  mistrovske.sort(
    (a, b) => a.nazevTematu.localeCompare(b.nazevTematu, 'cs') || poradiStupnu[a.stupen] - poradiStupnu[b.stupen],
  );

  return (
    <section className="sbirka">
      <div className="sbirka__hlava">
        <h1>Sbírka</h1>
        <span className="stitek">
          Velikáni: {pocetVelikanu}/{KARTY_VELIKANI.length} · Mistrovství: {mistrovske.length}
        </span>
      </div>

      <h2 className="sbirka__nadpis-sekce">Velikáni ekonomie</h2>
      <div className="sbirka__mrizka">
        {KARTY_VELIKANI.map((k) => {
          const ziskana = vlastnene.has(k.id);
          const flip = ziskana && flipKarty.includes(k.id);
          return (
            <button
              key={k.id}
              type="button"
              className={[
                'sbirka__karta',
                ziskana ? `sbirka__karta--${k.vzacnost}` : 'sbirka__karta--silueta',
                flip ? 'sbirka__karta--flip' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setDetail(k)}
              aria-label={ziskana ? `${k.jmeno} — detail karty` : 'Nezískaná karta'}
            >
              <span className="sbirka__karta-vnitrek">
                {/* Rub — vidět jen během flipu */}
                <span className="sbirka__karta-rub" aria-hidden="true">
                  <span className="sbirka__karta-erb">⚜️</span>
                </span>
                {/* Líc */}
                <span className="sbirka__karta-lic">
                  {ziskana ? (
                    <>
                      <span className="sbirka__karta-portret">{monogram(k.jmeno)}</span>
                      <span className="sbirka__karta-jmeno">{k.jmeno}</span>
                      <span className="sbirka__karta-titul">{k.titul}</span>
                      <span className="sbirka__karta-vzacnost">{NAZVY_VZACNOSTI[k.vzacnost]}</span>
                    </>
                  ) : (
                    <>
                      <span className="sbirka__karta-portret sbirka__karta-portret--stin">?</span>
                      <span className="sbirka__karta-jmeno">???</span>
                      <span className="sbirka__karta-titul">Skrytý velikán</span>
                    </>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="sbirka__nadpis-sekce">Mistrovství témat</h2>
      {mistrovske.length === 0 ? (
        <p className="sbirka__prazdno panel">
          Zvládni aspoň polovinu otázek nějakého tématu a získáš první mistrovskou kartu. 📚
        </p>
      ) : (
        <div className="sbirka__mrizka sbirka__mrizka--mistrovska">
          {mistrovske.map((m) => (
            <div key={m.id} className={`sbirka__mistr sbirka__mistr--${m.stupen} ${flipKarty.includes(m.id) ? 'animace-pop' : ''}`}>
              <span className="sbirka__mistr-ikona" aria-hidden="true">{IKONY_STUPNU[m.stupen]}</span>
              <span className="sbirka__mistr-tema">{m.nazevTematu}</span>
              <span className="sbirka__mistr-stupen">{NAZVY_STUPNU[m.stupen]}</span>
            </div>
          ))}
        </div>
      )}

      {/* Detail karty */}
      {detail && (
        <div className="sbirka__pozadi-modalu" onClick={() => setDetail(null)}>
          <div
            className={`panel sbirka__detail animace-pop ${vlastnene.has(detail.id) ? `sbirka__detail--${detail.vzacnost}` : ''}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Detail karty"
          >
            {vlastnene.has(detail.id) ? (
              <>
                <div className="sbirka__detail-portret">{monogram(detail.jmeno)}</div>
                <h2 className="sbirka__detail-jmeno">{detail.jmeno}</h2>
                <div className="sbirka__detail-titul">{detail.titul}</div>
                <span className={`stitek sbirka__detail-vzacnost sbirka__detail-vzacnost--${detail.vzacnost}`}>
                  {NAZVY_VZACNOSTI[detail.vzacnost]}
                </span>
                <p className="sbirka__detail-popis">{detail.popis}</p>
              </>
            ) : (
              <>
                <div className="sbirka__detail-portret sbirka__detail-portret--stin">?</div>
                <h2 className="sbirka__detail-jmeno">???</h2>
                <p className="sbirka__detail-popis">
                  Tahle karta na tebe ještě čeká v truhle. Otevírej truhly za dokončené testy!
                </p>
              </>
            )}
            <button type="button" className="tlacitko sbirka__detail-zavrit" onClick={() => setDetail(null)}>
              Zavřít
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
