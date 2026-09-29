// Testy fronty látky ke zpracování (server/src/materialy.ts): povolení jen
// vybraných profilů, kontrola typů podle obsahu, stav zpracování, stažení
// souborů správcem, denní limit a vrácení zveřejněné změny z historie verzí.

import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { BankaOtazek, FrontaMaterialu, Material, MojeMaterialy } from '@questor/sdilene';
import { vytvorApp } from '../src/app';
import { otevriDb } from '../src/db';

const ADMIN = { 'x-questor-token': 'admin-dev' };
const STUDENT = { 'x-questor-token': 'student-dev' };
const JSON_HLAVICKY = { 'content-type': 'application/json' };
const MATEJ = 'matej-1';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PDF = new TextEncoder().encode('%PDF-1.7 obsah');

let slozka: string;
let app: Hono;

function formular(
  soubory: { nazev: string; typ: string; data: Uint8Array }[],
  pole: Record<string, string> = {},
): FormData {
  const f = new FormData();
  f.set('profilId', pole.profilId ?? MATEJ);
  f.set('profilJmeno', pole.profilJmeno ?? 'Matěj');
  if (pole.predmetId !== undefined) f.set('predmetId', pole.predmetId);
  if (pole.poznamka !== undefined) f.set('poznamka', pole.poznamka);
  for (const s of soubory) f.append('soubory', new File([s.data], s.nazev, { type: s.typ }));
  return f;
}

async function posli(f: FormData) {
  return app.request('/api/materialy', { method: 'POST', headers: STUDENT, body: f });
}

async function povol(profily: string[]) {
  return app.request('/api/admin/materialy/povoleni', {
    method: 'PUT',
    headers: { ...ADMIN, ...JSON_HLAVICKY },
    body: JSON.stringify({ povoleneProfily: profily }),
  });
}

beforeEach(() => {
  slozka = mkdtempSync(join(tmpdir(), 'questor-materialy-'));
  app = vytvorApp(otevriDb(':memory:'), { slozkaMaterialu: slozka });
});

afterEach(() => {
  rmSync(slozka, { recursive: true, force: true });
});

describe('posílání látky studentem', () => {
  it('nepovolený profil nepošle nic (403) a vidí smiNahravat: false', async () => {
    const odpoved = await posli(formular([{ nazev: 'sesit.jpg', typ: 'image/jpeg', data: JPEG }]));
    expect(odpoved.status).toBe(403);
    const moje = (await (await app.request(`/api/materialy?profilId=${MATEJ}`, { headers: STUDENT })).json()) as MojeMaterialy;
    expect(moje).toEqual({ smiNahravat: false, materialy: [] });
  });

  it('povolený profil pošle fotky a dokument — uloží se mimo web a čekají na zpracování', async () => {
    expect((await povol([MATEJ])).status).toBe(200);
    const odpoved = await posli(
      formular(
        [
          { nazev: 'strana 1.jpg', typ: 'image/jpeg', data: JPEG },
          { nazev: 'poznamky.md', typ: '', data: new TextEncoder().encode('# Škody na zboží') },
        ],
        { predmetId: 'zbozinalstvi', poznamka: 'V pátek píšeme' },
      ),
    );
    expect(odpoved.status).toBe(200);
    const material = (await odpoved.json()) as Material;
    expect(material).toMatchObject({ profilId: MATEJ, predmetId: 'zbozinalstvi', stav: 'ceka', poznamka: 'V pátek píšeme' });
    expect(material.soubory.map((s) => [s.soubor, s.nazev, s.typ])).toEqual([
      ['01.jpg', 'strana 1.jpg', 'image/jpeg'],
      ['02.md', 'poznamky.md', 'text/markdown'],
    ]);
    expect(readdirSync(join(slozka, material.id)).sort()).toEqual(['01.jpg', '02.md']);

    const moje = (await (await app.request(`/api/materialy?profilId=${MATEJ}`, { headers: STUDENT })).json()) as MojeMaterialy;
    expect(moje.smiNahravat).toBe(true);
    expect(moje.materialy.map((m) => m.id)).toEqual([material.id]);
  });

  it('podvržený typ (PDF vydávané za JPEG) i nepodporovaný soubor odmítne', async () => {
    await povol([MATEJ]);
    expect((await posli(formular([{ nazev: 'x.jpg', typ: 'image/jpeg', data: PDF }]))).status).toBe(400);
    expect((await posli(formular([{ nazev: 'x.exe', typ: 'application/octet-stream', data: JPEG }]))).status).toBe(400);
    expect((await posli(formular([]))).status).toBe(400);
  });

  it('denní limit zásilek na profil', async () => {
    await povol([MATEJ]);
    for (let i = 0; i < 15; i++) {
      expect((await posli(formular([{ nazev: 'a.pdf', typ: 'application/pdf', data: PDF }]))).status).toBe(200);
    }
    expect((await posli(formular([{ nazev: 'a.pdf', typ: 'application/pdf', data: PDF }]))).status).toBe(429);
  });

  it('bez složky na serveru je posílání vypnuté (503)', async () => {
    const bezSlozky = vytvorApp(otevriDb(':memory:'));
    const odpoved = await bezSlozky.request('/api/materialy', {
      method: 'POST',
      headers: STUDENT,
      body: formular([{ nazev: 'a.pdf', typ: 'application/pdf', data: PDF }]),
    });
    expect(odpoved.status).toBe(503);
  });
});

