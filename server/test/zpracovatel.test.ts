// Celý cyklus zpracovatele látky (scripts/materialy.ts) proti serverové
// aplikaci: fronta → stažení podkladů → stav → zveřejnění s evidencí verzí
// → vrácení změny. Síť nahrazuje app.request, repo dočasná složka.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import type { BankaOtazek, Material, VyukaPredmetu } from '@questor/sdilene';
import { vytvorApp } from '../src/app';
import { otevriDb } from '../src/db';
import {
  nactiFrontu,
  nastavStav,
  stahniLatku,
  zverejniLatku,
  type Api,
} from '../../scripts/materialy';

const ADMIN = { 'x-questor-token': 'admin-dev' };
const STUDENT = { 'x-questor-token': 'student-dev' };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]);

let slozkaServeru: string;
let repo: string;
let app: Hono;
let api: Api;

function banka(verze: number, otazek: number): BankaOtazek {
  return {
    predmetId: 'zbozinalstvi',
    nazev: 'Zbožíznalství',
    verze,
    vytvoreno: '2026-09-29',
    temata: [{ id: 'skody-a-ochrana-zbozi', nazev: 'Škody a ochrana zboží', poradi: 0 }],
    otazky: Array.from({ length: otazek }, (_, i) => ({
      id: `o-skody-a-ochrana-zbozi-${i + 1}`,
      temaId: 'skody-a-ochrana-zbozi',
      obtiznost: 1 as const,
      typ: 'anone' as const,
      zadani: `Otázka ${i + 1}?`,
      spravna: true,
      vysvetleni: 'Protože.',
    })),
  };
}

function vyuka(verze: number): VyukaPredmetu {
  return {
    predmetId: 'zbozinalstvi',
    verze,
    vytvoreno: '2026-09-29',
    lekce: [
      {
        temaId: 'skody-a-ochrana-zbozi',
        nazev: 'Škody a ochrana zboží',
        poradi: 0,
        bloky: [{ typ: 'text', obsah: 'Škody na zboží jsou nežádoucí změny.' }],
      },
    ],
  };
}

function ulozMistne(b: BankaOtazek, v: VyukaPredmetu) {
  mkdirSync(join(repo, 'data', 'banky'), { recursive: true });
  mkdirSync(join(repo, 'data', 'vyuka'), { recursive: true });
  writeFileSync(join(repo, 'data', 'banky', 'zbozinalstvi.json'), JSON.stringify(b));
  writeFileSync(join(repo, 'data', 'vyuka', 'zbozinalstvi.json'), JSON.stringify(v));
}

async function posliLatku(): Promise<Material> {
  const f = new FormData();
  f.set('profilId', 'matej-1');
  f.set('profilJmeno', 'Matěj');
  f.set('predmetId', 'zbozinalstvi');
  f.append('soubory', new File([JPEG], 'strana.jpg', { type: 'image/jpeg' }));
  const odpoved = await app.request('/api/materialy', { method: 'POST', headers: STUDENT, body: f });
  return (await odpoved.json()) as Material;
}

beforeEach(async () => {
  slozkaServeru = mkdtempSync(join(tmpdir(), 'questor-server-'));
  repo = mkdtempSync(join(tmpdir(), 'questor-repo-'));
  app = vytvorApp(otevriDb(':memory:'), { slozkaMaterialu: slozkaServeru });
  api = {
    url: 'http://questor.test',
    kod: 'admin-dev',
    fetchFn: (url, init) => Promise.resolve(app.request(url, init)),
  };
  await app.request('/api/admin/materialy/povoleni', {
    method: 'PUT',
    headers: { ...ADMIN, 'content-type': 'application/json' },
    body: JSON.stringify({ povoleneProfily: ['matej-1'] }),
  });
});

afterEach(() => {
  rmSync(slozkaServeru, { recursive: true, force: true });
  rmSync(repo, { recursive: true, force: true });
});

