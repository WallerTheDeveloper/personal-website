/**
 * The brand marks every chip draws, each written into the document **once**.
 *
 * A chip carries `<use href="#si-<slug>"/>`, and this writes one hidden inline
 * `<svg>` holding a `<symbol>` per distinct slug, straight after `<body>`. Inline
 * paths per chip were the first shape of this, and they stopped scaling when the
 * About panel's skills joined the project rows: the same Python, Rust and
 * PostgreSQL marks were written two and three times over, and `simple-icons`
 * path data barely compresses. The sprite keeps a text-edition visitor's first
 * load inside the budget `tests/unit/build-artifact.test.ts` holds it to.
 *
 * Still inline, still in the served bytes, still no request: the text edition
 * and the printed CV draw the marks with no JS and nothing fetched, and
 * `simple-icons` stays a devDependency read only here, during the build.
 *
 * Runs after `project-tags` and `skill-tags`, and works from the `<use>`
 * references they left rather than from a list of its own, so a mark no chip
 * draws is never shipped.
 */

import * as simpleIcons from 'simple-icons';
import type { SimpleIcon } from 'simple-icons';
import type { Plugin } from 'vite';

/**
 * Every icon in the set, by slug. Built once, and only ever in the build — the
 * namespace import is ~3,500 icons, which is free here and unthinkable in the
 * bundle. Keyed off `icon.slug` rather than the `si…` export name so nothing
 * here has to reimplement the library's slug-to-identifier mangling.
 */
const BY_SLUG: ReadonlyMap<string, SimpleIcon> = new Map(
  Object.values<SimpleIcon>(simpleIcons).map((icon) => [icon.slug, icon]),
);

/**
 * Path data, and nothing that could be read as markup. `simple-icons` is a
 * trusted dependency, but its `path` is written straight into an attribute in a
 * document that has no other unescaped interpolation — so it is checked rather
 * than assumed.
 */
const PATH_DATA = /^[Mm][\d\s.,\-A-Za-z]+$/;

/** A chip's reference to a mark. Slugs are `[a-z0-9]+`, so the id needs no escaping. */
const USE = /<use href="#si-([a-z0-9]+)"\/>/g;

/** The id a mark's `<symbol>` carries, and a chip's `<use>` points at. */
export function symbolId(slug: string): string {
  return `si-${slug}`;
}

/**
 * The mark for a slug, or a build failure. `label` is only for the message:
 * it is what the owner wrote, and so what they will search for.
 */
export function markFor(slug: string, label: string): SimpleIcon {
  const mark = BY_SLUG.get(slug);
  if (mark === undefined) {
    throw new Error(
      `[icon-sprite] "${slug}" (tagged "${label}") is not a simple-icons slug. ` +
        'Check it at https://simple-icons.org — or drop the `icon` field and let the chip be text only, ' +
        'which is what a brand with no mark in the set is supposed to look like.',
    );
  }
  if (!PATH_DATA.test(mark.path)) {
    throw new Error(`[icon-sprite] the "${slug}" path is not plain path data.`);
  }
  return mark;
}

/**
 * One `<symbol>` per mark. `fill="currentColor"` sits on the path, where it
 * resolves against the `<use>` that clones it — so each chip's `color` tints its
 * own copy. No `fill-rule`: simple-icons paths are authored for the default
 * `nonzero`, and forcing `evenodd` punches holes in the ones with counters.
 */
function symbolFor(slug: string): string {
  const mark = markFor(slug, slug);
  return `<symbol id="${symbolId(slug)}" viewBox="0 0 24 24"><path fill="currentColor" d="${mark.path}"/></symbol>`;
}

/**
 * Pure. Writes the sprite for whatever the document references, in first-use
 * order, and nothing when it references nothing.
 */
export function fillSprite(html: string): string {
  const slugs = [...new Set(Array.from(html.matchAll(USE), (m) => m[1] as string))];
  if (slugs.length === 0) return html;

  if (!html.includes('<body>')) {
    throw new Error('[icon-sprite] chips reference marks, but there is no bare <body> to put them after.');
  }
  // `aria-hidden` and zero-size rather than `display: none`: the symbols are
  // drawing source, not content, and a `display: none` sprite is the one shape
  // older engines have refused to clone from.
  const sprite =
    '<svg class="icon-sprite" aria-hidden="true" focusable="false">' +
    slugs.map(symbolFor).join('') +
    '</svg>';
  return html.replace('<body>', `<body>\n${sprite}`);
}

export function iconSprite(): Plugin {
  return {
    name: 'icon-sprite',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => fillSprite(html),
    },
  };
}
