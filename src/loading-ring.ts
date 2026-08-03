/**
 * The loading screen's progress dial.
 *
 * The hairline this replaced was indeterminate on purpose — `import()` reports
 * no progress and the bakes are synchronous, so there was nothing to read. A
 * determinate dial is only defensible if it reads something real, and what is
 * real here are the three events the router already passes through on its way to
 * a first frame:
 *
 *   0. the engine chunk resolves — the download, and the whole transfer budget
 *   1. `initHub()` returns — the ten planet textures are baked and the scene built
 *   2. the second `requestAnimationFrame` — the first frame is composited, which
 *      is where the shader programs actually compile
 *
 * Each is a floor the dial may not pass until that event has happened. Inside a
 * phase the value eases toward the *next* floor asymptotically, so it always
 * moves — a slow connection sees the dial approach 70 and wait there rather than
 * freeze at zero — and it can never arrive early: the curve is bounded by its
 * ceiling, and the last ceiling is 99, so only `complete()` writes 100.
 *
 * "Bounded by", not "below": in float64 a long enough phase settles exactly on
 * its ceiling, because `Math.exp` of a large negative underflows to zero. That
 * costs nothing — the ceilings are floors of the *next* phase, and the readout
 * is clamped besides — but it is why the tests assert `≤` past ~30 τ.
 *
 * Two things follow from that and are worth stating, because both are the sort
 * of thing a later "tidy" would undo:
 *
 *   - **The number never reads 100 before the scene is up.** It is floored and
 *     clamped to 99 while the loop is running. `complete()` is the only writer of
 *     100, and the router calls it from `dismissLoader()`.
 *   - **The loop must be stopped from every exit.** A stalled boot flattens the
 *     document without ever reaching `complete()`, and a `requestAnimationFrame`
 *     left running against a hidden element would outlive the screen it draws.
 *     `stop()` is that exit, and it is idempotent.
 *
 * The per-frame writes allocate two short strings. That is fine here and only
 * here: this runs during the boot gap and stops at the first painted frame — it
 * is not the render loop, which stays allocation-free (CLAUDE.md).
 */

/** One segment of the boot: the floor it eases toward, and how fast. */
export interface RingPhase {
  /** The value this phase approaches but never reaches. */
  readonly ceil: number;
  /** Time constant, ms. The phase covers ~63 % of its span in one τ. */
  readonly tau: number;
}

/**
 * Indexed by phase. `ceil` rises monotonically, which is what makes the dial
 * monotonic: a milestone re-bases the curve at the value on screen, and the next
 * ceiling is always above the last one.
 *
 * The τ values are the shape of a *typical* boot, not a promise about one. They
 * only decide how quickly the dial approaches a floor it cannot cross, so being
 * wrong about them costs pacing, never correctness.
 */
export const RING_PHASES: readonly RingPhase[] = [
  { ceil: 70, tau: 900 },
  { ceil: 90, tau: 450 },
  { ceil: 99, tau: 300 },
];

/** How often the dial is repainted under `prefers-reduced-motion`, ms. */
const REDUCED_STEP_MS = 400;

/**
 * The dial value inside a phase: an asymptotic approach from `from` toward
 * `ceil`, never arriving.
 *
 * Pure, and exported for its own unit tests — the guarantees the dial rests on
 * (monotonic, bounded below by `from`, bounded above by `ceil`) are properties of
 * this function alone, so they can be asserted directly rather than inferred
 * from a browser.
 */
export function ringValue(from: number, ceil: number, tau: number, elapsedMs: number): number {
  // A phase that starts at or past its own ceiling has nothing to add. Cannot
  // happen with `RING_PHASES` as written; kept so the function is total.
  if (elapsedMs <= 0 || from >= ceil) return from;
  return from + (ceil - from) * (1 - Math.exp(-elapsedMs / tau));
}

export class LoadingRing {
  /** Circumference, derived from the markup's `r` so geometry lives in one place. */
  private readonly len: number;

  private phase = 0;
  /** Where the current phase started — the value that was on screen. */
  private from = 0;
  /** The value on screen now. */
  private at = 0;
  /** The last integer written, so a repaint does not touch the DOM needlessly. */
  private shown = -1;
  private since = 0;

  private frame = 0;
  private ticker = 0;
  /** Set by `stop()`/`complete()`. A dead dial ignores everything after it. */
  private dead = false;

  private readonly onFrame = (): void => {
    this.tick();
    this.frame = requestAnimationFrame(this.onFrame);
  };

  constructor(
    private readonly arc: SVGCircleElement,
    private readonly readout: HTMLElement,
    /**
     * Under reduce the same curve is sampled on a timer instead of per frame, so
     * the dial steps rather than glides. It is a readout, like the `#fps` chip,
     * not decoration — stopping it dead would leave an empty ring for the whole
     * of a slow boot.
     */
    private readonly reduce: boolean,
  ) {
    this.len = 2 * Math.PI * arc.r.baseVal.value;
    // The stylesheet ships `stroke-dasharray: 0 999` — an empty ring, which is
    // the honest 0 % for a document whose script has not run yet. From here the
    // dash pattern is one full circumference and `strokeDashoffset` is the value.
    this.arc.style.strokeDasharray = String(this.len);
  }

  /** Begin phase 0 and start driving. */
  start(): void {
    if (this.dead) return;
    this.since = performance.now();
    this.paint();
    if (this.reduce) {
      this.ticker = window.setInterval(() => this.tick(), REDUCED_STEP_MS);
    } else {
      this.frame = requestAnimationFrame(this.onFrame);
    }
  }

  /**
   * A milestone landed: re-base the curve at the value currently on screen and
   * ease toward the next floor. Ignores anything that is not forward progress,
   * so a late or repeated call cannot pull the dial backwards.
   */
  advance(phase: number): void {
    if (this.dead || phase <= this.phase || phase >= RING_PHASES.length) return;
    this.from = this.at;
    this.phase = phase;
    this.since = performance.now();
    this.tick();
  }

  /**
   * The scene is up. The only writer of 100, and the only one entitled to be:
   * the router calls this from `dismissLoader()`, which runs on the frame after
   * the first composited frame. The jump from ~90 happens under the screen's own
   * 400 ms fade.
   */
  complete(): void {
    if (this.dead) return;
    this.stop();
    this.at = 100;
    this.paint();
  }

  /**
   * Stand the dial down without finishing it — a stalled boot flattens the
   * document and never reaches `complete()`. Idempotent, and reachable from
   * `flatten()` and `destroy()` as well.
   */
  stop(): void {
    this.dead = true;
    cancelAnimationFrame(this.frame);
    clearInterval(this.ticker);
    this.frame = 0;
    this.ticker = 0;
  }

  private tick(): void {
    const phase = RING_PHASES[this.phase];
    if (phase === undefined) return;
    const next = ringValue(this.from, phase.ceil, phase.tau, performance.now() - this.since);
    // `ringValue` is monotonic in elapsed time, so this only matters if the
    // clock ever goes backwards. Cheap, and the dial falling back a percent
    // would be the one artefact a visitor is guaranteed to notice.
    this.at = Math.max(this.at, next);
    this.paint();
  }

  private paint(): void {
    this.arc.style.strokeDashoffset = String(this.len * (1 - this.at / 100));
    // Floored and capped at 99 while the loop runs: `complete()` sets `at` to
    // exactly 100 and is the only path that can print it.
    const n = this.at >= 100 ? 100 : Math.min(99, Math.floor(this.at));
    if (n === this.shown) return;
    this.shown = n;
    this.readout.textContent = String(n);
  }
}
