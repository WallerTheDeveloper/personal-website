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
 */

import type { Plugin } from 'vite';

import { CONTENT } from '../src/content';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
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

export function copyTokens(): Plugin {
  return {
    name: 'copy-tokens',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => fillTokens(html),
    },
  };
}
