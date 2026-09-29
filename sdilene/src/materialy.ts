// Látka ke zpracování: student (jen povolený profil) pošle z aplikace fotky
// zápisků nebo dokumenty, server je drží ve frontě a zpracovatel na Macu
// správce (Claude Code pod jeho předplatným) z nich udělá učivo, otázky
// a lekce. Detail postupu: docs/ZPRACOVANI-LATKY.md.

export type StavMaterialu = 'ceka' | 'zpracovava' | 'hotovo' | 'chyba' | 'vraceno';

export interface SouborMaterialu {
  /** Uložený název na serveru (např. `01.jpg`) — jediný identifikátor souboru v API. */
  soubor: string;
  /** Původní název od studenta (jen pro zobrazení). */
  nazev: string;
  /** MIME typ z povoleného seznamu (POVOLENE_TYPY_MATERIALU). */
  typ: string;
  velikost: number;
}

/** Jedna zveřejněná změna obsahu — podklad pro „vrátit" v admin přehledu. */
export interface PublikaceMaterialu {
  typ: 'banky' | 'vyuka';
  predmetId: string;
  /** Verze na serveru před zveřejněním; null = předmět byl nový. */
  zVerze: number | null;
  naVerzi: number;
}

export interface VysledekMaterialu {
  /** Odkazy na nové nebo doplněné lekce (aplikace z nich dělá tlačítka „Otevřít lekci"). */
  temata: { predmetId: string; temaId: string; nazev: string }[];
  publikace: PublikaceMaterialu[];
}

export interface Material {
  id: string;
  profilId: string;
  profilJmeno: string;
  /** Předmět zvolený studentem; null = „jiný / nevím" (rozhodne zpracovatel). */
  predmetId: string | null;
  poznamka: string;
  soubory: SouborMaterialu[];
  stav: StavMaterialu;
  vytvoreno: string;
  aktualizovano: string;
  /** Zpráva pro studenta (co přibylo, na co se zpracovatel ptá, proč chyba). */
  zprava?: string;
  vysledek?: VysledekMaterialu;
}

/** Odpověď GET /api/materialy?profilId= (studentská strana). */
export interface MojeMaterialy {
  smiNahravat: boolean;
  materialy: Material[];
}

/** Odpověď GET /api/admin/materialy. */
export interface FrontaMaterialu {
  povoleneProfily: string[];
  materialy: Material[];
}

export const LIMITY_MATERIALU = {
  maxSouboru: 20,
  maxVelikostSouboru: 12 * 1024 * 1024,
  maxCelkem: 45 * 1024 * 1024,
  maxPoznamka: 600,
  /** Kolik zásilek smí jeden profil poslat za 24 hodin (ochrana před zahlcením). */
  maxZaDen: 15,
} as const;

/** Povolené typy souborů → přípona uloženého souboru. */
export const POVOLENE_TYPY_MATERIALU: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
};

export const POPIS_STAVU_MATERIALU: Record<StavMaterialu, string> = {
  ceka: 'Čeká na zpracování',
  zpracovava: 'Zpracovává se',
  hotovo: 'Hotovo',
  chyba: 'Nepodařilo se',
  vraceno: 'Vráceno zpět',
};
