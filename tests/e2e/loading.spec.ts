/**
 * The loading screen.
 *
 * It exists for a gap the rest of the suite never sees, because every other spec
 * waits for `openHub()` before it asserts anything: the head probe fades
 * `#fallback` out before first paint, and `.scene` does not come up until the
 * engine chunk has downloaded and ten planet textures have baked. Between those
 * two, a WebGL visitor used to watch an empty `--void`.
 *
 * The invariants below are the ones that were expensive to reason about, and
 * each is a way the overlay could quietly break something that has nothing to do
 * with loading:
 *
 *   - It must not survive into the hub as an `opacity: 0` sheet. That is the
 *     classic dead-canvas-input bug, and it would surface in `dead-input.spec.ts`
 *     as a mysterious missed click rather than here as a stated rule.
 *   - It must be hidden in the flat document by CSS alone. `fallback.spec.ts`
 *     runs a case with JavaScript disabled entirely, where a full-bleed overlay
 *     would sit on top of the text edition's links with nothing able to remove
 *     it.
 *   - A request that never settles has to end somewhere. `load()` already
 *     catches a rejected import; this covers the stall.
 */

import { expect, test, type Page } from '@playwright/test';

import { blockWebGL, LOADER_EXIT_MS, openHub, waitForPanel } from './helpers';

/** `LOADER_TIMEOUT_MS` in `src/router.ts`. */
const LOADER_TIMEOUT_MS = 12_000;
/** `LOADER_HOLD_MS` in `src/router.ts`. */
const LOADER_HOLD_MS = 1500;

/**
 * `MAX_RATE_PCT_PER_MS` in `src/loading-ring.ts`. The arc's speed ceiling, and
 * the property the smoothness tests below actually assert.
 */
const MAX_RATE_PCT_PER_MS = 0.11;

/** One sampled frame of the dial. */
interface DialSample {
  /** Fraction of the ring painted, or -1 before the router writes the dash. */
  readonly drawn: number;
  readonly pct: number;
  /** Whether the scene had finished building when this frame was sampled. */
  readonly ready: boolean;
  /** The loading screen's own opacity, so the hold can be measured in-page. */
  readonly opacity: number;
  readonly t: number;
}

declare global {
  interface Window {
    __dialTrace?: DialSample[];
  }
}

/**
 * Record the dial every time it is actually written to.
 *
 * The complaint this all comes from — "it gets to 5 % and then suddenly 100 %" —
 * is a claim about the *series* of values, not about any one of them. A test
 * that polls from the outside cannot see it: two `dialPct()` calls a second
 * apart look identical whether the dial glided between them or teleported.
 *
 * A `MutationObserver` rather than a sampling loop, and the distinction matters
 * for the rate assertion below. A second `requestAnimationFrame` is not in step
 * with the ring's: when a long task blocks the thread — parsing half a megabyte
 * of engine, mostly — the ring's catch-up lands in one paint and a sampler
 * observes it a frame *later*, timestamping a large move against a short
 * interval it did not happen in. The observer is delivered at the end of the
 * same task as the write, so each entry carries the time of the write itself.
 */
async function traceDial(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const trace: DialSample[] = [];
    window.__dialTrace = trace;

    const start = (): void => {
      const arc = document.querySelector('#loading-arc');
      const pct = document.querySelector('#loading-pct');
      const screen = document.querySelector('#loading');
      if (arc === null || pct === null || screen === null) return;

      const record = (): void => {
        // Capped: a stalled boot sits here for twelve seconds, and an unbounded
        // array would be the harness distorting what it is measuring.
        if (trace.length >= 4_000) return;
        const style = getComputedStyle(arc);
        const len = Number.parseFloat(style.strokeDasharray);
        const off = Number.parseFloat(style.strokeDashoffset);
        const shell = getComputedStyle(screen);
        trace.push({
          drawn: Number.isFinite(len) && Number.isFinite(off) && len > 1 ? 1 - off / len : -1,
          pct: Number(pct.textContent),
          ready: window.__dg3dReady === true,
          opacity: shell.display === 'none' ? 0 : Number(shell.opacity),
          t: performance.now(),
        });
      };

      // The arc carries the climb; the screen carries the hold and the fade.
      const observer = new MutationObserver(record);
      observer.observe(arc, { attributes: true, attributeFilter: ['style'] });
      observer.observe(screen, { attributes: true, attributeFilter: ['style'] });
      record();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  });
}

