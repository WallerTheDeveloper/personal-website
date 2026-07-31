// `vitest/config` rather than `vite`: same `defineConfig`, widened to accept the
// `test` block below. One config file, so the build and the tests cannot drift.
import { defineConfig } from 'vitest/config';

import { copyTokens } from './build/copy-tokens';

// Single HTML entry, on purpose.
//
// design/BUILD_NOTES.md describes a five-entry `rollupOptions.input`. That note
// predates the single-document architecture and is obsolete — see PORT_PLAN.md
// step 1. Destinations are overlay panels in one document; a document swap tore
// down the WebGL context and rebuilt every baked planet texture on arrival.
export default defineConfig({
  // Fills the {{TOKEN}} placeholders from src/content.ts, so the owner fills
  // copy in one file and the served HTML carries it with JS disabled.
  plugins: [copyTokens()],
  build: {
    target: 'es2022',
    // The budget is < 900 KB transfer and `three` is essentially all of it,
    // so surface the moment a chunk grows unexpectedly.
    chunkSizeWarningLimit: 700,
  },
  test: {
    // `tests/e2e` is Playwright's, and its `*.spec.ts` files match Vitest's
    // default glob. Without this, `npm test` collects them and reports failing
    // files for suites that never ran.
    include: ['tests/unit/**/*.test.ts'],
  },
});
