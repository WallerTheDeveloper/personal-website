/**
 * The byte counter behind the loading dial's first and largest span.
 *
 * `warmEngineChunk` exists to make one number real: how much of the ~510 KB
 * engine chunk has arrived. Everything worth asserting about it is about what it
 * does when it *cannot* — because that is the path nobody sees in a browser, and
 * getting it wrong is expensive in two different directions:
 *
 *   - draining a body it cannot measure would download half a megabyte for
 *     nothing, twice, on the phone this whole change is for;
 *   - throwing would take the boot down over a progress readout.
 *
 * So the shape under test is: measurable → stream it and report; anything else →
 * `false`, untouched body, no throw.
 */

import { describe, expect, it, vi } from 'vitest';

import { engineChunkUrl, warmEngineChunk } from '../../src/boot-progress';

/** A response whose body yields `chunks`, and records whether it was read. */
function streamed(
  chunks: readonly number[],
  headers: Readonly<Record<string, string>> = {},
  ok = true,
): { response: Response; read: () => boolean } {
  let opened = false;
  const total = chunks.reduce((sum, n) => sum + n, 0);
  let i = 0;
  const response = {
    ok,
    headers: {
      get: (name: string): string | null =>
        name.toLowerCase() === 'content-length' && !('none' in headers)
          ? (headers['content-length'] ?? String(total))
          : (headers[name.toLowerCase()] ?? null),
    },
    body: {
      getReader: () => {
        opened = true;
        return {
          read: (): Promise<{ done: boolean; value?: Uint8Array }> => {
            const size = chunks[i];
            i += 1;
            return Promise.resolve(
              size === undefined ? { done: true } : { done: false, value: new Uint8Array(size) },
            );
          },
        };
      },
    },
  } as unknown as Response;
  return { response, read: () => opened };
}

const fetchOf = (response: Response): typeof fetch =>
  vi.fn().mockResolvedValue(response) as unknown as typeof fetch;

describe('warmEngineChunk', () => {
  it('reports a rising fraction and finishes at 1', async () => {
    const seen: number[] = [];
    const { response } = streamed([100, 100, 200]);

    const measured = await warmEngineChunk('/hub.js', (f) => seen.push(f), fetchOf(response));

    expect(measured).toBe(true);
    expect(seen).toEqual([0.25, 0.5, 1]);
  });

  it('never reports past 1, even if the server oversends', async () => {
    // A `content-length` is a promise, not a guarantee, and a fraction above 1
    // would push the dial's floor past the download span and into the next one —
    // claiming planets were baked because bytes were miscounted.
    const seen: number[] = [];
    const { response } = streamed([600, 600], { 'content-length': '1000' });

    await warmEngineChunk('/hub.js', (f) => seen.push(f), fetchOf(response));

    expect(Math.max(...seen)).toBe(1);
  });

  it('declines a response with no content-length, without reading the body', async () => {
    // The expensive mistake: no denominator means no progress, and draining the
    // body anyway would download the chunk once here and again for `import()`.
    const { response, read } = streamed([100], { none: '' });

    const measured = await warmEngineChunk('/hub.js', () => undefined, fetchOf(response));

    expect(measured).toBe(false);
    expect(read()).toBe(false);
  });

  it('declines a zero or unparseable content-length', async () => {
    for (const value of ['0', '', 'gzip']) {
      const { response, read } = streamed([100], { 'content-length': value });
      expect(await warmEngineChunk('/hub.js', () => undefined, fetchOf(response))).toBe(false);
      expect(read()).toBe(false);
    }
  });

  it('declines a non-ok response without reading it', async () => {
    const { response, read } = streamed([100], {}, false);

    expect(await warmEngineChunk('/hub.js', () => undefined, fetchOf(response))).toBe(false);
    expect(read()).toBe(false);
  });

  it('resolves false rather than throwing when the request fails', async () => {
    // A blocked request, an offline browser, a CSP refusal. None of them are
    // reasons not to boot — `import()` still runs, and the dial falls back to
    // its idle drift.
    const failing = vi.fn().mockRejectedValue(new Error('blocked')) as unknown as typeof fetch;

    await expect(warmEngineChunk('/hub.js', () => undefined, failing)).resolves.toBe(false);
  });

  it('resolves false rather than throwing when the stream breaks mid-body', async () => {
    const response = {
      ok: true,
      headers: { get: () => '1000' },
      body: {
        getReader: () => ({ read: () => Promise.reject(new Error('reset')) }),
      },
    } as unknown as Response;

    await expect(warmEngineChunk('/hub.js', () => undefined, fetchOf(response))).resolves.toBe(
      false,
    );
  });
});

describe('engineChunkUrl', () => {
  /** A document carrying `content`, or no meta tag at all when it is null. */
  function docWith(content: string | null): Document {
    return {
      querySelector: (): { content: string } | null =>
        content === null ? null : { content },
    } as unknown as Document;
  }

  it('reads the URL the build plugin wrote', () => {
    expect(engineChunkUrl(docWith('/personal-website/assets/hub-abc123.js'))).toBe(
      '/personal-website/assets/hub-abc123.js',
    );
  });

  it('is null when the tag is absent or empty', () => {
    // Both are the same outcome for the caller: skip the stream, import
    // normally, let the dial drift. A build that could not find the chunk has to
    // degrade, not break.
    expect(engineChunkUrl(docWith(null))).toBeNull();
    expect(engineChunkUrl(docWith(''))).toBeNull();
    expect(engineChunkUrl(docWith('   '))).toBeNull();
  });
});