/** The recorded frames in which the dial was actually being driven. */
async function dialTrace(page: Page): Promise<DialSample[]> {
  const trace = await page.evaluate(() => window.__dialTrace ?? []);
  return trace.filter((s) => s.drawn >= 0);
}

/**
 * The engine chunk, matched in both shapes it can have: `vite dev` (which is
 * what `playwright.config.ts` starts) serves the module at its source path,
 * while a built `dist/` serves the hashed chunk. Matching only the built name
 * silently matches nothing under the dev server, and the tests below then assert
 * against a scene that loaded perfectly normally.
 */
const engineChunk = (url: URL): boolean =>
  url.pathname === '/src/hub.ts' || /^\/assets\/hub-[^/]*\.js$/.test(url.pathname);

/**
 * Hold the engine chunk open, so the document sits in the boot gap for as long
 * as the test needs.
 *
 * The route is left pending rather than aborted on purpose: an aborted import
 * rejects and `load()` flattens immediately, which is a different path (and one
 * `fallback.spec.ts` already covers). A pending request is the stall.
 */
async function stallEngine(page: Page): Promise<() => void> {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(engineChunk, async (route) => {
    await held;
    // The route can be discarded out from under a parked handler — by the test
    // ending, or by the page navigating. Neither is a failure of what is being
    // tested here, and letting it throw reports as one.
    await route.continue().catch(() => undefined);
  });
  // Releasing alone, without unrouting: tearing the route down in the same tick
  // invalidates the parked handler before it can continue the request.
  return () => release?.();
}

/**
 * How much of the dial is drawn, 0…1, read off the arc's dash geometry rather
 * than off the number beside it — the number is floored, so it agrees with a
 * static ring for a whole percent at a time.
 *
 * `-1` if the router has not written the dash array yet, which is a state worth
 * distinguishing from "0 % drawn": the stylesheet ships `stroke-dasharray: 0 999`
 * so that a document whose script never runs shows an empty ring, and a test
 * that read that as a value would pass against a dial nothing is driving.
 */
async function arcDrawn(page: Page): Promise<number> {
  return page.locator('#loading-arc').evaluate((el) => {
    const style = getComputedStyle(el);
    const len = Number.parseFloat(style.strokeDasharray);
    const offset = Number.parseFloat(style.strokeDashoffset);
    if (!Number.isFinite(len) || !Number.isFinite(offset) || len <= 1) return -1;
    return 1 - offset / len;
  });
}

/** The integer in the middle of the dial. */
async function dialPct(page: Page): Promise<number> {
  return Number(await page.locator('#loading-pct').textContent());
}

