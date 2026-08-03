/**
 * ACCEPTANCE.md group C — leaving a panel.
 *
 * `exit()` is hard-wired to `go(null)`. The temptation is `history.back()`, and
 * these are the two reasons it is wrong: Back replays the *previously visited
 * panel* rather than returning to the scene, and where History is sandboxed it
 * does nothing at all, stranding `current` on a closed panel and dead-locking
 * canvas input. The third test below is the one that catches the first case.
 */

import { expect, test, type Page } from '@playwright/test';

import { clickElsewhere, clickLabel, hash, openHub, openPanel, PANELS, waitForPanel } from './helpers';

/**
 * Where the ship is on screen, in CSS pixels, sampled after two real animation
 * frames — never on a wall-clock timer, for the same reason `settledAzimuth()`
 * gives: SwiftShader under parallel workers stalls longer than any interval.
 */
async function shipY(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolve(window.__dgHub?.shipScreenPos().y ?? Number.NaN)),
        );
      }),
  );
}

for (const id of PANELS) {
  test(`Escape closes #${id} and returns to the hub`, async ({ page }) => {
    await openHub(page, `/#${id}`);
    expect(await openPanel(page)).toBe(id);

    await page.keyboard.press('Escape');
    await waitForPanel(page, null);

    expect(await hash(page)).toBe('');
    await expect(page.locator('#labels')).toHaveCSS('opacity', '1');
  });

  test(`the [data-exit] link closes #${id}`, async ({ page }) => {
    await openHub(page, `/#${id}`);
    await page.locator(`[data-panel="${id}"] [data-exit]`).first().click();
    await waitForPanel(page, null);

    expect(await hash(page)).toBe('');
  });
}

test('Escape returns to the hub, never to the previously visited panel', async ({ page }) => {
  await openHub(page);
  await clickLabel(page, 'backend');
  await waitForPanel(page, 'backend');
  await clickElsewhere(page, 'backend', 'projects');
  await waitForPanel(page, 'projects');

  await page.keyboard.press('Escape');
  await waitForPanel(page, null);

  // history.back() would land on #backend here. It must be the hub.
  expect(await openPanel(page)).toBeNull();
  expect(await hash(page)).toBe('');
});

/**
 * The ship rides the camera rig as a child of the camera, so its seat is a
 * literal in camera space rather than anything the park solve can move. That
 * literal used to be written in three places that disagreed: `resize()` seated
 * it at 5.2 while `returnShip()` and the dock's last control point used 3.4.
 * `shipBaseY` is solved against the half-height *at 5.2*, so coming back from a
 * panel dropped the ship to 97 % of the way down the viewport — bottom clipped,
 * a third larger — and it stayed there for the rest of the session, because
 * only `y` is rewritten per frame and never `z`.
 */
test('the ship comes back to the seat it booted in', async ({ page }) => {
  await openHub(page);
  const height = page.viewportSize()?.height ?? 0;
  expect(height).toBeGreaterThan(0);

  const before = await shipY(page);
  // The rig sits low, but clear of the edge with room for the hull.
  expect(before).toBeLessThan(height * 0.9);

  await clickLabel(page, 'backend');
  await waitForPanel(page, 'backend');
  await page.keyboard.press('Escape');
  // Resolves only once `isLaunching()` is false, which is after `dockShip()`
  // has run `returnShip()` — the exact moment the seat is rewritten.
  await waitForPanel(page, null);

  const after = await shipY(page);
  expect(after).toBeLessThan(height * 0.9);
  // The idle bob is ±0.02 world units at the rig depth, under 4 px at 900 tall,
  // so 12 px is slack for two samples at opposite phase and nothing else. With
  // the old seat restored this test reads 871.6 on a 900 px viewport, ~140 px
  // below the boot pose — measured, not estimated.
  expect(Math.abs(after - before)).toBeLessThan(12);
});

test('Escape after a deep link leaves a fully interactive hub', async ({ page }) => {
  await openHub(page, '/#xr');
  await page.keyboard.press('Escape');
  await waitForPanel(page, null);

  // Input is gated on `current` only, so a released panel means live input.
  await clickLabel(page, 'about');
  await waitForPanel(page, 'about');
  expect(await openPanel(page)).toBe('about');
});
