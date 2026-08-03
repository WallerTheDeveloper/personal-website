/**
 * The dial's honesty, tested where it actually lives.
 *
 * `LoadingRing` is a few DOM writes around one curve, and every guarantee the
 * loading screen rests on is a property of that curve rather than of the
 * writing: the dial only ever moves forward, it never reads a milestone that has
 * not happened, and it cannot arrive at 100 on its own. In a browser those need
 * a stalled engine chunk and a second of wall-clock to observe — `loading.spec.ts`
 * does exactly that, once, end to end. Here they are assertions about a function.
 *
 * The boundary cases below are the ones a real boot produces: a chunk that lands
 * almost immediately (a warm cache, so a phase begins far below its floor), and
 * one that never lands at all (the stall the watchdog exists for, where the
 * curve has to stay bounded for the full twelve seconds).
 */

import { describe, expect, it } from 'vitest';

import { RING_PHASES, ringValue } from '../../src/loading-ring';

/** Phase 0's shape, used wherever the specific numbers do not matter. */
const P0 = RING_PHASES[0]!;

describe('ringValue', () => {
  it('starts exactly where the phase started', () => {
    // The re-base on a milestone: whatever was on screen is what the next phase
    // continues from, with no jump at the seam.
    expect(ringValue(0, P0.ceil, P0.tau, 0)).toBe(0);
    expect(ringValue(43.5, 90, 450, 0)).toBe(43.5);
  });

  it('stays under the ceiling for the whole of a stalled boot', () => {
    // The whole basis for "the dial cannot claim a milestone early", asserted at
    // the duration that actually occurs: a stall sits here for the full
    // LOADER_TIMEOUT_MS (12 s, `router.ts`) before the document flattens.
    expect(ringValue(0, 70, 900, 12_000)).toBeLessThan(70);
  });

  it('is bounded by the ceiling however long the phase runs', () => {
    // Past roughly 30 τ the curve settles *on* the ceiling rather than below it:
    // `Math.exp` of a large negative underflows to zero and the span is added
    // whole. Harmless — a ceiling is the floor of the next phase, and the last
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
      const v = ringValue(0, P0.ceil, P0.tau, t);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });

  it('stays under its ceiling from a phase that began early', () => {
    // A warm cache: the import resolves at ~4 %, so phase 1 re-bases far below
    // its floor and has a much longer way to climb. It still cannot cross.
    expect(ringValue(4, 90, 450, 0)).toBe(4);
    expect(ringValue(4, 90, 450, 450)).toBeGreaterThan(4);
    expect(ringValue(4, 90, 450, 20_000)).toBeLessThanOrEqual(90);
  });

  it('is total for a phase already at or past its ceiling', () => {
    // Unreachable with RING_PHASES as written, since the ceilings rise. Asserted
    // so that reordering them can only cost pacing, never a backwards dial.
    expect(ringValue(90, 90, 300, 1_000)).toBe(90);
    expect(ringValue(95, 90, 300, 1_000)).toBe(95);
  });
});

describe('RING_PHASES', () => {
  it('rises monotonically, which is what makes the dial monotonic', () => {
    // Each milestone re-bases at the value on screen — always below the ceiling
    // it was approaching — and the next ceiling has to be above that.
    const ceilings = RING_PHASES.map((p) => p.ceil);
    expect(ceilings).toEqual([...ceilings].sort((a, b) => a - b));
    expect(new Set(ceilings).size).toBe(ceilings.length);
  });

  it('leaves the last percent to the scene actually being up', () => {
    // The final phase stops short of 100 so that `complete()` is the only writer
    // of it. A ceiling of 100 here would let the curve print a finished boot
    // while the visitor is still looking at the void.
    expect(RING_PHASES[RING_PHASES.length - 1]!.ceil).toBeLessThan(100);
  });

  it('covers the three milestones the router reports', () => {
    // `mount()` starts phase 0; `load()` and `boot()` advance to 1 and 2. A
    // fourth phase with no caller, or a missing third, would be silent.
    expect(RING_PHASES).toHaveLength(3);
  });
});