test.describe('while the scene is loading', () => {
  test('the loading screen is the only thing on screen', async ({ page }) => {
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#loading')).toBeVisible();
    // "Only the loading screen" is a claim about the other two as well. Both are
    // transparent rather than hidden: the head probe fades #fallback out before
    // first paint, and `.scene` does not come up until `boot()` raises it. Asked
    // as `toBeHidden()` this would fail — Playwright counts an element at
    // `opacity: 0` as visible, since it still occupies its box.
    await expect(page.locator('#fallback')).toHaveCSS('opacity', '0');
    await expect(page.locator('#scene')).toHaveCSS('opacity', '0');
    await expect(page.locator('#loading')).toHaveCSS('opacity', '1');

    release();
  });

  test('a deep link stays covered until the scene is behind it', async ({ page }) => {
    const release = await stallEngine(page);
    await page.goto('/#xr', { waitUntil: 'domcontentloaded' });

    // `boot()` commits a deep-linked panel synchronously, and `.panel` is
    // z-index 45. The loading screen has to clear it, or the panel appears over
    // the loader with nothing but void in its transparent top 44vh.
    const z = await page.locator('#loading').evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(z).toBeGreaterThan(45);
    await expect(page.locator('#loading')).toBeVisible();

    release();
    await waitForPanel(page, 'xr');
    await expect(page.locator('#loading')).toBeHidden({ timeout: LOADER_EXIT_MS });
  });

  test('the dial climbs, and stops short of the milestone it has not reached', async ({ page }) => {
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loading')).toBeVisible();

    const first = await dialPct(page);
    await page.waitForTimeout(900);
    const second = await dialPct(page);

    // Climbing at all: the phase-0 curve is the only thing that can move this,
    // and the chunk it is waiting on is parked.
    expect(second).toBeGreaterThan(first);
    // …but never past phase 0's ceiling of 70, because the engine has not
    // arrived. This is the whole claim the dial makes — that the number is the
    // boot's real position and not an animation playing out on a timer.
    await page.waitForTimeout(1_500);
    expect(await dialPct(page)).toBeLessThan(70);

    release();
  });

  test('the arc is drawn, not just the number counting', async ({ page }) => {
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);

    // A dash array the router has replaced (so the ring is being driven), and an
    // offset strictly inside it: some arc painted, and not the whole circle.
    const drawn = await arcDrawn(page);
    expect(drawn).toBeGreaterThan(0.05);
    expect(drawn).toBeLessThan(0.7);

    release();
  });

  test('it carries no focusable element', async ({ page }) => {
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The tab ring is pinned to exactly six stops in `keyboard.spec.ts`. A
    // "skip" control here would insert a seventh, and `pointer-events: none`
    // would not take it back out of the ring.
    const focusable = await page
      .locator('#loading')
      .evaluate((el) => el.querySelectorAll('a, button, input, [tabindex], [contenteditable]').length);
    expect(focusable).toBe(0);

    release();
  });
});

/**
 * The dial reads the boot, and *moves* like it.
 *
 * These are the regression tests for the reported behaviour: a dial that sat
 * near zero and then arrived at 100 with nothing in between. Two separate causes,
 * both asserted here — the value had only three sources to read (so there was
 * genuinely nothing between them), and the last step to 100 was written on the
 * same frame the screen started fading (so it was never seen at all).
 */
