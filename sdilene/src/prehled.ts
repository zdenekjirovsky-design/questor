// Přehled rodiny pro admina (rodiče): souhrn postupu všech profilů — level,
// streak, lekce, zvládnutí a úspěšnost po předmětech a tématech, poslední
// testy a duely. Čistá funkce nad daty, která drží server (registr profilů,
// snapshoty progresu, události testů, banky, výuky); server ji volá
// v GET /api/admin/prehled, testy ji zkoušejí bez DB.
//
// Postup lekcí (PostupLekce) žije v aplikaci ve vyukaSlice a na server
// putuje uvnitř snapshotu progresu jako pole postupLekci (SnimekProgresu).

import type {
  AvatarKonfigurace,
  BankaOtazek,
  ProfilRegistrZaznam,
  ProgresStudenta,
  RezimTestu,
  TestVysledek,
} from './typy';
import type { VyukaPredmetu } from './vyuka';
import { denZData, pondeliTydne, rozdilDnu, stavLevelu, type StavLevelu } from './gamifikace';

// ---------------------------------------------------------------------------
// Postup lekcí a jeho sloučení mezi zařízeními

/** Postup jedné lekce (klíč v záznamu = temaId lekce). */
export interface PostupLekce {
  /** Indexy dokončených bloků lekce (bez duplicit, v pořadí dokončení). */
  dokonceneBloky: number[];
  /** ISO čas PRVNÍHO dokončení celé lekce, null = ještě nedokončená. */
  dokoncenoPoprve: string | null;
  /** Den (YYYY-MM-DD), kdy za lekci naposledy padlo XP — hlídá 1× denně. */
  posledniXpDen: string | null;
  /** Kolikrát byla lekce dokončena celkem. */
  pocetDokonceni: number;
}

/**
 * Snapshot progresu, jak cestuje mezi aplikací a serverem: ProgresStudenta
 * + postup lekcí. `postupLekci` je volitelné — starší klienti ho neposílají
 * a server v tom případě drží naposledy známý postup (slucPostupLekci).
 */
export interface SnimekProgresu extends ProgresStudenta {
  postupLekci?: Record<string, PostupLekce>;
}

function drivejsiCas(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a <= b ? a : b;
}

function pozdejsiDen(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
}

function normalizujPostup(p: Partial<PostupLekce> | undefined): PostupLekce {
  const bloky = Array.isArray(p?.dokonceneBloky)
    ? p.dokonceneBloky.filter((i): i is number => Number.isInteger(i) && i >= 0)
    : [];
  return {
    dokonceneBloky: [...new Set(bloky)],
    dokoncenoPoprve: typeof p?.dokoncenoPoprve === 'string' ? p.dokoncenoPoprve : null,
    posledniXpDen: typeof p?.posledniXpDen === 'string' ? p.posledniXpDen : null,
    pocetDokonceni:
      typeof p?.pocetDokonceni === 'number' && p.pocetDokonceni > 0
        ? Math.floor(p.pocetDokonceni)
        : 0,
  };
}

/**
 * Sloučí postup lekcí ze dvou zdrojů (server × zařízení). Údaje o dokončení
 * jsou monotónní — nic se neztratí: první dokončení = dřívější čas, poslední
 * XP den = pozdější, počet dokončení = vyšší. Rozpracované bloky se berou
 * z `prednostni` strany, pokud lekci zná (jinak ze `zaklad`) — „Začít lekci
 * znovu" na jednom zařízení tak pull z druhého nevrátí.
 */
export function slucPostupLekci(
  zaklad: Record<string, PostupLekce> | undefined,
  prednostni: Record<string, PostupLekce> | undefined,
): Record<string, PostupLekce> {
  const vysledek: Record<string, PostupLekce> = {};
  for (const [temaId, p] of Object.entries(zaklad ?? {})) vysledek[temaId] = normalizujPostup(p);
  for (const [temaId, p] of Object.entries(prednostni ?? {})) {
    const nove = normalizujPostup(p);
    const puvodni = vysledek[temaId];
    if (!puvodni) {
      vysledek[temaId] = nove;
      continue;
    }
    vysledek[temaId] = {
      dokonceneBloky: nove.dokonceneBloky,
      dokoncenoPoprve: drivejsiCas(puvodni.dokoncenoPoprve, nove.dokoncenoPoprve),
      posledniXpDen: pozdejsiDen(puvodni.posledniXpDen, nove.posledniXpDen),
      pocetDokonceni: Math.max(puvodni.pocetDokonceni, nove.pocetDokonceni),
    };
  }
  return vysledek;
}

