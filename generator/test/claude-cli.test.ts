// Testy parsování výstupu poskytovatele claude-cli (fixture stdout, vytěžení JSON bloku).

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { vytezJsonBlok, zpracujStdoutClaudeCli } from '../src/poskytovatele/claude-cli';
import { davkaOtazekSchema } from '../src/llm-schema';

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'claude-cli-stdout.json',
);

describe('zpracujStdoutClaudeCli', () => {
  it('z fixture stdout vytáhne pole result a z něj dávku otázek', () => {
    const stdout = readFileSync(FIXTURE, 'utf8');
    const data = zpracujStdoutClaudeCli(stdout);
    const davka = davkaOtazekSchema.parse(data);
    expect(davka.otazky).toHaveLength(2);
    expect(davka.otazky[0].typ).toBe('vyber');
    expect(davka.otazky[0].zadani).toBe('Co je to statek?');
    expect(davka.otazky[1].typ).toBe('anone');
    expect(davka.otazky[1].zdroj).toBeNull();
  });

  it('odmítne stdout, který není JSON', () => {
    expect(() => zpracujStdoutClaudeCli('tohle není json')).toThrow('není platný JSON');
  });

  it('odmítne stdout bez textového pole result', () => {
    expect(() => zpracujStdoutClaudeCli('{"type":"result","result":42}')).toThrow('result');
  });
});

describe('vytezJsonBlok', () => {
  it('vezme čistý JSON přímo', () => {
    expect(vytezJsonBlok('{"otazky": []}')).toEqual({ otazky: [] });
    expect(vytezJsonBlok('  [1, 2, 3]  ')).toEqual([1, 2, 3]);
  });

  it('vytěží JSON z ohrazení ```json', () => {
    const text = 'Jasně, tady je výstup:\n```json\n{"temata": ["Trh"]}\n```\nSnad pomůže.';
    expect(vytezJsonBlok(text)).toEqual({ temata: ['Trh'] });
  });

  it('vytěží JSON blok obklopený prózou bez ohrazení', () => {
    const text = 'Výsledek je {"temata": ["Trh", "Podnikání"]} — hotovo.';
    expect(vytezJsonBlok(text)).toEqual({ temata: ['Trh', 'Podnikání'] });
  });

  it('bez JSON bloku vyhodí srozumitelnou chybu', () => {
    expect(() => vytezJsonBlok('žádný json tu není')).toThrow('JSON blok');
  });
});
