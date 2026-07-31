/**
 * The warp overlay, driven without a DOM.
 *
 * `Warp` touches exactly three things — a canvas, a 2D context and `window` —
 * so all three are stubbed and the animation is stepped by hand. That makes the
 * two properties this module is judged on directly testable: it builds nothing
 * at click time, and it can never leave a caller waiting on a `clear()` that
 * will not arrive (CLAUDE.md "Router invariants").
 *
 * The look is not tested here. It is verified against the prototype in a real
 * browser, like the engine was.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PLANETS } from '../../src/engine/planets';
import * as warpModule from '../../src/warp';
import {
  ACCENTS,
  HOLD_CAP,
  MAX_COVER,
  MIN_COVER,
  Warp,
  loadAzimuth,
  saveAzimuth,
} from '../../src/warp';

/* ---------------------------------------------------------------- harness */

interface ContextCall {
  readonly name: string;
  readonly args: readonly unknown[];
}

interface FakeCanvas {
  width: number;
  height: number;
  style: { display: string; width: string; height: string };
  getContext: () => unknown;
}

/** Everything the warp is allowed to ask a 2D context for. */
const ALLOWED_CONTEXT_CALLS = new Set([
  'setTransform',
  'clearRect',
  'fillRect',
  'beginPath',
  'moveTo',
  'lineTo',
  'stroke',
  'createRadialGradient',
  'addColorStop',
]);

let clock = 0;
let pendingFrame: ((now: number) => void) | null = null;
let framesScheduled = 0;
let resizeListeners: Array<() => void> = [];

function createContext(calls: ContextCall[]): unknown {
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      calls.push({ name, args });
    };
  // Anything that would mean a texture, a bitmap or a second canvas. The streak
  // field must never reach for one: an earlier warp baked sixteen 160² textures
  // inside the click handler and the click felt like it hung.
  const forbidden =
    (name: string) =>
    (): never => {
      throw new Error(`the warp must not call ${name}`);
    };

  return {
    globalAlpha: 1,
    fillStyle: '' as unknown,
    strokeStyle: '' as unknown,
    lineWidth: 0,
    lineCap: '',
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    createRadialGradient: (...args: unknown[]) => {
      calls.push({ name: 'createRadialGradient', args });
      return { addColorStop: record('addColorStop') };
    },
    createPattern: forbidden('createPattern'),
    createImageData: forbidden('createImageData'),
    getImageData: forbidden('getImageData'),
    putImageData: forbidden('putImageData'),
    drawImage: forbidden('drawImage'),
  };
}

interface EnvironmentOptions {
  width?: number;
  height?: number;
  dpr?: number;
}

function stubEnvironment(options: EnvironmentOptions = {}): void {
  const { width = 1440, height = 900, dpr = 1 } = options;
  clock = 0;
  pendingFrame = null;
  framesScheduled = 0;
  resizeListeners = [];

  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
    addEventListener: (type: string, fn: () => void) => {
      if (type === 'resize') resizeListeners.push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      if (type !== 'resize') return;
      resizeListeners = resizeListeners.filter((one) => one !== fn);
    },
  });
  vi.stubGlobal('performance', { now: () => clock });
  vi.stubGlobal('requestAnimationFrame', (cb: (now: number) => void) => {
    pendingFrame = cb;
    framesScheduled += 1;
    return framesScheduled;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    pendingFrame = null;
  });
  // The warp owns a canvas it was handed; it never makes one. Reaching for the
  // document at all is the failure this stub is here to catch.
  vi.stubGlobal('document', {
    createElement: () => {
      throw new Error('the warp must not touch the document');
    },
  });
}

function createCanvas(context: unknown): FakeCanvas {
  return {
    width: 0,
    height: 0,
    style: { display: 'none', width: '', height: '' },
    getContext: () => context,
  };
}

interface Harness {
  warp: Warp;
  canvas: FakeCanvas;
  calls: ContextCall[];
}

function mount(options: warpModule.WarpOptions = {}, context?: unknown): Harness {
  const calls: ContextCall[] = [];
  const canvas = createCanvas(context === undefined ? createContext(calls) : context);
  const warp = new Warp(canvas as unknown as HTMLCanvasElement, options);
  return { warp, canvas, calls };
}