/** Lekce je hotová, když byla aspoň jednou dokončena celá. */
export function lekceHotova(postup: PostupLekce | undefined): boolean {
  return !!postup && (postup.dokoncenoPoprve !== null || postup.pocetDokonceni > 0);
}

// ---------------------------------------------------------------------------
// Typy přehledu (odpověď GET /api/admin/prehled)

export interface PrehledTematu {
  temaId: string;
  nazev: string;
  /** Existuje k tématu lekce ve výuce předmětu? */
  maLekci: boolean;
  lekceHotova: boolean;
  /** Některé bloky prošel, celou lekci ještě ne. */
  lekceRozpracovana: boolean;
  otazekCelkem: number;
  /** Otázky v Leitnerově boxu ≥ 3. */
  zvladnuto: number;
  /** Počet odpovědí celkem (správně + špatně) na otázky tématu. */
  odpovedi: number;
  /** Správné odpovědi / všechny odpovědi, null = zatím žádná odpověď. */
  uspesnost: number | null;
}

export interface PrehledPredmetu {
  predmetId: string;
  nazev: string;
  /** Předmět je mezi studijními bankami profilu. */
  studuje: boolean;
  /** Aktivní banka profilu. */
  aktivni: boolean;
  lekceHotovo: number;
  lekceCelkem: number;
  otazekCelkem: number;
  /** Otázky, na které už aspoň jednou odpověděl. */
  otazekZodpovezeno: number;
  zvladnuto: number;
  uspesnost: number | null;
  testu: number;
  posledniTest: string | null;
  temata: PrehledTematu[];
}

export interface PrehledTestu {
  id: string;
  predmetId: string;
  nazevPredmetu: string;
  konec: string;
  uspesnost: number;
  pocetOtazek: number;
  ziskaneXp: number;
  delkaMs: number;
  rezim: RezimTestu;
  zVyzvy: boolean;
}

export interface PrehledProfilu {
  profilId: string;
  jmeno: string;
  barva: string | null;
  avatar: AvatarKonfigurace | null;
  /** Server má od profilu snapshot progresu (hrálo se se zapnutým syncem). */
  maProgres: boolean;
  posledniAktivita: string | null;
  xp: number;
  level: StavLevelu;
  streak: {
    /** Streak, který ještě platí (dnes/včera, případně zachranitelný zmrazením); jinak 0. */
    aktualni: number;
    nejdelsi: number;
    posledniDen: string | null;
  };
  dokonceneTesty: number;
  lekceHotovo: number;
  /** Posledních 6 týdnů (nejstarší první), klíč = pondělí týdne. */
  tydenniXp: { tyden: string; xp: number }[];
  duely: { vyhry: number; prohry: number; remizy: number; tituly: string[] } | null;
  predmety: PrehledPredmetu[];
  posledniTesty: PrehledTestu[];
}

export interface PrehledRodiny {
  vygenerovano: string;
  profily: PrehledProfilu[];
}

export interface VstupPrehledu {
  profily: ProfilRegistrZaznam[];
  progresy: { profilId: string; jmeno: string; progres: SnimekProgresu; prijato: string }[];
  udalosti: { profilId: string; vysledek: TestVysledek }[];
  banky: BankaOtazek[];
  vyuky: VyukaPredmetu[];
  /** Čas sestavení přehledu (Date kvůli lokálnímu dni pro streak a týdny). */
  ted: Date;
}

// ---------------------------------------------------------------------------
// Sestavení přehledu

export const POCET_TYDNU_PREHLEDU = 6;
export const POCET_TESTU_PREHLEDU = 8;

function podil(citatel: number, jmenovatel: number): number | null {
  return jmenovatel > 0 ? citatel / jmenovatel : null;
}

function platnyStreak(
  streak: ProgresStudenta['streak'] | undefined,
  dnes: string,
): PrehledProfilu['streak'] {
  if (!streak) return { aktualni: 0, nejdelsi: 0, posledniDen: null };
  let aktualni = 0;
  if (streak.posledniDen !== null) {
    const mezera = rozdilDnu(streak.posledniDen, dnes);
    if (mezera <= 1 || (mezera === 2 && streak.zmrazeni > 0)) aktualni = streak.aktualni;
  }
  return { aktualni, nejdelsi: streak.nejdelsi, posledniDen: streak.posledniDen };
}

