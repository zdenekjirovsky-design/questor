// Látka ke zpracování — fronta podkladů od studenta (fotky zápisků,
// dokumenty) pro zpracovatele na Macu správce (docs/ZPRACOVANI-LATKY.md).
// Soubory leží na disku serveru MIMO web (`<slozka>/<id>/<NN>.<ext>`),
// záznam v tabulce `materialy`. Posílat smí jen profily z povoleného
// seznamu (nastavuje správce v přehledu rodiny). Kvůli „vrátit" drží
// server historii verzí bank a výuk (`obsah_historie`).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Hono, MiddlewareHandler } from 'hono';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import {
  LIMITY_MATERIALU,
  POVOLENE_TYPY_MATERIALU,
  type FrontaMaterialu,
  type Material,
  type MojeMaterialy,
  type SouborMaterialu,
} from '@questor/sdilene';

export type TypObsahu = 'banky' | 'vyuka';

/** Pevné mapování typu obsahu na tabulku — do SQL se nikdy nevkládá vstup. */
const TABULKA: Record<TypObsahu, string> = { banky: 'banky', vyuka: 'vyuka' };

/** Uloží verzi banky/výuky do historie (idempotentní) — podklad pro „vrátit". */
export function zaznamenejVerziObsahu(
  db: DatabaseSync,
  typ: TypObsahu,
  predmetId: string,
  verze: number,
  json: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO obsah_historie (typ, predmet_id, verze, json, ulozeno)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(typ, predmetId, verze, json, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Soubory

const PRIPONA_NA_TYP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
};

/** Typ souboru z deklarace prohlížeče, jinak z přípony (.md/.docx často přijdou bez typu). */
export function urciTypSouboru(nazev: string, deklarovany: string): string | null {
  const typ = deklarovany.split(';')[0].trim().toLowerCase();
  if (POVOLENE_TYPY_MATERIALU[typ]) return typ;
  const pripona = /\.([a-z0-9]{1,5})$/i.exec(nazev)?.[1]?.toLowerCase() ?? '';
  return PRIPONA_NA_TYP[pripona] ?? null;
}

/** Obsah musí odpovídat typu (magická čísla) — přípona ani deklarace nestačí. */
export function obsahOdpovidaTypu(typ: string, data: Uint8Array): boolean {
  const zacina = (...bajty: number[]) => bajty.every((b, i) => data[i] === b);
  switch (typ) {
    case 'image/jpeg':
      return zacina(0xff, 0xd8, 0xff);
    case 'image/png':
      return zacina(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case 'image/webp':
      return zacina(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.slice(8, 12)) === 'WEBP';
    case 'application/pdf':
      return String.fromCharCode(...data.slice(0, 5)) === '%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return zacina(0x50, 0x4b, 0x03, 0x04);
    case 'text/plain':
    case 'text/markdown':
      return data.length <= 2 * 1024 * 1024 && !data.includes(0);
    default:
      return false;
  }
}

function cistyNazev(nazev: string): string {
  const posledni = nazev.split(/[\\/]/).pop() ?? '';
  const cisty = posledni.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '').trim();
  return (cisty || 'soubor').slice(0, 100);
}

const ID_VZOR = /^[A-Za-z0-9-]{1,64}$/;

// ---------------------------------------------------------------------------
// Schémata

const zmenaSchema = z.object({
  stav: z.enum(['ceka', 'zpracovava', 'hotovo', 'chyba', 'vraceno']).optional(),
  zprava: z.string().max(1000).optional(),
  vysledek: z
    .object({
      temata: z
        .array(
          z.object({
            predmetId: z.string().min(1).max(64),
            temaId: z.string().min(1).max(128),
            nazev: z.string().min(1).max(200),
          }),
        )
        .max(50),
      publikace: z
        .array(
          z.object({
            typ: z.enum(['banky', 'vyuka']),
            predmetId: z.string().min(1).max(64),
            zVerze: z.number().int().min(0).nullable(),
            naVerzi: z.number().int().min(1),
          }),
        )
        .max(50),
    })
    .optional(),
});

const povoleniSchema = z.object({
  povoleneProfily: z.array(z.string().min(1).max(64)).max(50),
});

// ---------------------------------------------------------------------------

export interface MoznostiMaterialu {
  student: MiddlewareHandler;
  admin: MiddlewareHandler;
  /** Limit těla pro nahrání (multipart s fotkami). */
  limitNahrani: MiddlewareHandler;
  limitBezny: MiddlewareHandler;
  /** Složka pro soubory; null = posílání látky na serveru vypnuté (503). */
  slozka: string | null;
  ted?: () => Date;
}

export function registrujMaterialy(app: Hono, db: DatabaseSync, m: MoznostiMaterialu): void {
  const ted = m.ted ?? (() => new Date());
  const VYPNUTO = { chyba: 'Posílání látky není na serveru zapnuté' };

  const povoleneProfily = (): string[] => {
    const radek = db.prepare("SELECT json FROM nastaveni WHERE klic = 'nahravani'").get() as
      | { json: string }
      | undefined;
    if (!radek) return [];
    const data = JSON.parse(radek.json) as { povoleneProfily?: unknown };
    return Array.isArray(data.povoleneProfily)
      ? data.povoleneProfily.filter((p): p is string => typeof p === 'string')
      : [];
  };

  const nacti = (id: string): Material | null => {
    const radek = db.prepare('SELECT json FROM materialy WHERE id = ?').get(id) as
      | { json: string }
      | undefined;
    return radek ? (JSON.parse(radek.json) as Material) : null;
  };

  const uloz = (material: Material): void => {
    db.prepare(
      `INSERT INTO materialy (id, json, stav, vytvoreno) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET json = excluded.json, stav = excluded.stav`,
    ).run(material.id, JSON.stringify(material), material.stav, material.vytvoreno);
  };

  // --- Studentská strana ----------------------------------------------------

  app.get('/api/materialy', m.student, (c) => {
    const profilId = c.req.query('profilId') ?? '';
    const odpoved: MojeMaterialy = { smiNahravat: false, materialy: [] };
    if (!m.slozka || !ID_VZOR.test(profilId)) return c.json(odpoved);
    odpoved.smiNahravat = povoleneProfily().includes(profilId);
    odpoved.materialy = (
      db
        .prepare(
          `SELECT json FROM materialy WHERE json_extract(json, '$.profilId') = ?
           ORDER BY vytvoreno DESC LIMIT 30`,
        )
        .all(profilId) as { json: string }[]
    ).map((r) => JSON.parse(r.json) as Material);
    return c.json(odpoved);
  });

  app.post('/api/materialy', m.student, m.limitNahrani, async (c) => {
    if (!m.slozka) return c.json(VYPNUTO, 503);
    let telo: Record<string, string | File | (string | File)[]>;
    try {
      telo = await c.req.parseBody({ all: true });
    } catch {
      return c.json({ chyba: 'Tělo musí být multipart/form-data se soubory' }, 400);
    }
    const text = (klic: string) => (typeof telo[klic] === 'string' ? (telo[klic] as string).trim() : '');
    const profilId = text('profilId');
    const profilJmeno = text('profilJmeno').slice(0, 64) || 'Student';
    const predmetId = text('predmetId');
    const poznamka = text('poznamka');
    if (!ID_VZOR.test(profilId)) return c.json({ chyba: 'Chybí profil' }, 400);
    if (!povoleneProfily().includes(profilId)) {
      return c.json({ chyba: 'Posílat látku smí jen profil, kterému to povolil správce' }, 403);
    }
    if (predmetId && !ID_VZOR.test(predmetId)) return c.json({ chyba: 'Neplatný předmět' }, 400);
    if (poznamka.length > LIMITY_MATERIALU.maxPoznamka) {
      return c.json({ chyba: `Poznámka může mít nejvýš ${LIMITY_MATERIALU.maxPoznamka} znaků` }, 400);
    }

    const surove = telo.soubory;
    const soubory = (Array.isArray(surove) ? surove : surove ? [surove] : []).filter(
      (s): s is File => typeof s !== 'string',
    );
    if (soubory.length === 0) return c.json({ chyba: 'Přidej aspoň jeden soubor' }, 400);
    if (soubory.length > LIMITY_MATERIALU.maxSouboru) {
      return c.json({ chyba: `Najednou jde poslat nejvýš ${LIMITY_MATERIALU.maxSouboru} souborů` }, 400);
    }
    const celkem = soubory.reduce((s, f) => s + f.size, 0);
    if (celkem > LIMITY_MATERIALU.maxCelkem) {
      return c.json({ chyba: 'Soubory jsou dohromady moc velké (max 45 MB)' }, 413);
    }

    const denZpet = new Date(ted().getTime() - 24 * 3600_000).toISOString();
    const zaDen = db
      .prepare(
        `SELECT COUNT(*) AS pocet FROM materialy
         WHERE json_extract(json, '$.profilId') = ? AND vytvoreno > ?`,
      )
      .get(profilId, denZpet) as { pocet: number };
    if (zaDen.pocet >= LIMITY_MATERIALU.maxZaDen) {
      return c.json({ chyba: 'Za dnešek už bylo posláno dost látky — zkus to zítra' }, 429);
    }

    const pripravene: { meta: SouborMaterialu; data: Uint8Array }[] = [];
    for (const [i, soubor] of soubory.entries()) {
      const typ = urciTypSouboru(soubor.name, soubor.type);
      if (!typ) {
        return c.json({ chyba: `Soubor „${cistyNazev(soubor.name)}" má nepodporovaný typ` }, 400);
      }
      if (soubor.size > LIMITY_MATERIALU.maxVelikostSouboru) {
        return c.json({ chyba: `Soubor „${cistyNazev(soubor.name)}" je větší než 12 MB` }, 413);
      }
      const data = new Uint8Array(await soubor.arrayBuffer());
      if (!obsahOdpovidaTypu(typ, data)) {
        return c.json({ chyba: `Soubor „${cistyNazev(soubor.name)}" neodpovídá svému typu` }, 400);
      }
      pripravene.push({
        meta: {
          soubor: `${String(i + 1).padStart(2, '0')}.${POVOLENE_TYPY_MATERIALU[typ]}`,
          nazev: cistyNazev(soubor.name),
          typ,
          velikost: data.length,
        },
        data,
      });
    }

    const id = randomUUID();
    const slozka = join(m.slozka, id);
    mkdirSync(slozka, { recursive: true });
    for (const p of pripravene) writeFileSync(join(slozka, p.meta.soubor), p.data);
    const cas = ted().toISOString();
    const material: Material = {
      id,
      profilId,
      profilJmeno,
      predmetId: predmetId || null,
      poznamka,
      soubory: pripravene.map((p) => p.meta),
      stav: 'ceka',
      vytvoreno: cas,
      aktualizovano: cas,
    };
    uloz(material);
    return c.json(material);
  });

  // --- Správce a zpracovatel -----------------------------------------------

  app.get('/api/admin/materialy', m.admin, (c) => {
    const odpoved: FrontaMaterialu = {
      povoleneProfily: povoleneProfily(),
      materialy: (
        db.prepare('SELECT json FROM materialy ORDER BY vytvoreno DESC LIMIT 100').all() as {
          json: string;
        }[]
      ).map((r) => JSON.parse(r.json) as Material),
    };
    return c.json(odpoved);
  });

  app.put('/api/admin/materialy/povoleni', m.admin, m.limitBezny, async (c) => {
    let telo: unknown;
    try {
      telo = await c.req.json();
    } catch {
      telo = undefined;
    }
    const v = povoleniSchema.safeParse(telo);
    if (!v.success) return c.json({ chyba: 'Tělo musí být { povoleneProfily: string[] }' }, 400);
    const povolene = [...new Set(v.data.povoleneProfily)];
    db.prepare(
      `INSERT INTO nastaveni (klic, json) VALUES ('nahravani', ?)
       ON CONFLICT(klic) DO UPDATE SET json = excluded.json`,
    ).run(JSON.stringify({ povoleneProfily: povolene }));
    return c.json({ ok: true, povoleneProfily: povolene });
  });

  app.get('/api/admin/materialy/:id/soubory/:soubor', m.admin, (c) => {
    if (!m.slozka) return c.json(VYPNUTO, 503);
    const material = nacti(c.req.param('id') ?? '');
    const meta = material?.soubory.find((s) => s.soubor === c.req.param('soubor'));
    if (!material || !meta) return c.json({ chyba: 'Soubor není' }, 404);
    const cesta = join(m.slozka, material.id, meta.soubor);
    if (!existsSync(cesta)) return c.json({ chyba: 'Soubor na disku chybí' }, 404);
    return new Response(readFileSync(cesta), {
      headers: {
        'content-type': meta.typ,
        'content-disposition': `attachment; filename="${meta.soubor}"`,
        'x-content-type-options': 'nosniff',
        'cache-control': 'no-store',
      },
    });
  });

  app.patch('/api/admin/materialy/:id', m.admin, m.limitBezny, async (c) => {
    const material = nacti(c.req.param('id') ?? '');
    if (!material) return c.json({ chyba: 'Látka nenalezena' }, 404);
    let telo: unknown;
    try {
      telo = await c.req.json();
    } catch {
      telo = undefined;
    }
    const v = zmenaSchema.safeParse(telo);
    if (!v.success) return c.json({ chyba: 'Neplatná změna stavu' }, 400);
    const zmeneny: Material = {
      ...material,
      ...(v.data.stav ? { stav: v.data.stav } : {}),
      ...(v.data.zprava !== undefined ? { zprava: v.data.zprava } : {}),
      ...(v.data.vysledek ? { vysledek: v.data.vysledek } : {}),
      aktualizovano: ted().toISOString(),
    };
    uloz(zmeneny);
    return c.json(zmeneny);
  });

  app.delete('/api/admin/materialy/:id', m.admin, (c) => {
    const id = c.req.param('id') ?? '';
    if (!ID_VZOR.test(id)) return c.json({ chyba: 'Neplatné id' }, 400);
    db.prepare('DELETE FROM materialy WHERE id = ?').run(id);
    if (m.slozka) rmSync(join(m.slozka, id), { recursive: true, force: true });
    return c.json({ ok: true });
  });

  // Vrácení zveřejněné změny: předchozí verze z historie se zveřejní jako NOVÁ
  // (vyšší číslo verze), aby si ji aplikace stáhly — ty berou jen vyšší verze.
  app.post('/api/admin/materialy/:id/vratit', m.admin, (c) => {
    const material = nacti(c.req.param('id') ?? '');
    if (!material) return c.json({ chyba: 'Látka nenalezena' }, 404);
    const publikace = material.vysledek?.publikace ?? [];
    if (material.stav !== 'hotovo' || publikace.length === 0) {
      return c.json({ chyba: 'Vrátit jde jen hotové zpracování se zveřejněnou změnou' }, 409);
    }
    const vratit = publikace.filter((p) => p.zVerze !== null);
    if (vratit.length === 0) {
      return c.json({ chyba: 'Nový předmět se automaticky vrátit nedá — řekni o to Claudovi' }, 409);
    }
    // Předběžná kontrola všeho, pak zápis v transakci (všechno, nebo nic).
    const plan: { typ: TypObsahu; predmetId: string; novaVerze: number; json: string }[] = [];
    for (const p of vratit) {
      const tabulka = TABULKA[p.typ];
      const aktualni = db
        .prepare(`SELECT verze FROM ${tabulka} WHERE predmet_id = ?`)
        .get(p.predmetId) as { verze: number } | undefined;
      if (!aktualni || aktualni.verze !== p.naVerzi) {
        return c.json(
          { chyba: 'Po této změně přibylo další zpracování — vrať nejdřív to novější' },
          409,
        );
      }
      const stara = db
        .prepare('SELECT json FROM obsah_historie WHERE typ = ? AND predmet_id = ? AND verze = ?')
        .get(p.typ, p.predmetId, p.zVerze) as { json: string } | undefined;
      if (!stara) return c.json({ chyba: 'Předchozí verze v historii serveru chybí' }, 409);
      const obsah = JSON.parse(stara.json) as { verze: number };
      obsah.verze = aktualni.verze + 1;
      plan.push({ typ: p.typ, predmetId: p.predmetId, novaVerze: obsah.verze, json: JSON.stringify(obsah) });
    }
    db.exec('BEGIN');
    try {
      for (const krok of plan) {
        db.prepare(`UPDATE ${TABULKA[krok.typ]} SET verze = ?, json = ? WHERE predmet_id = ?`).run(
          krok.novaVerze,
          krok.json,
          krok.predmetId,
        );
        zaznamenejVerziObsahu(db, krok.typ, krok.predmetId, krok.novaVerze, krok.json);
      }
      uloz({
        ...material,
        stav: 'vraceno',
        zprava: 'Správce změnu vrátil do předchozí verze.',
        aktualizovano: ted().toISOString(),
      });
      db.exec('COMMIT');
    } catch (chyba) {
      db.exec('ROLLBACK');
      throw chyba;
    }
    return c.json(nacti(material.id));
  });
}
