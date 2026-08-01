/**
 * ACCEPTANCE.md group E — `prefers-reduced-motion: reduce`.
 *
 * "No drift, no bob, no parallax, ambient rotation near zero, grain animation
 * off, and clicking a planet does a 200 ms cross-fade instead of the flight."
 *
 * The flight and the warp are the two things this path must not do, so both are
 * asserted by watching for them across the whole transition rather than by
 * sampling once after it: a warp that flashed for 200 ms would still be a warp.
 */

import { expect, test } from '@playwright/test';

import { clickLabel, openHub, openPanel, settledAzimuth, waitForPanel } from './helpers';

// Through `contextOptions`: `reducedMotion` is not a top-level test option in
// Playwright 1.62. The context has to carry it, so the media query is already
// `reduce` when the head probe and `initHub()` read it on the first load.
test.use({ contextOptions: { reducedMotion: 'reduce' } });

test('the engine comes up in reduced-motion mode', async ({ page }) => {
  await openHub(page);
  expect(await page.evaluate(() => window.__dgHub?.reduce)).toBe(true);
  // Grain is CSS, and it is the one piece of ambient motion the engine does not
  // own. `animation: none !important` resolves the name to "none".
  const animation = await page
    .locator('[data-grain]')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
});

test('a jump is a 200 ms cross-fade, with no ship flight and no warp', async ({ page }) => {
  await openHub(page);

  // Watch for the two things that must not happen, from before the click until
  // well past when a normal jump would have finished (head start + cover +
  // clear ≈ 2.4 s). Sampling on animation frames, so a starved rasteriser
  // stretches the window instead of skipping past it.
  //
  // The clock is in-page and spans click → panel on screen. Timing it from the
  // test would fold in Playwright's actionability checks and the round-trip,
  // which under parallel workers dwarf the thing being measured; this is the
  // interval the router actually controls.
  await page.evaluate(() => {
    const seen = { warp: false, flight: false, clickAt: 0, shownAt: 0 };
    (window as unknown as { __seen: typeof seen }).__seen = seen;
    document.addEventListener('click', () => { seen.clickAt = performance.now(); }, true);
    const tick = (): void => {
      const smoke = document.querySelector('#smoke');
      if (smoke !== null && getComputedStyle(smoke).display !== 'none') seen.warp = true;
      if (window.__dgHub?.isLaunching() === true) seen.flight = true;
      const panel = document.querySelector('[data-panel="backend"]');
      if (seen.shownAt === 0 && panel !== null && getComputedStyle(panel).visibility === 'visible') {
        seen.shownAt = performance.now();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await clickLabel(page, 'backend');
  await waitForPanel(page, 'backend');
  await page.waitForTimeout(1200);

  const seen = await page.evaluate(
    () => (window as unknown as { __seen: { warp: boolean; flight: boolean; clickAt: number; shownAt: number } }).__seen,
  );
  expect(seen.warp, '#smoke was shown — the warp ran under reduced motion').toBe(false);
  expect(seen.flight, 'the ship flew — reduced motion must not launch it').toBe(false);

  // `commit()` runs inside the click handler on this path, so the panel is up
  // on the next frame. The warped path could not be: it commits 520 ms of ship
  // head start plus 900 ms of cover after the click, so anything under a second
  // here means the flight was genuinely skipped rather than merely unobserved.
  expect(seen.shownAt - seen.clickAt).toBeLessThan(800);

  // And the fade that replaced them is the one the spec asks for. `visibility`
  // has to be in there with `opacity`: it is a discrete property, so it is what
  // holds the outgoing panel on screen long enough for there to be a fade at
  // all rather than a cut.
  const fade = await page.locator('[data-panel="backend"]').evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration };
  });
  expect(fade.property).toContain('opacity');
  expect(fade.property).toContain('visibility');
  expect(fade.duration).toBe('0.2s, 0.2s');
});

test('the parked camera holds still — no drift, no scroll parallax', async ({ page }) => {
  await openHub(page);
  await clickLabel(page, 'xr');
  await waitForPanel(page, 'xr');

  const parked = await settledAzimuth(page);

  // Scroll the panel: README's "Parked scene" would move the camera with it,
  // the prototype's own later decision does not, and under reduce it must not
  // move either way. This is the standing test for that.
  await page.locator('[data-panel="xr"]').evaluate((el) => {
    el.scrollTop = 600;
  });
  await page.waitForTimeout(600);

  expect(Math.abs((await settledAzimuth(page)) - parked)).toBeLessThan(0.001);
});

test('Escape still returns to the hub', async ({ page }) => {
  await openHub(page);
  await clickLabel(page, 'about');
  await waitForPanel(page, 'about');

  await page.keyboard.press('Escape');
  await waitForPanel(page, null);
  expect(await openPanel(page)).toBeNull();
});