describe('zpracovatel látky', () => {
  it('fronta → stažení → zveřejnění s evidencí verzí → vrácení', async () => {
    // Na serveru je dosavadní obsah (verze 1), zpracovatel připraví verzi 2.
    for (const [typ, obsah] of [['banky', banka(1, 2)], ['vyuka', vyuka(1)]] as const) {
      await app.request(`/api/${typ}/zbozinalstvi`, {
        method: 'PUT',
        headers: { ...ADMIN, 'content-type': 'application/json' },
        body: JSON.stringify(obsah),
      });
    }
    const material = await posliLatku();

    const fronta = await nactiFrontu(api);
    expect(fronta.map((m) => m.id)).toEqual([material.id]);

    const cesty = await stahniLatku(api, material.id, repo);
    expect(cesty).toHaveLength(1);
    expect(new Uint8Array(readFileSync(cesty[0]))).toEqual(JPEG);
    expect(JSON.parse(readFileSync(join(repo, 'podklady', material.id, 'latka.json'), 'utf8')).id).toBe(material.id);

    await nastavStav(api, material.id, 'zpracovava', 'Zpracovávám…');
    expect(await nactiFrontu(api)).toEqual([]); // rozpracovaná není ve frontě
    // …ale zaseknutá (spadlá session) se po 3 hodinách vrací.
    expect((await nactiFrontu(api, new Date(Date.now() + 4 * 3600_000))).map((m) => m.id)).toEqual([material.id]);

    ulozMistne(banka(2, 5), vyuka(2));
    const hotova = await zverejniLatku(api, {
      id: material.id,
      predmety: ['zbozinalstvi'],
      temata: ['skody-a-ochrana-zbozi'],
      zprava: 'Přibyla lekce Škody a ochrana zboží (5 otázek).',
      koren: repo,
    });
    expect(hotova.stav).toBe('hotovo');
    expect(hotova.vysledek?.publikace).toEqual([
      { typ: 'banky', predmetId: 'zbozinalstvi', zVerze: 1, naVerzi: 2 },
      { typ: 'vyuka', predmetId: 'zbozinalstvi', zVerze: 1, naVerzi: 2 },
    ]);
    expect(hotova.vysledek?.temata).toEqual([
      { predmetId: 'zbozinalstvi', temaId: 'skody-a-ochrana-zbozi', nazev: 'Škody a ochrana zboží' },
    ]);

    // Bez vyšší místní verze se nic nezveřejní (zpracovatel musí zvednout verzi).
    await expect(
      zverejniLatku(api, { id: material.id, predmety: ['zbozinalstvi'], temata: [], zprava: 'x', koren: repo }),
    ).rejects.toThrow(/Nic ke zveřejnění/);

    // Správce změnu vrátí — banka i výuka se vrátí k obsahu verze 1 jako verze 3.
    const vraceno = await app.request(`/api/admin/materialy/${material.id}/vratit`, { method: 'POST', headers: ADMIN });
    expect(vraceno.status).toBe(200);
    const bankaPo = (await (await app.request('/api/banky/zbozinalstvi', { headers: STUDENT })).json()) as BankaOtazek;
    expect([bankaPo.verze, bankaPo.otazky.length]).toEqual([3, 2]);
    const vyukaPo = (await (await app.request('/api/vyuka/zbozinalstvi', { headers: STUDENT })).json()) as VyukaPredmetu;
    expect(vyukaPo.verze).toBe(3);
  });

  it('nový předmět (na serveru ještě není) zveřejní se zVerze null', async () => {
    const material = await posliLatku();
    ulozMistne(banka(1, 3), vyuka(1));
    const hotova = await zverejniLatku(api, {
      id: material.id,
      predmety: ['zbozinalstvi'],
      temata: ['skody-a-ochrana-zbozi'],
      zprava: 'Nový předmět Zbožíznalství.',
      koren: repo,
    });
    expect(hotova.vysledek?.publikace.map((p) => p.zVerze)).toEqual([null, null]);
  });
});
