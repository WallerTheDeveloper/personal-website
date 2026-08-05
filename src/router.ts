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
 *     watchdog at `COVER + CLEAR + WATCHDOG_SLACK`. The token and the
 *     commit-once rule are `jump-guard.ts`, where they are unit-tested.
 *   - `go(id)` pushes history **and** drives `jump()` directly — it never waits
 *     on the resulting `hashchange`.
 *   - `openDetail()` / `closeDetail()` are the same rule one level down: they
 *     push and then change the view themselves. They exist *because* `go()`
 *     early-returns on `id === current`, and a detail always opens over a panel
 *     that is already current — routing one through `go()` would push nothing.
 *     `closeDetail()` pushes `#projects` rather than calling `history.back()`,
 *     for `exit()`'s reasons plus one more: a visitor who arrived on a deep
 *     link has no `#projects` entry behind them to go back to.
 *   - Exactly one live `Warp` owns `#smoke`; `jump()` disposes the previous
 *     instance before constructing the next.
 *   - Both canvas nav paths — the `pointerdown`/`pointerup` pair and a plain
 *     `click` — feed one deduplicated `nav()`. Keep both.
 *   - Overlapping jumps queue in `_pending`; they never interleave.
 */

import {
  isPanelId,
  isProjectDetailId,
  PANEL_IDS,
  PROJECT_DETAIL_IDS,
  type PanelId,
  type ProjectDetailId,
} from './content';
import { ProjectDetailLayer, teardownEmbeds, upgradeFacades } from './project-detail';
import { trackView } from './analytics';
import { engineChunkUrl, warmEngineChunk } from './boot-progress';
import { applyTitle } from './head';
import { JumpGuard } from './jump-guard';
import { LabelLayer } from './labels';
import { LoadingRing, RING_STAGES } from './loading-ring';
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
  /** The fps readout and the drag hint. */
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

/** Fade-out of the loading screen once the first frame has painted, ms. */
const LOADER_FADE_MS = 400;
/**
 * How long the completed dial is held, fully opaque, before the fade starts.
 *
 * Measured from the moment the arc *lands* on 100, not from the moment it is
 * told to — `complete()` resolves on arrival for exactly this reason, or the
 * ramp would eat the hold and the dial would read 100 for a few frames of an
 * already-fading screen. Which is the bug this whole path exists to fix.
 */
const LOADER_HOLD_MS = 1500;
/**
 * Backstop on the ramp: headroom for it, plus slack.
 *
 * `holdThenFade()` is idempotent and reachable from the ramp *and* from here,
 * the same shape as `finish()` and its watchdog. It matters more than that one
 * does: a stranded loading screen is fully opaque and would cover the entire
 * site, so "the ring resolved" can never be the only way the fade starts.
 *
 * Deliberately *not* including `LOADER_HOLD_MS` — `holdThenFade()` applies the
 * hold itself, so counting it here would hold twice on the backstop path. The
 * ramp is ~0.75 s from 90 and under 1 s from anywhere the arc can realistically
 * be when the first frame lands.
 */
const LOADER_SETTLE_MS = 1200 + 300;
/**
 * How long the loading screen may hold the viewport before the document gives
 * up and flattens.
 *
 * A failed `import()` rejects and `load()` already catches it. This covers the
 * other shape: a request that neither completes nor errors, which on a stalled
 * connection would otherwise leave a visitor watching a sweeping hairline
 * forever. Flattening hands them the text edition — the same content, and the
 * state this document ships in — rather than merely uncovering an empty void.
 */
const LOADER_TIMEOUT_MS = 12_000;

/* ------------------------------------------------------------------ input */

/**
 * Pointer travel, CSS px, above which a press is a drag and not a click.
 *
 * Two numbers, because a finger is not a mouse. A deliberate tap routinely
 * travels 8–12 px before it lifts, and *both* nav paths bail above this — so the
 * mouse-tuned 6 meant tapping a planet on a phone failed about as often as it
 * worked, silently, with no feedback that anything had been aimed at.
 */
const DRAG_SLOP_PX = { fine: 6, coarse: 12 } as const;
/** Two nav paths reach the same click; the later one inside this window loses. */
const NAV_DEDUPE_MS = 350;
const WHEEL_TO_RADIANS = 0.0011;
const DRAG_TO_RADIANS = 0.0022;
const ARROW_STEP_RADIANS = 0.1;

/** First-load nudge: ~10° out and back, unless the visitor has already acted. */
const HINT_DELAY_MS = 900;
const HINT_HOLD_MS = 1500;
const HINT_AZIMUTH = 0.17;