function poslednichTydnu(tydenniXp: Record<string, number> | undefined, dnes: string) {
  const tydny: { tyden: string; xp: number }[] = [];
  let pondeli = pondeliTydne(dnes);
  for (let i = 0; i < POCET_TYDNU_PREHLEDU; i++) {
    tydny.unshift({ tyden: pondeli, xp: tydenniXp?.[pondeli] ?? 0 });
    const d = new Date(`${pondeli}T12:00:00`);
    d.setDate(d.getDate() - 7);
    pondeli = denZData(d);
  }
  return tydny;
}

export function sestavPrehledRodiny(vstup: VstupPrehledu): PrehledRodiny {
  const dnes = denZData(vstup.ted);

  // Index otázek: id → předmět a téma (id jsou unikátní napříč předměty).
  const otazkaDo = new Map<string, { predmetId: string; temaId: string }>();
  for (const banka of vstup.banky) {
    for (const o of banka.otazky) otazkaDo.set(o.id, { predmetId: banka.predmetId, temaId: o.temaId });
  }
  const vyukaPodle = new Map(vstup.vyuky.map((v) => [v.predmetId, v]));
  const bankaPodle = new Map(vstup.banky.map((b) => [b.predmetId, b]));
  const nazevPredmetu = (predmetId: string) => bankaPodle.get(predmetId)?.nazev ?? predmetId;

  const registr = new Map(vstup.profily.map((p) => [p.profilId, p]));
  const progresPodle = new Map(vstup.progresy.map((p) => [p.profilId, p]));
  const testyPodle = new Map<string, TestVysledek[]>();
  for (const u of vstup.udalosti) {
    const seznam = testyPodle.get(u.profilId) ?? [];
    seznam.push(u.vysledek);
    testyPodle.set(u.profilId, seznam);
  }

  const idProfilu = [...new Set([...registr.keys(), ...progresPodle.keys()])];

  const profily = idProfilu.map((profilId): PrehledProfilu => {
    const zaznam = registr.get(profilId);
    const radekProgresu = progresPodle.get(profilId);
    const progres = radekProgresu?.progres;
    const statistiky = progres?.statistikyOtazek ?? {};
    const postup = progres?.postupLekci ?? {};
    const testy = [...(testyPodle.get(profilId) ?? [])].sort((a, b) => (a.konec < b.konec ? 1 : -1));

    // --- Předměty --------------------------------------------------------
    const studovane = zaznam?.predmety ?? [];
    const aktivni = zaznam?.aktivniPredmetId ?? null;
    const kandidati = new Set<string>([...studovane]);
    for (const otazkaId of Object.keys(statistiky)) {
      const cil = otazkaDo.get(otazkaId);
      if (cil) kandidati.add(cil.predmetId);
    }
    for (const t of testy) kandidati.add(t.konfigurace.predmetId);
    for (const vyuka of vstup.vyuky) {
      if (vyuka.lekce.some((l) => postup[l.temaId])) kandidati.add(vyuka.predmetId);
    }

    const predmety: PrehledPredmetu[] = [];
    for (const predmetId of kandidati) {
      const banka = bankaPodle.get(predmetId);
      const vyuka = vyukaPodle.get(predmetId);
      if (!banka && !vyuka) continue; // neznámý předmět (banka odebraná ze serveru)

      const temata = new Map<string, PrehledTematu & { spravne: number; poradi: number }>();
      const tema = (temaId: string, nazev: string, poradi: number) => {
        let t = temata.get(temaId);
        if (!t) {
          t = {
            temaId,
            nazev,
            maLekci: false,
            lekceHotova: false,
            lekceRozpracovana: false,
            otazekCelkem: 0,
            zvladnuto: 0,
            odpovedi: 0,
            uspesnost: null,
            spravne: 0,
            poradi,
          };
          temata.set(temaId, t);
        }
        return t;
      };
      for (const t of banka?.temata ?? []) tema(t.id, t.nazev, t.poradi);
      for (const lekce of vyuka?.lekce ?? []) {
        const t = tema(lekce.temaId, lekce.nazev, temata.get(lekce.temaId)?.poradi ?? 1000 + lekce.poradi);
        const p = postup[lekce.temaId];
        t.maLekci = true;
        t.lekceHotova = lekceHotova(p);
        t.lekceRozpracovana = !t.lekceHotova && !!p && p.dokonceneBloky.length > 0;
      }
      let otazekZodpovezeno = 0;
      for (const o of banka?.otazky ?? []) {
        const t = tema(o.temaId, o.temaId, 999);
        t.otazekCelkem += 1;
        const s = statistiky[o.id];
        if (!s) continue;
        const odpovedi = s.spravneCelkem + s.spatneCelkem;
        if (odpovedi > 0) otazekZodpovezeno += 1;
        t.odpovedi += odpovedi;
        t.spravne += s.spravneCelkem;
        if (s.box >= 3) t.zvladnuto += 1;
      }

      const seznamTemat = [...temata.values()]
        .sort((a, b) => a.poradi - b.poradi)
        .map(({ spravne, poradi: _poradi, ...t }) => ({ ...t, uspesnost: podil(spravne, t.odpovedi) }));
      const spravneCelkem = [...temata.values()].reduce((s, t) => s + t.spravne, 0);
      const odpovediCelkem = seznamTemat.reduce((s, t) => s + t.odpovedi, 0);
      const testyPredmetu = testy.filter((t) => t.konfigurace.predmetId === predmetId);

      predmety.push({
        predmetId,
        nazev: banka?.nazev ?? predmetId,
        studuje: studovane.includes(predmetId),
        aktivni: aktivni === predmetId,
        lekceHotovo: seznamTemat.filter((t) => t.maLekci && t.lekceHotova).length,
        lekceCelkem: seznamTemat.filter((t) => t.maLekci).length,
        otazekCelkem: banka?.otazky.length ?? 0,
        otazekZodpovezeno,
        zvladnuto: seznamTemat.reduce((s, t) => s + t.zvladnuto, 0),
        uspesnost: podil(spravneCelkem, odpovediCelkem),
        testu: testyPredmetu.length,
        posledniTest: testyPredmetu[0]?.konec ?? null,
        temata: seznamTemat,
      });
    }

    // Řazení: aktivní banka, studované v pořadí výběru, pak ostatní s aktivitou.
    const poradiStudia = (p: PrehledPredmetu) => {
      if (p.aktivni) return -1;
      const i = studovane.indexOf(p.predmetId);
      return i === -1 ? 1000 : i;
    };
    predmety.sort((a, b) => poradiStudia(a) - poradiStudia(b) || a.nazev.localeCompare(b.nazev, 'cs'));

    // --- Souhrny ---------------------------------------------------------
    const casyAktivity = [progres?.aktualizovano ?? null, testy[0]?.konec ?? null].filter(
      (c): c is string => c !== null,
    );
    const posledniAktivita = casyAktivity.length > 0 ? casyAktivity.sort()[casyAktivity.length - 1] : null;
    const bilance = Object.values(progres?.trofeje?.dvojice ?? {});

    return {
      profilId,
      jmeno: zaznam?.jmeno ?? radekProgresu?.jmeno ?? profilId,
      barva: zaznam?.barva ?? null,
      avatar: zaznam?.avatar ?? progres?.avatar ?? null,
      maProgres: !!progres,
      posledniAktivita,
      xp: progres?.xp ?? 0,
      level: stavLevelu(progres?.xp ?? 0),
      streak: platnyStreak(progres?.streak, dnes),
      dokonceneTesty: progres?.dokonceneTesty ?? 0,
      lekceHotovo: Object.values(postup).filter((p) => lekceHotova(p)).length,
      tydenniXp: poslednichTydnu(progres?.rekordy?.tydenniXp, dnes),
      duely: progres?.trofeje
        ? {
            vyhry: bilance.reduce((s, b) => s + b.vyhry, 0),
            prohry: bilance.reduce((s, b) => s + b.prohry, 0),
            remizy: bilance.reduce((s, b) => s + b.remizy, 0),
            tituly: progres.trofeje.tituly,
          }
        : null,
      predmety,
      posledniTesty: testy.slice(0, POCET_TESTU_PREHLEDU).map((t) => ({
        id: t.id,
        predmetId: t.konfigurace.predmetId,
        nazevPredmetu: nazevPredmetu(t.konfigurace.predmetId),
        konec: t.konec,
        uspesnost: t.uspesnost,
        pocetOtazek: t.odpovedi.length,
        ziskaneXp: t.ziskaneXp,
        delkaMs: Math.max(0, Date.parse(t.konec) - Date.parse(t.zacatek)) || 0,
        rezim: t.konfigurace.rezim,
        zVyzvy: !!t.vyzvaId,
      })),
    };
  });

  profily.sort((a, b) => {
    if (a.posledniAktivita !== b.posledniAktivita) {
      if (a.posledniAktivita === null) return 1;
      if (b.posledniAktivita === null) return -1;
      return a.posledniAktivita < b.posledniAktivita ? 1 : -1;
    }
    return a.jmeno.localeCompare(b.jmeno, 'cs');
  });

  return { vygenerovano: vstup.ted.toISOString(), profily };
}