/** Run the animation forward. Frames land every 16 ms, as ~60 Hz would. */
function advance(ms: number, step = 16): void {
  const until = clock + ms;
  while (clock < until) {
    clock = Math.min(clock + step, until);
    const frame = pendingFrame;
    pendingFrame = null;
    if (frame !== null) frame(clock);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------- module surface */

describe('durations', () => {
  it('holds the tuned values the router runs on', () => {
    expect(MIN_COVER).toBe(900);
    expect(MAX_COVER).toBe(2200);
    expect(HOLD_CAP).toBe(3400);
  });
});

describe('ACCENTS', () => {
  it('covers the four destinations plus the hub', () => {
    expect(Object.keys(ACCENTS).sort()).toEqual(['about', 'backend', 'index', 'projects', 'xr']);
  });

  it('tints each destination with that planet’s own glow', () => {
    // Restated rather than imported, because importing the engine here would
    // drag `three` into a 2D canvas module. This is what keeps them in step.
    for (const planet of PLANETS) {
      expect(ACCENTS[planet.id]).toBe(planet.glow);
    }
  });

  it('states every tint as a six-digit hex', () => {
    for (const tint of Object.values(ACCENTS)) {
      expect(tint).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('the deleted multi-page handoff', () => {
  it('exports none of it (PORT_PLAN step 7)', () => {
    // `writeLaunch` / `readLaunch` / `whenLoaded` / `bindDepartures` handed a
    // jump across a document swap. One document, no arrival, and a swap is the
    // exact thing this architecture exists to avoid — so they cannot come back.
    const surface = Object.keys(warpModule);
    for (const gone of ['writeLaunch', 'readLaunch', 'whenLoaded', 'bindDepartures']) {
      expect(surface).not.toContain(gone);
    }
  });
});

/* -------------------------------------------------------------- the class */

describe('construction', () => {
  it('sizes the field by viewport width', () => {
    stubEnvironment({ width: 1440 });
    expect(mount().warp.count).toBe(460);

    stubEnvironment({ width: 390, height: 844 });
    expect(mount().warp.count).toBe(260);
  });

  it('honours an explicit count', () => {
    stubEnvironment();
    expect(mount({ count: 12 }).warp.count).toBe(12);
  });

  it('builds nothing but the field: no textures, no second canvas, no frames', () => {
    stubEnvironment();
    const { calls } = mount();

    // Only the resize transform. Constructing a Warp is what happens inside the
    // click handler, and it must stay a few hundred plain objects.
    expect(calls.map((call) => call.name)).toEqual(['setTransform']);
    expect(framesScheduled).toBe(0);
  });

  it('takes the accent it is given, and ice blue otherwise', () => {
    stubEnvironment();
    expect(mount({ accent: ACCENTS.xr }).warp.accent).toBe('#b26bff');
    expect(mount().warp.accent).toBe('#9fd8ff');
  });

  it('survives a malformed accent rather than breaking the jump', () => {
    stubEnvironment();
    expect(() => mount({ accent: 'not-a-colour' })).not.toThrow();
  });

  it('clamps the overlay to 1.5× device pixels', () => {
    stubEnvironment({ width: 1000, height: 800, dpr: 3 });
    const { canvas } = mount();
    expect(canvas.width).toBe(1500);
    expect(canvas.height).toBe(1200);
    expect(canvas.style.width).toBe('1000px');
  });

  it('listens for resize, and re-measures when one arrives', () => {
    stubEnvironment({ width: 1000, height: 800, dpr: 1 });
    const { canvas } = mount();
    expect(resizeListeners).toHaveLength(1);

    vi.stubGlobal('window', { ...window, innerWidth: 500, innerHeight: 400 });
    resizeListeners[0]?.();
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(400);
  });
});

describe('cover', () => {
  it('shows the canvas and starts exactly one loop', () => {
    stubEnvironment();
    const { warp, canvas } = mount();
    warp.cover({ duration: MIN_COVER });

    expect(canvas.style.display).toBe('block');
    expect(framesScheduled).toBe(1);

    // A second cover must not stack a second rAF chain onto the same instance.
    warp.cover({ duration: MIN_COVER });
    expect(framesScheduled).toBe(1);
  });

  it('fires onOpaque once the screen is covered, and only once', () => {
    stubEnvironment();
    const { warp } = mount();
    const onOpaque = vi.fn();
    warp.cover({ duration: MIN_COVER, onOpaque });

    // 92 % of 900 ms is 828 ms: still under at 800.
    advance(800);
    expect(onOpaque).not.toHaveBeenCalled();

    advance(100);
    expect(onOpaque).toHaveBeenCalledTimes(1);

    advance(2000);
    expect(onOpaque).toHaveBeenCalledTimes(1);
  });

  it('holds the screen covered when the cover runs out, rather than revealing', () => {
    stubEnvironment();
    const { warp, canvas } = mount();
    warp.cover({ duration: MIN_COVER });
    advance(2000);

    // The router commits under the cover and clears on its own schedule; the
    // warp must not decide to lift by itself.
    expect(canvas.style.display).toBe('block');
    expect(pendingFrame).not.toBeNull();
  });

  it('draws streaks without ever asking for a texture', () => {
    stubEnvironment();
    const { warp, calls } = mount();
    warp.cover({ duration: MIN_COVER });
    advance(1200);

    expect(calls.length).toBeGreaterThan(100);
    for (const call of calls) {
      expect(ALLOWED_CONTEXT_CALLS).toContain(call.name);
    }
  });
});

describe('clear', () => {
  it('resolves when the reveal ends, and hides the canvas', async () => {
    stubEnvironment();
    const { warp, canvas } = mount();
    warp.cover({ duration: MIN_COVER });
    advance(MIN_COVER);

    let resolved = false;
    const done = warp.clear(950).then(() => {
      resolved = true;
    });

    advance(600);
    await Promise.resolve();
    expect(resolved).toBe(false);

    advance(500);
    await done;
    expect(canvas.style.display).toBe('none');
    expect(pendingFrame).toBeNull();
  });

  it('resolves a second clear immediately instead of hanging on it', async () => {
    stubEnvironment();
    const { warp } = mount();
    warp.cover({ duration: MIN_COVER });
    advance(MIN_COVER);
    const first = warp.clear(950);
    advance(1000);
    await first;

    // `finish()` is idempotent and reachable from a watchdog, so it will call
    // through here more than once. A pending promise the second time would wedge
    // routing permanently.
    await expect(warp.clear(950)).resolves.toBeUndefined();
  });

  it('runs even if nothing covered first, rather than waiting on a loop that is not running', async () => {
    stubEnvironment();
    const { warp } = mount();
    const done = warp.clear(400);
    advance(500);
    await expect(done).resolves.toBeUndefined();
  });
});

describe('dispose', () => {
  it('stops the loop, hides the canvas and drops the resize listener', () => {
    stubEnvironment();
    const { warp, canvas } = mount();
    warp.cover({ duration: MIN_COVER });
    advance(300);

    warp.dispose();
    expect(pendingFrame).toBeNull();
    expect(canvas.style.display).toBe('none');
    expect(resizeListeners).toHaveLength(0);
  });

  it('resolves a clear it was torn down in the middle of', async () => {
    stubEnvironment();
    const { warp } = mount();
    warp.cover({ duration: MIN_COVER });
    advance(MIN_COVER);
    const done = warp.clear(950);

    advance(200);
    warp.dispose();

    // The router disposes the previous Warp before building the next one. If
    // that swallowed the pending clear, `_going` would never be released.
    await expect(done).resolves.toBeUndefined();
  });

  it('stays disposed: a later cover cannot restart it', () => {
    stubEnvironment();
    const { warp, canvas } = mount();
    warp.dispose();

    const before = framesScheduled;
    warp.cover({ duration: MIN_COVER });
    warp.startHold();
    warp.fill();

    expect(framesScheduled).toBe(before);
    expect(canvas.style.display).toBe('none');
  });

  it('is safe to call twice', () => {
    stubEnvironment();
    const { warp } = mount();
    warp.dispose();
    expect(() => warp.dispose()).not.toThrow();
  });
});

describe('without a 2D context', () => {
  it('says so, stays inert, and still lets a jump finish', async () => {
    stubEnvironment();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { warp, canvas } = mount({}, null);

    expect(warn).toHaveBeenCalledOnce();

    warp.cover({ duration: MIN_COVER });
    expect(framesScheduled).toBe(0);
    expect(canvas.style.display).toBe('none');

    // The transition degrades to a cut. What it must not do is leave the router
    // waiting: `clear()` resolves at once, so `finish()` still runs.
    await expect(warp.clear(950)).resolves.toBeUndefined();
    expect(() => warp.dispose()).not.toThrow();
  });
});

/* --------------------------------------------------------------- azimuth */

describe('saveAzimuth / loadAzimuth', () => {
  function stubStorage(initial: string | null, throws = false): { written: string[] } {
    const written: string[] = [];
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        if (throws) throw new Error('SecurityError: storage is not available');
        return initial;
      },
      setItem: (_key: string, value: string) => {
        if (throws) throw new Error('SecurityError: storage is not available');
        written.push(value);
      },
    });
    return { written };
  }

  it('round-trips the hub angle', () => {
    const { written } = stubStorage(null);
    saveAzimuth(-0.375);
    expect(written).toEqual(['-0.375']);

    stubStorage('-0.375');
    expect(loadAzimuth()).toBe(-0.375);
  });

  it('is null when nothing was stored', () => {
    stubStorage(null);
    expect(loadAzimuth()).toBeNull();
  });

  it('is null rather than NaN when the stored value is junk', () => {
    stubStorage('somewhere');
    expect(loadAzimuth()).toBeNull();
  });

  it('stays silent when storage throws on access', () => {
    // A sandboxed iframe raises on property access. Losing the camera angle is
    // not worth taking the boot down with it.
    stubStorage(null, true);
    expect(() => saveAzimuth(0.2)).not.toThrow();
    expect(loadAzimuth()).toBeNull();
  });
});
