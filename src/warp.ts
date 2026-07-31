/**
 * The hyperspace transition: a radial streak field drawn on the shared 2D
 * overlay canvas (`#smoke`), between clicking a destination and its panel
 * appearing.
 *
 * Ported from `design/warp.js`. Four exports were deleted on the way in
 * (PORT_PLAN step 7) — `writeLaunch`, `readLaunch`, `whenLoaded` and
 * `bindDepartures`, together with the `dg-launch` sessionStorage key all four
 * shared. They existed to hand a jump *across a document swap*: the departing
 * page wrote the launch and navigated, the arriving page read it back and held
 * the warp until its own `load`. This site is one document — there is no
 * arrival to hand anything to, `bindDepartures` matched `href="backend.dc.html"`
 * links that no longer exist, and keeping any of it would invite the document
 * swap back (CLAUDE.md "Architecture").
 *
 * The whole `Warp` class stays, `dispose()` included, and so do the three
 * durations the transition is tuned around.
 *
 * Why this is a 2D canvas and not a three.js pass — it runs *alongside* the
 * scene, which the router keeps rendering underneath it:
 *
 *   - **No textures.** No image data, no offscreen canvas, no gradient bitmap.
 *   - **Nothing is built at click time.** The streak field is allocated once, in
 *     the constructor, and reseeded in place forever after. An earlier warp
 *     baked sixteen 160² textures inside the click handler and the click felt
 *     like it hung (CLAUDE.md "Performance").
 *   - A frame is a few hundred line strokes plus one radial gradient. The
 *     gradient is the only per-frame allocation and the only one that cannot be
 *     hoisted: its radius follows `k`.
 */

import type { PanelId } from './content';

/* -------------------------------------------------------------- durations */

/**
 * The cover the router runs, milliseconds. The prototype hard-coded `900` as
 * `COVER` inside `jump()` while also exporting it here; Phase 7 imports this
 * instead of restating the number.
 */
export const MIN_COVER = 900;

/**
 * The longest a cover may be waited on. Anything gated on `onOpaque` has to give
 * up at this point and proceed regardless — the callback rides the animation,
 * and an animation can be starved.
 */
export const MAX_COVER = 2200;

/** The longest a `startHold()` may run before it is cleared regardless. */
export const HOLD_CAP = 3400;

/* ----------------------------------------------------------------- colour */

/**
 * Warp tint per route. Five keys: the four destinations plus `index`, the hub —
 * `go(null)` is a jump like any other and needs a colour too.
 *
 * The four destination values are each planet's `glow`, restated rather than
 * imported. The engine's public face is `hub.ts`, which pulls in `three`, and a
 * 2D canvas module has no business importing that; reaching around it into
 * `engine/planets.ts` would break the single-entry rule Phase 5 established.
 * `tests/unit/warp.test.ts` asserts the two tables agree, so they cannot drift.
 */
export const ACCENTS: Readonly<Record<PanelId | 'index', string>> = {
  index: '#ff9b3d',
  backend: '#3fd8ff',
  projects: '#38ffb0',
  xr: '#b26bff',
  about: '#ff9b3d',
};

/** What the cover fills to: `--void` in `styles.css`, the page base. */
const BASE = '#05060d';
/** The jump itself — a short white-blue blowout at the end of the cover. */
const FLASH = '#eaf4ff';
/** Ice blue, used when the caller names no accent. */
const DEFAULT_ACCENT = '#9fd8ff';

/* ------------------------------------------------------------- invariants */

const DEFAULT_COVER_MS = 950;
const DEFAULT_CLEAR_MS = 950;

/**
 * The point in the cover at which the screen is opaque enough to swap what is
 * underneath it. `onOpaque` fires here, once — it is what the router commits on.
 */
const COVER_OPAQUE_AT = 0.92;

/**
 * Largest slice any single frame may claim, seconds. A backgrounded tab comes
 * back with a gap of whole seconds; without the clamp the field would teleport.
 */
