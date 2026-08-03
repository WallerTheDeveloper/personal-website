/**
 * The loading screen's progress dial.
 *
 * The hairline this replaced was indeterminate on purpose — there was nothing to
 * read. A determinate dial is only defensible if it reads something real, so this
 * one is driven entirely by things the boot has genuinely finished:
 *
 *   - **the engine chunk, by the byte** (`src/boot-progress.ts`). One ~510 KB
 *     chunk carries three.js and the whole engine, so on any connection slow
 *     enough to notice, this band *is* the wait, and it is continuous.
 *   - **each planet baked** (`initHub()` yields a paint between them). Four real
 *     ticks, not one guess across the gap.
 *   - **the first composited frame**, where the shader programs compile.
 *
 * Two ideas keep it honest, and both are the sort of thing a later "tidy" would
 * undo:
 *
 *   - **`report()` is a floor, and the arc only ever eases *toward* it.** The
 *     value on screen is therefore always ≤ what has actually happened. Motion is
 *     animated; progress is not invented. That is the same standing the `#fps`
 *     chip has — a readout, smoothed, never ahead of its source.
 *   - **`idle()` is the explicit admission that there is nothing finer to read.**
 *     It is armed only for the two spans that genuinely cannot be subdivided: a
 *     download whose server sent no `content-length`, and the single frame where
 *     the shaders compile. The first `report()` after it retires it, because a
 *     real datum supersedes a guess. A dial that idled *through* real data would
 *     be decoration pretending to be data.
 *
 * The number never reads 100 before the scene is up: it is floored and capped at
 * 99 while the loop runs, and `complete()` is the only writer of 100.
 *
 * The loop must be stopped from every exit. A stalled boot flattens the document
 * without ever reaching `complete()`, and a `requestAnimationFrame` left running
 * against a hidden element would outlive the screen it draws. `stop()` is that
 * exit, it is idempotent, and — like `Warp.dispose()` — it resolves any pending
 * `complete()` so a caller awaiting the ramp cannot be stranded.
 *
 * The per-frame writes allocate two short strings. That is fine here and only
 * here: this runs during the boot gap and stops at the first painted frame — it
 * is not the render loop, which stays allocation-free (CLAUDE.md).
 */

/** One span of the boot: the value it ends on, and how fast it idles there. */
export interface RingStage {
  /** The value this span ends on. `idle()` approaches it but never arrives. */
  readonly ceil: number;
  /** Idle time constant, ms. The curve covers ~63 % of its span in one τ. */
  readonly tau: number;
}

/**
 * The three spans, in order. `ceil` rises monotonically, which is what makes the
 * dial monotonic: each span ends where the next begins.
 *
 * The τ values only decide how quickly an *unreadable* span drifts toward a
 * ceiling it cannot cross, so being wrong about them costs pacing, never
 * correctness. `download` is the only one that idles for long, and only when the
 * server withheld a `content-length`.
 */
export const RING_STAGES = {
  /** The engine chunk. Real bytes when they are measurable, an idle drift when not. */
  download: { ceil: 70, tau: 900 },
  /** `initHub()` — four planet bakes, each reported as it lands. */
  build: { ceil: 90, tau: 450 },
  /** The first composited frame. One event; nothing inside it to sample. */
  frame: { ceil: 99, tau: 300 },
} as const satisfies Record<string, RingStage>;

/**
 * Time constant of the arc's approach to the reported floor, ms.
 *
 * Far behind, it moves fast; close, it settles. So a milestone that lands
 * instantly — a warm cache resolving the chunk in 20 ms — reads as a glide
 * instead of the jump this replaced, while a genuinely slow boot is unaffected
 * because the floor is already moving slower than the arc can chase it.
 */
const CATCH_TAU_MS = 200;

/**
 * Ceiling on the arc's speed, percentage points per millisecond.
 *
 * The easing above is a function of elapsed time, which is correct and is also
 * not enough on its own: the boot has moments where the main thread is held for
 * hundreds of milliseconds at a stretch — parsing half a megabyte of engine is
 * the big one — and the first frame after such a stall arrives with a `dt` large
 * enough for the curve to cover almost the whole remaining gap in one repaint.
 * Which is a jump; measurably so, and the very thing this is here to stop.
 *
 * So the arc is also rate-limited, and the two together give the motion its
 * shape: a straight climb while it is far behind, easing out as it arrives. The
 * value sets the floor on a full sweep — 100 points at 0.11/ms is ~0.9 s, which
 * is the least time the dial can take even if the entire boot were instant.
 */
export const MAX_RATE_PCT_PER_MS = 0.11;

/**
 * Within this of the floor, the arc is treated as having arrived.
 *
 * An asymptote never lands, and `complete()` resolves on landing — so without a
 * settle the loading screen would sit at 99.99 until its backstop fired. A
 * quarter of a percent is a fifth of a degree of arc: invisible, and it takes
 * the final ramp from ~1.1 s to ~0.75 s, which is a beat the visitor is waiting
 * through with a finished scene behind the screen.
 */
const SETTLE_EPSILON = 0.25;

/** How often the dial is repainted under `prefers-reduced-motion`, ms. */
const REDUCED_STEP_MS = 400;

/**
 * The idle value inside a span: an asymptotic approach from `from` toward
 * `ceil`, never arriving.
 *
 * Pure, and exported for its own unit tests — the guarantees the idle drift rests
 * on (monotonic, bounded below by `from`, bounded above by `ceil`) are properties
 * of this function alone, so they can be asserted directly rather than inferred
 * from a browser.
 */
