// Výběr a autodetekce poskytovatele: ANTHROPIC_API_KEY → api,
// jinak binárka claude v PATH → claude-cli, jinak mock + varování.

import { vytvorPoskytovateleApi, VYCHOZI_MODEL } from './api';
import { jeClaudeCliDostupny, vytvorPoskytovateleClaudeCli } from './claude-cli';
import { vytvorPoskytovateleMock } from './mock';
import { NAZVY_POSKYTOVATELU, type NazevPoskytovatele, type Poskytovatel } from './rozhrani';

export interface VyberVolby {
  /** Výslovně požadovaný poskytovatel (--poskytovatel); undefined = autodetekce. */
  pozadovany?: string;
  /** Model zadaný uživatelem (--model); undefined = výchozí. */
  model?: string;
  log?: (zprava: string) => void;
}

export interface VybranyPoskytovatel {
  poskytovatel: Poskytovatel;
  varovani?: string;
}

export function vyberPoskytovatele(volby: VyberVolby = {}): VybranyPoskytovatel {
  const { pozadovany, model, log } = volby;

  if (pozadovany !== undefined) {
    if (!NAZVY_POSKYTOVATELU.includes(pozadovany as NazevPoskytovatele)) {
      throw new Error(
        `Neznámý poskytovatel „${pozadovany}“ — povolené hodnoty: ${NAZVY_POSKYTOVATELU.join(', ')}.`,
      );
    }
    return { poskytovatel: sestavPoskytovatele(pozadovany as NazevPoskytovatele, model, log) };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return { poskytovatel: sestavPoskytovatele('api', model, log) };
  }
  if (jeClaudeCliDostupny()) {
    return { poskytovatel: sestavPoskytovatele('claude-cli', model, log) };
  }
  return {
    poskytovatel: sestavPoskytovatele('mock', model, log),
    varovani:
      'POZOR: není nastavený ANTHROPIC_API_KEY ani nalezena binárka claude — používá se ' +
      'poskytovatel mock (deterministické testovací otázky, ne skutečné učivo od Claude).',
  };
}

function sestavPoskytovatele(
  nazev: NazevPoskytovatele,
  model: string | undefined,
  log?: (zprava: string) => void,
): Poskytovatel {
  switch (nazev) {
    case 'api':
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error(
          'Poskytovatel api vyžaduje ANTHROPIC_API_KEY v prostředí (viz docs/NAVOD.md).',
        );
      }
      return vytvorPoskytovateleApi({ model: model ?? VYCHOZI_MODEL, log });
    case 'claude-cli':
      // Model se binárce předává jen když ho uživatel výslovně zadal.
      return vytvorPoskytovateleClaudeCli({ model, log });
    case 'mock':
      return vytvorPoskytovateleMock();
  }
}
