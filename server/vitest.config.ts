import { defineConfig } from 'vitest/config';

// Provozní log požadavků (app.ts) by v testech zahltil výstup stovkami řádků.
export default defineConfig({
  test: {
    env: { QUESTOR_LOG_POZADAVKU: '0' },
  },
});