const MAX_FRAME_S = 0.05;

/** Streak count, by viewport width. */
const STREAK_COUNT = { narrow: 260, wide: 460 } as const;

/**
 * Narrow-viewport threshold for that count, CSS px of *width*. Deliberately not
 * the engine's `isSmallViewport()`, which measures the shorter edge against 700
 * and decides how much GPU work to do. Two different questions, two numbers.
 */
const NARROW_VIEWPORT_PX = 720;

/**
 * Device pixel ratio ceiling for the overlay, tighter than the scene's 2 / 1.5.
 * The field is soft, moving and mostly opaque, so extra device pixels buy
 * nothing — and it has to stay cheap enough to run over a live WebGL scene.
 */
const WARP_DPR_CAP = 1.5;

/* ------------------------------------------------------------------ types */

type WarpPhase = 'idle' | 'cover' | 'hold' | 'clear' | 'done';

export interface WarpOptions {
  /** Streak tint, `#rrggbb`. Defaults to ice blue. */
  accent?: string;
  /** Streak count. Defaults by viewport width. */
  count?: number;
}

export interface CoverOptions {
  /** Milliseconds. Defaults to 950; the router passes `MIN_COVER`. */
  duration?: number;
  /** Fires once, at `COVER_OPAQUE_AT`. */
  onOpaque?: () => void;
}

/**
 * One streak. Mutable and reused on purpose: the field is reseeded in place, so
 * a jump allocates nothing after construction. This is the one place the
 * project's immutable-update default is deliberately off.
 */
interface Streak {
  /** Direction from the vanishing point, radians. */
  a: number;
  /** Distance from it, in half-diagonals. Reseeded past 1.25. */
  r: number;
  /** Radial velocity multiplier. */
  sp: number;
  /** Streak length at full warp. */
  len: number;
  /** Stroke width. */
  w: number;
  /** 0 = white, 1 = accent. Fixed for the life of the streak. */
  tint: number;
  /** `tint` resolved against the accent. Built at seed time, not per frame. */
  color: string;
}

/**
 * `#rrggbb` → three channels. A malformed value parses to `NaN` and yields
 * black rather than throwing: the accent is cosmetic and must never be able to
 * break a jump.
 */
