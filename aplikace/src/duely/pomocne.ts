// Male UI pomucky duelu (formatovani, jmena, ikony) — ciste, testovatelne.
import type { Duel, PowerupTyp } from '@questor/sdilene';
import { nactiSyncNastaveni, vytvorKlienta } from '../sync/klient';

/**
 * Klient serveru pro akce duelu (zalozeni, prijeti); null = sync vypnuty
 * (chybi adresa nebo rodinny kod). Sdili ho stranka Duely i DuelHrani.
 */
export function duelovyKlient() {
  const nastaveni = nactiSyncNastaveni();
  if (!nastaveni.url || !nastaveni.token) return null;
  return vytvorKlienta(nastaveni);
}

/** Ikony power-upu (nazvy a popisy drzi POWERUP_INFO ve sdilene). */
export const IKONY_POWERUPU: Record<PowerupTyp, string> = {
  'pade-na-pade': '✂️',
  'zmrazeni-casu': '🧊',
  stit: '🛡️',
};

/** Druhy ucastnik duelu z mého pohledu (null u otevrene vyzvy bez soupere). */
export function souperVDuelu(
  duel: Duel,
  profilId: string,
): { profilId: string; jmeno: string } | null {
  if (duel.vyzyvatel.profilId === profilId) return duel.souper ?? null;
  return duel.vyzyvatel;
}

/** Kolik zbyva do vyprseni duelu (kratky text do karty). */
export function zbyvaDoVyprseni(vyprsi: string, tedMs: number): string {
  const ms = Date.parse(vyprsi) - tedMs;
  if (!Number.isFinite(ms) || ms <= 0) return 'vypršelo';
  const hodin = Math.floor(ms / 3_600_000);
  if (hodin >= 1) return `zbývá ${hodin} h`;
  const minut = Math.max(1, Math.floor(ms / 60_000));
  return `zbývá ${minut} min`;
}

/** Sekundy s desetinou pro odpocet otazky (např. „12,4 s"). */
export function formatujOdpocet(ms: number): string {
  const sekundy = Math.max(0, ms) / 1000;
  return `${sekundy.toFixed(1).replace('.', ',')} s`;
}

/** Celkovy cas hrace ve vysledku (mm:ss). */
export function formatujCelkovyCas(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Ferovy popis handicapu pro UI: kdo ma bonus casu a jaky. Nasobice jsou
 * ze snapshotu na serveru a NEMENI se po cely duel — oboum se ukazuji.
 */
export function popisHandicapu(
  duel: Duel,
  profilId: string,
): { muj: number; souperuv: number; text: string | null } {
  const muj = duel.handicap[profilId] ?? 1;
  const souperId = souperVDuelu(duel, profilId)?.profilId;
  const souperuv = souperId ? (duel.handicap[souperId] ?? 1) : 1;
  let text: string | null = null;
  if (muj > souperuv) {
    text = `Máš bonus času ×${muj.toFixed(2).replace('.', ',')} — soupeř tenhle obor zvládá líp, časy jsou vyrovnané férově.`;
  } else if (souperuv > muj) {
    text = `Soupeř má bonus času ×${souperuv.toFixed(2).replace('.', ',')} — obor zvládáš líp ty, časy jsou vyrovnané férově.`;
  }
  return { muj, souperuv, text };
}
