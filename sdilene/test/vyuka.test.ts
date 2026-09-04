// Testy výukové části — schémata lekcí, parametry widgetů a sanitizace SVG.
import { describe, expect, it } from 'vitest';
import {
  sanitizujSvg,
  validujVyuku,
  vyukaPredmetuSchema,
  vyukovyBlokSchema,
} from '../src/index';
import type { Otazka, VyukaPredmetu, VyukovyBlok } from '../src/index';

// ---------------------------------------------------------------------------
// Pomůcky

const MINI_KVIZ_OTAZKA: Otazka = {
  id: 'o-kviz-1',
  temaId: 'tema-a',
  obtiznost: 2,
  typ: 'vyber',
  zadani: 'Co znamená jakost?',
  moznosti: ['Souhrn vlastností výrobku', 'Cena výrobku'],
  spravna: 0,
  vysvetleni: 'Jakost je souhrn vlastností, které určují schopnost plnit funkci.',
};

const VSECHNY_BLOKY: VyukovyBlok[] = [
  { typ: 'text', obsah: 'Úvod do **jakosti** zboží.' },
  { typ: 'klicove-pojmy', polozky: [{ pojem: 'Jakost', definice: 'Souhrn vlastností výrobku.' }] },
  { typ: 'obrazek', svg: '<svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" /></svg>', popisek: 'Schéma' },
  { typ: 'priklad', zadani: 'Zákazník reklamuje boty po týdnu.', reseni: 'Jde o vadu jakosti, prodejce ji řeší.' },
  { typ: 'karticky', polozky: [{ predni: 'Obal', zadni: 'Chrání zboží' }, { predni: 'Skladování', zadni: 'Udržuje jakost' }] },
  { typ: 'mini-kviz', otazka: MINI_KVIZ_OTAZKA },
  {
    typ: 'widget',
    widgetId: 'tridicka',
    parametry: {
      zadani: 'Roztřiď potraviny podle původu',
      kategorie: [{ id: 'ziv', nazev: 'Živočišné' }, { id: 'rost', nazev: 'Rostlinné' }],
      polozky: [{ text: 'Mléko', kategorieId: 'ziv' }, { text: 'Mouka', kategorieId: 'rost' }],
    },
  },
  { typ: 'widget', widgetId: 'pexeso', parametry: { dvojice: [{ a: 'ISO 9001', b: 'Systém řízení jakosti' }, { a: 'HACCP', b: 'Kritické body' }] } },
  {
    typ: 'widget',
    widgetId: 'prubeh-procesu',
    parametry: { zadani: 'Od vlákna k oděvu', kroky: [{ nazev: 'Vlákno', popis: 'Surovina' }, { nazev: 'Příze', popis: 'Spřádání', ikona: 'nit' }] },
  },
  {
    typ: 'widget',
    widgetId: 'popisovacka',
    parametry: { svg: '<svg viewBox="0 0 100 50"><path d="M0 0 L10 10" /></svg>', body: [{ x: 10, y: 20, nazev: 'Podešev', popis: 'Spodní část boty' }] },
  },
  {
    typ: 'widget',
    widgetId: 'casova-osa',
    parametry: { udalosti: [{ rok: 1900, nazev: 'Kontrola', popis: 'Třídění zmetků' }, { rok: 1987, nazev: 'ISO 9000', popis: 'První vydání norem' }] },
  },
  {
    typ: 'widget',
    widgetId: 'srovnavac',
    parametry: {
      polozky: [
        { nazev: 'Sklo', vlastnosti: { recyklace: 'výborná', hmotnost: 'vysoká' } },
        { nazev: 'Plast', vlastnosti: { recyklace: 'omezená', hmotnost: 'nízká' } },
      ],
    },
  },
];

function platnaVyuka(prepis: Partial<VyukaPredmetu> = {}): VyukaPredmetu {
  return {
    predmetId: 'zbozinalstvi',
    verze: 1,
    vytvoreno: '2026-09-04',
    lekce: [
      { temaId: 'tema-a', nazev: 'Základy zbožíznalství', poradi: 1, bloky: VSECHNY_BLOKY },
      { temaId: 'tema-b', nazev: 'Potravinářské zboží', poradi: 2, bloky: [{ typ: 'text', obsah: 'Potraviny.' }] },
    ],
    ...prepis,
  };
}

