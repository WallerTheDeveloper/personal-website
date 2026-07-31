/**
 * Hash routing for a single document.
 *
 * Ported from the `<script data-dc-script>` logic class in
 * `design/index.dc.html`. `componentDidMount` became `mount()`,
 * `componentWillUnmount` became `destroy()` on `pagehide`, and the four
 * authoring-tool props became the `config` object below.
 *
 * There are no separate pages. A destination is an overlay panel and a parked
 * camera; a jump costs one warp animation and a class swap. Swapping documents
 * instead tore down the WebGL context and re-baked every planet texture on
 * arrival — that lag is the reason this file exists (CLAUDE.md "Architecture").
 *
 * **The invariants below were each bought with debugging time. Do not relax
 * them, and add a Playwright test before changing any of them.**
 *
 *   - `exit()` is hard-wired to `go(null)`. **Never `history.back()`**: Back
 *     replays the previously visited panel, which is the wrong intent, and
 *     where History is sandboxed it silently does nothing — stranding
 *     `current` on a closed panel and dead-locking canvas input.
 *   - Input is gated on `current` **only**, never on `_going`. Gating on the
 *     transition flag turns any hiccup into permanently dead canvas input;
 *     re-entrant clicks are absorbed by `_pending` instead.
 *   - `_going` is never released solely by `warp.clear().then(…)`. One stalled
 *     promise would wedge routing for good, so `finish()` is idempotent,
 *     carries a jump token, and is reachable from the animation *and* from a
 *     watchdog at `COVER + CLEAR + WATCHDOG_SLACK`.
 *   - `go(id)` pushes history **and** drives `jump()` directly — it never waits
 *     on the resulting `hashchange`.
 *   - Exactly one live `Warp` owns `#smoke`; `jump()` disposes the previous
 *     instance before constructing the next.
 *   - Both canvas nav paths — the `pointerdown`/`pointerup` pair and a plain
 *     `click` — feed one deduplicated `nav()`. Keep both.
 *   - Overlapping jumps queue in `_pending`; they never interleave.
 */

import { isPanelId, PANEL_IDS, type PanelId } from './content';
import { trackView } from './analytics';
import { applyTitle } from './head';
import { LabelLayer } from './labels';
import { ACCENTS, MIN_COVER, saveAzimuth, loadAzimuth, Warp } from './warp';
import type { HubApi, Composition, LabelPlacement } from './hub';

/** The dynamically loaded engine. Type-only, so it costs nothing at runtime. */
type Engine = typeof import('./hub');

/* ----------------------------------------------------------------- config */

export type WarpColor = 'planet' | 'ice' | 'amber' | 'white';

export interface RouterConfig {
  composition: Composition;
  /** `planet` takes the destination's own glow; the rest are fixed tints. */
  warpColor: WarpColor;
  /** Panel-scroll parallax amount. See `startDrift()` — currently inert. */
  parallax: number;
  /** The quality/fps readout and the drag hint. */
  showHud: boolean;
}

/**
 * The prototype's four tweakable props, kept as the knobs the owner tuned the
 * scene with. These are the shipping values.
 */
export const config: RouterConfig = {
  composition: 'arc',
  warpColor: 'planet',
  parallax: 0.1,
  showHud: true,
};

/** Fixed warp tints, for every `warpColor` except `planet`. */
const WARP_TINTS: Readonly<Record<Exclude<WarpColor, 'planet'>, string>> = {
  ice: '#9fd8ff',
  amber: '#ffb066',
  white: '#eaf4ff',
};

/* -------------------------------------------------------------- durations */

/** Warp ramp-up, ms. The warp module owns this number; do not restate it. */
const COVER = MIN_COVER;
/** Warp ramp-down, ms. Passed to `clear()` explicitly so the watchdog agrees. */
const CLEAR = 950;
/** How long past a nominal jump the watchdog waits before forcing `finish()`. */
const WATCHDOG_SLACK = 700;
/** The warp starts this long after `cover()` would have finished ramping. */
const CLEAR_DELAY = COVER + 120;
/** Leaving the hub, the ship gets this head start so the jump reads as departure. */
const SHIP_HEAD_START = 520;
const LAUNCH_MS = 1700;
const DOCK_MS = 1150;

/** Fade-out of the text edition once the scene is up, ms. Matches styles.css. */
const FALLBACK_FADE_MS = 400;

/* ------------------------------------------------------------------ input */

