/**
 * Shared plumbing for the router specs.
 *
 * Everything here exists because the hub is a live WebGL scene running on a
 * software rasteriser: nothing is instant, and the interesting state lives on
 * `window.__dgHub` rather than in the DOM.
 */

import type { Page } from '@playwright/test';

/** Panel ids in the order the site presents them. */
export const PANELS = ['backend', 'projects', 'xr', 'about'] as const;
export type Panel = (typeof PANELS)[number];

/**
 * A full jump is the ship head start (520 ms) plus cover (900) plus clear
 * (950), and the watchdog sits 700 ms past that. Waiting the watchdog out means
 * a test never races the transition, at ~22 fps included.
 */
export const JUMP_MS = 3400;

/*
 * `window.__dgHub` and `window.__dg3dReady` are declared by `src/hub.ts`, which
 * this project's tsconfig also compiles — so the probes below are checked
 * against the engine's real types rather than a hand-written shape that could
 * quietly go stale.
 */

/**
 * Turn every WebGL context request into `null`, leaving 2D alone — which is
 * what a device without WebGL looks like to the head probe and to the engine.
 *
 * Always an init script, never a browser flag: the flag would change what the
 * rest of the suite runs against, and the probe has to see the same failure the
 * engine would.
 */
export async function blockWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    const blocked = new Set(['webgl', 'webgl2', 'experimental-webgl']);
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (blocked.has(String(args[0]))) return null;
      return (real as (...a: unknown[]) => unknown).apply(this, args);
    } as typeof real;
  });
}

/** Load a URL and wait for the WebGL hub to be up. */
export async function openHub(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => window.__dg3dReady === true, undefined, { timeout: 30_000 });
  // The scene still has to place the labels at least once.
  await page.waitForFunction(
    () => (window.__dgHub?.planets.length ?? 0) > 0 && (window.__dgHub?.planets[0]?.label.pr ?? 0) > 0,
    undefined,
    { timeout: 30_000 },
  );
}

/** Which panel is on screen, by the inline visibility the router writes. */
export async function openPanel(page: Page): Promise<Panel | null> {
  return page.evaluate(() => {
    const on = document.querySelector<HTMLElement>('[data-panel][style*="visible"]');
    const id = on?.dataset['panel'] ?? null;
    return (id as 'backend' | 'projects' | 'xr' | 'about' | null) ?? null;
  });
}

/**
 * Wait until a jump has fully landed: the expected panel (or the hub) is on
 * screen, the warp canvas is back down, and the ship is neither flying out nor
 * docking back in.
 *
 * Prefer this over a fixed `settle()` anywhere a navigation precedes the next
 * step. Under parallel workers the software rasteriser can stretch a jump past
 * any duration guessed in advance, and a test that then clicks into a
 * transition reads as a router bug when it is only a starved browser.
 *
 * The `isLaunching()` term is not belt-and-braces. Leaving the hub, `jump()`
 * launches the ship and only starts the warp 520 ms later — so a *queued* jump
 * draining right after `finish()` leaves a window where no panel is visible and
 * `#smoke` is still hidden. Without this, the wait returns inside that window
 * and the next click lands mid-transition.
 */
export async function waitForPanel(page: Page, id: Panel | null): Promise<void> {
  await page.waitForFunction(
    (want) => {
      if (window.__dgHub?.isLaunching() !== false) return false;
      const smoke = document.querySelector('#smoke');
      if (smoke !== null && getComputedStyle(smoke).display !== 'none') return false;
      const open = document.querySelector('[data-panel][style*="visible"]');
      return (open?.getAttribute('data-panel') ?? null) === want;
    },
    id,
    { timeout: 30_000 },
  );
}

/**
 * Where a planet is on screen, in CSS pixels. Read off the engine's own
 * projection rather than guessed from the label, so a click lands on the body
 * the raycaster tests — the label hangs *below* the planet.
 */
export async function planetPoint(page: Page, id: Panel): Promise<{ x: number; y: number }> {
  const point = await page.evaluate((want) => {
    const view = window.__dgHub?.planets.find((p) => p.planet.id === want);
    if (view === undefined) return null;
    const { x, y, pr, visible } = view.label;
    // `visible` only means "in front of the camera". A planet the camera has
    // panned away from still projects — to coordinates off the viewport, where
    // a click would land on nothing and the failure would read as dead input.
    const onScreen =
      visible && x - pr >= 0 && x + pr <= window.innerWidth && y - pr >= 0 && y + pr <= window.innerHeight;
    return onScreen ? { x, y } : null;
  }, id);
  if (point === null) throw new Error(`planet "${id}" is not fully on screen`);
  return point;
}

