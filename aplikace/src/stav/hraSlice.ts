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
  Odmena,
  OdpovedZaznam,
  ProgresStudenta,
  QuestDenni,
  StatistikaOtazky,
  TestVysledek,
  TruhlaTyp,
  Vyzva,
} from '@questor/sdilene';
import {
  aktualizujStatistiku,
  aktualizujStreakPoAktivite,
  aplikujOdpovedNaQuesty,
  aplikujTestNaQuesty,
  denZData,
  idMistrovskeKarty,
  KARTY_VELIKANI,
  otevriTruhlu,
  pondeliTydne,
  vychoziProgres,
  vygenerujDenniQuesty,
  xpZaOdpoved,
  type KontextQuestu,
  type StupenMistrovstvi,
} from '@questor/sdilene';
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

function kontextQuestu(
  banky: Record<string, BankaOtazek>,
  statistiky: Record<string, StatistikaOtazky>,
): KontextQuestu {
  const videna = new Set<string>();
  const temata = Object.values(banky)
    .flatMap((b) => b.temata)
    .filter((t) => (videna.has(t.id) ? false : (videna.add(t.id), true)))
    .sort((a, b) => a.poradi - b.poradi);
  return { temata, nejslabsiTemaId: nejslabsiTema(banky, statistiky) };
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

    const ctx = kontextQuestu(stav.banky, statistiky);
    const questy = aplikujOdpovedNaQuesty(
      zajistiQuestyDne(progres.questy, dnes, ctx, stav.aktivniProfilId),
      zaznam,
      comboAktualni,
    );

    // XP za questy splněné touhle odpovědí — hned, ne až po dokončení testu
    // (jinak by quest splněný v nedokončeném testu o půlnoci propadl bez odměny).
    const kOdmene = questy.filter((q) => q.splneno && !stav.questyOdmeneno.includes(q.id));
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
    const ctx = kontextQuestu(stav.banky, progres.statistikyOtazek);
    const questy = aplikujTestNaQuesty(
      zajistiQuestyDne(progres.questy, dnes, ctx, stav.aktivniProfilId),
      vysledek,
    );
    const kOdmene = questy.filter((q) => q.splneno && !stav.questyOdmeneno.includes(q.id));
    const xpZaQuesty = kOdmene.reduce((s, q) => s + q.odmenaXp, 0);
    const questyOdmeneno = [
      ...stav.questyOdmeneno.filter((id) => id.startsWith(dnes)),
      ...kOdmene.map((q) => q.id),
    ];

    // Bonusová bronzová truhla za všechny 3 splněné questy (1× denně).
    const cekajiciTruhly = [...stav.cekajiciTruhly];
    let denBonusoveTruhly = stav.denBonusoveTruhly;
    if (questy.length >= 3 && questy.every((q) => q.splneno) && denBonusoveTruhly !== dnes) {
      cekajiciTruhly.push('bronzova');
      denBonusoveTruhly = dnes;
    }

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

    set({
      progres: {
        ...progres,
        xp: progres.xp + xp,
        streak:
          odmena.typ === 'zmrazeni'
            ? { ...progres.streak, zmrazeni: progres.streak.zmrazeni + 1 }
            : progres.streak,
        sbirka,
        vlastnenaVybava,
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
    const ctx = kontextQuestu(stav.banky, progres.statistikyOtazek);
    set({
      progres: {
        ...progres,
        questy: vygenerujDenniQuesty(dnes, ctx, stav.aktivniProfilId ?? undefined),
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
    set({
      progres: {
        ...progres,
        avatar: { ...konfigurace, vybava },
        aktualizovano: new Date().toISOString(),
      },
    });
  },

  oznacKartyZaVidene: () => {
    if (get().novaKarty.length > 0) set({ novaKarty: [] });
  },
});
