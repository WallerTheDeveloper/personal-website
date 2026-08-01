/**
 * What actually ships (PORT_PLAN step 11's build-artifact test, and the parts of
 * ACCEPTANCE.md D and G that can only be read off the built output).
 *
 * The suite builds the site itself, into a directory of its own, rather than
 * measuring whatever happens to be in `dist/`. A test that reads a stale build —
 * or quietly skips because nobody has run one — cannot fail, and this is the
 * only file standing between the transfer budget and a dependency someone adds
 * on a Friday. The build takes about two seconds.
 *
 * **The budget is what the document fetches, not what the directory weighs.**
 * `public/` holds 813 kB of `og.png` and `cv.pdf`; a crawler reads the first and
 * a visitor asks for the second only if they want it. Neither is a subresource,
 * and `du dist/` is not the number ACCEPTANCE D is about — that mistake is one
 * assertion below, on purpose.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(tmpdir(), 'dg-build-artifact-test');

/** ACCEPTANCE D — production build, gzip, cold load. */
const TRANSFER_BUDGET = 900 * 1024;

interface Emitted {
  readonly name: string;
  readonly bytes: number;
  readonly gzip: number;
  readonly text: string | null;
}

const emitted = new Map<string, Emitted>();

/** Everything in the output directory, keyed by its path relative to it. */
function collect(dir: string, prefix = ''): void {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const name = prefix === '' ? entry : `${prefix}/${entry}`;
    if (statSync(full).isDirectory()) {
      collect(full, name);
      continue;
    }
    const body = readFileSync(full);
    emitted.set(name, {
      name,
      bytes: body.byteLength,
      gzip: gzipSync(body).byteLength,
      // Binary assets are read for their size only.
      text: /\.(html|css|js|txt|xml|md|json)$/.test(name) ? body.toString('utf8') : null,
    });
  }
}

/** The files a browser fetches to render the page: the document and its assets. */
function coldLoad(): readonly Emitted[] {
  return [...emitted.values()].filter((f) => f.name === 'index.html' || f.name.startsWith('assets/'));
}

function sourceText(): readonly Emitted[] {
  return [...emitted.values()].filter((f) => f.text !== null);
}

beforeAll(async () => {
  await build({
    root: ROOT,
    logLevel: 'silent',
    build: { outDir: OUT, emptyOutDir: true },
  });
  collect(OUT);
}, 180_000);

describe('the cold load', () => {
  it('fetches the document, one stylesheet and two scripts', () => {
    const names = coldLoad()
      .map((f) => f.name.replace(/-[A-Za-z0-9_-]{8}\./, '-[hash].'))
      .sort();
    // The hub is a *separate* chunk because the router imports it dynamically.
    // That split is the whole reason a device with no WebGL is cheap, so it is
    // worth failing on rather than discovering in a waterfall.
    expect(names).toEqual([
      'assets/hub-[hash].js',
      'assets/index-[hash].css',
      'assets/index-[hash].js',
      'index.html',
    ]);
  });

  it('stays under the 900 KB transfer budget', () => {
    const total = coldLoad().reduce((sum, f) => sum + f.gzip, 0);
    expect(total, `${(total / 1024).toFixed(1)} kB gzip`).toBeLessThan(TRANSFER_BUDGET);
  });

  it('does not make a text-edition visitor pay for three', () => {
    // No WebGL means the engine chunk is never requested — `mount()` reads the
    // head probe's answer off <html> and flattens before it imports anything.
    const flat = coldLoad().filter((f) => !f.name.startsWith('assets/hub-'));
    const hub = coldLoad().find((f) => f.name.startsWith('assets/hub-'));
    expect(hub).toBeDefined();
    const flatTotal = flat.reduce((sum, f) => sum + f.gzip, 0);
    expect(flatTotal).toBeLessThan(hub!.gzip);
    expect(flatTotal).toBeLessThan(64 * 1024);
  });

  it('is not what `dist/` weighs on disk', () => {
    // The trap this assertion exists to keep from being rediscovered: `og.png`
    // and `cv.pdf` are together larger than everything the page loads, and cost
    // a cold load nothing at all. Measure the budget from the fetches.
    const onDisk = [...emitted.values()].reduce((sum, f) => sum + f.bytes, 0);
    const fetched = coldLoad().reduce((sum, f) => sum + f.bytes, 0);
    expect(emitted.get('og.png')).toBeDefined();
    expect(emitted.get('cv.pdf')).toBeDefined();
    expect(onDisk).toBeGreaterThan(fetched);
    // And neither is pulled in as a subresource. `og.png` is named only in an
    // absolute `og:image`, `cv.pdf` only in `<a href>`s.
    const html = emitted.get('index.html')!.text!;
    expect(html).not.toMatch(/(?:src|rel=["']preload["'][^>]*href)=["'][^"']*(?:og\.png|cv\.pdf)/);
  });
});

describe('ACCEPTANCE G — nothing from the authoring layer ships', () => {
  const forbidden: readonly [string, RegExp][] = [
    ['the authoring element', /<\/?x-dc[\s>]/],
    ['the authoring head', /<\/?helmet[\s>]/],
    ['the authoring runtime', /support\.js/],
    ['the hover-style attributes', /style-hover|style-before/],
    ['the escaped token form', /\{<!---->\{/],
    ['the placeholder domain', /example\.com/],
    ['a three CDN URL', /unpkg\.com|cdn\.jsdelivr\.net|esm\.sh/],
  ];

  for (const [what, pattern] of forbidden) {
    it(`no ${what}`, () => {
      const hits = sourceText()
        .filter((f) => pattern.test(f.text!))
        .map((f) => f.name);
      expect(hits).toEqual([]);
    });
  }
});

describe('ACCEPTANCE D — no post-processing in the bundle', () => {
  it('ships no effect composer or pass', () => {
    // The glow is a back-face fresnel shell plus additive geometry, and that is
    // a draw-call decision, not a stylistic one (CLAUDE.md "Performance"). A
    // composer arriving would be both a budget and an architecture regression.
    const pattern = /EffectComposer|UnrealBloomPass|\bRenderPass\b|\bShaderPass\b|postprocessing/;
    const hits = sourceText()
      .filter((f) => f.name.endsWith('.js') && pattern.test(f.text!))
      .map((f) => f.name);
    expect(hits).toEqual([]);
  });
});

describe('copy', () => {
  it.skip('leaves no {{TOKEN}} unfilled — enable once the owner fills content.ts', () => {
    // Skipped on purpose, and it is not a gap: every value in `content.ts` is
    // still its own literal `{{TOKEN}}` string, so the built HTML carries 115 of
    // them by design and this would fail for the wrong reason. The moment real
    // copy lands, un-skip it — a `{{TYPPO}}` reaching production is exactly the
    // failure this catches, and the build already refuses a token the table does
    // not define (`tests/unit/copy-tokens.test.ts`).
    const html = emitted.get('index.html')!.text!;
    expect(html).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it('carries the copy in the served HTML, not in a script', () => {
    // The text edition is the default state and has to be complete with JS
    // disabled, which is why substitution is a build step rather than a DOM
    // walk. While the tokens are still literal, their presence in the document
    // is what proves the copy is in the bytes a crawler reads.
    const html = emitted.get('index.html')!.text!;
    expect(html).toMatch(/\{\{FULL_NAME\}\}/);
    expect(html.match(/\{\{[A-Z0-9_]+\}\}/g)?.length ?? 0).toBeGreaterThan(100);
  });
});
