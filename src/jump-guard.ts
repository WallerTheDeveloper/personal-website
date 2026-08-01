/**
 * The completion guard behind `Router.jump()`.
 *
 * A jump has two independent ways to land — the warp's own `clear()` promise
 * and a watchdog timer at `COVER + CLEAR + WATCHDOG_SLACK` — and a third way to
 * reach its commit, `cover()`'s `onOpaque`. Any of them may arrive first, twice,
 * or long after the visitor has asked for somewhere else entirely. Two rules
 * make that safe, and both were bought with debugging time (see `router.ts`'s
 * header):
 *
 *   - **The commit runs exactly once per jump.** Whichever path reaches it
 *     first swaps the destination in; the others find the work done.
 *   - **A superseded jump can no longer finish anything.** Every `begin()`
 *     invalidates the jumps before it, so a stalled promise resolving three
 *     seconds late cannot release the transition flag out from under the jump
 *     that replaced it, nor hide a warp canvas that now belongs to someone else.
 *
 * `finish()` deliberately is *not* once-only: for a jump that is still current
 * it re-runs `settle`, and every step in the router's `settle` is idempotent by
 * construction. Gating it would add a second way to wedge routing in exchange
 * for nothing.
 *
 * This lives in its own module because it is the one piece of `jump()` that is
 * pure state machine — no DOM, no timers, no engine — and therefore the one
 * piece that can be tested directly rather than inferred from a browser.
 */

export interface JumpSteps {
  /** Swap the destination in, under full cover. Runs at most once per jump. */
  readonly commit: () => void;
  /**
   * Everything after the swap: clear the watchdog, drop the warp, hide the warp
   * canvas, release the transition flag, drain the queue. Must be safe to run
   * more than once.
   */
  readonly settle: () => void;
}

export interface Jump {
  /** Still the newest jump? `false` once a later one has begun. */
  readonly live: boolean;
  /** Swap the destination in now. First call wins; the rest are no-ops. */
  readonly commit: () => void;
  /** Land the jump: commit, then settle. Inert once superseded. */
  readonly finish: () => void;
}

export class JumpGuard {
  /** Monotonic. Only the newest token may still finish. */
  private token = 0;

  /**
   * Begin a jump. Every jump begun before this one is superseded from here on,
   * whatever state it was left in.
   */
  begin(steps: JumpSteps): Jump {
    const token = ++this.token;
    const live = (): boolean => token === this.token;

    let committed = false;
    const commit = (): void => {
      if (committed) return;
      // Set before the call, not after: a commit that throws must not leave the
      // door open for a second attempt at the same swap.
      committed = true;
      steps.commit();
    };

    return {
      get live(): boolean {
        return live();
      },
      commit,
      finish: (): void => {
        if (!live()) return;
        commit();
        steps.settle();
      },
    };
  }
}
