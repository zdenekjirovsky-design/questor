// Poskytovatel 'mock' — deterministické smysluplné otázky bez sítě.
// Slouží testům pipeline a lokálnímu vyzkoušení CLI; obsah odvozuje z učiva
// (věty z kontextu, názvy témat), žádná náhoda.

import type { Obtiznost } from '@questor/sdilene';
import type { LlmOtazka } from '../llm-schema';
import type { Poskytovatel, VstupGenerovani } from './rozhrani';

/** Vytáhne z textu učiva smysluplné věty (deterministicky, v pořadí výskytu). */
function vetyZKontextu(kontext: string): string[] {
  return kontext
    .replace(/^#{1,6}\s+.*$/gm, '')
    .split(/(?<=[.!?])\s+/)
    .map((v) => v.replace(/\s+/g, ' ').trim())
    .filter((v) => v.length >= 25 && v.length <= 220);
}

function veta(vety: string[], index: number, zaklad: string): string {
  if (vety.length === 0) return `Základní poznatek k tématu ${zaklad}.`;
  return vety[index % vety.length];
}

function vytvorOtazku(vstup: VstupGenerovani, index: number, vety: string[]): LlmOtazka {
  const { tema, pasmo } = vstup;
  const rozpeti = pasmo.max - pasmo.min + 1;
  const obtiznost = (pasmo.min + (index % rozpeti)) as Obtiznost;
  const spravnaVeta = veta(vety, index, tema.nazev);
  const vysvetleni = `Vychází z učiva tématu „${tema.nazev}“: ${spravnaVeta}`;
  const zaklad = { obtiznost, vysvetleni, zdroj: tema.nazev };

  switch (index % 5) {
    case 0: {
      const spravna = index % 4;
      const moznosti = [0, 1, 2, 3].map((i) =>
        i === spravna
          ? `Platí: ${spravnaVeta}`
          : `Neplatí: smyšlené tvrzení č. ${i + 1} k tématu ${tema.nazev}.`,
      );
      return {
        typ: 'vyber',
        ...zaklad,
        zadani: `Které tvrzení k tématu „${tema.nazev}“ je správné? (${index + 1})`,
        moznosti,
        spravna,
      };
    }
    case 1: {
      const dalsiVeta = veta(vety, index + 1, tema.nazev);
      return {
        typ: 'multi',
        ...zaklad,
        zadani: `Označte všechna správná tvrzení k tématu „${tema.nazev}“. (${index + 1})`,
        moznosti: [
          `Platí: ${spravnaVeta}`,
          `Neplatí: smyšlené tvrzení A k tématu ${tema.nazev}.`,
          `Platí: ${dalsiVeta}`,
          `Neplatí: smyšlené tvrzení B k tématu ${tema.nazev}.`,
        ],
        spravne: [0, 2],
      };
    }
    case 2:
      return {
        typ: 'anone',
        ...zaklad,
        zadani: `Platí k tématu „${tema.nazev}“ toto tvrzení? ${spravnaVeta} (${index + 1})`,
        spravna: true,
      };
    case 3: {
      const pojem = tema.nazev.split(/\s+/)[0].toLowerCase();
      return {
        typ: 'doplneni',
        ...zaklad,
        zadani: `Doplňte klíčový pojem: první slovo názvu tématu „${tema.nazev}“. (${index + 1})`,
        spravneOdpovedi: [pojem],
      };
    }
    default:
      return {
        typ: 'prirazovani',
        ...zaklad,
        zadani: `Přiřaďte k sobě pojmy a charakteristiky tématu „${tema.nazev}“. (${index + 1})`,
        pary: [1, 2, 3].map((n) => ({
          levy: `Pojem ${n} (${tema.nazev})`,
          pravy: `Charakteristika ${n}: ${veta(vety, index + n, tema.nazev).slice(0, 120)}`,
        })),
      };
  }
}

export function vytvorPoskytovateleMock(): Poskytovatel {
  return {
    nazev: 'mock',
    async extrahujTemata(vstup) {
      const nazvy: string[] = [];
      for (const kapitola of vstup.kapitoly) {
        const nazev = kapitola.nadpis.replace(/\s*\(část \d+\)$/, '');
        if (!nazvy.includes(nazev)) nazvy.push(nazev);
        if (nazvy.length >= 8) break;
      }
      return nazvy.length > 0 ? nazvy : ['Základní pojmy'];
    },
    async vygenerujOtazky(vstup) {
      const vety = vetyZKontextu(vstup.kontext);
      const otazky: LlmOtazka[] = [];
      for (let i = 0; i < vstup.pocet; i++) {
        // Posun o pasmo.min, aby se dávky různých pásem nelišily jen obtížností
        // (jinak by po dedupu podle id zbyla jen jedna dávka z tématu).
        otazky.push(vytvorOtazku(vstup, i + vstup.pasmo.min * 7, vety));
      }
      return otazky;
    },
    async overOtazky(vstup) {
      // Deterministická kontrola bez sítě: otázky projdou beze změny.
      return vstup.otazky;
    },
  };
}