/** Pointer travel, CSS px, above which a press is a drag and not a click. */
const DRAG_SLOP_PX = 6;
/** Two nav paths reach the same click; the later one inside this window loses. */
const NAV_DEDUPE_MS = 350;
const WHEEL_TO_RADIANS = 0.0011;
const DRAG_TO_RADIANS = 0.0022;
const ARROW_STEP_RADIANS = 0.1;

/** First-load nudge: ~10° out and back, unless the visitor has already acted. */
const HINT_DELAY_MS = 900;
const HINT_HOLD_MS = 1500;
const HINT_AZIMUTH = 0.17;

/* ----------------------------------------------------------------- router */

export class Router {
  private engine: Engine | null = null;
  private hub: HubApi | null = null;
  private labels: LabelLayer | null = null;
  private warpFx: Warp | null = null;

  /** The open panel, or `null` for the hub. The single gate on all input. */
  private current: PanelId | null = null;
  private hovered: PanelId | null = null;

  private reduce = false;
  /** True once the text edition has taken over; routing is off from then on. */
  private flat = false;
  /** At most one initial view is recorded per document load. */
  private viewed = false;

  /** Transition in progress. Never gate input on this — see the file header. */
  private going = false;
  /** A jump requested mid-transition. `undefined` means "nothing queued". */
  private pending: PanelId | null | undefined = undefined;
  /** Invalidates a superseded `finish()`. */
  private token = 0;
  private watchdog = 0;
  private drift = 0;

  /** Where the hub camera was left, so a panel visit does not lose it. */
  private hubAz = 0;
  /** The azimuth the parked (or hub) view holds. */
  private baseAz = 0;

  private interactedOnce = false;
  private dragging = false;
  private lastX = 0;
  private moved = 0;
  private navAt = 0;
  private coarse = false;

  private el!: {
    canvas: HTMLCanvasElement;
    labels: HTMLElement;
    fallback: HTMLElement | null;
    smoke: HTMLCanvasElement;
    reticle: HTMLElement | null;
    hint: HTMLElement | null;
    qBtn: HTMLElement | null;
    fps: HTMLElement | null;
    header: HTMLElement | null;
    foot: HTMLElement | null;
    stage: HTMLElement | null;
  };
  private panels: ReadonlyMap<PanelId, HTMLElement> = new Map();

  /* Bound once so `destroy()` can take them off again. */
  private readonly onPop = (): void => this.route();
  private readonly onHash = (): void => this.route();
  private readonly onKey = (e: KeyboardEvent): void => this.handleKey(e);
  private readonly onClick = (e: MouseEvent): void => this.handleClick(e);
  private readonly onWheel = (e: WheelEvent): void => this.handleWheel(e);
  private readonly onDown = (e: PointerEvent): void => this.handleDown(e);
  private readonly onMove = (e: PointerEvent): void => this.handleMove(e);
  private readonly onUp = (e: PointerEvent): void => this.handleUp(e);
  private readonly onCanvasClick = (e: MouseEvent): void => this.handleCanvasClick(e);
  private readonly onTouchMove = (e: TouchEvent): void => {
    if (this.current === null) e.preventDefault();
  };
  private readonly onVisibility = (): void => {
    this.hub?.pause(document.hidden);
    // pagehide is not guaranteed on mobile, where a backgrounded tab may simply
    // be killed. This is the reliable moment to bank the camera angle.
    if (document.hidden) saveAzimuth(this.currentHubAzimuth());
  };
  private readonly onResize = (): void => this.hub?.resize();

  /* ------------------------------------------------------------ lifecycle */

