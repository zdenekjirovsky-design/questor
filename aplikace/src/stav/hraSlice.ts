// Slice gamifikace — VLASTNÍ agent APP-HRA.
// Drží progres studenta (XP, streak, questy, sbírka, rekordy) a akce nad ním.
// GARANTOVANÉ akce (importuje je testový engine): zapocitejOdpoved, zapocitejTest,
// otevriTruhluAkce, prijmiVyzvy, resetujProgres.
//
// Pozn. k truhlám: zapocitejTest zařadí truhlu z testu do `cekajiciTruhly`;
// otevriTruhluAkce ji při otevření z fronty zase odebere. Truhla se tak nikdy
// neztratí (neotevřená z Výsledku čeká na Domů) a nikdy nezdvojí. Když už
// ve frontě žádná truhla daného typu nečeká, otevriTruhluAkce vrací null
// a ŽÁDNOU odměnu neuděluje — fronta je jediný zdroj pravdy (jinak by šlo
// remountem stránky Výsledek farmit odměny donekonečna).

import type { StateCreator } from 'zustand';
import type {
  AvatarKonfigurace,
  BankaOtazek,
  Duel,
  Odmena,
  OdpovedZaznam,
  PowerupTyp,
  ProgresStudenta,
  QuestDenni,
  StatistikaOtazky,
  TestVysledek,
  TrofejeProfilu,
  TruhlaTyp,
  Vyzva,
} from '@questor/sdilene';
import {
  aktualizujStatistiku,
  aktualizujStreakPoAktivite,
  aktualizujTrofeje,
  aplikujOdpovedNaQuesty,
  aplikujTestNaQuesty,
  denZData,
  doplnDuelovyProgres,
  expirujDuel,
  idMistrovskeKarty,
  KARTY_VELIKANI,
  otevriTruhlu,
  pondeliTydne,
  vychoziPowerupy,
  vychoziProgres,
  vygenerujDenniQuesty,
  vyhodnotDuel,
  vysledekProHrace,
  xpZaOdpoved,
  type KontextQuestu,
  type StupenMistrovstvi,
} from '@questor/sdilene';
import {
  casDokonceniDuelu,
  jeDokoncenyDuel,
  jeUcastnikDuelu,
  odpovezVPrubehu,
  odstartujPrubeh,
  otazkyDuelu,
  pouzijPowerupVPrubehu,
  sloucDuely,
  timeoutVPrubehu,
  vysledekZPrubehu,
  vytvorDuelPrubeh,
  type DuelPrubeh,
} from '../duely/engine';
import { vyhodnotOdpoved, type OdpovedHodnota } from '../testy/engine';
import { nazevPredmetu } from '../data/predmety';
import {
  aktivniPredmetProfilu,
  najdiAktivniProfil,
  type QuestyBanky,
} from './profilySlice';
import type { QUESTORStav } from './store';

// ---------------------------------------------------------------------------
// Pomocné čisté funkce (lokální pro slice)

function pridejTydenniXp(
  tydenniXp: Record<string, number>,
  den: string,
  xp: number,
): Record<string, number> {
  if (xp <= 0) return tydenniXp;
  const klic = pondeliTydne(den);
  return { ...tydenniXp, [klic]: (tydenniXp[klic] ?? 0) + xp };
}

/** Téma s nejnižší úspěšností (min. 3 zodpovězené otázky), pro denní quest. */
function nejslabsiTema(
  banky: Record<string, BankaOtazek>,
  statistiky: Record<string, StatistikaOtazky>,
): string | undefined {
  const agregace: Record<string, { spravne: number; celkem: number }> = {};
  for (const banka of Object.values(banky)) {
    for (const otazka of banka.otazky) {
      const stat = statistiky[otazka.id];
      if (!stat) continue;
      const a = (agregace[otazka.temaId] ??= { spravne: 0, celkem: 0 });
      a.spravne += stat.spravneCelkem;
      a.celkem += stat.spravneCelkem + stat.spatneCelkem;
    }
  }
  let vitez: string | undefined;
  let nejnizsi = Infinity;
  for (const [temaId, a] of Object.entries(agregace)) {
    if (a.celkem < 3) continue;
    const uspesnost = a.spravne / a.celkem;
    if (uspesnost < nejnizsi) {
      nejnizsi = uspesnost;
      vitez = temaId;
    }
  }
  return vitez;
}

/**
 * Kontext questu dne. S aktivni bankou (`predmetId`) se temata i nejslabsi
 * tema berou JEN z ni — denni questy se vztahuji k aktivni bance profilu.
 * Bez aktivni banky (zadny profil, napr. testy) zustava puvodni chovani
 * pres vsechny banky.
 */
function kontextQuestu(
  banky: Record<string, BankaOtazek>,
  statistiky: Record<string, StatistikaOtazky>,
  predmetId: string | null,
): KontextQuestu {
  const zdroj: Record<string, BankaOtazek> =
    predmetId === null ? banky : banky[predmetId] ? { [predmetId]: banky[predmetId] } : {};
  const videna = new Set<string>();
  const temata = Object.values(zdroj)
    .flatMap((b) => b.temata)
    .filter((t) => (videna.has(t.id) ? false : (videna.add(t.id), true)))
    .sort((a, b) => a.poradi - b.poradi);
  return { temata, nejslabsiTemaId: nejslabsiTema(zdroj, statistiky) };
}