/* ------------------------------------------------------------------ hash */

/*
 * A location hash as routing state — a destination, plus the project detail
 * open over it.
 *
 * Pure, and exported for its own unit tests: this is the one place a URL turns
 * into routing state, so everything it must tolerate — an empty hash, a bare
 * `#`, the `#/xr` form, a hash from a stale link, an id that is not a
 * destination — has to be settled here rather than at each call site.
 *
 * An unrecognised destination is the hub. There is no error state to route to:
 * an unknown hash on a single-document site means "the visitor is here", and
 * the hub is what "here" looks like.
 */

export interface Route {
  readonly panel: PanelId | null;
  readonly project: ProjectDetailId | null;
}

/**
 * The full grammar: `#<panel>`, or `#projects/<pN>` for a project detail, with
 * the `#/` form still tolerated on the front.
 *
 * The two halves recover differently, on purpose. A *head* that is not a
 * destination is the hub, exactly as it has always been. A *tail* that is not a
 * project id is dropped rather than escalated to the hub — "the visitor asked
 * for Projects" is still true, and the panel with no dialog on it is a better
 * answer to `#projects/p9` than the hub is.
 */
export function parseRoute(hash: string): Route {
  const raw = (hash || '').replace(/^#\/?/, '');
  const cut = raw.indexOf('/');
  const head = cut === -1 ? raw : raw.slice(0, cut);
  const tail = cut === -1 ? '' : raw.slice(cut + 1);
  if (!isPanelId(head)) return { panel: null, project: null };
  return {
    panel: head,
    project: head === 'projects' && isProjectDetailId(tail) ? tail : null,
  };
}

/**
 * The panel half on its own. Kept as its own export because most of the router
 * only ever wants the destination, and because its test file is the regression
 * guard on everything the grammar above must keep tolerating.
 */
export function parseHash(hash: string): PanelId | null {
  return parseRoute(hash).panel;
}

/* ----------------------------------------------------------------- router */

export class Router {
  private engine: Engine | null = null;
  private hub: HubApi | null = null;
  private labels: LabelLayer | null = null;
  private warpFx: Warp | null = null;

  /** The open panel, or `null` for the hub. The single gate on all input. */
  private current: PanelId | null = null;
  /**
   * The project detail open over the Projects panel, or `null`. A second axis,
   * not a fifth destination: it never starts a jump, because the panel is
   * already open and the camera already parked, so none of the warp machinery
   * below is involved in changing it.
   */
  private detail: ProjectDetailId | null = null;
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
  /** Hands out the per-jump commit-once / superseded guard. See `jump-guard.ts`. */
  private readonly jumps = new JumpGuard();
  private watchdog = 0;
  private drift = 0;
  /** Loading-screen stall timer, and the once-only guard on its dismissal. */
  private loaderTimer = 0;
  private loaderDone = false;
  /** Backstop on the hold at 100, and the once-only guard on the fade itself. */
  private loaderSettle = 0;
  private loaderFading = false;
  /** The loading screen's progress dial, fed from what the boot actually finishes. */
  private ring: LoadingRing | null = null;

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
  /** Set from `coarse` when the pointer is bound, so the two cannot disagree. */
  private dragSlop: number = DRAG_SLOP_PX.fine;
  /** In-flight resize frame, so a burst of events costs one `resize()`. */
  private resizeRaf = 0;
  /** The hub chrome carrying the reticle's link affordance, kept for teardown. */
  private hoverEls: readonly Element[] = [];

  private el!: {
    canvas: HTMLCanvasElement;
    labels: HTMLElement;
    fallback: HTMLElement | null;
    loader: HTMLElement | null;
    smoke: HTMLCanvasElement;
    reticle: HTMLElement | null;
    hint: HTMLElement | null;
    /** The chip, hidden wholesale when the HUD is off… */
    fpsBox: HTMLElement | null;
    /** …and the number inside it, rewritten twice a second. */
    fps: HTMLElement | null;
    header: HTMLElement | null;
    foot: HTMLElement | null;
  };
  private panels: ReadonlyMap<PanelId, HTMLElement> = new Map();
  private details: ReadonlyMap<ProjectDetailId, HTMLElement> = new Map();
  private detailLayer: ProjectDetailLayer | null = null;

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
  private readonly onLinkEnter = (): void => this.labels?.setLinkHover(true);
  private readonly onLinkLeave = (): void => this.labels?.setLinkHover(false);
  private readonly onPointerLeave = (): void => this.labels?.setArmed(false);
  private readonly onTouchMove = (e: TouchEvent): void => {
    if (this.current === null) e.preventDefault();
  };
  private readonly onVisibility = (): void => {
    this.hub?.pause(document.hidden);
    // pagehide is not guaranteed on mobile, where a backgrounded tab may simply
    // be killed. This is the reliable moment to bank the camera angle.
    if (document.hidden) saveAzimuth(this.currentHubAzimuth());
  };
  private readonly onResize = (): void => {
    // Throttled to one `resize()` per frame. iOS fires this continuously while
    // the address bar collapses, and each call reallocates the drawing buffer —
    // on a phone, mid-scroll, which is the worst moment to be doing it. Nothing
    // is lost: a frame is the finest the result can be seen at anyway.
    if (this.resizeRaf !== 0) return;
    this.resizeRaf = requestAnimationFrame(() => {
      this.resizeRaf = 0;
      this.hub?.resize();
    });
  };

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
      loader: document.querySelector('#loading'),
      reticle: document.querySelector('#reticle'),
      hint: document.querySelector('#hud-hint'),
      fpsBox: document.querySelector('#fps'),
      fps: document.querySelector('#fps-readout'),
      header: document.querySelector('#hub-head'),
      foot: document.querySelector('#hub-foot'),
      // No `#stage` ref: hiding it is `html[data-dg-flat] #stage` in the
      // stylesheet now, so that the no-JS document gets it too.
    };

    const panels = new Map<PanelId, HTMLElement>();
    for (const id of PANEL_IDS) {
      const panel = document.querySelector<HTMLElement>(`[data-panel="${id}"]`);
      if (panel !== null) panels.set(id, panel);
    }
    this.panels = panels;

    const details = new Map<ProjectDetailId, HTMLElement>();
    for (const id of PROJECT_DETAIL_IDS) {
      // getElementById, never querySelector: the detail's id is `projects/p1`,
      // which is legal as an id and as a URI fragment but is not a valid CSS id
      // selector — `#projects\/p1` would need CSS.escape. getElementById takes
      // the raw string, so the id can simply match the sub-route.
      const detail = document.getElementById(`projects/${id}`);
      if (detail !== null) details.set(id, detail);
    }
    this.details = details;
    this.detailLayer = new ProjectDetailLayer(details, () => this.closeDetail());

    this.labels = new LabelLayer(labels, this.el.reticle);
    if (!config.showHud && this.el.fpsBox !== null) this.el.fpsBox.style.display = 'none';

    window.addEventListener('popstate', this.onPop);
    window.addEventListener('hashchange', this.onHash);
    document.addEventListener('click', this.onClick);

    // The head probe already answered this, before first paint, and wrote the
    // answer onto <html>. Asking it here rather than after the import is what
    // makes "a device with no WebGL never downloads three" true — and it closes
    // the window in which this router would intercept every hash link, drop it
    // (there is no hub to jump with), and only then find out it should have been
    // flat all along. `boot()` still re-checks with the engine's own
    // `hasWebGL()`, which is a stricter test than the probe's.
    if (!document.documentElement.hasAttribute('data-dg-3d')) {
      this.flatten();
      return;
    }

    // Armed before the import, not after: the stall this guards against is the
    // request itself never settling, so the clock has to start with it.
    this.loaderTimer = window.setTimeout(() => this.flatten(), LOADER_TIMEOUT_MS);

    // Started beside the stall clock above, because the two watch the same
    // thing: the dial's first span *is* the download, so it has to begin before
    // the request does. Reduced motion is asked of matchMedia rather than of the
    // engine's `reducedMotion()` on purpose — `this.reduce` is not answered
    // until the chunk that defines it has downloaded, which is the very thing
    // being waited on here. Do not "tidy" this into the engine call.
    const arc = document.querySelector<SVGCircleElement>('#loading-arc');
    const pct = document.querySelector<HTMLElement>('#loading-pct');
    if (arc !== null && pct !== null) {
      this.ring = new LoadingRing(arc, pct, matchMedia('(prefers-reduced-motion: reduce)').matches);
      this.ring.start();
      // Armed until the first byte lands. A server that sends no `content-length`
      // never produces one, and this is what keeps that visitor watching a dial
      // that approaches 70 rather than one frozen at zero.
      this.ring.idle(RING_STAGES.download.ceil, RING_STAGES.download.tau);
    }

    void this.load();
  }

  private async load(): Promise<void> {
    try {
      // Stream the chunk first, purely to count its bytes — the `import()` below
      // then resolves out of the cache entry this just filled. Never fatal: it
      // resolves `false` on anything it cannot measure, and the dial falls back
      // to the idle drift armed in `mount()`.
      const url = engineChunkUrl();
      if (url !== null) {
        await warmEngineChunk(url, (fraction) => {
          this.ring?.report(fraction * RING_STAGES.download.ceil);
        });
      }
      const engine = await import('./hub');
      // The chunk is down. Everything left is local work.
      this.ring?.report(RING_STAGES.download.ceil);
      await this.boot(engine);
    } catch (err: unknown) {
      console.warn('[router] 3D unavailable, using the text edition', err);
      this.flatten();
    }
  }

  private async boot(engine: Engine): Promise<void> {
    // The import has already resolved by the time this runs, and the stall
    // watchdog may have flattened the document while it was in flight. Booting
    // a scene into a flattened document would re-hide #fallback behind a canvas
    // the visitor has already been told is not coming.
    if (this.flat) return;

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
        // A context lost inside the fade window has already handed the text
        // edition back; this stale timer would hide it again.
        if (this.flat) return;
        fb.style.display = 'none';
      }, FALLBACK_FADE_MS + 20);
    }
    this.el.canvas.style.opacity = '1';

    const hub = await engine.initHub(this.el.canvas, {
      composition: config.composition,
      // Four planets, each reported as its textures land. `initHub()` yields a
      // paint between them, which is the only reason these are visible at all —
      // a synchronous build would apply all four and repaint once, at the end.
      onProgress: (done: number, total: number): void => {
        const span = RING_STAGES.build.ceil - RING_STAGES.download.ceil;
        this.ring?.report(RING_STAGES.download.ceil + (span * done) / total);
      },
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
      // The GPU can take the context away at any moment — a driver reset, a
      // laptop switching cards, too many live contexts in other tabs. The
      // engine stops itself and this hands the visitor the text edition, which
      // is the same document, flowed.
      onContextLost: (): void => this.flatten(),
    });
    // `initHub()` now yields between planets, so the document can be handed to
    // the text edition *while the scene is being built* — by the stall watchdog,
    // or by a context lost mid-bake. Neither could happen when it was one
    // synchronous call. Booting on over a flattened document would re-hide
    // #fallback behind a canvas the visitor has already been told is not coming.
    //
    // Disposing here is not a second renderer lifecycle: nothing re-creates one,
    // and this is an abandoned boot being torn down rather than the live hub
    // being re-initialised (CLAUDE.md "one WebGLRenderer per document").
    if (this.flat) {
      hub.dispose();
      return;
    }

    this.hub = hub;
    window.__dgHub = hub;
    window.__dg3dReady = true;
    // The scene is built. What is left is the first frame, where the shaders
    // compile — one event, with nothing inside it to sample, so the dial drifts
    // across it rather than pretending to measure it.
    this.ring?.report(RING_STAGES.build.ceil);
    this.ring?.idle(RING_STAGES.frame.ceil, RING_STAGES.frame.tau);

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

    // Two frames, not one, and not `__dg3dReady` above. `initHub()` returns
    // having only *scheduled* its first rAF, and that first frame is where the
    // scene's shader programs actually compile — the longest single stall in the
    // boot. The inner callback runs after it has been composited, which is the
    // first moment there is genuinely something behind the loading screen.
    requestAnimationFrame(() => requestAnimationFrame(() => this.dismissLoader()));
  }

  /**
   * The scene is genuinely behind the screen: finish the dial, then take the
   * screen down.
   *
   * This is the one moment the dial is entitled to read 100. It *ramps* there
   * rather than snapping — the arc eases toward every floor it is given, and 100
   * is just the last one — and the hold below is measured from the ramp landing,
   * not from this call. Snapping to 100 on the same frame the fade started was
   * the visible half of the "5 % then suddenly 100 %" this path was rebuilt to
   * fix; holding a completed dial for a beat is the other half.
   *
   * Idempotent, and reachable from the first painted frame, from `flatten()` and
   * from `destroy()`.
   */
  private dismissLoader(): void {
    if (this.loaderDone) return;
    this.loaderDone = true;
    clearTimeout(this.loaderTimer);

    const ramp = this.ring?.complete();
    if (ramp === undefined) {
      // No dial to finish — nothing to hold for either.
      this.holdThenFade();
      return;
    }
    // Two ways in, exactly as `finish()` has two ways in, and for a stronger
    // reason: a loading screen stranded at `opacity: 1` covers the whole site,
    // so the ring resolving can never be the only path to the fade.
    void ramp.then(() => this.holdThenFade());
    this.loaderSettle = window.setTimeout(() => this.holdThenFade(), LOADER_SETTLE_MS);
  }

  /**
   * Hold the completed dial, then fade.
   *
   * Mirrors the `#fallback` fade deliberately: opacity and pointer-events first,
   * `display: none` only after the transition, and both timers re-check the flat
   * flag because a context lost inside the window has already handed the
   * document over. Idempotent.
   */
  private holdThenFade(): void {
    if (this.loaderFading) return;
    this.loaderFading = true;
    clearTimeout(this.loaderSettle);

    const el = this.el?.loader;
    if (el == null) return;
    window.setTimeout(() => {
      // `flatten()` hands the screen back to the stylesheet; writing a fade over
      // it here would pin inline values on top of the flat rules.
      if (this.flat) return;
      el.style.transition = `opacity ${LOADER_FADE_MS}ms ease`;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      window.setTimeout(() => {
        if (this.flat) return;
        el.style.display = 'none';
      }, LOADER_FADE_MS + 20);
    }, LOADER_HOLD_MS);
  }

  /**
   * No WebGL, the engine failed to load, or the context was lost mid-session:
   * one continuous scrolling document. Not a degraded mode so much as the other
   * edition of the same content — `index.html` ships in this state and the head
   * probe leaves it there whenever the scene cannot run.
   *
   * The presentation is entirely `html[data-dg-flat]` in `styles.css`, including
   * the `#stage` and `#fallback` rules that used to be written inline here: the
   * flat document has to render identically with no JS at all, so CSS is the
   * only place that can own it. What is left here is undoing the inline styles
   * the *3D* path wrote, and standing the routing machinery down.
   *
   * Idempotent — context loss can fire more than once, and a lost context on a
   * device that also failed `hasWebGL()` would arrive here twice.
   */
  flatten(): void {
    if (this.flat) return;
    this.flat = true;
    window.__dg3dReady = false;
    document.documentElement.removeAttribute('data-dg-3d');
    document.documentElement.setAttribute('data-dg-flat', '1');

    // Stop driving the scene. The renderer itself is NOT disposed: one renderer
    // per document, disposed only from `destroy()` on `pagehide` (CLAUDE.md).
    cancelAnimationFrame(this.drift);
    clearTimeout(this.watchdog);
    clearTimeout(this.loaderTimer);
    clearTimeout(this.loaderSettle);
    this.loaderDone = true;
    // Both guards, because the hold and the fade are separately reachable: the
    // flat rules hide the screen outright, so neither has anything left to do.
    this.loaderFading = true;
    // Stood down rather than completed: this path is a boot that did not happen,
    // and a dial left running would keep a frame loop alive against a screen the
    // flat rules have already hidden. `stop()` also resolves a pending
    // `complete()`, so a `dismissLoader()` racing this one is not left awaiting
    // a ramp that will never run.
    this.ring?.stop();
    this.warpFx?.dispose();
    this.warpFx = null;
    this.going = false;
    this.pending = undefined;
    // The dialog rules are gated on `data-dg-3d`, just removed, so the detail
    // un-fixes itself back into the flow. What this is for is the part CSS
    // cannot undo: taking the modal ARIA and the focus trap off, so the flat
    // document does not claim to hold a modal that can no longer be dismissed.
    this.setDetail(null);
    // And a card player is neither open nor closed by that, so it would go on
    // playing under a document that has just become the text edition.
    teardownEmbeds(this.panels.get('projects') ?? null);

    // Inline styles beat the stylesheet, so the fade-out `boot()` wrote on the
    // success path has to be cleared rather than overridden. Emptying them hands
    // #fallback back to the flat rules instead of pinning a second set of
    // values that would then have to agree with them.
    const fb = this.el?.fallback;
    if (fb != null) {
      fb.style.display = '';
      fb.style.opacity = '';
      fb.style.pointerEvents = '';
      fb.style.transition = '';
    }
    // The loading screen is hidden here by `html[data-dg-flat] #stage`, but a
    // half-finished fade would leave inline values pinned over it. Same reason
    // as #fallback above: hand the element back to the stylesheet rather than
    // keep a second set of values that then has to agree with it.
    const ld = this.el?.loader;
    if (ld != null) {
      ld.style.display = '';
      ld.style.opacity = '';
      ld.style.pointerEvents = '';
      ld.style.transition = '';
    }
    // Same for the panels: `commit()` wrote visibility/opacity on each. The flat
    // rules carry `!important` and win regardless, but leaving stale inline
    // state behind would make the DOM lie about what is on screen.
    for (const panel of this.panels.values()) {
      panel.style.visibility = '';
      panel.style.opacity = '';
    }

    // Mid-session loss: keep the visitor where they were reading. The panel is
    // now a section in the flow, and `#backend`/`#xr`/… are its anchors, so
    // every in-page link resolves natively from here on.
    if (this.current !== null) this.panels.get(this.current)?.scrollIntoView();

    if (!this.viewed) this.recordView(null);
  }

  destroy(): void {
    saveAzimuth(this.currentHubAzimuth());
    cancelAnimationFrame(this.drift);
    cancelAnimationFrame(this.resizeRaf);
    clearTimeout(this.watchdog);
    clearTimeout(this.loaderTimer);
    clearTimeout(this.loaderSettle);
    this.ring?.stop();
    window.removeEventListener('popstate', this.onPop);
    window.removeEventListener('hashchange', this.onHash);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.removeEventListener('pointerleave', this.onPointerLeave);
    for (const el of this.hoverEls) {
      el.removeEventListener('pointerenter', this.onLinkEnter);
      el.removeEventListener('pointerleave', this.onLinkLeave);
    }
    this.hoverEls = [];
    if (this.el !== undefined) {
      this.el.canvas.removeEventListener('wheel', this.onWheel);
      this.el.canvas.removeEventListener('pointerdown', this.onDown);
      this.el.canvas.removeEventListener('click', this.onCanvasClick);
      this.el.canvas.removeEventListener('touchmove', this.onTouchMove);
    }
    this.warpFx?.dispose();
    this.warpFx = null;
    this.detailLayer?.destroy();
    this.detailLayer = null;
    // The one renderer per document, disposed here and nowhere else.
    if (window.__dgHub != null) {
      window.__dgHub.dispose();
      window.__dgHub = null;
    }
    this.hub = null;
  }

  /* --------------------------------------------------------------- routing */

  /**
   * The hash as a panel id, or `null` for the hub — and additionally `null` for
   * a destination this document does not carry, which is the same recovery an
   * unknown hash gets: show the hub rather than route to a panel that is not
   * there.
   */
  private hashRoute(): Route {
    const { panel, project } = parseRoute(window.location.hash);
    if (panel === null || !this.panels.has(panel)) return { panel: null, project: null };
    if (project === null || !this.details.has(project)) return { panel, project: null };
    return { panel, project };
  }

  private hashId(): PanelId | null {
    return this.hashRoute().panel;
  }

  private route(): void {
    if (this.flat) return;
    const { panel, project } = this.hashRoute();
    // Same destination, different sub-route — which is what Back out of an open
    // detail is. No jump and no warp: the scene does not move, so there is
    // nothing for a cover to hide. Without this branch the old `target ===
    // current` early return swallowed it and Back did nothing at all.
    if (panel === this.current) {
      if (this.setDetail(panel === 'projects' ? project : null)) this.announce();
      return;
    }
    this.jump(panel);
  }

  /**
   * Push a history entry and animate to it. The jump is driven directly rather
   * than waiting on the resulting `hashchange`, so it still runs where History
   * is sandboxed and `pushState` throws.
   */
  go(id: PanelId | null): void {
    if (this.flat) return;
    if (id === this.current) return;
    // Take the detail down on the click that leaves, not 900 ms later when
    // `commit()` runs: the teardown is what stops a playing embed, and under an
    // opaque warp cover the visitor would go on hearing it the whole way.
    // `commit()` sets the title and the view for the destination either way.
    this.setDetail(null);
    const url = id === null ? window.location.pathname + window.location.search : `#${id}`;
    this.push(url, { dg: id });
    this.jump(id);
  }

  /**
   * Push a URL, tolerating a frame that sandboxes History. Extracted from `go()`
   * so a sub-route pushes in exactly the same way a destination does.
   */
  private push(url: string, state: unknown): void {
    try {
      window.history.pushState(state, '', url);
    } catch {
      // Sandboxed history. Driving the change directly is what moves the site.
    }
  }

  /**
   * Open a project detail.
   *
   * The same shape `go()` has — push history, then drive the change directly,
   * never waiting on a `hashchange` that `pushState` does not fire — but with no
   * jump attached: the panel is already open and the camera already parked.
   *
   * It cannot be routed through `go()`, which early-returns on `id ===
   * current`, and a detail always opens over a panel that is already current.
   * That return is correct and stays; this is the entry point beside it.
   */
  openDetail(project: ProjectDetailId): void {
    if (this.flat || this.detail === project || !this.details.has(project)) return;
    this.push(`#projects/${project}`, { dg: 'projects', detail: project });
    if (this.current === 'projects') {
      if (this.setDetail(project)) this.announce();
      return;
    }
    // Reached from a stale bookmark or a link on another panel: one ordinary
    // jump, and `commit()` picks the sub-route back out of the hash just pushed.
    this.jump('projects');
  }

  /**
   * Close it, back to `#projects`.
   *
   * **Push, never `history.back()`** — the rule `exit()` lives by, and here
   * there is a second reason for it: a visitor who arrived on `#projects/p1` by
   * deep link has no `#projects` entry behind them at all, so Back would take
   * them off the site. Where History is sandboxed it would do nothing, leaving
   * an open dialog over a URL claiming it is closed.
   *
   * The cost is that Back *after* closing re-opens the detail. That is the same
   * trade `exit()` already makes, and `project-detail.spec.ts` pins it so that
   * changing it later has to be deliberate.
   */
  closeDetail(): void {
    if (this.flat || this.detail === null) return;
    this.push('#projects', { dg: 'projects', detail: null });
    if (this.setDetail(null)) this.announce();
  }

  /**
   * The view half, with no history in it — `jump()` is to `go()` as this is to
   * `openDetail()`. Returns whether anything actually changed, so the callers
   * do not record a second view for a state the visitor is already in.
   */
  private setDetail(project: ProjectDetailId | null): boolean {
    if (this.detail === project) return false;
    this.detail = project;
    if (project === null) this.detailLayer?.hide();
    else this.detailLayer?.show(project);
    return true;
  }

  /** Title and analytics for whatever is on screen now — always after the swap. */
  private announce(): void {
    applyTitle(this.current, this.detail);
    this.recordView(this.current, this.detail);
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

    // The reticle stands in for the cursor over the scene; it has no business
    // hanging over a panel. Hidden before the reduced-motion branch below, or
    // that path would leave it floating there.
    this.labels?.setArmed(false);

    /*
     * Reduced motion: no ship flight and no warp — the destination swaps under
     * a 200 ms cross-fade instead (README "Reduced motion"). The fade is the
     * `.panel` transition in the `prefers-reduced-motion` block of styles.css,
     * driven by the same inline visibility/opacity `commit()` always writes, so
     * there is no second timeline here that could disagree with the CSS.
     *
     * `going` is released immediately and deliberately: nothing asynchronous is
     * outstanding, and holding the flag across the fade would gain nothing but
     * a new way to wedge routing.
     */
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

    // One Warp owns the shared #smoke canvas at a time. A surviving previous
    // instance would fight this one over its 2D transform, its resize listener
    // and its rAF chain.
    this.warpFx?.dispose();
    const warp = new Warp(this.el.smoke, { accent: tint });
    this.warpFx = warp;

    /*
     * Releasing `going` only from `clear().then(…)` means one stalled promise
     * wedges routing permanently. `finish` is therefore reachable from the
     * animation *and* from the watchdog below, and the guard is what makes that
     * safe: the commit runs exactly once however many paths reach it, and a
     * jump this one has superseded can no longer finish anything. Both rules
     * live in `jump-guard.ts`, with the reasoning.
     */
    const jump = this.jumps.begin({
      commit: () => this.commit(target),
      settle: () => {
        clearTimeout(this.watchdog);
        if (this.warpFx === warp) {
          warp.dispose();
          this.warpFx = null;
        }
        this.el.smoke.style.display = 'none';
        this.going = false;
        this.drainPending();
      },
    });

    this.watchdog = window.setTimeout(jump.finish, COVER + CLEAR + WATCHDOG_SLACK);
    const run = (): void => {
      warp.cover({ duration: COVER, onOpaque: jump.commit });
      window.setTimeout(() => {
        void warp.clear(CLEAR).then(jump.finish);
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
    // Opening a panel hands the OS cursor back — the panel is a sibling of
    // #stage, so `cursor: none` does not reach it. Disarm, or the ring stays
    // frozen wherever the pointer was when the jump started. The next real
    // pointer move on the hub arms it again.
    this.labels?.setLinkHover(false);
    if (target !== null) this.labels?.setArmed(false);

    if (target !== null) {
      this.baseAz = this.engine?.byId(target).theta ?? 0;
      hub.park(target);
    } else {
      this.baseAz = this.hubAz;
      hub.unpark();
      hub.setAzimuth(this.baseAz, true);
    }

    this.current = target;
    // The card video facades, built the first time the Projects panel is
    // committed to and never before: a visitor who stays on the hub must not pay
    // four `i.ytimg.com` requests for a grid they have not seen. Both calls are
    // additive and idempotent — no routing rule is involved, and the sub-route
    // below is still the only second axis.
    const projects = this.panels.get('projects') ?? null;
    if (target === 'projects') upgradeFacades(projects ?? document);
    else teardownEmbeds(projects);
    // The detail layer is told; it never listens for itself. `go()` drives
    // `jump()` directly and `pushState` fires no `hashchange`, so anything
    // watching only the URL would miss every router-driven navigation. This is
    // also the deep-link path: `boot()` reaches here with `#projects/p1`
    // already in the address bar.
    this.setDetail(target === 'projects' ? this.hashRoute().project : null);
    this.announce();
  }

  /** One view per destination swap, and at most one for the initial state. */
  private recordView(id: PanelId | null, project: ProjectDetailId | null = null): void {
    this.viewed = true;
    trackView(id, project);
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
    this.dragSlop = this.coarse ? DRAG_SLOP_PX.coarse : DRAG_SLOP_PX.fine;
    // `cursor: none` is the stylesheet's now, on the whole stage rather than the
    // canvas, so that the labels and the chrome do not hand the OS cursor back
    // mid-sweep. It is gated on the same `(pointer: coarse)` this line reads.

    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('click', this.onCanvasClick);
    c.addEventListener('touchmove', this.onTouchMove, { passive: false });
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    // Leaving the window is the one way the pointer can stop existing without a
    // final move to tell us. Without this the ring stays pinned to the edge.
    document.addEventListener('pointerleave', this.onPointerLeave);

    if (!this.coarse) this.bindHoverAffordance();
  }

  /**
   * The hub's clickable chrome — four planet anchors and the skip link — told to
   * the reticle.
   *
   * Scoped to `#stage` rather than listed by id: everything interactive inside
   * it is hub chrome by definition, and a control added later gets the
   * affordance without having to remember this. Nothing outside `#stage` is
   * covered by `cursor: none`, so nothing outside it needs the treatment. The
   * `a, button` selector is also what keeps the inert fps chip out of the set —
   * a readout must not grow the ring as though it could be clicked.
   */
  private bindHoverAffordance(): void {
    const stage = document.querySelector('#stage');
    if (stage === null) return;
    this.hoverEls = Array.from(stage.querySelectorAll('a, button'));
    for (const el of this.hoverEls) {
      el.addEventListener('pointerenter', this.onLinkEnter);
      el.addEventListener('pointerleave', this.onLinkLeave);
    }
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
    // Coarse pointers get neither the reticle nor `cursor: none`: there is no
    // cursor to replace, and a ring trailing a finger is just a smudge. Moving
    // it anyway — as this used to, before the `coarse` guard further down —
    // armed it on touch as soon as arming became a side effect of moving.
    if (!this.coarse) this.labels?.moveReticle(e.clientX, e.clientY);

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
    if (this.current === null && this.dragging && this.moved < this.dragSlop) {
      this.nav(e.clientX, e.clientY);
    }
    this.dragging = false;
  }

  private handleCanvasClick(e: MouseEvent): void {
    if (this.current !== null || this.moved > this.dragSlop) return;
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
    // Escape chains: the detail first, the panel second. This branch can never
    // be the reason Escape stops reaching `exit()` — a detail is only ever open
    // over an open panel, so the second press finds `detail === null` and falls
    // through to the branch below. Canvas input is still gated on `current`
    // alone; `detail !== null` implies `current === 'projects'`.
    if (e.key === 'Escape' && this.detail !== null) {
      e.preventDefault();
      this.closeDetail();
      return;
    }
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
    // Its href is `#projects`, which is a live in-page anchor with no JS. Here
    // it has to mean "close", because `go('projects')` would early-return on
    // the panel that is already current and leave the dialog up.
    if (a.hasAttribute('data-detail-close')) {
      e.preventDefault();
      this.closeDetail();
      return;
    }
    const href = a.getAttribute('href') ?? '';
    if (href.charAt(0) !== '#') return;
    const id = href.slice(1);
    e.preventDefault();
    if (id === '') {
      this.exit();
      return;
    }
    const { panel, project } = parseRoute(`#${id}`);
    if (panel === 'projects' && project !== null) this.openDetail(project);
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
