/**
 * The authored project bodies — `content/projects/pN.html`.
 *
 * These are the one place in the site where the owner writes markup rather than
 * copy, and `build/copy-tokens.ts` inlines them **unescaped**. Nothing here is a
 * defence against an attacker: the files are the owner's own, in this repo, read
 * at build time, and no runtime user input exists anywhere on this site. What
 * these rules defend is *predictability* — that a body cannot quietly break the
 * house rules, the heading outline, or a Playwright sweep that runs a hundred
 * times slower than this file does.
 *
 * A failure here should read like an editing note, so every message says what to
 * write instead. See `content/projects/README.md`, which documents the same set.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = fileURLToPath(new URL('../../content/projects/', import.meta.url));

const FILES = readdirSync(DIR)
  .filter((name) => name.endsWith('.html'))
  .sort();

const bodies = FILES.map((name) => ({
  name,
  html: readFileSync(`${DIR}${name}`, 'utf8'),
}));

/** Elements that legitimately have no closing tag. */
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/**
 * A tag stack, over markup with the comments stripped. Deliberately cheap: it
 * will not catch everything a parser would, but it catches the one that matters
 * — an unclosed element swallowing the rest of the dialog.
 */
function unbalanced(html: string): string | null {
  const stack: string[] = [];
  const tags = html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g);
  for (const [, closing, raw, attrs = ''] of tags) {
    const tag = (raw as string).toLowerCase();
    if (VOID.has(tag) || attrs.trimEnd().endsWith('/')) continue;
    if (closing === '') {
      stack.push(tag);
      continue;
    }
    const open = stack.pop();
    if (open !== tag) return `</${tag}> closes ${open === undefined ? 'nothing' : `<${open}>`}`;
  }
  return stack.length === 0 ? null : `<${stack[stack.length - 1]}> is never closed`;
}

describe('the authored project bodies', () => {
  it('exist as fragments, not documents', () => {
    expect(bodies.length, 'no authored bodies at all — content/projects/ is empty').toBeGreaterThan(
      0,
    );
    for (const { name, html } of bodies) {
      // They are inlined into a `<div>` inside the dialog. A whole document
      // would nest <html> inside <body>, which the parser then unwinds silently.
      expect(html, `${name} is a document, not a fragment`).not.toMatch(
        /<(?:!doctype|html|head|body)\b/i,
      );
    }
  });

  it('execute nothing', () => {
    for (const { name, html } of bodies) {
      expect(html, `${name} has a <script>`).not.toMatch(/<script\b/i);
      // `on*=` handlers. Banned for predictability rather than for safety —
      // nothing on this site runs behaviour out of content.
      expect(html, `${name} has an inline event handler`).not.toMatch(/\son[a-z]+\s*=/i);
    }
  });

  it('keep every visual decision in the stylesheet', () => {
    for (const { name, html } of bodies) {
      expect(html, `${name} has a style attribute — use a class, or add a rule`).not.toMatch(
        /\sstyle\s*=/i,
      );
      // The house rules, checked in the source so the owner learns at `npm test`
      // rather than from `visual.spec.ts` sweeping the rendered page.
      for (const banned of ['border-radius', 'box-shadow', 'font-family']) {
        expect(html.toLowerCase(), `${name} sets ${banned}`).not.toContain(banned);
      }
    }
  });

  it('start at <h4>, so the document keeps one <h1> per panel', () => {
    // panel <h1> -> card <h2> -> dialog <h3> -> authored body <h4>.
    // `tests/e2e/fallback.spec.ts` counts `[data-panel] h1` and would fail on a
    // promotion; this says which file did it.
    for (const { name, html } of bodies) {
      expect(html, `${name} uses a heading above <h4>`).not.toMatch(/<h[123]\b/i);
    }
  });

  it('describe every image and put it where the base path can find it', () => {
    for (const { name, html } of bodies) {
      for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
        expect(tag, `${name} has an <img> with no alt`).toMatch(/\salt\s*=/i);
        const src = /\ssrc\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '';
        // Relative, the way `href="cv.pdf"` is: a leading slash resolves to the
        // host root and 404s under the site's `/personal-website/` base.
        expect(src, `${name} has an absolute image path`).not.toMatch(/^\//);
      }
    }
  });

  it('open external links safely', () => {
    for (const { name, html } of bodies) {
      for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
        if (!/\shref\s*=\s*"https?:/i.test(tag)) continue;
        expect(tag, `${name} has an external link with no rel="noopener"`).toMatch(/noopener/i);
      }
    }
  });

  it('carry no copy tokens', () => {
    // Bodies are inlined *after* `fillTokens` runs, so a token written here
    // would ship as visible braces. The copy goes in the file.
    for (const { name, html } of bodies) {
      expect(html, `${name} contains a {{TOKEN}} — write the copy out`).not.toContain('{{');
    }
  });

  it('parse as balanced markup', () => {
    for (const { name, html } of bodies) {
      expect(unbalanced(html), `${name}: ${unbalanced(html) ?? ''}`).toBeNull();
    }
  });
});