/** Aktivni banka aktivniho profilu (null bez profilu). */
function aktivniPredmetZeStavu(stav: QUESTORStav): string | null {
  return aktivniPredmetProfilu(najdiAktivniProfil(stav));
}

/**
 * Seed generatoru questu dne: profil × banka (questy jsou per profil × banka
 * × den). Bez profilu zustava seed prazdny (zpetne kompatibilni chovani).
 */
function seedQuestu(profilId: string | null, predmetId: string | null): string | undefined {
  if (!profilId) return undefined;
  return predmetId ? `${profilId}:${predmetId}` : profilId;
}

/**
 * Vrátí questy platné pro dnešek — když je den nový, vygeneruje čerstvé.
 * Seed doplňuje id aktivního profilu, aby dva profily na jednom počítači
 * neměly identické questy dne.
 */
function zajistiQuestyDne(
  questy: QuestDenni[],
  dnes: string,
  ctx: KontextQuestu,
  profilId?: string | null,
): QuestDenni[] {
  if (questy.length > 0 && questy[0].datum === dnes) return questy;
  return vygenerujDenniQuesty(dnes, ctx, profilId ?? undefined);
}

const PRAHY_MISTROVSTVI: { stupen: StupenMistrovstvi; prah: number }[] = [
  { stupen: 'bronz', prah: 0.5 },
  { stupen: 'stribro', prah: 0.75 },
  { stupen: 'zlato', prah: 0.95 },
];

/**
 * Mistrovské karty témat: podíl otázek tématu v Leitnerově boxu >= 3
 * dosáhl 50 % / 75 % / 95 % → bronz / stříbro / zlato. Vrací jen NOVÉ karty.
 */
function noveMistrovskeKarty(
  banky: Record<string, BankaOtazek>,
  statistiky: Record<string, StatistikaOtazky>,
  vlastnene: string[],
): string[] {
  const nove: string[] = [];
  for (const banka of Object.values(banky)) {
    for (const tema of banka.temata) {
      const otazkyTematu = banka.otazky.filter((o) => o.temaId === tema.id);
      if (otazkyTematu.length === 0) continue;
      const zvladnute = otazkyTematu.filter((o) => (statistiky[o.id]?.box ?? 0) >= 3).length;
      const podil = zvladnute / otazkyTematu.length;
      for (const { stupen, prah } of PRAHY_MISTROVSTVI) {
        if (podil < prah) continue;
        const id = idMistrovskeKarty(tema.id, stupen);
        if (!vlastnene.includes(id) && !nove.includes(id)) nove.push(id);
      }
    }
  }
  return nove;
}

/**
 * Zapocita dane duely do trofejni vitriny (bilance dvojic, serie, tituly).
 * Kandidati se radi od nejstarsiho podle CASU DOKONCENI (serie vyher musi
 * jit chronologicky podle toho, kdy duely skoncily — poradi zalozeni muze
 * byt jine; casDokonceniDuelu, remiza radi vytvoreno). Preskakuji se duely
 * bez soupere a duely, kde nikdo neodehral (vyprsela vyzva bez jedine
 * odpovedi neni rivalita). Cista funkce.
 */
function zapoctiTrofejeZDuelu(
  vychozi: TrofejeProfilu,
  duely: Duel[],
  profilId: string,
  banky: Record<string, BankaOtazek>,
): { trofeje: TrofejeProfilu; zapocitane: string[]; noveTituly: string[] } {
  let trofeje = vychozi;
  const zapocitane: string[] = [];
  const noveTituly: string[] = [];
  const chronologicky = [...duely].sort(
    (a, b) =>
      casDokonceniDuelu(a).localeCompare(casDokonceniDuelu(b)) ||
      a.vytvoreno.localeCompare(b.vytvoreno),
  );
  for (const duel of chronologicky) {
    if (!jeDokoncenyDuel(duel) || !duel.souper || !jeUcastnikDuelu(duel, profilId)) continue;
    if (Object.keys(duel.vysledky).length === 0) continue; // nikdo nehral
    const souper = duel.vyzyvatel.profilId === profilId ? duel.souper : duel.vyzyvatel;
    const vitez = duel.vitezProfilId !== undefined ? duel.vitezProfilId : vyhodnotDuel(duel);
    const predchoziTituly = trofeje.tituly;
    trofeje = aktualizujTrofeje(trofeje, souper.profilId, vysledekProHrace(vitez, profilId), {
      predmetId: duel.predmetId,
      nazev: nazevPredmetu(duel.predmetId, banky[duel.predmetId]?.nazev),
    });
    for (const titul of trofeje.tituly) {
      if (!predchoziTituly.includes(titul)) noveTituly.push(titul);
    }
    zapocitane.push(duel.id);
  }
  return { trofeje, zapocitane, noveTituly };
}

