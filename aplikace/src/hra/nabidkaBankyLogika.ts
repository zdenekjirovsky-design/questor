// Nabídka nové banky na Domů — čistá rozhodovací logika + skrytí nabídky.
//
// Banka z registru může říct, komu se má nabídnout (`nabidnoutK` — id bank,
// jejichž studentům dává smysl; např. Pravopis studentům Českého jazyka).
// Karta na Domů (NabidkaBanky.tsx) se ukáže, dokud si ji profil nepřidá mezi
// studijní banky nebo nabídku neskryje. Skrytí je per profil a žije jen
// v localStorage tohohle zařízení (klíč níže) — není to herní stav, do
// persistu aplikace ani do syncu nepatří.
import { PREDMETY, type PredmetMetadata } from '../data/predmety';
import { vychoziUloziste, type Uloziste } from '../sync/klient';

export interface VstupNabidky {
  /** Studijní banky profilu (profilySlice.predmetyProfilu). */
  predmetyProfilu: readonly string[];
  /** Banky s načteným obsahem (store `banky`) — stačí klíče. */
  nacteneBanky: Readonly<Record<string, unknown>>;
  /** Id bank, jejichž nabídku profil skryl. */
  skryte: readonly string[];
  /** Registr předmětů (injektovatelný kvůli testům). */
  registr?: readonly PredmetMetadata[];
}

/**
 * Která banka se má profilu nabídnout? První banka registru, která:
 *  - má `nabidnoutK` a profil některou z těch bank studuje,
 *  - ještě není mezi studijními bankami profilu,
 *  - má načtený obsah (bez něj by nabídka vedla do prázdna),
 *  - a profil její nabídku neskryl.
 * Jinak null. Čistá funkce.
 */
export function bankaKNabidnuti(vstup: VstupNabidky): PredmetMetadata | null {
  const registr = vstup.registr ?? PREDMETY;
  for (const predmet of registr) {
    if (!predmet.nabidnoutK || predmet.nabidnoutK.length === 0) continue;
    if (vstup.predmetyProfilu.includes(predmet.id)) continue;
    if (!predmet.nabidnoutK.some((id) => vstup.predmetyProfilu.includes(id))) continue;
    if (vstup.nacteneBanky[predmet.id] === undefined) continue;
    if (vstup.skryte.includes(predmet.id)) continue;
    return predmet;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Skrytí nabídky (per profil, localStorage)

function klicSkrytych(profilId: string): string {
  return `questor-nabidka-banky:${profilId}`;
}

/**
 * Skrytí, která se nepodařilo zapsat do úložiště (zablokované cookies, plná
 * kvóta): profilId → id bank. Drží se v paměti, aby nabídka zůstala skrytá
 * aspoň do zavření stránky — bez toho by se po každém návratu na Domů
 * objevila znovu.
 */
const neulozeneSkryti = new Map<string, string[]>();

function zUloziste(profilId: string, uloziste: Uloziste): string[] {
  try {
    const raw = uloziste.getItem(klicSkrytych(profilId));
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Id bank, jejichž nabídku profil skryl. Vadná / nedostupná data = nic skrytého. */
export function nactiSkryteNabidky(
  profilId: string,
  uloziste: Uloziste = vychoziUloziste(),
): string[] {
  const ulozene = zUloziste(profilId, uloziste);
  const jenVPameti = (neulozeneSkryti.get(profilId) ?? []).filter((id) => !ulozene.includes(id));
  return [...ulozene, ...jenVPameti];
}

/**
 * Skryje nabídku banky pro profil a vrátí nový seznam skrytých. Když zápis
 * selže (zablokované úložiště), skrytí si pamatuje modul — platí do zavření
 * stránky a jen se nepřenese přes restart.
 */
export function skryjNabidku(
  profilId: string,
  predmetId: string,
  uloziste: Uloziste = vychoziUloziste(),
): string[] {
  const dosud = nactiSkryteNabidky(profilId, uloziste);
  const nove = dosud.includes(predmetId) ? dosud : [...dosud, predmetId];
  try {
    uloziste.setItem(klicSkrytych(profilId), JSON.stringify(nove));
  } catch {
    neulozeneSkryti.set(profilId, nove);
  }
  return nove;
}