function hexToRgb(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function blankStreak(): Streak {
  return { a: 0, r: 0, sp: 0, len: 0, w: 0, tint: 0, color: '' };
}

/* ------------------------------------------------------------------- warp */

export class Warp {
  readonly canvas: HTMLCanvasElement;
  /** The tint the streaks mix toward, `#rrggbb`. */
  readonly accent: string;
  readonly count: number;

  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly rgb: readonly [number, number, number];
  private readonly streaks: Streak[];

  /**
   * False without a 2D context, and after `dispose()`. Every phase method is a
   * no-op then, and `clear()` resolves at once from `'done'`.
   */
  private live: boolean;
  private phase: WarpPhase = 'idle';

  /** 0 = still stars, 1 = full hyperspace. */
  private k = 0;
  /** Opacity of the flat `BASE` fill under the streaks. */
  private coverAlpha = 0;
  private flash = 0;

  private raf = 0;
  private last = 0;
  /** Seconds into the current phase. */
  private t = 0;
  private coverDur = DEFAULT_COVER_MS / 1000;
  private clearDur = DEFAULT_CLEAR_MS / 1000;

  /* CSS-pixel geometry, refreshed on resize. */
  private w = 0;
  private h = 0;
  private cx = 0;
  private cy = 0;
  /** Half the viewport diagonal. Streak `r` is expressed in these. */
  private rad = 0;

  private onOpaque: (() => void) | null = null;
  private firedOpaque = false;
  private onClear: (() => void) | null = null;

  /** Bound once so `dispose()` can take the same reference off the window. */
  private readonly handleResize = (): void => {
    this.resize();
  };

  private readonly handleFrame = (now: number): void => {
    this.tick(now);
  };

  constructor(canvas: HTMLCanvasElement, options: WarpOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.accent = options.accent ?? DEFAULT_ACCENT;
    this.rgb = hexToRgb(this.accent);

    const narrow = window.innerWidth < NARROW_VIEWPORT_PX;
    this.count = options.count ?? (narrow ? STREAK_COUNT.narrow : STREAK_COUNT.wide);
    // Pushed rather than `new Array(count)`: a pre-sized array stays holey even
    // once every slot is filled, and holey is the slower element kind to walk.
    this.streaks = [];
    for (let i = 0; i < this.count; i++) this.streaks.push(this.seed(blankStreak(), true));

    this.live = this.ctx !== null;
    if (!this.live) {
      // Only reachable if something already claimed a context of another type on
      // the overlay canvas. Say so, then stay inert: `clear()` resolves straight
      // away from `'done'`, the router's `finish()` still runs, and a jump can
      // never dead-lock waiting on us. The transition degrades to a cut.
      this.phase = 'done';
      console.warn('[warp] no 2D context on the overlay canvas; jumps will cut instead of warping');
    }

    window.addEventListener('resize', this.handleResize);
    this.resize();
  }

  /**
   * Jump to lightspeed. `opts.onOpaque` fires once, at `COVER_OPAQUE_AT` — the
   * frame the screen is covered enough to swap what is under it.
   */
  cover(options: CoverOptions = {}): this {
    if (!this.live) return this;
    this.canvas.style.display = 'block';
    this.phase = 'cover';
    this.coverDur = (options.duration ?? DEFAULT_COVER_MS) / 1000;
    this.t = 0;
    this.onOpaque = options.onOpaque ?? null;
    this.firedOpaque = false;
    this.start();
    return this;
  }

  /** Sustained hyperspace. Runs until `clear()`. */
  startHold(): this {
    if (!this.live) return this;
    this.canvas.style.display = 'block';
    this.phase = 'hold';
    this.k = 1;
    this.coverAlpha = 1;
    this.start();
    return this;
  }

  /**
   * Drop out of hyperspace and reveal the page. Resolves once the canvas is
   * clear and hidden — or immediately, if there is nothing to drop out of.
   */
  clear(duration = DEFAULT_CLEAR_MS): Promise<void> {
    if (this.phase === 'clear' || this.phase === 'done') return Promise.resolve();
    this.phase = 'clear';
    this.clearDur = duration / 1000;
    this.t = 0;
    this.flash = 0.5;
    // Only the animation resolves this promise, so it must be running. It always
    // is in practice — `cover()` started it — but a `clear()` with no loop
    // behind it would hang the caller forever, and the router releases `_going`
    // through here.
    this.start();
    return new Promise<void>((resolve) => {
      this.onClear = resolve;
    });
  }

  /** Paint opaque immediately, before the animation's first frame. */
  fill(): void {
    const c = this.ctx;
    if (!this.live || c === null) return;
    this.canvas.style.display = 'block';
    c.globalAlpha = 1;
    c.fillStyle = BASE;
    c.fillRect(0, 0, this.w, this.h);
  }

  /**
   * Give up the shared canvas. Exactly one live `Warp` owns `#smoke`, so the
   * router disposes the previous instance before building the next one (CLAUDE.md
   * "Router invariants") — two would fight over its transform, resize listener
   * and rAF chain.
   *
   * An instance torn down mid-cover must not leave the screen covered forever,
   * and must not leave a caller waiting on a `clear()` that will now never run.
   */
  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.phase = 'done';
    // Hardening beyond the prototype, and the same idea as the engine's flight
    // token: a disposed instance stays disposed. `cover()` on one would
    // otherwise start a fresh rAF chain with no resize listener behind it.
    this.live = false;
    window.removeEventListener('resize', this.handleResize);
    try {
      const c = this.ctx;
      if (c !== null) {
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
    } catch {
      // A context that refuses to clear is still one we are done with. The
      // canvas is hidden either way, so the screen cannot stay covered.
    }
    this.canvas.style.display = 'none';
    const resolve = this.onClear;
    this.onClear = null;
    if (resolve !== null) resolve();
    this.onOpaque = null;
    this.streaks.length = 0;
  }

  /* ------------------------------------------------------------ internals */

  /**
   * (Re)randomise one streak in place. `fresh` spreads the field across the
   * whole radius at construction; afterwards streaks re-enter near the centre.
   */
  private seed(q: Streak, fresh: boolean): Streak {
    q.a = Math.random() * Math.PI * 2;
    q.r = fresh ? Math.pow(Math.random(), 0.6) : 0.004 + Math.random() * 0.02;
    q.sp = 0.55 + Math.random() * 2.4;
    q.len = 0.10 + Math.random() * 0.55;
    q.w = 0.6 + Math.random() * 1.9;
    q.tint = Math.random();
    q.a += (Math.random() - 0.5) * 0.02;
    q.color = this.mix(q.tint);
    return q;
  }

  /**
   * White at `tint` 0, 85 % of the way to the accent at 1. Both inputs are fixed
   * for the life of a streak, so the string is built here rather than rebuilt
   * for every streak on every frame — same colours, no per-frame churn.
   */
  private mix(tint: number): string {
    const [r0, g0, b0] = this.rgb;
    const r = Math.round(255 - (255 - r0) * tint * 0.85);
    const g = Math.round(255 - (255 - g0) * tint * 0.85);
    const b = Math.round(255 - (255 - b0) * tint * 0.85);
    return `rgb(${r},${g},${b})`;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, WARP_DPR_CAP);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.rad = Math.hypot(this.w, this.h) / 2;

    const c = this.ctx;
    if (c === null) return;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    // Sizing the backing store resets the context, so the transform goes last.
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private start(): void {
    if (!this.live || this.raf !== 0) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.handleFrame);
  }

  private tick(now: number): void {
    const c = this.ctx;
    if (c === null) return;

    const dt = Math.min(MAX_FRAME_S, (now - this.last) / 1000);
    this.last = now;

    switch (this.phase) {
      case 'cover':
        this.advanceCover(dt);
        break;
      case 'clear':
        // Returns true once the reveal is complete: the loop has already been
        // stopped and the canvas hidden, so there is nothing left to paint.
        if (this.advanceClear(dt, c)) return;
        break;
      case 'hold':
        this.flash = Math.max(0, this.flash - dt * 3.0);
        break;
      default:
        break;
    }

    this.paint(c, dt);
    this.raf = requestAnimationFrame(this.handleFrame);
  }

  /* The curve constants below are the prototype's, unchanged. They are shape,
     not configuration — naming each one would obscure the curve it describes
     without making any of it adjustable. */

  private advanceCover(dt: number): void {
    this.t += dt;
    const p = Math.min(1, this.t / this.coverDur);
    this.k = Math.pow(p, 1.7); // spool up
    this.coverAlpha = Math.max(0, Math.min(1, (p - 0.30) / 0.45));
    if (p > 0.82) this.flash = Math.max(this.flash, Math.min(0.7, (p - 0.82) / 0.18));

    if (!this.firedOpaque && p >= COVER_OPAQUE_AT) {
      this.firedOpaque = true;
      const fire = this.onOpaque;
      if (fire !== null) fire();
    }

    if (p >= 1) {
      this.phase = 'hold';
      this.k = 1;
      this.coverAlpha = 1;
    }
  }

  /** @returns `true` once the clear has finished and the loop has been stopped. */
  private advanceClear(dt: number, c: CanvasRenderingContext2D): boolean {
    this.t += dt;
    const p = Math.min(1, this.t / this.clearDur);
    this.k = Math.max(0, 1 - Math.pow(p, 0.75)); // decelerate
    this.coverAlpha = Math.max(0, 1 - Math.max(0, (p - 0.35) / 0.65));
    this.flash = Math.max(0, this.flash - dt * 5.5);
    if (p < 1) return false;

    this.phase = 'done';
    c.clearRect(0, 0, this.w, this.h);
    this.canvas.style.display = 'none';
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    const resolve = this.onClear;
    this.onClear = null;
    if (resolve !== null) resolve();
    return true;
  }

  private paint(c: CanvasRenderingContext2D, dt: number): void {
    const k = this.k;
    c.clearRect(0, 0, this.w, this.h);

    // Opaque base — no seams, ever.
    if (this.coverAlpha > 0) {
      c.globalAlpha = this.coverAlpha;
      c.fillStyle = BASE;
      c.fillRect(0, 0, this.w, this.h);
    }

    this.paintStreaks(c, dt, k);
    if (k > 0.02) this.paintBloom(c, k);

    // The jump itself.
    if (this.flash > 0.002) {
      c.globalAlpha = Math.min(1, this.flash) * 0.75;
      c.fillStyle = FLASH;
      c.fillRect(0, 0, this.w, this.h);
    }

    c.globalAlpha = 1;
  }

  private paintStreaks(c: CanvasRenderingContext2D, dt: number, k: number): void {
    const R = this.rad;
    const cx = this.cx;
    const cy = this.cy;
    c.lineCap = 'round';

    for (let i = 0; i < this.streaks.length; i++) {
      const q = this.streaks[i];
      // `noUncheckedIndexedAccess` bookkeeping; `i` is always in range.
      if (q === undefined) continue;

      q.r += q.sp * dt * (0.09 + k * 2.4) * (0.25 + q.r * 1.6);
      if (q.r > 1.25) this.seed(q, false);

      // Tested before the geometry rather than after it, as the prototype had
      // it: the two depend on nothing each other touches, and a streak that has
      // just re-entered is invisible for its first frames.
      const a = Math.min(1, q.r * 3.2) * (0.30 + 0.70 * k);
      if (a <= 0.01) continue;

      const cosA = Math.cos(q.a);
      const sinA = Math.sin(q.a);
      const tail = Math.max(0, q.r - q.len * k * (0.35 + q.r));

      c.globalAlpha = a;
      c.strokeStyle = q.color;
      c.lineWidth = q.w * (0.5 + k * 0.9);
      c.beginPath();
      c.moveTo(cx + cosA * tail * R, cy + sinA * tail * R);
      c.lineTo(cx + cosA * q.r * R, cy + sinA * q.r * R);
      c.stroke();
    }
  }

  /** Core bloom at the vanishing point. */
  private paintBloom(c: CanvasRenderingContext2D, k: number): void {
    const [r0, g0, b0] = this.rgb;
    const gradient = c.createRadialGradient(
      this.cx, this.cy, 0,
      this.cx, this.cy, this.rad * (0.20 + k * 0.55),
    );
    gradient.addColorStop(0, `rgba(255,255,255,${(0.55 * k).toFixed(3)})`);
    gradient.addColorStop(0.35, `rgba(${r0},${g0},${b0},${(0.30 * k).toFixed(3)})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 1;
    c.fillStyle = gradient;
    c.fillRect(0, 0, this.w, this.h);
  }
}

/* --------------------------------------------------------- azimuth handoff */

const AZIMUTH_KEY = 'dg-az';

/**
 * Where the visitor left the hub camera. Session-scoped on purpose: it belongs
 * to this visit, not to the profile, so it is not a preference to persist.
 *
 * Written and read by the router (Phase 7) — the engine keeps no storage of its
 * own. Both are silent when storage is unavailable: a sandboxed iframe throws on
 * property access, and an azimuth is not worth a broken boot.
 */
export function saveAzimuth(a: number): void {
  try {
    sessionStorage.setItem(AZIMUTH_KEY, String(a));
  } catch {
    // Nothing to recover: the hub simply opens at its default angle next time.
  }
}

export function loadAzimuth(): number | null {
  try {
    const raw = sessionStorage.getItem(AZIMUTH_KEY);
    if (raw === null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
