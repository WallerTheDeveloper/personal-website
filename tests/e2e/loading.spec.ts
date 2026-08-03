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

import { blockWebGL, openHub, waitForPanel } from './helpers';

/** `LOADER_TIMEOUT_MS` in `src/router.ts`. */
const LOADER_TIMEOUT_MS = 12_000;

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
    await expect(page.locator('#loading')).toBeHidden();
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

test.describe('once the scene is up', () => {
  test('the loading screen is gone, not merely transparent', async ({ page }) => {
    await openHub(page);

    // `display: none`, not `opacity: 0`. A transparent full-bleed overlay left
    // in the document is what makes canvas input go dead — the router's own
    // `#fallback` teardown takes the same two steps for the same reason.
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: 5_000 });
  });

  test('the dial finished at 100', async ({ page }) => {
    await openHub(page);
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: 5_000 });

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
    await expect(page.locator('#loading')).toHaveCSS('display', 'none', { timeout: 5_000 });

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