/** Výuka se zaměněným kouskem uvnitř první lekce. */
function sBloky(bloky: VyukovyBlok[]): VyukaPredmetu {
  return platnaVyuka({ lekce: [{ temaId: 'tema-a', nazev: 'Lekce', poradi: 1, bloky }] });
}

// ---------------------------------------------------------------------------
// Validní výuka

describe('validujVyuku — validní data', () => {
  it('projde výuka se všemi typy bloků a všemi widgety', () => {
    const vyuka = validujVyuku(platnaVyuka());
    expect(vyuka.lekce).toHaveLength(2);
    expect(vyuka.lekce[0].bloky).toHaveLength(VSECHNY_BLOKY.length);
  });

  it('po validaci jsou parametry widgetu typované přes zúžení widgetId', () => {
    const vyuka = validujVyuku(platnaVyuka());
    const widget = vyuka.lekce[0].bloky.find((b) => b.typ === 'widget' && b.widgetId === 'tridicka');
    if (!widget || widget.typ !== 'widget' || widget.widgetId !== 'tridicka') throw new Error('třídička chybí');
    expect(widget.parametry.kategorie.map((k) => k.id)).toEqual(['ziv', 'rost']);
  });
});

// ---------------------------------------------------------------------------
// Nevalidní výuka

describe('validujVyuku — nevalidní data', () => {
  it('odmítne neznámý typ bloku', () => {
    expect(() => validujVyuku(sBloky([{ typ: 'video', url: 'x' } as unknown as VyukovyBlok]))).toThrow(/validac/);
  });

  it('odmítne verzi 0, prázdné lekce a špatné predmetId', () => {
    expect(() => validujVyuku(platnaVyuka({ verze: 0 }))).toThrow();
    expect(() => validujVyuku(platnaVyuka({ lekce: [] }))).toThrow();
    expect(() => validujVyuku(platnaVyuka({ predmetId: 'Zboží Znalství' }))).toThrow();
  });

  it('odmítne duplicitní lekci pro stejné téma', () => {
    const vyuka = platnaVyuka();
    vyuka.lekce[1] = { ...vyuka.lekce[1], temaId: 'tema-a' };
    expect(() => validujVyuku(vyuka)).toThrow(/Duplicitní lekce/);
  });

  it('odmítne lekci bez bloků', () => {
    expect(() => validujVyuku(sBloky([]))).toThrow();
  });

  it('odmítne obrázek, jehož svg nezačíná elementem <svg>', () => {
    expect(() =>
      validujVyuku(sBloky([{ typ: 'obrazek', svg: '<div>ne</div>', popisek: 'x' } as unknown as VyukovyBlok])),
    ).toThrow(/SVG musí začínat/);
  });

  it('odmítne mini-kvíz s indexem správné odpovědi mimo možnosti', () => {
    const otazka = { ...MINI_KVIZ_OTAZKA, spravna: 5 };
    expect(() => validujVyuku(sBloky([{ typ: 'mini-kviz', otazka }]))).toThrow(/mimo možnosti/);
  });

  it('odmítne mini-kvíz s otázkou bez vysvětlení', () => {
    const { vysvetleni: _, ...bezVysvetleni } = MINI_KVIZ_OTAZKA;
    expect(() => validujVyuku(sBloky([{ typ: 'mini-kviz', otazka: bezVysvetleni as unknown as Otazka }]))).toThrow();
  });

  it('odmítne třídičku s položkou v neexistující kategorii', () => {
    const blok: VyukovyBlok = {
      typ: 'widget',
      widgetId: 'tridicka',
      parametry: {
        zadani: 'Třiď',
        kategorie: [{ id: 'a', nazev: 'A' }, { id: 'b', nazev: 'B' }],
        polozky: [{ text: 'X', kategorieId: 'a' }, { text: 'Y', kategorieId: 'neexistuje' }],
      },
    };
    expect(() => validujVyuku(sBloky([blok]))).toThrow(/neexistující kategorii/);
  });

  it('odmítne widget s parametry jiného widgetu', () => {
    const blok = {
      typ: 'widget',
      widgetId: 'pexeso',
      parametry: { udalosti: [{ rok: 1900, nazev: 'x', popis: 'y' }] },
    } as unknown as VyukovyBlok;
    expect(() => validujVyuku(sBloky([blok]))).toThrow(/pexeso/);
  });

  it('odmítne srovnávač s jednou položkou i s pěti položkami', () => {
    const polozka = (nazev: string) => ({ nazev, vlastnosti: { cena: 'nízká' } });
    const jedna = { typ: 'widget', widgetId: 'srovnavac', parametry: { polozky: [polozka('A')] } } as VyukovyBlok;
    expect(() => validujVyuku(sBloky([jedna]))).toThrow();
    const pet = {
      typ: 'widget',
      widgetId: 'srovnavac',
      parametry: { polozky: ['A', 'B', 'C', 'D', 'E'].map(polozka) },
    } as VyukovyBlok;
    expect(() => validujVyuku(sBloky([pet]))).toThrow();
  });

  it('odmítne časovou osu s jedinou událostí a s neceločíselným rokem', () => {
    const jedna = {
      typ: 'widget',
      widgetId: 'casova-osa',
      parametry: { udalosti: [{ rok: 1900, nazev: 'x', popis: 'y' }] },
    } as VyukovyBlok;
    expect(() => validujVyuku(sBloky([jedna]))).toThrow();
    const desetinny = {
      typ: 'widget',
      widgetId: 'casova-osa',
      parametry: { udalosti: [{ rok: 1900.5, nazev: 'x', popis: 'y' }, { rok: 1950, nazev: 'z', popis: 'w' }] },
    } as unknown as VyukovyBlok;
    expect(() => validujVyuku(sBloky([desetinny]))).toThrow();
  });

  it('vyukovyBlokSchema samo o sobě přijme widget blok (parametry řeší až validujVyuku)', () => {
    const ok = vyukovyBlokSchema.safeParse({ typ: 'widget', widgetId: 'pexeso', parametry: { cokoli: 1 } });
    expect(ok.success).toBe(true);
    const spatne = vyukaPredmetuSchema.safeParse(sBloky([{ typ: 'widget', widgetId: 'pexeso', parametry: { cokoli: 1 } } as unknown as VyukovyBlok]));
    expect(spatne.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Sanitizace SVG

describe('sanitizujSvg', () => {
  it('ponechá povolené elementy a atributy beze změny významu', () => {
    const svg = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><g transform="translate(5 5)"><rect x="0" y="0" width="10" height="10" fill="currentColor" /><text x="5" y="5" text-anchor="middle">Ahoj</text></g></svg>';
    expect(sanitizujSvg(svg)).toBe(svg);
  });

  it('zahodí <script> včetně obsahu', () => {
    const svg = '<svg><script>alert("xss")</script><rect width="5" height="5" /></svg>';
    const cisty = sanitizujSvg(svg);
    expect(cisty).not.toContain('script');
    expect(cisty).not.toContain('alert');
    expect(cisty).toContain('<rect width="5" height="5" />');
  });

  it('zahodí <foreignObject> včetně vnořeného HTML', () => {
    const svg = '<svg><foreignObject><body onload="zle()"><img src=x onerror=alert(1)></body></foreignObject><circle r="4" /></svg>';
    const cisty = sanitizujSvg(svg);
    expect(cisty).not.toContain('foreignObject');
    expect(cisty).not.toContain('onerror');
    expect(cisty).toContain('<circle r="4" />');
  });

  it('zahodí on* atributy, ale element ponechá', () => {
    const cisty = sanitizujSvg('<svg onload="zle()"><rect onclick="zle()" onmouseover=zle() width="5" height="5" /></svg>');
    expect(cisty).not.toMatch(/on\w+\s*=/);
    expect(cisty).toContain('<rect width="5" height="5" />');
  });

  it('zahodí href s javascript:, interní kotvy ponechá s prefixem svg-', () => {
    // Prefix id/kotvy brání SVG z obsahu podvrhnout kotvy stránky (lekce-zaver).
    const cisty = sanitizujSvg('<svg><rect fill="url(#grad)" href="javascript:alert(1)" xlink:href=\'JaVaScRiPt:zle()\' /><stop href="#grad" /></svg>');
    expect(cisty).not.toContain('javascript');
    expect(cisty).not.toContain('JaVaScRiPt');
    expect(cisty).toContain('href="#svg-grad"');
    expect(cisty).toContain('fill="url(#svg-grad)"');
  });

  it('prefixuje id, aby SVG nemohlo podvrhnout kotvy stránky', () => {
    const cisty = sanitizujSvg('<svg><g id="lekce-zaver"><rect id="vz-sipka" fill="url(#vz-sipka)" /></g></svg>');
    expect(cisty).toContain('id="svg-lekce-zaver"');
    expect(cisty).toContain('id="svg-vz-sipka"');
    expect(cisty).toContain('fill="url(#svg-vz-sipka)"'); // odkaz zůstává konzistentní s id
    expect(cisty).not.toContain('id="lekce-zaver"');
  });

  it('zahodí fill/stroke/marker s url() mimo interní kotvu, bezpečné hodnoty ponechá', () => {
    const cisty = sanitizujSvg(
      '<svg><rect fill="url(javascript:alert(1))" stroke="url(https://utocnik.cz/x.svg#g)" marker-end="url(https://utocnik.cz/b.svg#m)" /><rect fill="var(--akcent)" stroke="currentColor" /><line marker-end="url(#sipka)" stroke="#a1b2c3" /></svg>',
    );
    expect(cisty).not.toContain('javascript');
    expect(cisty).not.toContain('utocnik');
    expect(cisty).toContain('fill="var(--akcent)"');
    expect(cisty).toContain('stroke="currentColor"');
    expect(cisty).toContain('marker-end="url(#svg-sipka)"');
    expect(cisty).toContain('stroke="#a1b2c3"');
  });

  it('zahodí href na externí URL i data:', () => {
    const cisty = sanitizujSvg('<svg><stop href="https://utocnik.cz/a.svg" /><stop xlink:href="data:text/html,zle" /></svg>');
    expect(cisty).not.toContain('utocnik');
    expect(cisty).not.toContain('data:');
  });

  it('zahodí nepovolené elementy (style, image, use, a, animate) včetně obsahu párových', () => {
    const cisty = sanitizujSvg('<svg><style>*{background:url(javascript:1)}</style><image href="http://x/y.png" /><use href="#x" /><a href="http://x"><text>klik</text></a><animate attributeName="x" /></svg>');
    expect(cisty).not.toContain('style');
    expect(cisty).not.toContain('background');
    expect(cisty).not.toContain('image');
    expect(cisty).not.toContain('<use');
    expect(cisty).not.toContain('<a ');
    expect(cisty).not.toContain('animate');
    // obsah nepovoleného páru (<a>…</a>) se zahazuje celý
    expect(cisty).not.toContain('klik');
  });

  it('zvládne vnořené stejnojmenné nepovolené elementy', () => {
    const cisty = sanitizujSvg('<svg><switch><switch><text>uvnitř</text></switch></switch><text>venku</text></svg>');
    expect(cisty).not.toContain('uvnitř');
    expect(cisty).toContain('<text>venku</text>');
  });

  it('odstraní komentáře, CDATA a DOCTYPE', () => {
    const cisty = sanitizujSvg('<!DOCTYPE svg><!-- <script>zle()</script> --><svg><![CDATA[<script>zle()</script>]]><rect width="1" height="1" /></svg>');
    expect(cisty).not.toContain('script');
    expect(cisty).not.toContain('DOCTYPE');
    expect(cisty).toContain('<rect width="1" height="1" />');
  });

  it('neutralizuje rozbité značky typu <scr<script>ipt> (radši zahodí víc než míň)', () => {
    const cisty = sanitizujSvg('<svg><scr<script>ipt>alert(1)</script><rect width="1" height="1" /></svg>');
    expect(cisty).not.toContain('<script');
    expect(cisty).not.toContain('alert(1)');
  });

  it('osamocené < v textu escapuje', () => {
    const cisty = sanitizujSvg('<svg><text>a < b</text></svg>');
    expect(cisty).toContain('a &lt; b');
  });

  it('zahodí nepovolené atributy (style, tabindex), povolené ponechá vč. camelCase', () => {
    const cisty = sanitizujSvg('<svg viewBox="0 0 5 5"><linearGradient id="g" gradientUnits="userSpaceOnUse" style="position:fixed" tabindex="0"><stop offset="0" stop-color="red" /></linearGradient></svg>');
    expect(cisty).toContain('viewBox="0 0 5 5"');
    expect(cisty).toContain('gradientUnits="userSpaceOnUse"');
    expect(cisty).not.toContain('style=');
    expect(cisty).not.toContain('tabindex');
  });
});
