// `vitest/config` rather than `vite`: same `defineConfig`, widened to accept the
// `test` block below. One config file, so the build and the tests cannot drift.
import { defineConfig } from 'vitest/config';

import { copyTokens } from './build/copy-tokens';
import { engineChunk } from './build/engine-chunk';
import { projectTags } from './build/project-tags';

// Single HTML entry, on purpose.
//
// design/BUILD_NOTES.md describes a five-entry `rollupOptions.input`. That note
// predates the single-document architecture and is obsolete — see PORT_PLAN.md
// step 1. Destinations are overlay panels in one document; a document swap tore
// down the WebGL context and rebuilt every baked planet texture on arrival.
// GitHub Pages serves this repo as a *project* site, at
// `wallerthedeveloper.github.io/personal-website/`. A root base emits
// `<script src="/assets/…">`, which resolves to the host root, 404s, and leaves
// the page on the text edition — the site looks like plain static HTML because
// the module that boots the hub never arrives. That was the live state until
// this line existed; `tests/unit/build-artifact.test.ts` now pins it.
//
// Build only, deliberately. `base` applies to the dev server too, and Playwright
// drives `npm run dev` with `page.goto('/')` throughout — a global base moves
// that server to `/personal-website/` and every spec 404s on the way in. Dev and
// preview stay rooted; only the shipped artifact carries the path.
//
// Moving to an apex domain later means setting this back to '/' and restoring
// `public/CNAME`, plus the origin in index.html, src/content.ts, public/robots.txt
// and public/sitemap.xml.
const BASE = '/personal-website/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? BASE : '/',
  // copyTokens fills the {{TOKEN}} placeholders from src/content.ts, so the
  // owner fills copy in one file and the served HTML carries it with JS
  // disabled. projectTags does the same for the tech tag rows, resolving the
  // brand marks out of simple-icons — a devDependency, so the glyphs ship as
  // inline paths and the library never reaches the browser. engineChunk writes
  // the hashed engine URL into the head, which is the only place that URL is
  // knowable — the loading dial streams it for a byte count before importing it.
  plugins: [copyTokens(), projectTags(), engineChunk()],
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
}));