describe('zpracovatel a správce', () => {
  async function jednaLatka(): Promise<Material> {
    await povol([MATEJ]);
    return (await (await posli(formular([{ nazev: 'strana.jpg', typ: 'image/jpeg', data: JPEG }]))).json()) as Material;
  }

  it('studentský token na správcovské routy nesmí', async () => {
    const material = await jednaLatka();
    expect((await app.request('/api/admin/materialy', { headers: STUDENT })).status).toBe(401);
    expect((await app.request(`/api/admin/materialy/${material.id}/soubory/01.jpg`, { headers: STUDENT })).status).toBe(401);
    expect(
      (await app.request(`/api/admin/materialy/${material.id}`, {
        method: 'PATCH',
        headers: { ...STUDENT, ...JSON_HLAVICKY },
        body: JSON.stringify({ stav: 'hotovo' }),
      })).status,
    ).toBe(401);
  });

  it('správce vidí frontu, stáhne soubor a nastaví výsledek, který student uvidí', async () => {
    const material = await jednaLatka();
    const fronta = (await (await app.request('/api/admin/materialy', { headers: ADMIN })).json()) as FrontaMaterialu;
    expect(fronta.povoleneProfily).toEqual([MATEJ]);
    expect(fronta.materialy[0].id).toBe(material.id);

    const soubor = await app.request(`/api/admin/materialy/${material.id}/soubory/01.jpg`, { headers: ADMIN });
    expect(soubor.status).toBe(200);
    expect(soubor.headers.get('content-disposition')).toContain('attachment');
    expect(new Uint8Array(await soubor.arrayBuffer())).toEqual(JPEG);
    expect((await app.request(`/api/admin/materialy/${material.id}/soubory/..%2F..%2Fquestor.db`, { headers: ADMIN })).status).toBe(404);

    const zmena = await app.request(`/api/admin/materialy/${material.id}`, {
      method: 'PATCH',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify({
        stav: 'hotovo',
        zprava: 'Přibyla lekce Škody a ochrana zboží.',
        vysledek: {
          temata: [{ predmetId: 'zbozinalstvi', temaId: 'skody-a-ochrana-zbozi', nazev: 'Škody a ochrana zboží' }],
          publikace: [],
        },
      }),
    });
    expect(zmena.status).toBe(200);
    const moje = (await (await app.request(`/api/materialy?profilId=${MATEJ}`, { headers: STUDENT })).json()) as MojeMaterialy;
    expect(moje.materialy[0]).toMatchObject({ stav: 'hotovo', zprava: 'Přibyla lekce Škody a ochrana zboží.' });
    expect(moje.materialy[0].vysledek?.temata[0].temaId).toBe('skody-a-ochrana-zbozi');
  });

  it('smazání odstraní záznam i soubory', async () => {
    const material = await jednaLatka();
    expect((await app.request(`/api/admin/materialy/${material.id}`, { method: 'DELETE', headers: ADMIN })).status).toBe(200);
    expect(existsSync(join(slozka, material.id))).toBe(false);
    const fronta = (await (await app.request('/api/admin/materialy', { headers: ADMIN })).json()) as FrontaMaterialu;
    expect(fronta.materialy).toEqual([]);
  });
});

