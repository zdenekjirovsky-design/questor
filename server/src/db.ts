// Databázová vrstva serveru QUESTOR — node:sqlite (žádné nativní závislosti).
// Schéma tabulek je závazně popsané v docs/ARCHITEKTURA.md.
//
// Profily (bez účtů a e-mailů): aplikaci sdílí víc lidí na jednom počítači
// se SPOLEČNÝM studentským tokenem — server rozlišuje jen profil_id/profil_jmeno,
// které klient posílá v těle. Progres je per profil, události nesou profil,
// výzvy mohou mít cíl (cilovyProfilId v JSON výzvy, NULL = pro všechny).

import { DatabaseSync } from 'node:sqlite';

/** Výchozí profil — kam patří data z dob před profily i těla bez profilId. */
export const VYCHOZI_PROFIL_ID = 'vychozi';
export const VYCHOZI_PROFIL_JMENO = 'Student';

/** Názvy sloupců tabulky (prázdné pole = tabulka neexistuje). */
function sloupceTabulky(db: DatabaseSync, tabulka: string): string[] {
  const radky = db.prepare(`PRAGMA table_info(${tabulka})`).all() as { name: string }[];
  return radky.map((r) => r.name);
}

/**
 * Progres per profil: progres(profil_id PK, profil_jmeno, json, prijato).
 * Migrace staré tabulky progres(id=1, json, prijato) → jediný řádek se stane
 * profilem 'vychozi' / 'Student' (data přežijí beze změny).
 */
function zajistiProgresProfilu(db: DatabaseSync): void {
  const sloupce = sloupceTabulky(db, 'progres');
  if (sloupce.includes('profil_id')) return; // nové schéma už je

  if (sloupce.includes('id')) {
    // Stará jednořádková tabulka — přejmenovat, přelít, zahodit.
    db.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE progres RENAME TO progres_stara;
      CREATE TABLE progres (
        profil_id    TEXT PRIMARY KEY,
        profil_jmeno TEXT,
        json         TEXT NOT NULL,
        prijato      TEXT NOT NULL
      );
      INSERT INTO progres (profil_id, profil_jmeno, json, prijato)
        SELECT '${VYCHOZI_PROFIL_ID}', '${VYCHOZI_PROFIL_JMENO}', json, prijato
        FROM progres_stara WHERE id = 1;
      DROP TABLE progres_stara;
      COMMIT;
    `);
    return;
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS progres (
      profil_id    TEXT PRIMARY KEY,
      profil_jmeno TEXT,
      json         TEXT NOT NULL,
      prijato      TEXT NOT NULL
    );
  `);
}

/** Události: doplnit sloupce profil_id/profil_jmeno (u starých řádků NULL). */
function zajistiUdalostiProfilu(db: DatabaseSync): void {
  const sloupce = sloupceTabulky(db, 'udalosti');
  if (sloupce.includes('profil_id')) return;
  db.exec(`
    ALTER TABLE udalosti ADD COLUMN profil_id TEXT;
    ALTER TABLE udalosti ADD COLUMN profil_jmeno TEXT;
  `);
}

/**
 * Otevře (a případně založí) databázi na dané cestě, včetně migrací schématu.
 * V testech se používá ':memory:', v produkci server/data/questor.db.
 */
export function otevriDb(cesta: string): DatabaseSync {
  const db = new DatabaseSync(cesta);
  db.exec(`
    CREATE TABLE IF NOT EXISTS banky (
      predmet_id TEXT PRIMARY KEY,
      verze      INT  NOT NULL,
      json       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS udalosti (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      cas  TEXT NOT NULL,
      json TEXT NOT NULL
    );
    -- Idempotence POST /api/udalosti: klient posílá at-least-once (timeout
    -- + retry), duplicitní TestVysledek se pozná podle id uvnitř JSON.
    CREATE UNIQUE INDEX IF NOT EXISTS udalosti_vysledek_id
      ON udalosti (json_extract(json, '$.id'));
    CREATE TABLE IF NOT EXISTS vyzvy (
      id   TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vyuka (
      predmet_id TEXT PRIMARY KEY,
      verze      INT  NOT NULL,
      json       TEXT NOT NULL
    );
    -- Registr profilů (sync mezi zařízeními): json = ProfilMetadata
    -- (jmeno, barva, pinHash?, avatar?, predmety, aktivniPredmetId),
    -- aktualizovano = ISO čas poslední změny (rozhodčí LWW zápisů).
    CREATE TABLE IF NOT EXISTS profily (
      profil_id     TEXT PRIMARY KEY,
      json          TEXT NOT NULL,
      aktualizovano TEXT NOT NULL
    );
  `);
  zajistiProgresProfilu(db);
  zajistiUdalostiProfilu(db);
  return db;
}
