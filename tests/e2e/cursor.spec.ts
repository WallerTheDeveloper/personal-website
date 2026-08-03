/**
 * The custom cursor.
 *
 * The reticle is the pointer on the hub — not an extra flourish that appears
 * over a planet. Before this, `cursor: none` was set on `#scene` alone while the
 * reticle was raised only by a raycast hit, so the pointer had three identities
 * as it crossed the viewport: the OS hand over a label, the ring over a planet,
 * and nothing at all over empty sky. The rule now is one cursor, always present,
 * that grows over anything clickable.
 *
 * `armed` is the interesting half. The reticle sits at `left: 0; top: 0` until
 * something moves it, so anything that shows it before the pointer's position is
 * known puts a ring in the corner of the viewport — which is exactly what
 * focusing a label with the keyboard used to do, and the last test here is the
 * guard against it coming back.
 */

import { expect, test, type Page } from '@playwright/test';

import { blockWebGL, clickLabel, openHub, planetPoint, waitForPanel } from './helpers';

/** Somewhere on the canvas with no planet under it. */
async function emptySky(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate(() => {
    const hub = window.__dgHub;
    const y = Math.round(window.innerHeight * 0.12);
    for (let x = 40; x < window.innerWidth - 40; x += 40) {
      if (hub?.pick(x, y) == null) return { x, y };
    }
    throw new Error('no empty sky found along the sample line');
  });
}

const opacityOf = (page: Page) => page.locator('#reticle').evaluate((el) => getComputedStyle(el).opacity);

/** The reticle's scale, read off the computed matrix rather than the string. */
const scaleOf = (page: Page) =>
  page.locator('#reticle').evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (t === 'none') return 1;
    return Number(/matrix\(([^,]+)/.exec(t)?.[1] ?? '1');
  });

test.describe('the OS cursor', () => {
  test('is gone from the whole stage, not just the canvas', async ({ page }) => {
    await openHub(page);

    // Every one of these used to hand the system cursor back mid-sweep, which is
    // what made the pointer look like it was flickering in and out of existence.
    for (const selector of ['#scene', '#labels a', '#skip-scene', '#quality-toggle', '#hub-head']) {
      await expect(page.locator(selector).first(), selector).toHaveCSS('cursor', 'none');
    }
  });

  test('comes back inside an open panel', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'about');
    await waitForPanel(page, 'about');

    // `.panel` is a sibling of `#stage`, so `cursor: none` does not reach it —
    // and must not. Panel content is ordinary prose and links.
    const cursor = await page
      .locator('[data-panel="about"] a')
      .first()
      .evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).not.toBe('none');
  });

  test('is left alone in the text edition', async ({ page }) => {
    await blockWebGL(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1');

    // The rule is gated on `data-dg-3d`: with no scene there is no reticle to
    // stand in for the cursor, so taking it away would leave nothing at all.
    const cursor = await page
      .locator('#fallback a')
      .first()
      .evaluate((el) => getComputedStyle(el).cursor);
    expect(cursor).not.toBe('none');
  });
});

test.describe('the reticle', () => {
  test('is visible over empty sky, which is the whole point', async ({ page }) => {
    await openHub(page);
    const { x, y } = await emptySky(page);
    await page.mouse.move(x, y);

    // This is the regression the change exists for: no planet under the pointer
    // used to mean no pointer at all.
    await expect.poll(() => opacityOf(page)).toBe('1');
    expect(await scaleOf(page)).toBeCloseTo(0.6, 1);
  });

  test('follows the pointer', async ({ page }) => {
    await openHub(page);
    const { x, y } = await emptySky(page);
    await page.mouse.move(x, y);
    await expect.poll(() => opacityOf(page)).toBe('1');

    const at = await page.locator('#reticle').evaluate((el) => ({ left: el.style.left, top: el.style.top }));
    expect(at).toEqual({ left: `${x}px`, top: `${y}px` });
  });

  test('grows over a planet', async ({ page }) => {
    await openHub(page);
    const { x, y } = await planetPoint(page, 'backend');
    await page.mouse.move(x, y);

    await expect.poll(() => opacityOf(page)).toBe('1');
    await expect.poll(() => scaleOf(page)).toBeCloseTo(1, 1);
  });

  test('grows over the hub chrome, so affordance survives losing the hand', async ({ page }) => {
    await openHub(page);
    // Arm it somewhere neutral first, so the growth is what is being measured.
    const { x, y } = await emptySky(page);
    await page.mouse.move(x, y);
    await expect.poll(() => scaleOf(page)).toBeCloseTo(0.6, 1);

    await page.locator('#quality-toggle').hover();
    await expect.poll(() => scaleOf(page)).toBeCloseTo(1, 1);
    await expect.poll(() => opacityOf(page)).toBe('1');
  });

  test('goes down when a panel opens', async ({ page }) => {
    await openHub(page);
    const { x, y } = await emptySky(page);
    await page.mouse.move(x, y);
    await expect.poll(() => opacityOf(page)).toBe('1');

    await clickLabel(page, 'xr');
    await waitForPanel(page, 'xr');

    // The OS cursor is back over the panel. A ring left frozen at the position
    // the pointer held when the jump started would be a second, stale one.
    await expect.poll(() => opacityOf(page)).toBe('0');
  });

  test('is not shown before the pointer has ever been anywhere', async ({ page }) => {
    await openHub(page);

    // Tab straight to a label without touching the mouse. `focus` routes through
    // the same `setHover()` the raycast does, and the reticle has no position
    // yet — so showing it here would draw a ring at the viewport's top-left
    // corner, half of it off screen.
    await page.keyboard.press('Tab');
    await expect(page.locator('#lbl-backend')).toBeFocused();

    expect(await opacityOf(page)).toBe('0');
  });
});

test.describe('coarse pointers', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('get neither the hidden cursor nor the reticle', async ({ page }) => {
    await openHub(page);

    // There is no cursor to replace on a touch device, and a ring trailing a
    // finger is a smudge. The CSS gate and the router's `matchMedia('(pointer:
    // coarse)')` have to agree, or a phone gets no cursor *and* no reticle.
    await expect(page.locator('#scene')).not.toHaveCSS('cursor', 'none');

    // Empty sky, not a planet: tapping a planet would navigate, and the reticle
    // is down inside a panel anyway — which would pass without proving anything.
    // A touch that stays on the hub is what has to leave it alone.
    const { x, y } = await emptySky(page);
    await page.touchscreen.tap(x, y);
    await page.mouse.move(x, y);
    expect(await opacityOf(page)).toBe('0');
  });
});