describe('vrácení zveřejněné změny', () => {
  function banka(verze: number, pocetOtazek: number): BankaOtazek {
    return {
      predmetId: 'zbozinalstvi',
      nazev: 'Zbožíznalství',
      verze,
      vytvoreno: '2026-09-29',
      temata: [{ id: 'skody', nazev: 'Škody', poradi: 0 }],
      otazky: Array.from({ length: pocetOtazek }, (_, i) => ({
        id: `o-skody-${i + 1}`,
        temaId: 'skody',
        obtiznost: 1 as const,
        typ: 'anone' as const,
        zadani: `Otázka ${i + 1}?`,
        spravna: true,
        vysvetleni: 'Protože.',
      })),
    };
  }

  async function nahrajBanku(b: BankaOtazek) {
    return app.request(`/api/banky/${b.predmetId}`, {
      method: 'PUT',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify(b),
    });
  }

  async function hotovaLatka(publikace: unknown[]): Promise<Material> {
    await povol([MATEJ]);
    const material = (await (await posli(formular([{ nazev: 'a.pdf', typ: 'application/pdf', data: PDF }]))).json()) as Material;
    await app.request(`/api/admin/materialy/${material.id}`, {
      method: 'PATCH',
      headers: { ...ADMIN, ...JSON_HLAVICKY },
      body: JSON.stringify({ stav: 'hotovo', vysledek: { temata: [], publikace } }),
    });
    return material;
  }

  it('vrátí předchozí obsah jako novou vyšší verzi a označí látku jako vrácenou', async () => {
    await nahrajBanku(banka(1, 2));
    await nahrajBanku(banka(2, 5)); // zveřejněné zpracování
    const material = await hotovaLatka([{ typ: 'banky', predmetId: 'zbozinalstvi', zVerze: 1, naVerzi: 2 }]);

    const odpoved = await app.request(`/api/admin/materialy/${material.id}/vratit`, { method: 'POST', headers: ADMIN });
    expect(odpoved.status).toBe(200);
    expect(((await odpoved.json()) as Material).stav).toBe('vraceno');

    const aktualni = (await (await app.request('/api/banky/zbozinalstvi', { headers: STUDENT })).json()) as BankaOtazek;
    expect(aktualni.verze).toBe(3); // aplikace berou jen vyšší verze
    expect(aktualni.otazky).toHaveLength(2); // obsah verze 1
  });

  it('odmítne vrátit, když po změně přibylo další zveřejnění', async () => {
    await nahrajBanku(banka(1, 2));
    await nahrajBanku(banka(2, 5));
    const material = await hotovaLatka([{ typ: 'banky', predmetId: 'zbozinalstvi', zVerze: 1, naVerzi: 2 }]);
    await nahrajBanku(banka(3, 7)); // novější zpracování
    const odpoved = await app.request(`/api/admin/materialy/${material.id}/vratit`, { method: 'POST', headers: ADMIN });
    expect(odpoved.status).toBe(409);
  });

  it('nový předmět (zVerze null) automaticky nevrací', async () => {
    await nahrajBanku(banka(1, 2));
    const material = await hotovaLatka([{ typ: 'banky', predmetId: 'zbozinalstvi', zVerze: null, naVerzi: 1 }]);
    const odpoved = await app.request(`/api/admin/materialy/${material.id}/vratit`, { method: 'POST', headers: ADMIN });
    expect(odpoved.status).toBe(409);
  });
});