  /**
   * Wire everything that does not need the engine, then load it. Routing is
   * bound *before* the engine arrives so a hash change during the download is
   * not lost.
   */
  mount(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('#scene');
    const smoke = document.querySelector<HTMLCanvasElement>('#smoke');
    const labels = document.querySelector<HTMLElement>('#labels');
    // Without these three there is no hub to route around. The text edition is
    // already on screen — it is the default state — so leaving it up is the
    // whole recovery.
    if (canvas === null || smoke === null || labels === null) {
      console.warn('[router] hub markup is missing; staying on the text edition');
      return;
    }

    this.el = {
      canvas,
      smoke,
      labels,
      fallback: document.querySelector('#fallback'),
      reticle: document.querySelector('#reticle'),
      hint: document.querySelector('#hud-hint'),
      qBtn: document.querySelector('#quality-toggle'),
      fps: document.querySelector('#fps-readout'),
      header: document.querySelector('#hub-head'),
      foot: document.querySelector('#hub-foot'),
      stage: document.querySelector('#stage'),
    };

    const panels = new Map<PanelId, HTMLElement>();
    for (const id of PANEL_IDS) {
      const panel = document.querySelector<HTMLElement>(`[data-panel="${id}"]`);
      if (panel !== null) panels.set(id, panel);
    }
    this.panels = panels;

    this.labels = new LabelLayer(labels, this.el.reticle);
    if (!config.showHud && this.el.qBtn !== null) this.el.qBtn.style.display = 'none';

    window.addEventListener('popstate', this.onPop);
    window.addEventListener('hashchange', this.onHash);
    document.addEventListener('click', this.onClick);

    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const engine = await import('./hub');
      this.boot(engine);
    } catch (err: unknown) {
      console.warn('[router] 3D unavailable, using the text edition', err);
      this.flatten();
    }
  }

  private boot(engine: Engine): void {
    this.engine = engine;
    if (!engine.hasWebGL()) {
      this.flatten();
      return;
    }
    this.reduce = engine.reducedMotion();

    // The text edition is the DEFAULT state; this is the success path fading it
    // out, not an error branch being cleared. Never invert this.
    const fb = this.el.fallback;
    if (fb !== null) {
      fb.style.transition = `opacity ${FALLBACK_FADE_MS}ms ease`;
      fb.style.opacity = '0';
      fb.style.pointerEvents = 'none';
      window.setTimeout(() => {
        fb.style.display = 'none';
      }, FALLBACK_FADE_MS + 20);
    }
    this.el.canvas.style.opacity = '1';

    const hub = engine.initHub(this.el.canvas, {
      composition: config.composition,
      onLabels: (out: readonly LabelPlacement[]) => this.labels?.place(out, this.hovered),
      // The single place `hovered` is written. Everything that wants to change
      // it goes through `hub.setHovered()` and arrives back here, so the DOM
      // tint and the scene's own hover state can never disagree.
      onHover: (id: PanelId | null): void => {
        if (this.hovered === id) return;
        this.hovered = id;
        this.labels?.tint(id);
      },
      onFps: config.showHud
        ? (fps: number): void => {
            if (this.el.fps !== null) this.el.fps.textContent = String(fps);
          }
        : null,
    });
    this.hub = hub;
    window.__dgHub = hub;
    window.__dg3dReady = true;

    // The label is the button's first text node: "Quality: high · <span>--</span> fps".
    const qLabel = this.el.qBtn?.firstChild;
    if (qLabel != null) qLabel.textContent = `Quality: ${hub.quality} · `;

    // Session-scoped, written by this router alone — the engine keeps no storage.
    const saved = loadAzimuth();
    this.hubAz = saved ?? 0;
    this.baseAz = this.hubAz;
    if (saved !== null) hub.setAzimuth(saved, true);

    this.bindPointer();
    this.bindKeyboard();
    this.bindLifecycle();
    this.startDrift();

    // Deep link: open the destination straight away. No warp on first paint —
    // there is nothing to transition *from*.
    const id = this.hashId();
    if (id !== null) {
      this.commit(id);
      this.labels?.setVisible(false);
    } else {
      this.labels?.setVisible(true);
      this.recordView(null);
      if (!this.reduce) this.hint();
    }
  }

  /**
   * No WebGL, or the engine failed to load: one continuous scrolling document.
   * Not a degraded mode so much as the other edition of the same content.
   */
  flatten(): void {
    window.__dg3dReady = false;
    document.documentElement.removeAttribute('data-dg-3d');
    document.documentElement.setAttribute('data-dg-flat', '1');
    if (this.el?.stage != null) this.el.stage.style.display = 'none';
    const fb = this.el?.fallback;
    if (fb != null) {
      fb.style.position = 'static';
      fb.style.opacity = '1';
      fb.style.pointerEvents = 'auto';
    }
    // Panels ship as `id="panel-xr"` so the hash never matches one by accident
    // while routing is live. Flat, the hash *should* reach them: re-id each one
    // and every `href="#…"` becomes an in-page scroll instead of a route.
    for (const [id, panel] of this.panels) panel.id = id;
    this.flat = true;
    if (!this.viewed) this.recordView(null);
  }

  destroy(): void {
    saveAzimuth(this.currentHubAzimuth());
    cancelAnimationFrame(this.drift);
    clearTimeout(this.watchdog);
    window.removeEventListener('popstate', this.onPop);
    window.removeEventListener('hashchange', this.onHash);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.el !== undefined) {
      this.el.canvas.removeEventListener('wheel', this.onWheel);
      this.el.canvas.removeEventListener('pointerdown', this.onDown);
      this.el.canvas.removeEventListener('click', this.onCanvasClick);
      this.el.canvas.removeEventListener('touchmove', this.onTouchMove);
    }
    this.warpFx?.dispose();
    this.warpFx = null;
    // The one renderer per document, disposed here and nowhere else.
    if (window.__dgHub != null) {
      window.__dgHub.dispose();
      window.__dgHub = null;
    }
    this.hub = null;
  }

  /* --------------------------------------------------------------- routing */

  /** The hash as a panel id, or `null` for the hub. Unknown hashes are the hub. */
  private hashId(): PanelId | null {
    const raw = (window.location.hash || '').replace(/^#\/?/, '');
    return isPanelId(raw) && this.panels.has(raw) ? raw : null;
  }

  private route(): void {
    if (this.flat) return;
    const target = this.hashId();
    if (target === this.current) return;
    this.jump(target);
  }

  /**
   * Push a history entry and animate to it. The jump is driven directly rather
   * than waiting on the resulting `hashchange`, so it still runs where History
   * is sandboxed and `pushState` throws.
   */
  go(id: PanelId | null): void {
    if (this.flat) return;
    if (id === this.current) return;
    const url = id === null ? window.location.pathname + window.location.search : `#${id}`;
    try {
      window.history.pushState({ dg: id }, '', url);
    } catch {
      // Sandboxed history. The jump below is what actually moves the site.
    }
    this.jump(id);
  }

  /**
   * Escape and every "Back to system" mean the scene — always.
   *
   * **Never `history.back()`.** It replays the previously visited panel, which
   * is the wrong intent, and where the frame sandboxes history it does nothing
   * at all, stranding `current` on a closed panel and dead-locking input.
   */
  exit(): void {
    if (this.flat) return;
    this.go(null);
  }

  /* -------------------------------------------------- the hyperspace jump */

  private jump(target: PanelId | null): void {
    const hub = this.hub;
    if (this.going || hub === null) {
      this.pending = target;
      return;
    }
    this.going = true;
    const from = this.current;
    const tint =
      config.warpColor === 'planet' ? ACCENTS[target ?? from ?? 'backend'] : WARP_TINTS[config.warpColor];

    if (this.reduce) {
      this.commit(target);
      this.going = false;
      this.drainPending();
      return;
    }

    if (from === null) {
      this.labels?.setVisible(false);
      this.setHover(null);
    }
    this.labels?.hideReticle();

    // One Warp owns the shared #smoke canvas at a time. A surviving previous
    // instance would fight this one over its 2D transform, its resize listener
    // and its rAF chain.
    this.warpFx?.dispose();
    const warp = new Warp(this.el.smoke, { accent: tint });
    this.warpFx = warp;

    const token = ++this.token;
    let committed = false;
    const commitOnce = (): void => {
      if (committed) return;
      committed = true;
      this.commit(target);
    };

    /**
     * Releasing `going` only from `clear().then(…)` means one stalled promise
     * wedges routing permanently. This is idempotent, carries the jump token,
     * and is reachable from the animation *and* from the watchdog below — so
     * it always leaves the router usable.
     */
    const finish = (): void => {
      if (token !== this.token) return;
      clearTimeout(this.watchdog);
      commitOnce();
      if (this.warpFx === warp) {
        warp.dispose();
        this.warpFx = null;
      }
      this.el.smoke.style.display = 'none';
      this.going = false;
      this.drainPending();
    };

    this.watchdog = window.setTimeout(finish, COVER + CLEAR + WATCHDOG_SLACK);
    const run = (): void => {
      warp.cover({ duration: COVER, onOpaque: commitOnce });
      window.setTimeout(() => {
        void warp.clear(CLEAR).then(finish);
      }, CLEAR_DELAY);
    };

    if (from === null && target !== null && !hub.isLaunching()) {
      void hub.launch(target, LAUNCH_MS);
      window.setTimeout(run, SHIP_HEAD_START);
    } else {
      run();
    }
  }

  private drainPending(): void {
    if (this.pending === undefined) return;
    const next = this.pending;
    this.pending = undefined;
    if (next !== this.current) this.jump(next);
  }

  /**
   * Swap what is on screen. Called while the warp is fully opaque, so none of
   * this is ever seen mid-change. Idempotent: callers guard with a per-jump
   * flag, and re-running it is harmless anyway.
   */
  private commit(target: PanelId | null): void {
    const hub = this.hub;
    if (hub === null) return;
    // Leaving the hub: remember the angle so returning does not lose the view.
    if (this.current === null) this.hubAz = hub.azimuth;
    if (this.reduce) hub.returnShip();
    else void hub.dockShip(DOCK_MS);
    hub.setHovered(null);
    hub.setFocused(null);
    this.hovered = null;

    for (const [id, panel] of this.panels) {
      const on = id === target;
      panel.style.visibility = on ? 'visible' : 'hidden';
      panel.style.opacity = on ? '1' : '0';
      if (on) panel.scrollTop = 0;
    }

    const hubChrome = target === null ? '1' : '0';
    if (this.el.header !== null) this.el.header.style.opacity = hubChrome;
    if (this.el.foot !== null) {
      this.el.foot.style.opacity = hubChrome;
      this.el.foot.style.pointerEvents = target === null ? 'auto' : 'none';
    }
    if (this.el.hint !== null) {
      this.el.hint.style.opacity = target === null && !this.interactedOnce ? '1' : '0';
    }
    this.labels?.setVisible(target === null);
    this.labels?.tint(null);

    if (target !== null) {
      this.baseAz = this.engine?.byId(target).theta ?? 0;
      hub.park(target);
    } else {
      this.baseAz = this.hubAz;
      hub.unpark();
      hub.setAzimuth(this.baseAz, true);
    }

    this.current = target;
    applyTitle(target);
    this.recordView(target);
  }

  /** One view per destination swap, and at most one for the initial state. */
  private recordView(id: PanelId | null): void {
    this.viewed = true;
    trackView(id);
  }

  /* ----------------------------------- scene motion while a panel is open */

  /**
   * The parked view holds absolutely still — no wander, no scroll parallax.
   * Camera motion belongs to the hub only.
   *
   * README "Parked scene" still describes a sine wander plus a `scrollTop`
   * parallax at `config.parallax`, and the prototype still carries the prop —
   * but it **removed both behaviours**, and said so in its own comments ("no
   * drift, no scroll parallax", "panel scroll no longer drives the camera").
   * The prototype is the later decision and it wins; CLAUDE.md says to measure
   * there rather than guess. `config.parallax` is kept as the knob that would
   * turn it back on, and the panel `scroll` listener is *not* registered,
   * because an empty one is just a lie about what happens. See TASKS.md Phase 7
   * — this is an ASK, not drift.
   */
  private startDrift(): void {
    const tick = (): void => {
      this.drift = requestAnimationFrame(tick);
      if (this.going || this.hub === null) return;
      if (this.current !== null) this.hub.setAzimuth(this.baseAz);
    };
    this.drift = requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------- hovering */

  /** Tell the scene. The `onHover` callback above is what updates the DOM. */
  private setHover(id: PanelId | null): void {
    this.hub?.setHovered(id);
  }

  /* ---------------------------------------------------------------- input */

  private bindPointer(): void {
    const c = this.el.canvas;
    this.coarse = window.matchMedia('(pointer: coarse)').matches;
    // The reticle stands in for the cursor over the scene.
    if (!this.coarse) c.style.cursor = 'none';

    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('click', this.onCanvasClick);
    c.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  private handleWheel(e: WheelEvent): void {
    if (this.current !== null || this.hub === null) return;
    e.preventDefault();
    this.interacted();
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    this.hub.nudge(d * WHEEL_TO_RADIANS);
    this.hubAz = this.hub.azimuth;
  }

  private handleDown(e: PointerEvent): void {
    if (this.current !== null) return;
    this.dragging = true;
    this.moved = 0;
    this.lastX = e.clientX;
    this.el.canvas.setPointerCapture?.(e.pointerId);
    this.interacted();
  }

  private handleMove(e: PointerEvent): void {
    if (this.current !== null || this.going || this.hub === null) return;
    this.labels?.moveReticle(e.clientX, e.clientY);

    const r = this.el.canvas.getBoundingClientRect();
    this.hub.setPointer(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      ((e.clientY - r.top) / r.height) * 2 - 1,
    );

    if (this.dragging) {
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.moved += Math.abs(dx);
      this.hub.nudge(-dx * DRAG_TO_RADIANS);
      this.hubAz = this.hub.azimuth;
      return;
    }
    if (this.coarse) return;
    // The engine owns the ~30 Hz raycast cap and skips it mid-launch, so the
    // router does not keep a second copy of that throttle. A change comes back
    // through `onHover`.
    this.hub.rayThrottled(e.clientX, e.clientY, performance.now());
  }

  private handleUp(e: PointerEvent): void {
    if (this.current === null && this.dragging && this.moved < DRAG_SLOP_PX) {
      this.nav(e.clientX, e.clientY);
    }
    this.dragging = false;
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (this.current !== null || this.moved > DRAG_SLOP_PX) return;
    this.nav(e.clientX, e.clientY);
  }

  /**
   * The one navigation path for the canvas, fed by two independent listeners
   * and deduplicated by timestamp: the `pointerup` pair, which is what makes
   * the drag/click distinction possible, and a plain `click`, which fires even
   * when the `pointerdown` was swallowed by pointer capture or by an
   * overlapping label hit-box. That swallowing is how clicks went dead
   * intermittently — keep both listeners.
   */
  private nav(x: number, y: number): void {
    const hub = this.hub;
    if (hub === null) return;
    const now = performance.now();
    if (now - this.navAt < NAV_DEDUPE_MS) return;
    const id = hub.pick(x, y);
    if (id === null) return;
    this.navAt = now;
    this.go(id);
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', this.onKey);
    for (const a of this.labels?.items ?? []) {
      const id = a.dataset['planet'];
      if (id === undefined || !isPanelId(id)) continue;
      a.addEventListener('focus', () => {
        if (this.current !== null) return;
        this.hub?.setFocused(id);
        this.hub?.focusPlanet(id);
        this.setHover(id);
      });
      a.addEventListener('blur', () => this.hub?.setFocused(null));
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.current !== null) {
      e.preventDefault();
      this.exit();
      return;
    }
    if (this.current !== null || this.hub === null) return;
    if (e.key === 'ArrowLeft') {
      this.interacted();
      this.hub.nudge(-ARROW_STEP_RADIANS);
      this.hubAz = this.hub.azimuth;
    } else if (e.key === 'ArrowRight') {
      this.interacted();
      this.hub.nudge(ARROW_STEP_RADIANS);
      this.hubAz = this.hub.azimuth;
    }
  }

  /**
   * Every in-site hash link routes; nothing does a document load. Delegated at
   * the document, so panel links, the text edition and the hub labels are all
   * covered by this one listener.
   */
  private handleClick(e: MouseEvent): void {
    if (this.flat) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    const a = target.closest('a');
    if (a === null) return;
    // Leave modified clicks alone — they mean "open elsewhere".
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (a.hasAttribute('data-exit')) {
      e.preventDefault();
      this.exit();
      return;
    }
    const href = a.getAttribute('href') ?? '';
    if (href.charAt(0) !== '#') return;
    const id = href.slice(1);
    e.preventDefault();
    if (id === '') this.exit();
    else if (isPanelId(id) && this.panels.has(id)) this.go(id);
  }

  private bindLifecycle(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('resize', this.onResize);
  }

  /* ----------------------------------------------------------- first load */

  private interacted(): void {
    this.interactedOnce = true;
    if (this.el.hint !== null) this.el.hint.style.opacity = '0';
  }

  /** A one-time ~10° swing, so the camera reads as draggable without a tooltip. */
  private hint(): void {
    window.setTimeout(() => {
      if (this.interactedOnce || this.current !== null || this.hub === null) return;
      this.hub.setAzimuth(HINT_AZIMUTH);
      window.setTimeout(() => {
        if (this.interactedOnce || this.current !== null || this.hub === null) return;
        this.hub.setAzimuth(this.hubAz);
      }, HINT_HOLD_MS);
    }, HINT_DELAY_MS);
  }

  /** The hub angle, not the parked one — a panel is holding its planet's theta. */
  private currentHubAzimuth(): number {
    if (this.hub === null || this.current !== null) return this.hubAz;
    return this.hub.azimuth;
  }
}

/* ------------------------------------------------------------------ start */

/**
 * Boot the router. `main.ts` is a deferred module, so the DOM contract already
 * exists — the `readyState` check is here only so this stays correct if the
 * script is ever moved or loaded some other way.
 */
export function startRouter(): Router {
  const router = new Router();
  const begin = (): void => router.mount();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', begin, { once: true });
  } else {
    begin();
  }
  // `pagehide`, not `unload`: `unload` is ignored on mobile Safari and blocks
  // the back/forward cache everywhere else. This is the only teardown point.
  window.addEventListener('pagehide', () => router.destroy(), { once: true });
  return router;
}