/** Click a planet on the canvas — the pointer path, not the anchor path. */
export async function clickPlanet(page: Page, id: Panel): Promise<void> {
  const { x, y } = await planetPoint(page, id);
  await page.mouse.click(x, y);
}

/**
 * Click whichever planet sits nearest the middle of the viewport, and say which
 * one it was.
 *
 * For tests that care that the canvas still routes at all rather than about a
 * specific destination. Which planets are framed depends on where the camera
 * was left — focusing a label swings it toward that planet — so naming one in
 * advance makes the test depend on the camera angle.
 */
export async function clickNearestPlanet(page: Page): Promise<Panel> {
  const pick = await page.evaluate(() => {
    const hub = window.__dgHub;
    if (hub == null) return null;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let best: { id: string; x: number; y: number; d: number } | null = null;
    for (const view of hub.planets) {
      const { x, y, pr, visible } = view.label;
      if (!visible) continue;
      if (x - pr < 0 || x + pr > window.innerWidth || y - pr < 0 || y + pr > window.innerHeight) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (best === null || d < best.d) best = { id: view.planet.id, x, y, d };
    }
    return best;
  });
  if (pick === null) throw new Error('no planet is fully on screen');
  await page.mouse.click(pick.x, pick.y);
  return pick.id as Panel;
}

/**
 * Click a hub label — the anchor path, through the delegated document handler.
 *
 * `force` is required and is not papering over a defect: the engine rewrites
 * every label's `left`/`top` each frame, and the hub camera sways forever, so
 * Playwright's "element is stable" check (two consecutive frames with an
 * identical box) can never pass. A real pointer hits a moving label fine.
 */
export async function clickLabel(page: Page, id: Panel): Promise<void> {
  await page.locator(`#labels a[href="#${id}"]`).click({ force: true });
}

/** Follow one panel's "Elsewhere" cross-link to another destination. */
export async function clickElsewhere(page: Page, from: Panel, to: Panel): Promise<void> {
  await page.locator(`[data-panel="${from}"] a[href="#${to}"]`).click();
}

/** The hash without its `#`, or `''` for the hub. */
export async function hash(page: Page): Promise<string> {
  return page.evaluate(() => window.location.hash.replace(/^#\/?/, ''));
}

export async function settle(page: Page, ms = JUMP_MS): Promise<void> {
  await page.waitForTimeout(ms);
}

/**
 * The hub azimuth once it has stopped easing.
 *
 * `azimuth` is the *current* angle, lerped toward its target at 0.08 a frame,
 * so sampling it right after an input returns a number that keeps moving. Any
 * test that compares a reading taken now against one taken later has to wait
 * for convergence first, or it is really measuring the frame rate.
 */
export async function settledAzimuth(page: Page): Promise<number> {
  let last = Number.NaN;
  let stable = 0;
  for (let i = 0; i < 120; i++) {
    // Sampled after two real animation frames, never on a wall-clock timer.
    // SwiftShader under parallel workers can stall longer than any interval
    // worth waiting, and two samples taken across a stall are identical by
    // definition — which would report "settled" halfway through the ease.
    const now = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve(window.__dgHub?.azimuth ?? 0));
          });
        }),
    );
    stable = Math.abs(now - last) < 0.0005 ? stable + 1 : 0;
    if (stable >= 2) return now;
    last = now;
  }
  throw new Error(`azimuth never settled (last ${last})`);
}

/** Pan the hub away from wherever it is, and return the angle it lands on. */
export async function panHub(page: Page, presses = 3): Promise<number> {
  const before = await settledAzimuth(page);
  // ±0.5 rad is a hard clamp, so nudge toward whichever side has headroom.
  const key = before > 0 ? 'ArrowLeft' : 'ArrowRight';
  for (let i = 0; i < presses; i++) await page.keyboard.press(key);
  const after = await settledAzimuth(page);
  if (Math.abs(after - before) < 0.05) throw new Error('the hub camera did not pan');
  return after;
}
