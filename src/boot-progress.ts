/**
 * Real byte progress for the engine download.
 *
 * `await import('./hub')` reports nothing on the way — it either has the module
 * or it does not. That is why the loading dial used to spend the longest part of
 * the boot drifting toward a ceiling on a guessed curve: there was no finer
 * signal to read.
 *
 * There is one now. The built site is a *single* chunk — `assets/hub-*.js`, about
 * 510 KB of three.js plus the whole engine, against a 24 KB entry — so on any
 * connection slow enough for a visitor to notice, that one file *is* the wait.
 * Streaming it with `fetch` gives a byte count, and the `import()` that follows
 * resolves out of the HTTP cache the stream just filled.
 *
 * Two rules keep this from ever costing more than it gives:
 *
 *   - **Measurable or nothing.** No `content-length`, a non-`ok` response, or no
 *     `ReadableStream` and it returns `false` *without reading the body*. The
 *     caller then falls back to the idle drift and lets `import()` do the
 *     download itself. The worst case is the dial we had before, never two
 *     downloads of half a megabyte.
 *   - **Never fatal.** This feeds a progress readout. Anything that goes wrong
 *     here resolves `false`; the boot is not this function's to fail.
 *
 * The body is read to the end and discarded a chunk at a time — the bytes are
 * only wanted for the cache entry, and holding 510 KB of them to throw away
 * afterwards would be the one allocation in the boot worth avoiding.
 */

/** The URL the plugin in `build/engine-chunk.ts` wrote into the document head. */
export function engineChunkUrl(doc: Document = document): string | null {
  const meta = doc.querySelector<HTMLMetaElement>('meta[name="dg-engine-chunk"]');
  const url = meta?.content?.trim();
  return url !== undefined && url !== '' ? url : null;
}

/**
 * Streams `url` to warm the HTTP cache, reporting 0…1 as the bytes arrive.
 *
 * Resolves `true` only if the whole body was measured and streamed — that is the
 * caller's signal that the dial was reading real data and the idle drift is not
 * needed for this span.
 */
export async function warmEngineChunk(
  url: string,
  onProgress: (fraction: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(url, { credentials: 'same-origin' });
    if (!response.ok) return false;

    const total = Number(response.headers.get('content-length'));
    // Not a number, zero, or absent: there is no denominator, so there is no
    // progress to report. Returning before touching `body` leaves the response
    // unread and the download to `import()`.
    if (!Number.isFinite(total) || total <= 0) return false;

    const body = response.body;
    if (body === null || typeof body.getReader !== 'function') return false;

    const reader = body.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.byteLength ?? 0;
      // Clamped: a server may send more than it promised, and a dial that read
      // past its own span would push the next stage's floor up with it.
      onProgress(Math.min(received / total, 1));
    }
    return true;
  } catch {
    // A blocked request, an aborted stream, a browser without `fetch` at all.
    // None of them are reasons not to boot.
    return false;
  }
}
