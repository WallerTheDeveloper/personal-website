/**
 * Fills `{{TOKEN}}` placeholders in `index.html` from `src/content.ts`, at
 * build time and in dev.
 *
 * This is what makes `content.ts` the one file the owner edits. Doing it in the
 * build rather than at runtime matters: the text edition is the site's default
 * state and must be complete with JavaScript disabled, so the copy has to be in
 * the served HTML, not applied by a script that may never run.
 *
 * Every value is HTML-escaped. Tokens sit in both text content and attributes
 * (`<title>`, `meta[content]`), and escaping `& < > " '` is correct in both, so
 * an ampersand or a quote in real copy cannot break the markup.
 *
 * Not everything can come through here. The `Person` JSON-LD is raw text inside
 * a `<script>` element, where HTML escaping does not apply and would corrupt the
 * JSON — `head.ts` builds it with `JSON.stringify`, which does its own escaping.
 * The project and contact hrefs likewise stay in `head.ts` (PORT_PLAN step 4).
 *
 * This file also inlines the **authored project bodies** — `content/projects/
 * pN.html`, written by the owner as plain HTML — into their `[data-body]` slots.
 * Those go in **raw, deliberately not through `escapeHtml`**: the whole point of
 * them is that they are markup. See `fillBodies` for why that is safe here and
 * what `tests/unit/authored-html.test.ts` enforces instead.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Plugin } from 'vite';

import { CONTENT } from '../src/content';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Shared with `project-tags.ts`, which escapes tag labels for the same reason:
 * one escaper, so "C#" and an ampersand in a label cannot break the markup in
 * one pipeline and not the other.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/**
 * Pure, and takes its table as an argument so it can be tested against copy the
 * owner has not written yet.
 *
 * Throws on a token the table does not define. Failing the build is the point:
 * a typo in the markup would otherwise ship as visible `{{TYPPO}}` text.
 */
export function fillTokens(
  html: string,
  table: Readonly<Record<string, string | undefined>> = CONTENT,
): string {
  return html.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match: string, name: string) => {
    const value = table[name];
    if (value === undefined) {
      throw new Error(
        `[copy-tokens] ${match} appears in index.html but is not defined in src/content.ts. ` +
          'Add it to the content table — that table is the single source for copy.',
      );
    }
    return escapeHtml(value);
  });
}

/** The empty slot each project detail ships, one per project. */
const BODY_SLOT = /<div class="project__body" data-body="([^"]+)"><\/div>/g;

/**
 * Inline each project's authored HTML into its slot, **unescaped**.
 *
 * The body is the owner's own markup, in this repo, read at build time. There is
 * no runtime user input anywhere on this site and nothing here is ever fetched,
 * so a sanitizer would have nothing to defend against — escaping it would simply
 * print the tags. What stands in for that is a lint,
 * `tests/unit/authored-html.test.ts`, which bans `<script>`, `on*=` handlers and
 * `style=` outright, and rejects the house-rule violations (`border-radius`,
 * `box-shadow`, `font-family`) and any heading above `<h4>`.
 *
 * A missing file leaves the slot empty, which is the clean unfilled state: the
 * owner has not written that body yet. That is why this does not throw the way
 * `fillTokens` does — an unwritten body is expected, an undefined token is a typo.
 *
 * The slot is a `data-` attribute rather than a `{{TOKEN}}` on purpose: the token
 * regex in `tests/unit/content.test.ts` sweeps the markup both ways, and a body
 * token would be pulled into coverage assertions it does not belong in.
 */
export function fillBodies(html: string, read: (id: string) => string | null): string {
  return html.replace(BODY_SLOT, (match: string, id: string) => {
    const body = read(id);
    return body === null ? match : `<div class="project__body" data-body="${id}">${body}</div>`;
  });
}

/** `null` when the owner has not written that body yet — see `fillBodies`. */
function readBody(root: string, id: string): string | null {
  try {
    return readFileSync(join(root, 'content', 'projects', `${id}.html`), 'utf8').trim();
  } catch {
    return null;
  }
}

export function copyTokens(): Plugin {
  // Taken from the resolved config rather than from `import.meta.url`: this
  // module is inlined into the temporary bundle Vite builds for the config, so
  // its own URL points at the project root, not at `build/`.
  let root = process.cwd();
  return {
    name: 'copy-tokens',
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      order: 'pre',
      // Tokens first, then bodies — so an authored body is literal text and a
      // stray `{{TOKEN}}` in one cannot reach `fillTokens` and fail the build
      // over copy that is not in the content table. The lint rejects `{{` in an
      // authored body for the same reason.
      handler: (html: string) => fillBodies(fillTokens(html), (id) => readBody(root, id)),
    },
  };
}
