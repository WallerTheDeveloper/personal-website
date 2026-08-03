/**
 * Finding the engine chunk in the bundle.
 *
 * This is the one place a Rollup bundle turns into the URL the loading dial
 * streams, and it fails *quietly*: a miss produces no meta tag, the dial falls
 * back to its idle drift, and the site looks exactly as it did before byte
 * progress existed. Nothing goes red. So the cases where the chunk moves — a
 * different name, a different separator, no facade at all — are asserted here
 * rather than left to be noticed on a slow connection one day.
 */

import { describe, expect, it } from 'vitest';

import { findEngineChunk, joinBase, type BundledChunk } from '../../build/engine-chunk';

const chunk = (fileName: string, facadeModuleId: string | null = null): BundledChunk => ({
  type: 'chunk',
  fileName,
  facadeModuleId,
});

describe('findEngineChunk', () => {
  it('finds the chunk fronting src/hub.ts', () => {
    const found = findEngineChunk({
      a: chunk('assets/index-aaa.js', '/repo/index.html'),
      b: chunk('assets/hub-bbb.js', '/repo/src/hub.ts'),
    });
    expect(found).toBe('assets/hub-bbb.js');
  });

  it('finds it when Rollup reports a Windows path', () => {
    // The build runs on the developer's machine as well as in CI, and Rollup
    // hands back the host's separators.
    const found = findEngineChunk({
      b: chunk('assets/hub-bbb.js', 'D:\\personal-website\\src\\hub.ts'),
    });
    expect(found).toBe('assets/hub-bbb.js');
  });

  it('is not fooled by a module whose path merely ends in hub.ts', () => {
    // `/src/hub.ts`, anchored on the separator — not `sub.ts`, and not some
    // other package's `hub.ts` vendored in.
    const found = findEngineChunk({
      a: chunk('assets/other-aaa.js', '/repo/node_modules/x/src/nothub.ts'),
    });
    expect(found).toBeNull();
  });

  it('falls back to the file name when the chunk has no facade', () => {
    // A dynamic import can be emitted without a facade module. The name is
    // Rollup's to choose, so this is the weaker of the two matches — but it is
    // the one that keeps working if the entry shape changes.
    const found = findEngineChunk({ b: chunk('assets/hub-bbb.js') });
    expect(found).toBe('assets/hub-bbb.js');
  });

  it('ignores assets, which have no facade and no code', () => {
    const found = findEngineChunk({
      css: { type: 'asset', fileName: 'assets/hub-styles.css' },
      js: chunk('assets/hub-bbb.js', '/repo/src/hub.ts'),
    });
    expect(found).toBe('assets/hub-bbb.js');
  });

  it('is null for a bundle with no engine chunk', () => {
    // Degrade, do not throw: a build that cannot find it still ships, and the
    // dial reverts to the drift it used before this existed.
    expect(findEngineChunk({ a: chunk('assets/index-aaa.js', '/repo/index.html') })).toBeNull();
    expect(findEngineChunk({})).toBeNull();
  });
});

describe('joinBase', () => {
  it('carries the project-site base onto the chunk path', () => {
    // The site ships at wallerthedeveloper.github.io/personal-website/. A root
    // path here 404s and leaves the visitor on the text edition — the same
    // failure `vite.config.ts` pins `base` for.
    expect(joinBase('/personal-website/', 'assets/hub-a.js')).toBe(
      '/personal-website/assets/hub-a.js',
    );
  });

  it('handles a root base and a base without its trailing slash', () => {
    expect(joinBase('/', 'assets/hub-a.js')).toBe('/assets/hub-a.js');
    expect(joinBase('/personal-website', 'assets/hub-a.js')).toBe(
      '/personal-website/assets/hub-a.js',
    );
  });
});
