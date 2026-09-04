// Databázová vrstva serveru QUESTOR — node:sqlite (žádné nativní závislosti).
// Schéma tabulek je závazně popsané v docs/ARCHITEKTURA.md.

import { DatabaseSync } from 'node:sqlite';

/**
 * Otevře (a případně založí) databázi na dané cestě.
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
    CREATE TABLE IF NOT EXISTS progres (
      id      INT PRIMARY KEY CHECK (id = 1),
      json    TEXT NOT NULL,
      prijato TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS udalosti (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      cas  TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vyzvy (
      id   TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
  `);
  return db;
}
