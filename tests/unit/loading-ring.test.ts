/**
 * The dial's honesty, tested where it actually lives.
 *
 * `LoadingRing` is a few DOM writes around two curves, and every guarantee the
 * loading screen rests on is a property of those curves rather than of the
 * writing:
 *
 *   - the arc only ever moves forward;
 *   - it never passes the floor it was told about, so it can never show progress
 *     that has not happened;
 *   - it cannot arrive at 100 on its own.
 *
 * In a browser those need a stalled engine chunk and a second of wall-clock to
 * observe — `loading.spec.ts` does exactly that, once, end to end. Here they are
 * assertions about two functions.
 *
 * The boundary cases below are the ones a real boot produces: a chunk that lands
 * almost immediately (a warm cache, so the floor jumps a long way at once — the
 * "5 % then suddenly 100 %" this model replaced), and one that never lands at all
 * (the stall the watchdog exists for, where the idle drift has to stay bounded
 * for the full twelve seconds).
 */

import { describe, expect, it } from 'vitest';

import { catchUp, RING_STAGES, ringValue } from '../../src/loading-ring';

describe('ringValue — the idle drift', () => {
  it('starts exactly where the span started', () => {
    // No jump at the seam: whatever is on screen is what the drift continues
    // from.
    expect(ringValue(0, RING_STAGES.download.ceil, RING_STAGES.download.tau, 0)).toBe(0);
    expect(ringValue(43.5, 90, 450, 0)).toBe(43.5);
  });

  it('stays under the ceiling for the whole of a stalled boot', () => {
    // The whole basis for "the dial cannot claim a milestone early", asserted at
    // the duration that actually occurs: a stall sits here for the full
    // LOADER_TIMEOUT_MS (12 s, `router.ts`) before the document flattens.
    expect(ringValue(0, 70, 900, 12_000)).toBeLessThan(70);
  });

  it('is bounded by the ceiling however long the span runs', () => {
    // Past roughly 30 τ the curve settles *on* the ceiling rather than below it:
    // `Math.exp` of a large negative underflows to zero and the span is added
    // whole. Harmless — a ceiling is the start of the next span, and the last
    // one is 99 — but the strict form above would be false here.
    expect(ringValue(0, 70, 900, 10 ** 6)).toBeLessThanOrEqual(70);
  });

  it('closes most of the gap within one time constant', () => {
    // ~63 % of the span, which is what makes the pacing a decision about τ
    // rather than about the curve.
    const oneTau = ringValue(0, 100, 500, 500);
    expect(oneTau).toBeGreaterThan(62);
    expect(oneTau).toBeLessThan(64);
  });

  it('only ever moves forward', () => {
    let last = -1;
    for (let t = 0; t <= 4_000; t += 50) {
      const v = ringValue(0, RING_STAGES.download.ceil, RING_STAGES.download.tau, t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('is total for a span already at or past its ceiling', () => {
    // Unreachable with RING_STAGES as written, since the ceilings rise. Asserted
    // so that reordering them can only cost pacing, never a backwards dial.
    expect(ringValue(90, 90, 300, 1_000)).toBe(90);
    expect(ringValue(95, 90, 300, 1_000)).toBe(95);
  });
});

describe('catchUp — the arc chasing the floor', () => {
  it('never passes the floor', () => {
    // This single property is the dial's honesty. `report()` is what has
    // genuinely happened; the arc is only allowed to approach it.
    for (const dt of [1, 16, 100, 1_000, 60_000]) {
      expect(catchUp(0, 70, dt)).toBeLessThanOrEqual(70);
      expect(catchUp(69.9, 70, dt)).toBeLessThanOrEqual(70);
    }
  });

  it('crosses a large jump over several frames, not one', () => {
    // The bug this model replaced: a warm cache resolved the chunk at ~4 % and
    // the dial went there and to 100 within a few frames. One 16 ms frame must
    // cover only a fraction of a 0 → 70 step.
    const afterOneFrame = catchUp(0, 70, 16);
    expect(afterOneFrame).toBeGreaterThan(0);
    expect(afterOneFrame).toBeLessThan(70 * 0.15);
  });

  it('still arrives promptly — a step is a glide, not a crawl', () => {
    // The counterweight to the test above. The hold at 100 is measured from the
    // arc landing, so a ramp that took seconds would be felt as a stall.
    expect(catchUp(0, 70, 600)).toBeGreaterThan(70 * 0.9);
  });

  it('settles exactly on the floor rather than approaching it forever', () => {
    // `complete()` resolves on `at >= 100`; an asymptote that never quite
    // arrives would leave the loading screen up until its watchdog fired.
    expect(catchUp(99.99, 100, 16)).toBe(100);
    expect(catchUp(0, 100, 10_000)).toBe(100);
  });

  it('only ever moves forward', () => {
    let at = 0;
    for (let i = 0; i < 200; i += 1) {
      const next = catchUp(at, 70, 16);
      expect(next).toBeGreaterThanOrEqual(at);
      at = next;
    }
  });

  it('does not move for a floor at or below the arc', () => {
    // `report()` is monotonic, but a caller reporting the same value twice — or
    // the idle drift being retired below the arc — must not rewind it.
    expect(catchUp(50, 50, 16)).toBe(50);
    expect(catchUp(50, 20, 16)).toBe(50);
  });

  it('does not move on a zero or backwards clock', () => {
    expect(catchUp(10, 70, 0)).toBe(10);
    expect(catchUp(10, 70, -5)).toBe(10);
  });
});

describe('RING_STAGES', () => {
  it('rises monotonically, which is what makes the dial monotonic', () => {
    const ceilings = [
      RING_STAGES.download.ceil,
      RING_STAGES.build.ceil,
      RING_STAGES.frame.ceil,
    ];
    expect(ceilings).toEqual([...ceilings].sort((a, b) => a - b));
    expect(new Set(ceilings).size).toBe(ceilings.length);
  });

  it('leaves the last percent to the scene actually being up', () => {
    // The final span stops short of 100 so that `complete()` is the only writer
    // of it. A ceiling of 100 here would let the curve print a finished boot
    // while the visitor is still looking at the void.
    expect(RING_STAGES.frame.ceil).toBeLessThan(100);
  });

  it('gives the download the largest span', () => {
    // 510 KB of chunk against four local bakes and one frame. The band widths
    // are meant to track where the time actually goes, and the download is the
    // only one that scales with the visitor's connection.
    const download = RING_STAGES.download.ceil;
    const build = RING_STAGES.build.ceil - RING_STAGES.download.ceil;
    const frame = RING_STAGES.frame.ceil - RING_STAGES.build.ceil;
    expect(download).toBeGreaterThan(build);
    expect(download).toBeGreaterThan(frame);
  });
});