/** Seznam zapocitanych duelu s ochranou proti neomezenemu rustu. */
function orizniZapocitane(zapocitane: string[]): string[] {
  return zapocitane.length > 100 ? zapocitane.slice(-100) : zapocitane;
}

// ---------------------------------------------------------------------------
// Slice

export interface HraSlice {
  progres: ProgresStudenta;
  /** Truhly čekající na otevření (z testů a bonus za splnění všech 3 questů). */
  cekajiciTruhly: TruhlaTyp[];
  /** Výzvy od táty přijaté ze serveru. */
  vyzvy: Vyzva[];
  /** Karty získané, ale ještě neukázané ve Sbírce (flip animace). */
  novaKarty: string[];
  /** Id questů, za které už bylo připsáno XP (aby se nepřipsalo dvakrát). */
  questyOdmeneno: string[];
  /** Den (YYYY-MM-DD), za který už byla udělena bonusová truhla za všechny 3 questy. */
  denBonusoveTruhly: string | null;
  /** Den, kdy streak zachránilo zmrazení (ledový plamínek v HUD). */
  zmrazeniPouzitoDen: string | null;
  /** Posledních 10 dokončených testů (pro Statistiky). */
  historieTestu: TestVysledek[];
  /**
   * Questy dne NEAKTIVNÍCH bank profilu (aktivní banka je drží v
   * progres.questy + questyOdmeneno). Klíč = predmetId; přepínání bank
   * (profilySlice.prepniAktivniPredmet) sem questy ukládá a zase je nahrává,
   * takže přepnutí tam a zpět NEgeneruje nové questy zadarmo.
   */
  questyPodleBank: Record<string, QuestyBanky>;
  /**
   * Týdenní XP z testů PER BANKA: predmetId → pondělí týdne (YYYY-MM-DD)
   * → součet ziskaneXp. Přesný průběžný agregát pro graf ve Statistikách —
   * historieTestu drží jen posledních 10 testů, na graf 8 týdnů nestačí.
   */
  tydenniXpTestuPodleBank: Record<string, Record<string, number>>;
  /** Moje duely (běžící + historie) ze serveru, s lokálně doplněnými výsledky. */
  duely: Duel[];
  /** Otevřené rodinné výzvy jiných hráčů (jdou přijmout). */
  otevreneDuely: Duel[];
  /** Rozehraný průběh duelu (null = žádný neběží). Přežívá restart. */
  aktualniDuel: DuelPrubeh | null;
  /** Id duelů už započítaných do trofejí (každý duel se počítá jen jednou). */
  duelyZapocitane: string[];
  /** Tituly získané a ještě neoslavené na výsledkové obrazovce. */
  noveTituly: string[];

  zapocitejOdpoved(zaznam: OdpovedZaznam, comboAktualni: number): void;
  zapocitejTest(vysledek: TestVysledek): void;
  /** Otevře truhlu z fronty `cekajiciTruhly`. Vrací null, když tam typ nečeká. */
  otevriTruhluAkce(typ: TruhlaTyp): Odmena | null;
  prijmiVyzvy(vyzvy: Vyzva[]): void;
  resetujProgres(): void;
  /** Denní obnova questů — volat při startu dne / zobrazení dashboardu. */
  obnovDenniQuesty(): void;
  /** Uloží celou konfiguraci avataru (editor v Nastavení posílá hotový návrh). */
  zmenAvatara(konfigurace: AvatarKonfigurace): void;
  /** Sbírka zavolá po přehrání flip animací nových karet. */
  oznacKartyZaVidene(): void;

  /**
   * Merge duelů ze serveru (pull při syncu). Lokálně odehraný výsledek,
   * který na server ještě nedorazil (offline fronta), se neztrácí; nově
   * dokončené duely se hned započítají do trofejí (každý jen jednou).
   */
  prijmiDuely(moje: Duel[], otevrene: Duel[]): void;
  /** Upsert jednoho duelu (odpověď serveru na založení/přijetí výzvy). */
  pridejDuel(duel: Duel): void;
  /**
   * Založí průběh duelu (obrazovka VS — čas ještě neběží). Vrací false,
   * když duel nejde hrát (chybí soupeř/handicap, už odehráno, banka nezná
   * otázky). Rozehraný průběh TÉHOŽ duelu se neresetuje (pokračuje se).
   */
  zacniDuelAkce(duelId: string): boolean;
  /** Odstartuje čas první otázky (klik na „Do boje!" na intru). */
  odstartujDuelAkce(): void;
  /**
   * Odpověď v duelu; hodnota null = timeout (0 bodů). Po poslední otázce
   * uloží můj výsledek do duelu, zařadí ho do offline fronty a případně
   * duel lokálně vyhodnotí (trofeje, tituly).
   */
  odpovezVDueluAkce(hodnota: OdpovedHodnota | null, casMs: number): void;
  /**
   * Použije power-up v běžícím duelu (ubere kus ze zásoby v progresu).
   * Vrací false, když použít nejde (došla zásoba, už použitý, špatný typ
   * otázky…). Náhoda jen pro los skrytých možností 50:50.
   */
  pouzijPowerupAkce(typ: PowerupTyp, nahoda?: () => number): boolean;
  /** Výsledková obrazovka zavolá po oslavě nových titulů. */
  oznacTitulyZaVidene(): void;
}

