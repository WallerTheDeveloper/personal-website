/**
 * Fills each project's tech tag row with real brand marks, at build time.
 *
 * The glyphs come from `simple-icons`, which is a **devDependency**: it is read
 * during the build, and the browser never receives a byte of it. Each chip
 * carries a `<use>` of its mark, and `build/icon-sprite.ts` writes each mark
 * that is used once, inline in `index.html`, monochrome in `currentColor` so the
 * panel accent tints it.
 *
 * Build time rather than on open, and that is the whole point of this file:
 *
 * - the rows exist in the text edition and in the printed CV, which is the gap
 *   the card's old `Stack — …` line was papering over;
 * - `simple-icons` stays out of the browser bundle entirely;
 * - no runtime renderer, and no `:empty` rule to hide a row that never filled.
 *
 * Throws on a slug `simple-icons` does not export and on a slot with no entry in
 * `PROJECT_DETAILS`. Failing the build is the same stance `copy-tokens.ts`
 * takes: a typo must not ship as a silently empty row.
 *
 * A brand with no mark in the set renders as a **text-only chip**. That is
 * honest — C#, OpenXR, GLSL and Protocol Buffers genuinely have no logo here —
 * and drawing a hand-made stand-in is exactly what this file replaced.
 */

import type { Plugin } from 'vite';

import { PROJECT_DETAILS, type ProjectDetail, type Tech } from '../src/content';

import { escapeHtml } from './copy-tokens';
import { markFor, symbolId } from './icon-sprite';

/** The empty slot the markup ships, one per project. */
const SLOT = /<ul class="project__tech" data-tech="([^"]+)"><\/ul>/g;

/**
 * One chip: the mark, then the label as text.
 *
 * `aria-hidden` on the svg because the label beside it already names the
 * technology, and `focusable="false"` to keep it out of the tab ring in engines
 * that make SVG focusable by default. The slug is resolved here, not only when
 * the sprite is written, so an unknown one fails naming the label it was on.
 *
 * `className` is the only thing a row decides: `build/skill-tags.ts` draws the
 * About panel's skills through this same function as `skills__tag`.
 */
export function chipFor({ icon, label }: Tech, className = 'project__tag'): string {
  const text = escapeHtml(label);
  if (icon === undefined) return `<li class="${className}">${text}</li>`;

  markFor(icon, label);

  return (
    `<li class="${className}">` +
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
    `<use href="#${symbolId(icon)}"/>` +
    '</svg>' +
    `${text}</li>`
  );
}

/**
 * Pure, and takes its table as an argument so it can be tested against tags the
 * owner has not written yet. Checked both ways: a slot with no entry throws, and
 * an entry with no slot throws.
 */
export function fillTags(
  html: string,
  details: readonly ProjectDetail[] = PROJECT_DETAILS,
): string {
  const filled = new Set<string>();

  const out = html.replace(SLOT, (_match: string, id: string) => {
    const row = details.find((entry) => entry.id === id);
    if (row === undefined) {
      throw new Error(
        `[project-tags] data-tech="${id}" has no entry in PROJECT_DETAILS. ` +
          'That table is the single source for the tag rows.',
      );
    }
    filled.add(id);
    const chips = row.tech.map((tech) => chipFor(tech)).join('');
    return `<ul class="project__tech" data-tech="${id}">${chips}</ul>`;
  });

  const missing = details.filter((entry) => !filled.has(entry.id)).map((entry) => entry.id);
  if (missing.length > 0) {
    throw new Error(
      `[project-tags] no <ul class="project__tech" data-tech="…"></ul> slot for ${missing.join(', ')}. ` +
        'The slot must be empty and written exactly that way — this fills it, nothing else does.',
    );
  }
  return out;
}

export function projectTags(): Plugin {
  return {
    name: 'project-tags',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => fillTags(html),
    },
  };
}