export function ringValue(from: number, ceil: number, tau: number, elapsedMs: number): number {
  // A span that starts at or past its own ceiling has nothing to add. Kept so
  // the function is total.
  if (elapsedMs <= 0 || from >= ceil) return from;
  return from + (ceil - from) * (1 - Math.exp(-elapsedMs / tau));
}

/**
 * How far the arc moves toward `floor` in `dt` ms.
 *
 * Also pure and also exported for tests: "the arc never passes the floor" is the
 * property the dial's honesty rests on, and it is a property of this line.
 */
export function catchUp(at: number, floor: number, dt: number): number {
  if (dt <= 0 || at >= floor) return at;
  const eased = at + (floor - at) * (1 - Math.exp(-dt / CATCH_TAU_MS));
  // Whichever is slower. Both are bounded by `floor`, so their minimum is too —
  // the arc cannot pass what has actually happened by either route.
  const next = Math.min(eased, at + MAX_RATE_PCT_PER_MS * dt);
  return floor - next < SETTLE_EPSILON ? floor : next;
}

/** An armed idle drift: where it started, where it is heading, and when. */
interface Idle {
  readonly from: number;
  readonly ceil: number;
  readonly tau: number;
  readonly since: number;
}

export class LoadingRing {
  /** Circumference, derived from the markup's `r` so geometry lives in one place. */
  private readonly len: number;

  /** The highest value genuinely reported, plus any armed idle drift. */
  private floor = 0;
  /** The value on screen now. Always ≤ `floor`. */
  private at = 0;
  /** The last integer written, so a repaint does not touch the DOM needlessly. */
  private shown = -1;
  /** Armed only where there is nothing finer to read. Retired by `report()`. */
  private drift: Idle | null = null;
  private last = 0;

  private frame = 0;
  private ticker = 0;
  /** Set by `stop()`. A dead dial ignores everything after it. */
  private dead = false;
  /** Resolves when the arc lands on 100, or when `stop()` stands it down. */
  private settle: (() => void) | null = null;

  private readonly onFrame = (): void => {
    this.tick();
    // `stop()` inside `tick()` — the ramp landing on 100 — must not schedule
    // another frame against a dial that is already down.
    if (!this.dead) this.frame = requestAnimationFrame(this.onFrame);
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

  /** Begin driving. */
  start(): void {
    if (this.dead) return;
    this.last = performance.now();
    this.paint();
    if (this.reduce) {
      this.ticker = window.setInterval(() => this.tick(), REDUCED_STEP_MS);
    } else {
      this.frame = requestAnimationFrame(this.onFrame);
    }
  }

  /**
   * Something genuinely finished, and this is how far along it puts the boot.
   *
   * Monotonic: a lower or repeated value cannot pull the dial back. Capped at the
   * last span's ceiling, so only `complete()` can write 100. Retires any armed
   * idle drift — real data supersedes a guess, and letting a drift keep running
   * underneath a live byte count is exactly how the dial would come to show
   * progress that had not happened.
   */
  report(value: number): void {
    if (this.dead) return;
    this.drift = null;
    this.floor = Math.max(this.floor, Math.min(value, RING_STAGES.frame.ceil));
  }

  /**
   * There is nothing finer to read until the next `report()`: drift toward
   * `ceil` from wherever the floor is now.
   *
   * Armed at exactly two call sites, both spans that genuinely cannot be
   * subdivided — a download whose server sent no `content-length`, and the frame
   * where the shaders compile. A slow one of either then shows a dial that
   * approaches its ceiling and waits there, rather than one frozen at the value
   * before it.
   */
  idle(ceil: number, tau: number): void {
    if (this.dead) return;
    this.drift = { from: this.floor, ceil, tau, since: performance.now() };
  }

  /**
   * The scene is up. The only writer of 100, and the only one entitled to be:
   * the router calls this from `dismissLoader()`, on the frame after the first
   * composited frame.
   *
   * Resolves when the arc has actually *landed* on 100, not when it was told to.
   * The caller holds the screen from that moment, so a hold measured from here
   * would be eaten by the ramp.
   */
  complete(): Promise<void> {
    if (this.dead) return Promise.resolve();
    this.drift = null;
    this.floor = 100;
    // Nothing animates under reduce, so there is no ramp to wait out.
    if (this.reduce) {
      this.at = 100;
      this.paint();
      this.stop();
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.settle = resolve;
    });
  }

  /**
   * Stand the dial down — a stalled boot flattens the document and never reaches
   * `complete()`. Idempotent, reachable from `flatten()` and `destroy()`, and it
   * resolves a pending `complete()` rather than leaving its caller waiting on a
   * ramp that will never run again.
   */
  stop(): void {
    this.dead = true;
    cancelAnimationFrame(this.frame);
    clearInterval(this.ticker);
    this.frame = 0;
    this.ticker = 0;
    const settle = this.settle;
    this.settle = null;
    settle?.();
  }

  private tick(): void {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;

    if (this.drift !== null) {
      const d = this.drift;
      // `Math.max` because `report()` may have raised the floor above where the
      // drift started; the drift may lift the floor, never lower it.
      this.floor = Math.max(this.floor, ringValue(d.from, d.ceil, d.tau, now - d.since));
    }

    this.at = catchUp(this.at, this.floor, dt);
    this.paint();

    if (this.at >= 100) {
      // Landed. `stop()` resolves the promise `complete()` handed out.
      this.stop();
    }
  }

  private paint(): void {
    this.arc.style.strokeDashoffset = String(this.len * (1 - this.at / 100));
    // Floored and capped at 99 while the loop runs: only `complete()` raises the
    // floor to 100, so only it can print it.
    const n = this.at >= 100 ? 100 : Math.min(99, Math.floor(this.at));
    if (n === this.shown) return;
    this.shown = n;
    this.readout.textContent = String(n);
  }
}
