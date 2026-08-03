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

import { fillTokens } from '../../build/copy-tokens';
import { CONTENT } from '../../src/content';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = join(tmpdir(), 'dg-build-artifact-test');

/** Every `{{TOKEN}}` written in the authored markup, deduplicated. */
const markupTokens = new Set(
  Array.from(
    readFileSync(join(ROOT, 'index.html'), 'utf8').matchAll(/\{\{([A-Z0-9_]+)\}\}/g),
    (match) => match[1] as string,
  ),
);

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

  it('asks for its assets under the Pages project path', () => {
    // The regression this exists for, and it was live: with no `base`, Vite
    // emits `src="/assets/…"`. On `wallerthedeveloper.github.io/personal-website/`
    // that resolves to the *host* root, 404s, and the module that boots the hub
    // never arrives — so the page sits on `#fallback` and reads as plain static
    // HTML. Nothing else in the suite notices, because Playwright drives the dev
    // server, where `base` is '/' by design (vite.config.ts).
    const html = emitted.get('index.html')!.text!;
    const refs = Array.from(html.matchAll(/(?:src|href)="([^"]*assets\/[^"]*)"/g), (m) => m[1] as string);
    // Guards the guard: a regex that stops matching would pass vacuously, and
    // the cold load above already fixes the count at one stylesheet + one script.
    expect(refs.length).toBeGreaterThanOrEqual(2);
    for (const ref of refs) {
      expect(ref, `${ref} does not carry the base`).toMatch(/^\/personal-website\/assets\//);
    }
  });

  it('publishes absolute URLs that agree with that path', () => {
    // The canonical, the OG image and `base` are one decision in three files.
    // An origin updated without the base (or the reverse) points crawlers at a
    // URL that does not serve this document.
    const html = emitted.get('index.html')!.text!;
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical).toBe('https://wallerthedeveloper.github.io/personal-website/');
    expect(new URL(canonical!).pathname).toBe('/personal-website/');
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
    // Still skipped, and still not a gap: the owner is filling `content.ts`
    // panel by panel, so the built HTML carries the tokens they have not
    // reached yet by design and this would fail for the wrong reason. The
    // moment the last one lands, un-skip it — a `{{TYPPO}}` reaching production
    // is exactly the failure this catches, and the build already refuses a
    // token the table does not define (`tests/unit/copy-tokens.test.ts`).
    // Until then the two assertions below cover the filled half exactly.
    const html = emitted.get('index.html')!.text!;
    expect(html).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  it('carries filled copy in the served HTML, not in a script', () => {
    // The text edition is the default state and has to be complete with JS
    // disabled, which is why substitution is a build step rather than a DOM
    // walk. Every value the owner has written must therefore be in the bytes a
    // crawler reads — escaped exactly as `fillTokens` escapes it, which is why
    // the escaping is borrowed from the shipped implementation rather than
    // re-stated here.
    const html = emitted.get('index.html')!.text!;
    const escaped = (value: string): string => fillTokens('{{V}}', { V: value });

    const filled = Object.entries(CONTENT).filter(([key, value]) => value !== `{{${key}}}`);
    expect(filled.length, 'no copy is filled — content.ts is all placeholders').toBeGreaterThan(0);

    for (const [key, value] of filled) {
      expect(html, `${key} is filled but its token still ships`).not.toContain(`{{${key}}}`);
      // `EDUCATION_NOTE` is deliberately empty; `toContain('')` says nothing,
      // and the token assertion above is the one that matters for it.
      if (value !== '' && markupTokens.has(key)) {
        expect(html, `${key} is filled but its copy is not in the document`).toContain(
          escaped(value),
        );
      }
    }
  });

  it('still ships the tokens the owner has not filled', () => {
    // The other half of the same contract, and the reason the skipped test
    // above is not simply deleted: an unfilled token has to survive the build
    // as visible `{{TOKEN}}` text. Anything else — a blank, a stale value, a
    // silently dropped node — would hide unwritten copy instead of showing it.
    const html = emitted.get('index.html')!.text!;
    const unfilled = [...markupTokens].filter(
      (token) => CONTENT[token as keyof typeof CONTENT] === `{{${token}}}`,
    );
    expect(unfilled.length, 'every token is filled — un-skip the test above').toBeGreaterThan(0);
    for (const token of unfilled) {
      expect(html, `{{${token}}} was dropped from the document`).toContain(`{{${token}}}`);
    }
  });
});