export const vytvorHraSlice: StateCreator<QUESTORStav, [], [], HraSlice> = (set, get) => ({
  progres: vychoziProgres(new Date().toISOString()),
  cekajiciTruhly: [],
  vyzvy: [],
  novaKarty: [],
  questyOdmeneno: [],
  denBonusoveTruhly: null,
  zmrazeniPouzitoDen: null,
  historieTestu: [],
  questyPodleBank: {},
  tydenniXpTestuPodleBank: {},
  duely: [],
  otevreneDuely: [],
  aktualniDuel: null,
  duelyZapocitane: [],
  noveTituly: [],

  zapocitejOdpoved: (zaznam, comboAktualni) => {
    const ted = new Date();
    const dnes = denZData(ted);
    const stav = get();
    const progres = stav.progres;

    // XP jen za správnou odpověď; comboKrok se počítá od 0.
    const xp = zaznam.spravne
      ? xpZaOdpoved(zaznam.obtiznost, Math.max(0, comboAktualni - 1))
      : 0;

    const statistiky = {
      ...progres.statistikyOtazek,
      [zaznam.otazkaId]: aktualizujStatistiku(
        progres.statistikyOtazek[zaznam.otazkaId],
        zaznam.otazkaId,
        zaznam.spravne,
        ted.toISOString(),
      ),
    };

    // Questy dne patří AKTIVNÍ bance profilu — odpověď z testu JINÉ banky je
    // plnit nesmí (přepínáním chipu, i uprostřed testu, by šlo jedním testem
    // sbírat odměny questů více bank). Bez profilu nebo bez běžícího testu
    // zůstává původní chování (žádný filtr).
    const aktivniPredmet = aktivniPredmetZeStavu(stav);
    const bankaTestu = stav.aktualniTest?.konfigurace.predmetId ?? null;
    const plnitQuesty =
      aktivniPredmet === null || bankaTestu === null || bankaTestu === aktivniPredmet;

    let questy = progres.questy;
    let kOdmene: QuestDenni[] = [];
    if (plnitQuesty) {
      const ctx = kontextQuestu(stav.banky, statistiky, aktivniPredmet);
      questy = aplikujOdpovedNaQuesty(
        zajistiQuestyDne(progres.questy, dnes, ctx, seedQuestu(stav.aktivniProfilId, aktivniPredmet)),
        zaznam,
        comboAktualni,
      );
      // XP za questy splněné touhle odpovědí — hned, ne až po dokončení testu
      // (jinak by quest splněný v nedokončeném testu o půlnoci propadl bez odměny).
      kOdmene = questy.filter((q) => q.splneno && !stav.questyOdmeneno.includes(q.id));
    }
    const xpZaQuesty = kOdmene.reduce((s, q) => s + q.odmenaXp, 0);
    const celkoveXp = xp + xpZaQuesty;

    set({
      progres: {
        ...progres,
        xp: progres.xp + celkoveXp,
        statistikyOtazek: statistiky,
        questy,
        rekordy: {
          ...progres.rekordy,
          tydenniXp: pridejTydenniXp(progres.rekordy.tydenniXp, dnes, celkoveXp),
        },
        aktualizovano: ted.toISOString(),
      },
      questyOdmeneno:
        kOdmene.length > 0
          ? [
              ...stav.questyOdmeneno.filter((id) => id.startsWith(dnes)),
              ...kOdmene.map((q) => q.id),
            ]
          : stav.questyOdmeneno,
    });
  },

  zapocitejTest: (vysledek) => {
    const ted = new Date();
    const dnes = denZData(ted);
    const stav = get();
    const progres = stav.progres;

    // Streak (den se počítá při >= 1 dokončeném testu); detekce spotřeby zmrazení.
    const streak = aktualizujStreakPoAktivite(progres.streak, dnes);
    const zmrazeniPouzito = streak.zmrazeni < progres.streak.zmrazeni;

    // Rekordy.
    const trvaniMs = new Date(vysledek.konec).getTime() - new Date(vysledek.zacatek).getTime();
    const bezchybny = vysledek.uspesnost >= 1 && vysledek.odpovedi.length > 0;
    const nejrychlejsi = progres.rekordy.nejrychlejsiBezchybnyMs;
    const rekordy = {
      ...progres.rekordy,
      nejlepsiUspesnost: Math.max(progres.rekordy.nejlepsiUspesnost, vysledek.uspesnost),
      nejdelsiCombo: Math.max(progres.rekordy.nejdelsiCombo, vysledek.nejdelsiCombo),
      nejrychlejsiBezchybnyMs:
        bezchybny && trvaniMs > 0 && (nejrychlejsi === null || trvaniMs < nejrychlejsi)
          ? trvaniMs
          : nejrychlejsi,
    };

    // Questy po testu + XP za právě splněné (dosud neodměněné) questy.
    // Questy dne patří AKTIVNÍ bance profilu — test JINÉ banky je plnit nesmí
    // (šablona `uspesnost` nemá vlastní filtr banky); bez profilu beze změny.
    const aktivniPredmet = aktivniPredmetZeStavu(stav);
    const plnitQuesty =
      aktivniPredmet === null || vysledek.konfigurace.predmetId === aktivniPredmet;
    let questy = progres.questy;
    let kOdmene: QuestDenni[] = [];
    if (plnitQuesty) {
      const ctx = kontextQuestu(stav.banky, progres.statistikyOtazek, aktivniPredmet);
      questy = aplikujTestNaQuesty(
        zajistiQuestyDne(progres.questy, dnes, ctx, seedQuestu(stav.aktivniProfilId, aktivniPredmet)),
        vysledek,
      );
      kOdmene = questy.filter((q) => q.splneno && !stav.questyOdmeneno.includes(q.id));
    }
    const xpZaQuesty = kOdmene.reduce((s, q) => s + q.odmenaXp, 0);
    const questyOdmeneno = plnitQuesty
      ? [
          ...stav.questyOdmeneno.filter((id) => id.startsWith(dnes)),
          ...kOdmene.map((q) => q.id),
        ]
      : stav.questyOdmeneno;

    // Bonusová bronzová truhla za všechny 3 splněné questy (1× denně) — jen
    // po testu aktivní banky (jinak by hlídka `datum` questů nebyla zaručená).
    const cekajiciTruhly = [...stav.cekajiciTruhly];
    let denBonusoveTruhly = stav.denBonusoveTruhly;
    if (
      plnitQuesty &&
      questy.length >= 3 &&
      questy.every((q) => q.splneno) &&
      denBonusoveTruhly !== dnes
    ) {
      cekajiciTruhly.push('bronzova');
      denBonusoveTruhly = dnes;
    }

    // Týdenní XP z testů per banka (graf ve Statistikách) — přesný průběžný
    // agregát; klíčem je týden KONCE testu.
    const predmetTestu = vysledek.konfigurace.predmetId;
    const tydenniXpTestuPodleBank =
      vysledek.ziskaneXp > 0
        ? {
            ...stav.tydenniXpTestuPodleBank,
            [predmetTestu]: pridejTydenniXp(
              stav.tydenniXpTestuPodleBank[predmetTestu] ?? {},
              denZData(new Date(vysledek.konec)),
              vysledek.ziskaneXp,
            ),
          }
        : stav.tydenniXpTestuPodleBank;

    // Truhla z testu do fronty (otevře ji stránka Výsledek, viz otevriTruhluAkce).
    if (vysledek.truhla) cekajiciTruhly.push(vysledek.truhla);

    // Mistrovské karty témat — přidávají se jen nové.
    const mistrovske = noveMistrovskeKarty(
      stav.banky,
      progres.statistikyOtazek,
      progres.sbirka.karty,
    );

    // Dokončení výzvy od táty (lokální stav; odeslání na server řeší sync).
    const vyzvy = vysledek.vyzvaId
      ? stav.vyzvy.map((v) =>
          v.id === vysledek.vyzvaId
            ? {
                ...v,
                stav: 'dokoncena' as const,
                vysledek: {
                  uspesnost: vysledek.uspesnost,
                  xp: vysledek.ziskaneXp,
                  dokonceno: ted.toISOString(),
                },
              }
            : v,
        )
      : stav.vyzvy;

    set({
      progres: {
        ...progres,
        xp: progres.xp + xpZaQuesty,
        streak,
        questy,
        sbirka:
          mistrovske.length > 0
            ? { ...progres.sbirka, karty: [...progres.sbirka.karty, ...mistrovske] }
            : progres.sbirka,
        rekordy: {
          ...rekordy,
          tydenniXp: pridejTydenniXp(progres.rekordy.tydenniXp, dnes, xpZaQuesty),
        },
        dokonceneTesty: progres.dokonceneTesty + 1,
        aktualizovano: ted.toISOString(),
      },
      cekajiciTruhly,
      denBonusoveTruhly,
      questyOdmeneno,
      vyzvy,
      novaKarty: mistrovske.length > 0 ? [...stav.novaKarty, ...mistrovske] : stav.novaKarty,
      zmrazeniPouzitoDen: zmrazeniPouzito ? dnes : stav.zmrazeniPouzitoDen,
      historieTestu: [vysledek, ...stav.historieTestu].slice(0, 10),
      tydenniXpTestuPodleBank,
    });
  },

  otevriTruhluAkce: (typ) => {
    const ted = new Date();
    const dnes = denZData(ted);
    const stav = get();
    const progres = stav.progres;

    // Bez čekající truhly daného typu ŽÁDNÁ odměna — fronta je jediný zdroj
    // pravdy (ochrana proti opakovanému otevírání po remountu Výsledku).
    const idx = stav.cekajiciTruhly.indexOf(typ);
    if (idx < 0) return null;

    const { odmena, sbirka, vlastnenaVybava } = otevriTruhlu(
      typ,
      progres.sbirka,
      KARTY_VELIKANI,
      progres.vlastnenaVybava,
      Math.random,
    );
    const cekajiciTruhly = stav.cekajiciTruhly.filter((_, i) => i !== idx);

    const xp = odmena.typ === 'xp' ? (odmena.xp ?? 0) : 0;

    // Zaklad s doplnenymi duelovymi poli (starsi snapshoty powerupy nemaji);
    // odmena typu powerup pricte kus do zasoby (spotrebovava se jen v duelu).
    const zaklad = doplnDuelovyProgres(progres);
    const powerupy = { ...(zaklad.powerupy ?? vychoziPowerupy()) };
    if (odmena.typ === 'powerup' && odmena.powerupTyp) {
      powerupy[odmena.powerupTyp] = (powerupy[odmena.powerupTyp] ?? 0) + 1;
    }

    set({
      progres: {
        ...zaklad,
        xp: progres.xp + xp,
        streak:
          odmena.typ === 'zmrazeni'
            ? { ...progres.streak, zmrazeni: progres.streak.zmrazeni + 1 }
            : progres.streak,
        sbirka,
        vlastnenaVybava,
        powerupy,
        rekordy: {
          ...progres.rekordy,
          tydenniXp: pridejTydenniXp(progres.rekordy.tydenniXp, dnes, xp),
        },
        aktualizovano: ted.toISOString(),
      },
      cekajiciTruhly,
      novaKarty:
        odmena.typ === 'karta' && odmena.kartaId
          ? [...stav.novaKarty, odmena.kartaId]
          : stav.novaKarty,
    });

    // Push snapshotu progresu (odmena z truhly meni XP/sbirku/vybavu) — at je
    // server cerstvy pro pull postupu na druhem zarizeni. Tiche, offline-first.
    void import('../sync/sync')
      .then((m) => m.zaznamenejZmenuProgresu())
      .catch(() => {});

    return odmena;
  },

  prijmiVyzvy: (prichozi) => {
    const stav = get();
    // Server posílá výzvy != dokoncena; lokálně dokončené nezahazovat ani nevracet zpět.
    const lokalne = new Map(stav.vyzvy.map((v) => [v.id, v]));
    const sloucene = prichozi.map((v) => {
      const moje = lokalne.get(v.id);
      return moje && moje.stav === 'dokoncena' ? moje : v;
    });
    const prichoziId = new Set(prichozi.map((v) => v.id));
    const jenLokalniDokoncene = stav.vyzvy.filter(
      (v) => v.stav === 'dokoncena' && !prichoziId.has(v.id),
    );
    set({ vyzvy: [...sloucene, ...jenLokalniDokoncene] });
  },

  resetujProgres: () => {
    set({
      progres: vychoziProgres(new Date().toISOString()),
      cekajiciTruhly: [],
      vyzvy: [],
      novaKarty: [],
      questyOdmeneno: [],
      denBonusoveTruhly: null,
      zmrazeniPouzitoDen: null,
      historieTestu: [],
      questyPodleBank: {},
      tydenniXpTestuPodleBank: {},
      duely: [],
      otevreneDuely: [],
      aktualniDuel: null,
      duelyZapocitane: [],
      noveTituly: [],
      // Postup lekci (vyukaSlice) je soucast progresu studenta — obsah
      // (vyuky, banky) naopak zustava.
      postupLekci: {},
    });
  },

  obnovDenniQuesty: () => {
    const dnes = denZData(new Date());
    const stav = get();
    const progres = stav.progres;
    if (progres.questy.length > 0 && progres.questy[0].datum === dnes) return;
    const aktivniPredmet = aktivniPredmetZeStavu(stav);
    const ctx = kontextQuestu(stav.banky, progres.statistikyOtazek, aktivniPredmet);
    set({
      progres: {
        ...progres,
        questy: vygenerujDenniQuesty(dnes, ctx, seedQuestu(stav.aktivniProfilId, aktivniPredmet)),
      },
      questyOdmeneno: stav.questyOdmeneno.filter((id) => id.startsWith(dnes)),
    });
  },

  zmenAvatara: (konfigurace) => {
    const progres = get().progres;
    // Invariant: nasazena vybava ⊆ vlastnena. Polozky, ktere hrac nevlastni
    // (napr. navrh editoru prezivsi reset progresu), se pri zapisu odfiltruji —
    // tohle je jedine misto zapisu konfigurace avataru, takze invariant plati vsude.
    const vybava: AvatarKonfigurace['vybava'] = {};
    for (const [slot, id] of Object.entries(konfigurace.vybava ?? {})) {
      if (id !== undefined && progres.vlastnenaVybava.includes(id)) {
        vybava[slot as keyof AvatarKonfigurace['vybava']] = id;
      }
    }
    const ted = new Date().toISOString();
    const stav = get();
    set({
      progres: {
        ...progres,
        avatar: { ...konfigurace, vybava },
        aktualizovano: ted,
      },
      // Avatar je soucast zaznamu profilu v serverovem registru — zmena
      // bumpne aktualizovano profilu (LWW) a naplanuje PUT pres frontu.
      profily: stav.profily.map((p) =>
        p.id === stav.aktivniProfilId ? { ...p, aktualizovano: ted } : p,
      ),
    });
    if (stav.aktivniProfilId) {
      const aktivniId = stav.aktivniProfilId;
      void import('../sync/sync')
        .then((m) => m.zaznamenejZmenuProfilu(aktivniId))
        .catch(() => {});
    }
  },

  oznacKartyZaVidene: () => {
    if (get().novaKarty.length > 0) set({ novaKarty: [] });
  },

  // -------------------------------------------------------------------------
  // Duely

  prijmiDuely: (moje, otevrene) => {
    const stav = get();
    const profilId = stav.aktivniProfilId;
    if (!profilId) return;
    const sloucene = sloucDuely(moje, stav.duely, profilId);

    // Trofeje se zapocitavaji jen za dokonceni, ktere tohle zarizeni „vidi"
    // (duel lokalne znamy jako nedokonceny je ted dokonceny). Duel dokonceny
    // uz pri PRVNIM stazeni se jen oznaci za zapocitany — jeho trofeje uz
    // pripocitalo zarizeni, ktere ho dohralo, a sem dorazi LWW syncem progresu
    // (jinak by cerstva instalace pripocitala celou historii podruhe).
    const driveNedokoncene = new Set(
      stav.duely.filter((d) => !jeDokoncenyDuel(d)).map((d) => d.id),
    );
    const kZapocteni: Duel[] = [];
    const jenOznacit: string[] = [];
    for (const duel of sloucene) {
      if (!jeDokoncenyDuel(duel) || stav.duelyZapocitane.includes(duel.id)) continue;
      if (driveNedokoncene.has(duel.id)) kZapocteni.push(duel);
      else jenOznacit.push(duel.id);
    }

    const zakladProgres = doplnDuelovyProgres(stav.progres);
    const { trofeje, zapocitane, noveTituly } = zapoctiTrofejeZDuelu(
      zakladProgres.trofeje!,
      kZapocteni,
      profilId,
      stav.banky,
    );

    set({
      duely: sloucene,
      otevreneDuely: otevrene.filter((d) => d.vyzyvatel.profilId !== profilId && !d.souper),
      duelyZapocitane: orizniZapocitane([
        ...stav.duelyZapocitane,
        ...zapocitane,
        ...jenOznacit,
      ]),
      ...(zapocitane.length > 0
        ? {
            progres: { ...zakladProgres, trofeje, aktualizovano: new Date().toISOString() },
            noveTituly: [...stav.noveTituly, ...noveTituly],
          }
        : {}),
    });
  },

  pridejDuel: (duel) => {
    const stav = get();
    const bezNej = stav.duely.filter((d) => d.id !== duel.id);
    set({
      duely: [duel, ...bezNej],
      otevreneDuely: stav.otevreneDuely.filter((d) => d.id !== duel.id),
    });
  },

  zacniDuelAkce: (duelId) => {
    const stav = get();
    const profilId = stav.aktivniProfilId;
    if (!profilId) return false;
    // Rozehrany prubeh tehoz duelu pokracuje (reload cas nevraci).
    if (stav.aktualniDuel?.duelId === duelId && !stav.aktualniDuel.dokonceno) return true;
    const duel = stav.duely.find((d) => d.id === duelId);
    if (!duel || jeDokoncenyDuel(duel) || !jeUcastnikDuelu(duel, profilId)) return false;
    // Lina expirace i lokalne: po vyprsi duel hrat nejde (kontumace, server
    // by vysledek stejne odmitl 409) — offline hrani po terminu nesmi projit.
    if (duel.vyprsi <= new Date().toISOString()) return false;
    if (!duel.souper || duel.vysledky[profilId]) return false;
    // Vsechny otazky duelu musi znat lokalni banka (jinak pockat na sync).
    if (!otazkyDuelu(duel, stav.banky[duel.predmetId])) return false;
    set({ aktualniDuel: vytvorDuelPrubeh(duel, profilId, new Date().toISOString()) });
    return true;
  },

  odstartujDuelAkce: () => {
    const prubeh = get().aktualniDuel;
    if (!prubeh || prubeh.zahajeno) return;
    set({ aktualniDuel: odstartujPrubeh(prubeh, Date.now()) });
  },

  odpovezVDueluAkce: (hodnota, casMs) => {
    const stav = get();
    const prubeh = stav.aktualniDuel;
    if (!prubeh || !prubeh.zahajeno || prubeh.dokonceno) return;
    const duel = stav.duely.find((d) => d.id === prubeh.duelId);
    const otazky = duel ? otazkyDuelu(duel, stav.banky[duel.predmetId]) : null;
    const otazka = otazky?.[prubeh.index];
    if (!duel || !otazka) return;

    const ted = new Date();
    const novyPrubeh =
      hodnota === null
        ? timeoutVPrubehu(prubeh, otazka, ted.getTime())
        : odpovezVPrubehu(prubeh, otazka, vyhodnotOdpoved(otazka, hodnota), casMs, ted.getTime());

    if (!novyPrubeh.dokonceno) {
      set({ aktualniDuel: novyPrubeh });
      return;
    }

    // Duel mezitim VYPRSEL (hrani zacalo pred terminem, dokoncilo se po nem —
    // typicky offline): muj pozdni vysledek uz neplati (server by ho odmitl
    // 409 a frontovou polozku zahodil), takze se NEodesila ani lokalne
    // nezapisuje. Misto toho probehne stejna kontumace jako na serveru — BEZ
    // meho vysledku — a trofeje se zapocitaji z ni (vcasna vyhra soupere je
    // platna rivalita; bez jedine odpovedi se nepocita nic).
    const tedIso = ted.toISOString();
    if (duel.vyprsi <= tedIso) {
      const vyprsely = expirujDuel(duel, tedIso);
      const zakladPoVyprseni = doplnDuelovyProgres(stav.progres);
      const zapocistPoVyprseni =
        jeDokoncenyDuel(vyprsely) && !stav.duelyZapocitane.includes(vyprsely.id);
      const poVyprseni = zapocistPoVyprseni
        ? zapoctiTrofejeZDuelu(zakladPoVyprseni.trofeje!, [vyprsely], prubeh.profilId, stav.banky)
        : { trofeje: zakladPoVyprseni.trofeje!, zapocitane: [], noveTituly: [] };
      set({
        aktualniDuel: null,
        duely: stav.duely.map((d) => (d.id === vyprsely.id ? vyprsely : d)),
        ...(poVyprseni.zapocitane.length > 0
          ? {
              progres: {
                ...zakladPoVyprseni,
                trofeje: poVyprseni.trofeje,
                aktualizovano: tedIso,
              },
              duelyZapocitane: orizniZapocitane([
                ...stav.duelyZapocitane,
                ...poVyprseni.zapocitane,
              ]),
              noveTituly: [...stav.noveTituly, ...poVyprseni.noveTituly],
            }
          : {}),
      });
      return;
    }

    // Moje pulka je dohrana: vysledek do duelu, pripadne lokalni vyhodnoceni
    // (souper uz hral) vcetne trofeji, a odeslani pres offline frontu.
    const vysledek = vysledekZPrubehu(novyPrubeh, ted.toISOString());
    const vysledky = { ...duel.vysledky, [prubeh.profilId]: vysledek };
    let novyDuel: Duel = {
      ...duel,
      // Vysledek cileneho soupere je zaroven prijeti vyzvy (kontrakt serveru).
      stav:
        duel.stav === 'cekajici' && duel.souper?.profilId === prubeh.profilId
          ? 'prijaty'
          : duel.stav,
      vysledky,
    };
    if (novyDuel.souper && vysledky[novyDuel.vyzyvatel.profilId] && vysledky[novyDuel.souper.profilId]) {
      novyDuel = { ...novyDuel, stav: 'hotovy', vitezProfilId: vyhodnotDuel(novyDuel) };
    }

    const zakladProgres = doplnDuelovyProgres(stav.progres);
    const dokoncen = jeDokoncenyDuel(novyDuel) && !stav.duelyZapocitane.includes(novyDuel.id);
    const { trofeje, zapocitane, noveTituly } = dokoncen
      ? zapoctiTrofejeZDuelu(zakladProgres.trofeje!, [novyDuel], prubeh.profilId, stav.banky)
      : { trofeje: zakladProgres.trofeje!, zapocitane: [], noveTituly: [] };

    set({
      aktualniDuel: null,
      duely: stav.duely.map((d) => (d.id === novyDuel.id ? novyDuel : d)),
      ...(zapocitane.length > 0
        ? {
            progres: { ...zakladProgres, trofeje, aktualizovano: ted.toISOString() },
            duelyZapocitane: orizniZapocitane([...stav.duelyZapocitane, ...zapocitane]),
            noveTituly: [...stav.noveTituly, ...noveTituly],
          }
        : {}),
    });

    // Push vysledku pres offline frontu (typ 'duel-vysledek') — dynamicky
    // import brani cyklu zavislosti, selhani site je tiche (offline-first).
    void import('../sync/sync')
      .then((m) => m.zaznamenejVysledekDuelu(novyDuel.id, vysledek))
      .catch(() => {});
  },

  pouzijPowerupAkce: (typ, nahoda = Math.random) => {
    const stav = get();
    const prubeh = stav.aktualniDuel;
    if (!prubeh || prubeh.dokonceno) return false;
    const zakladProgres = doplnDuelovyProgres(stav.progres);
    const zasoba = zakladProgres.powerupy?.[typ] ?? 0;
    if (zasoba <= 0) return false;
    const duel = stav.duely.find((d) => d.id === prubeh.duelId);
    const otazka = duel
      ? (otazkyDuelu(duel, stav.banky[duel.predmetId])?.[prubeh.index] ?? null)
      : null;
    if (!otazka) return false;
    const novyPrubeh = pouzijPowerupVPrubehu(prubeh, typ, otazka, nahoda);
    if (!novyPrubeh) return false;
    set({
      aktualniDuel: novyPrubeh,
      progres: {
        ...zakladProgres,
        powerupy: { ...zakladProgres.powerupy!, [typ]: zasoba - 1 },
        aktualizovano: new Date().toISOString(),
      },
    });
    return true;
  },

  oznacTitulyZaVidene: () => {
    if (get().noveTituly.length > 0) set({ noveTituly: [] });
  },
});