test.describe('how the dial moves', () => {
  test('it climbs no faster than the arc is allowed to move', async ({ page }) => {
    await traceDial(page);
    await openHub(page);

    // Collapsed to the frames where the geometry actually changed, and measured
    // between those. Sampling every frame would misattribute a move: this
    // recorder and the ring are two `requestAnimationFrame` callbacks, so when a
    // long task blocks the thread the ring's catch-up lands in one paint and is
    // *observed* a frame later — against a 9 ms interval that did not contain it.
    // Change-to-change spans the real elapsed time.
    const trace = await dialTrace(page);
    const moves = trace.filter((s, i) => i === 0 || s.drawn !== trace[i - 1]!.drawn);
    expect(moves.length).toBeGreaterThan(5);

    // Asserted against the rate ceiling rather than a flat number of points: the
    // easing is a function of elapsed time, so a 200 ms frame is *entitled* to
    // cover more ground than a 16 ms one. What it may never do is teleport, and
    // that is what the ceiling forbids. Doubled plus a constant for the one
    // frame of observation lag that remains.
    for (let i = 1; i < moves.length; i += 1) {
      const from = moves[i - 1]!;
      const to = moves[i]!;
      const allowed = (2 * MAX_RATE_PCT_PER_MS * (to.t - from.t)) / 100 + 0.03;
      expect(to.drawn - from.drawn).toBeLessThanOrEqual(allowed);
    }
  });

  test('the climb takes as long as a climb, even on an instant boot', async ({ page }) => {
    await traceDial(page);
    await openHub(page);

    // The regression test for the reported bug, stated as a duration.
    //
    // Against a dev server the whole boot is a few hundred milliseconds, and the
    // dial used to finish in about that — 5 %, then 100 %, with the intervening
    // numbers never painted. The rate ceiling puts a floor under the sweep of
    // 100 / 0.11 ≈ 909 ms regardless of how fast the boot was, and *that* is
    // what makes the dial legible rather than the number of frames the machine
    // running this happened to find time for.
    const trace = await dialTrace(page);
    const started = trace[0]!;
    const landed = trace.find((s) => s.drawn >= 1);
    expect(landed, 'the dial should reach a full ring').toBeDefined();
    expect(landed!.t - started.t).toBeGreaterThan(700);
  });

  test('it only ever moves forward', async ({ page }) => {
    await traceDial(page);
    await openHub(page);

    const trace = await dialTrace(page);
    for (let i = 1; i < trace.length; i += 1) {
      expect(trace[i]!.drawn).toBeGreaterThanOrEqual(trace[i - 1]!.drawn - 1e-9);
    }
  });

  test('the scene is built across frames, so the bakes are visible', async ({ page }) => {
    await traceDial(page);
    await openHub(page);

    // The precise claim for `initHub()` being asynchronous. While it was one
    // blocking call, the main thread could not paint *at all* between the chunk
    // landing and the scene being built — so no frame could exist that was past
    // the download's 70 and not yet `__dg3dReady`. Every one of these frames is
    // a paint that a synchronous build made impossible.
    const trace = await dialTrace(page);
    const midBuild = trace.filter((s) => !s.ready && s.pct > 70 && s.pct < 90);
    expect(midBuild.length).toBeGreaterThan(0);
  });

  test('the completed dial is held, fully opaque, before the screen fades', async ({ page }) => {
    await traceDial(page);
    await openHub(page);

    // Measured from the in-page trace rather than by polling from outside: the
    // whole window is under two seconds, and a round trip per assertion cannot
    // resolve it. This is also why `openHub()` is safe to await first — the
    // frames have already been recorded by the time it returns.
    const trace = await dialTrace(page);
    const landed = trace.find((s) => s.pct === 100);
    expect(landed, 'the dial should reach 100').toBeDefined();

    // Reaching 100 used to *be* the dismissal: the step up was written on the
    // same frame the fade started, so a finished dial was never actually seen.
    const fadeStart = trace.find((s) => s.t > landed!.t && s.opacity < 1);
    expect(fadeStart, 'the screen should eventually fade').toBeDefined();
    expect(fadeStart!.t - landed!.t).toBeGreaterThan(LOADER_HOLD_MS * 0.8);

    // Every frame in between is a frame of finished dial on an opaque screen.
    const held = trace.filter((s) => s.t >= landed!.t && s.t < fadeStart!.t);
    expect(held.every((s) => s.opacity === 1 && s.pct === 100)).toBe(true);

    // And it does come down — a hold that never ended would be an opaque sheet
    // over the entire site.
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: LOADER_EXIT_MS });
  });
});

test.describe('the engine chunk is streamed for its byte count', () => {
  test('the build writes a resolvable chunk URL into the head', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The dial's largest span reads this file's bytes. If the tag is missing or
    // wrong the dial silently falls back to drifting and nothing goes red — so
    // the tag existing, and pointing at something real, is asserted here.
    const url = await page
      .locator('meta[name="dg-engine-chunk"]')
      .getAttribute('content');
    expect(url).toBeTruthy();

    const response = await page.request.get(new URL(url!, page.url()).toString());
    expect(response.status()).toBe(200);
  });
});

