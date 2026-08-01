/**
 * `finish()`'s two rules, tested directly (PORT_PLAN step 11 — "the `finish()`
 * token/idempotency logic (pure, extract it if needed)").
 *
 * Each test below is a state this transition genuinely reaches: a warp promise
 * resolving after the visitor has already asked for somewhere else, a watchdog
 * firing beside an animation that has just landed, a commit reached twice from
 * two different paths. In a browser they need a stalled transition and precise
 * timing to set up; here they are three lines each, which is the whole point of
 * the extraction.
 *
 * **This file is the only place the superseded rule is observable.** From
 * outside, a jump has three independent ways to land, so a stale `finish()`
 * against a live jump does cleanup that jump was about to do anyway and the end
 * state converges — an e2e test written for it passed with the check deleted.
 * See the note above the last describe block in `tests/e2e/resilience.spec.ts`,
 * which covers the sequence end to end but cannot pin this.
 */

import { describe, expect, it, vi } from 'vitest';

import { JumpGuard } from '../../src/jump-guard';

/** A jump whose steps just record that they ran. */
function spyJump(guard: JumpGuard) {
  const commit = vi.fn();
  const settle = vi.fn();
  return { jump: guard.begin({ commit, settle }), commit, settle };
}

describe('commit-once', () => {
  it('swaps the destination in on the first call only', () => {
    const { jump, commit } = spyJump(new JumpGuard());

    jump.commit();
    jump.commit();
    jump.commit();

    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('is reached once whether the animation or the watchdog lands first', () => {
    // `cover()`'s `onOpaque` fires the commit under full cover; `finish()`
    // commits again in case it never did. Exactly one swap either way.
    const opaqueFirst = spyJump(new JumpGuard());
    opaqueFirst.jump.commit();
    opaqueFirst.jump.finish();
    expect(opaqueFirst.commit).toHaveBeenCalledTimes(1);

    const finishFirst = spyJump(new JumpGuard());
    finishFirst.jump.finish();
    finishFirst.jump.commit();
    expect(finishFirst.commit).toHaveBeenCalledTimes(1);
  });

  it('does not retry a commit that threw', () => {
    const guard = new JumpGuard();
    const commit = vi.fn(() => {
      throw new Error('commit blew up');
    });
    const jump = guard.begin({ commit, settle: vi.fn() });

    expect(() => jump.commit()).toThrow('commit blew up');
    jump.commit();

    // Half-applied is bad; half-applied twice is worse. The watchdog behind
    // this one still runs `settle`, so routing is released either way.
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe('finish', () => {
  it('commits and then settles, in that order', () => {
    const order: string[] = [];
    const jump = new JumpGuard().begin({
      commit: () => order.push('commit'),
      settle: () => order.push('settle'),
    });

    jump.finish();

    // The swap happens under full cover; settling is what takes the cover down.
    // Reversed, the visitor would watch the panel assemble.
    expect(order).toEqual(['commit', 'settle']);
  });

  it('is safe to call more than once', () => {
    const { jump, commit, settle } = spyJump(new JumpGuard());

    jump.finish();
    jump.finish();

    expect(commit).toHaveBeenCalledTimes(1);
    // `settle` is deliberately not gated: every step of the router's is
    // idempotent, and gating it would add a second way to leave `going` set.
    expect(settle).toHaveBeenCalledTimes(2);
  });
});

describe('superseding', () => {
  it('leaves the newest jump live and every earlier one not', () => {
    const guard = new JumpGuard();
    const first = guard.begin({ commit: vi.fn(), settle: vi.fn() });
    expect(first.live).toBe(true);

    const second = guard.begin({ commit: vi.fn(), settle: vi.fn() });
    expect(first.live).toBe(false);
    expect(second.live).toBe(true);
  });

  it('ignores a superseded finish entirely', () => {
    const guard = new JumpGuard();
    const stalled = spyJump(guard);
    const current = spyJump(guard);

    // The stalled jump's `clear()` finally resolves, three seconds late.
    stalled.jump.finish();

    expect(stalled.commit).not.toHaveBeenCalled();
    // This is the one that matters: `settle` releases `going`, hides #smoke and
    // drains the queue. Running it here would tear down the transition that is
    // on screen right now.
    expect(stalled.settle).not.toHaveBeenCalled();
    expect(current.settle).not.toHaveBeenCalled();
  });

  it('still lets a superseded jump commit, because its content is already up', () => {
    // `onOpaque` belongs to that jump's own warp, which owns the screen until
    // its `dispose()`. Blocking it would show a bare panel under a lifting
    // cover; the guard only stops a *superseded* jump from settling.
    const guard = new JumpGuard();
    const first = spyJump(guard);
    guard.begin({ commit: vi.fn(), settle: vi.fn() });

    first.jump.commit();

    expect(first.commit).toHaveBeenCalledTimes(1);
  });

  it('does not resurrect an earlier jump when a later one is superseded in turn', () => {
    const guard = new JumpGuard();
    const first = spyJump(guard);
    const second = spyJump(guard);
    const third = spyJump(guard);

    first.jump.finish();
    second.jump.finish();
    third.jump.finish();

    expect(first.settle).not.toHaveBeenCalled();
    expect(second.settle).not.toHaveBeenCalled();
    expect(third.settle).toHaveBeenCalledTimes(1);
  });
});
