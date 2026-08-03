/**
 * Writes the engine chunk's URL into the document head, so the boot can stream it
 * for a byte count before importing it (`src/boot-progress.ts`).
 *
 * The URL is only knowable here. In dev the module is served at its source path;
 * in a build it is content-hashed, and the hash changes with every edit to the
 * engine — hard-coding either one ships a dial that silently reads nothing the
 * moment the other is in play.
 *
 * A meta tag rather than an inline script: the text edition is the default state
 * and must be complete with scripting off, so nothing in `<head>` should need to
 * *run* for the document to be correct. If the tag is missing the dial falls back
 * to its idle drift, which is exactly the behaviour that shipped before this
 * existed — so a build that cannot find the chunk degrades rather than breaks.
 */

import type { Plugin } from 'vite';

/** Where `vite dev` serves the engine module. */
const DEV_URL = '/src/hub.ts';

/** Enough of a Rollup output entry to find the chunk. Structural, so the pure
 *  function below can be tested against plain objects. */
export interface BundledChunk {
  readonly type: string;
  readonly fileName: string;
  readonly facadeModuleId?: string | null;
}

/**
 * The built engine chunk's file name, or `null` if the bundle has no such chunk.
 *
 * Pure, and exported for its own unit test: this is the one place a bundle turns
 * into the URL the dial reads, and getting it wrong is invisible at runtime — the
 * dial simply falls back and nobody notices the byte count went away.
 *
 * Matched on the module it fronts rather than on its name, because the name is
 * Rollup's to choose. The file-name pattern is kept as a fallback for the case
 * where the chunk is reached through a dynamic import with no facade.
 */
export function findEngineChunk(bundle: Readonly<Record<string, BundledChunk>>): string | null {
  const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk');
  const byModule = chunks.find((entry) =>
    // Rollup reports the absolute path, with the host's separators.
    (entry.facadeModuleId ?? '').replace(/\\/g, '/').endsWith('/src/hub.ts'),
  );
  if (byModule !== undefined) return byModule.fileName;
  return chunks.find((entry) => /(?:^|\/)hub-[^/]*\.js$/.test(entry.fileName))?.fileName ?? null;
}

/** `base` and a bundle-relative file name, joined without doubling the slash. */
export function joinBase(base: string, fileName: string): string {
  return base.endsWith('/') ? `${base}${fileName}` : `${base}/${fileName}`;
}

export function engineChunk(): Plugin {
  let base = '/';
  return {
    name: 'engine-chunk',
    configResolved(config): void {
      base = config.base;
    },
    transformIndexHtml: {
      // `post` is what puts `ctx.bundle` in reach: it runs the hook from
      // `generateBundle`, by which point the chunks have their final names.
      order: 'post',
      handler(html: string, ctx) {
        const url =
          ctx.bundle === undefined
            ? DEV_URL
            : (() => {
                const file = findEngineChunk(ctx.bundle as Record<string, BundledChunk>);
                return file === null ? null : joinBase(base, file);
              })();
        if (url === null) return html;
        return {
          html,
          tags: [
            {
              tag: 'meta',
              attrs: { name: 'dg-engine-chunk', content: url },
              injectTo: 'head' as const,
            },
          ],
        };
      },
    },
  };
}
