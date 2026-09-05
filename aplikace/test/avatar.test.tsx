// Testy komponenty Avatar — fail-safe render nad poškozenými persistovanými
// daty (Avatar je v HUD na každé stránce, jedno vadné pole v localStorage
// nesmí položit celou aplikaci) + regrese viditelnosti gumičky culíku.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AvatarKonfigurace } from '@questor/sdilene';
import { VYCHOZI_AVATAR } from '@questor/sdilene';
import Avatar from '../src/hra/Avatar';

function render(konfigurace: AvatarKonfigurace): string {
  return renderToStaticMarkup(<Avatar konfigurace={konfigurace} />);
}

describe('Avatar — fail-safe nad poškozenými daty', () => {
  it('neznámý tvar obličeje spadne na oválný místo pádu', () => {
    const konfigurace = {
      ...VYCHOZI_AVATAR,
      tvarObliceje: 'srdcovy',
    } as unknown as AvatarKonfigurace;
    const svg = render(konfigurace);
    // Cesta oválného obličeje (fallback) je v markupu.
    expect(svg).toContain('M100 50 C80 50 68 66 68 88');
  });

  it('chybějící objekt vybava se bere jako prázdný místo pádu', () => {
    const konfigurace = {
      ...VYCHOZI_AVATAR,
      vybava: undefined,
    } as unknown as AvatarKonfigurace;
    expect(() => render(konfigurace)).not.toThrow();
  });

  it('platná konfigurace se vykreslí beze změny (žádný fallback se neaktivuje)', () => {
    const svg = render({ ...VYCHOZI_AVATAR, tvarObliceje: 'hranaty' });
    expect(svg).toContain('M100 52 C82 52 70 62 70 80');
  });
});

describe('Avatar — culík', () => {
  it('gumička je v přední vrstvě vedle obličeje (cx=136), aby ji obličej nezakryl', () => {
    for (const tvarObliceje of ['ovalny', 'hranaty', 'kulaty'] as const) {
      const svg = render({ ...VYCHOZI_AVATAR, tvarObliceje, stylVlasu: 'culik' });
      expect(svg).toContain('cx="136"');
    }
  });
});
