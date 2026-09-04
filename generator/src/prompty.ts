// Prompty pro Claude — sdílené mezi poskytovateli 'api' a 'claude-cli'.
// Poskytovatel 'api' vynucuje tvar structured outputem; 'claude-cli' si k promptu
// přidává textový popis JSON tvaru (viz POKYN_CISTY_JSON a popisy níže).

import type { Kapitola } from './ingest';
import type { Tema } from '@questor/sdilene';
import type { LlmOtazka } from './llm-schema';
import type { PasmoObtiznosti } from './poskytovatele/rozhrani';

export const SYSTEM_GENERATOR =
  'Jsi zkušený středoškolský učitel a tvůrce testových otázek. Tvoříš kvalitní, ' +
  'věcně správné otázky v češtině přesně podle dodaného učiva. Nikdy si nevymýšlíš ' +
  'fakta, která v učivu nejsou nebo z něj neplynou.';

export const POPIS_TYPU = `Typy otázek a jejich pole (kromě společných polí typ, obtiznost, zadani, vysvetleni, zdroj):
- "vyber": jedna správná z možností — pole "moznosti" (2–6 textů) a "spravna" (index správné možnosti od 0).
- "multi": více správných — pole "moznosti" (3–6 textů) a "spravne" (indexy VŠECH správných, aspoň jeden, bez duplicit).
- "anone": ano/ne — pole "spravna" (true = tvrzení platí).
- "doplneni": volná odpověď — pole "spravneOdpovedi" (všechny uznávané varianty odpovědi; krátké výrazy, ne věty).
- "prirazovani": párování — pole "pary" (2–6 objektů { "levy": …, "pravy": … }).
Společná pole: "obtiznost" (celé číslo 1–5), "zadani" (text otázky), "vysvetleni" (proč je odpověď správná — učí studenta), "zdroj" (název kapitoly učiva, nebo null).`;

export function promptTemata(nazevPredmetu: string, kapitoly: Kapitola[]): string {
  const osnova = kapitoly
    .map((k, i) => `${i + 1}. ${k.nadpis} (${k.text.length} znaků)\n   Začátek: ${k.text.slice(0, 200).replace(/\s+/g, ' ')}`)
    .join('\n');
  return `Z osnovy učiva předmětu „${nazevPredmetu}“ vytvoř seznam 3–12 témat pro banku testových otázek.

Pravidla:
- Témata pokrývají celé učivo, nepřekrývají se a jdou v pořadí, v jakém na sebe navazují.
- Název tématu je krátký (2–6 slov), česky, výstižný.
- Příbuzné kapitoly sluč do jednoho tématu; nevymýšlej témata, která v učivu nejsou.

Osnova učiva (nadpisy kapitol a začátky textů):
${osnova}`;
}

export function promptOtazky(vstup: {
  nazevPredmetu: string;
  tema: Tema;
  pasmo: PasmoObtiznosti;
  pocet: number;
  kontext: string;
}): string {
  const { nazevPredmetu, tema, pasmo, pocet, kontext } = vstup;
  const rozsah = pasmo.min === pasmo.max ? `přesně ${pasmo.min}` : `${pasmo.min}–${pasmo.max}`;
  return `Vytvoř ${pocet} testových otázek k tématu „${tema.nazev}“ předmětu „${nazevPredmetu}“.

Požadavky:
- Obtížnost každé otázky: ${rozsah} (1 = základní pojmy, 3 = porozumění a souvislosti, 5 = aplikace a analýza).
- Namíchej různé typy otázek — použij co nejvíc z pěti typů (vyber, multi, anone, doplneni, prirazovani), žádný typ víc než dvakrát, pokud to počet dovolí.
- Otázky vycházejí VÝHRADNĚ z dodaného učiva. Každá má srozumitelné zadání, jednoznačný klíč správnosti a "vysvetleni", které studenta poučí (ne jen zopakuje odpověď).
- U typu "vyber" a "multi" musí být špatné možnosti věrohodné, ale jednoznačně špatné.
- U typu "doplneni" chtěj krátký pojem/číslo a uveď všechny rozumné varianty zápisu.
- Do "zdroj" dej název kapitoly učiva, ze které otázka vychází (nebo null).

${POPIS_TYPU}

Učivo k tématu:
${kontext}`;
}

export function promptOvereni(vstup: {
  nazevPredmetu: string;
  tema: Tema;
  otazky: LlmOtazka[];
  kontext: string;
}): string {
  const { nazevPredmetu, tema, otazky, kontext } = vstup;
  return `Jsi přísný oponent. Dostaneš dávku testových otázek k tématu „${tema.nazev}“ předmětu „${nazevPredmetu}“ a učivo, ze kterého vycházejí. Zkontroluj u každé otázky klíč správnosti a vysvětlení:
- Je označená odpověď skutečně správná podle učiva? Není správných možností víc/míň, než klíč tvrdí?
- Je zadání jednoznačné a vysvětlení věcně správné a poučné?
- Drobné chyby OPRAV (uprav text, klíč nebo vysvětlení). Otázku, která se opravit nedá (nejednoznačná, mimo učivo, věcně špatně), VYŘAĎ — do výstupu ji nedávej.
Vrať výsledné otázky ve stejném tvaru, v jakém jsi je dostal.

${POPIS_TYPU}

Otázky ke kontrole (JSON):
${JSON.stringify({ otazky }, null, 2)}

Učivo:
${kontext}`;
}

// ---------------------------------------------------------------------------
// Dodatky pro poskytovatele claude-cli (bez structured outputu)

export const POKYN_CISTY_JSON =
  'Odpověz VÝHRADNĚ čistým JSON bez markdownu, bez ohrazení ``` a bez jakéhokoli dalšího textu před ním či za ním.';

export const POPIS_TVARU_TEMAT = `${POKYN_CISTY_JSON}
Tvar odpovědi: {"temata": ["Název tématu", …]}`;

export const POPIS_TVARU_OTAZEK = `${POKYN_CISTY_JSON}
Tvar odpovědi: {"otazky": [{…otázka…}, …]} — každá otázka přesně s poli popsanými výše (typ, obtiznost, zadani, vysvetleni, zdroj + pole svého typu).`;