test.describe('once the scene is up', () => {
  test('the loading screen is gone, not merely transparent', async ({ page }) => {
    await openHub(page);

    // `display: none`, not `opacity: 0`. A transparent full-bleed overlay left
    // in the document is what makes canvas input go dead — the router's own
    // `#fallback` teardown takes the same two steps for the same reason.
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: LOADER_EXIT_MS });
  });

  test('the dial finished at 100', async ({ page }) => {
    await openHub(page);
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: LOADER_EXIT_MS });

    // Read after the screen is down rather than raced for during the 400 ms
    // fade: the text stays in the document either way, and `complete()` is the
    // only thing that can have written it. A dial that eased to 99 and was
    // dismissed mid-climb would fail here, which is the point — the last percent
    // is supposed to cost a real first frame.
    expect(await dialPct(page)).toBe(100);
    expect(await arcDrawn(page)).toBeCloseTo(1, 5);
  });

  test('the canvas still routes underneath it', async ({ page }) => {
    await openHub(page);
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: LOADER_EXIT_MS });

    // The direct proof of the point above: a click at dead centre reaches the
    // canvas rather than a leftover sheet.
    const reached = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return el?.id ?? '';
    });
    expect(reached).not.toBe('loading');
  });
});

test.describe('when the scene never arrives', () => {
  test('a stalled engine hands over the text edition', async ({ page }) => {
    test.setTimeout(LOADER_TIMEOUT_MS + 30_000);
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loading')).toBeVisible();

    // The watchdog flattens rather than merely uncovering: uncovering a stalled
    // boot would leave the visitor looking at an empty void, and the text
    // edition is the state this document ships in.
    await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1', {
      timeout: LOADER_TIMEOUT_MS + 10_000,
    });
    await expect(page.locator('#fallback')).toBeVisible();
    await expect(page.locator('#loading')).toBeHidden();
    // #fallback's links have to work from here — this is the recovery, not a
    // holding screen.
    await expect(page.locator('#fallback a[href="#about"]').first()).toBeVisible();

    release();
  });

  test('an engine that lands after the timeout does not boot over the text edition', async ({ page }) => {
    test.setTimeout(LOADER_TIMEOUT_MS + 40_000);
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1', {
      timeout: LOADER_TIMEOUT_MS + 10_000,
    });

    // `load()` awaits the import and then calls `boot()` unconditionally, so a
    // late resolution arrives at a document that has already been flattened and
    // would put a canvas back over the text edition the visitor is reading.
    release();
    await page.waitForTimeout(2_000);
    await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1');
    await expect(page.locator('#fallback')).toBeVisible();
    expect(await page.evaluate(() => window.__dg3dReady === true)).toBe(false);
  });
});

/**
 * The dial under `prefers-reduced-motion`.
 *
 * It keeps reading, because it is a readout and not decoration — the same
 * standing the `#fps` chip has, which is also `aria-hidden` and also keeps
 * updating under reduce. What changes is the cadence: `LoadingRing` samples its
 * curve on a 400 ms timer instead of per frame, so the arc steps between values
 * with nothing tweening in between.
 *
 * The alternative considered was freezing it at the last milestone, which on a
 * slow connection means an empty ring for the whole of the boot — motion the
 * visitor did not ask for, traded for a screen that reads as broken.
 */
test.describe('the dial under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('keeps reading, in steps rather than a glide', async ({ page }) => {
    const release = await stallEngine(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loading')).toBeVisible();

    const first = await dialPct(page);
    // Three sampling intervals, so this cannot pass on a single lucky tick.
    await page.waitForTimeout(1_400);
    expect(await dialPct(page)).toBeGreaterThan(first);

    // And nothing smooths the gaps between those ticks back into motion.
    const duration = await page
      .locator('#loading-arc')
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration).toBe('0s');

    release();
  });
});

test.describe('the editions that never see it', () => {
  test('the text edition never shows it, with no script having run', async ({ browser }) => {
    // Scripting off: `data-dg-3d` is never set, so the gate that reveals the
    // loading screen never opens. Nothing can remove it at runtime here, which
    // is why the hidden state has to be CSS and not the router's doing.
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('#loading')).toBeHidden();
    await expect(page.locator('#fallback')).toBeVisible();
    await context.close();
  });

  test('a browser without WebGL never shows it', async ({ page }) => {
    await blockWebGL(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1');
    await expect(page.locator('#loading')).toBeHidden();
  });
});
