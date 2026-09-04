// Textovy blok lekce — mini-markdown: odstavce, **tucne**, odrazky.
// Zadne dangerouslySetInnerHTML: parsuje se primo do React elementu.
import type { ReactNode } from 'react';
import type { VyukovyBlokText } from '@questor/sdilene';

/** Inline cast: **tucne** → <strong>. */
function inlineCasti(text: string, klicZaklad: string): ReactNode[] {
  const casti: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let posledni = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > posledni) casti.push(text.slice(posledni, m.index));
    casti.push(<strong key={`${klicZaklad}-${i++}`}>{m[1]}</strong>);
    posledni = re.lastIndex;
  }
  if (posledni < text.length) casti.push(text.slice(posledni));
  return casti;
}

/**
 * Vykresli mini-markdown obsah: radky zacinajici `- `/`* `/`• ` se skladaji
 * do odrazkovych seznamu, prazdny radek deli odstavce. Sdili ho i PrikladBlok.
 */
export function MiniMarkdown({ text }: { text: string }) {
  const radky = text.split(/\r?\n/);
  const vystup: ReactNode[] = [];
  let odstavec: string[] = [];
  let odrazky: string[] = [];

  const uzavriOdstavec = () => {
    if (odstavec.length === 0) return;
    const t = odstavec.join(' ').trim();
    if (t) vystup.push(<p key={`p-${vystup.length}`}>{inlineCasti(t, `p${vystup.length}`)}</p>);
    odstavec = [];
  };
  const uzavriOdrazky = () => {
    if (odrazky.length === 0) return;
    vystup.push(
      <ul key={`ul-${vystup.length}`}>
        {odrazky.map((o, i) => (
          <li key={i}>{inlineCasti(o, `li${vystup.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    odrazky = [];
  };

  for (const radek of radky) {
    const orez = radek.trim();
    const odrazka = /^[-*•]\s+/.exec(orez);
    if (odrazka) {
      uzavriOdstavec();
      odrazky.push(orez.slice(odrazka[0].length));
    } else if (orez === '') {
      uzavriOdstavec();
      uzavriOdrazky();
    } else {
      uzavriOdrazky();
      odstavec.push(orez);
    }
  }
  uzavriOdstavec();
  uzavriOdrazky();

  return <div className="mini-markdown">{vystup}</div>;
}

export default function TextBlok({ blok }: { blok: VyukovyBlokText }) {
  return (
    <div className="vyuka-text">
      <MiniMarkdown text={blok.obsah} />
    </div>
  );
}
