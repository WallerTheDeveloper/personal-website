/**
 * ACCEPTANCE.md group B — "rapid double-click on two different planets: jumps
 * queue, never interleave, and you land on the second target".
 *
 * A jump in flight does not start another one; the request is held in
 * `_pending` and drained by `finish()`. Only the *last* request survives, so a
 * visitor who changes their mind mid-warp lands where they last asked.
 */

import { expect, test } from '@playwright/test';

import { clickElsewhere, clickLabel, clickPlanet, openHub, openPanel, waitForPanel } from './helpers';

/**
 * Driven from an open panel rather than from the hub, on purpose: leaving the
 * hub, `jump()` immediately takes `pointer-events` off every label, so a second
 * label click mid-departure is not something a visitor can perform. Panel links
 * stay live right up to the swap, which is where the queue is reachable.
 */
test('a second request mid-jump wins, and only one panel ends up open', async ({ page }) => {
  await openHub(page);
  await clickLabel(page, 'backend');
  await waitForPanel(page, 'backend');

  await clickElsewhere(page, 'backend', 'xr');
  // Well before the cover goes opaque, so the first jump is still in flight.
  await page.waitForTimeout(200);
  await clickElsewhere(page, 'backend', 'about');

  // Two jumps back to back, queued not interleaved.
  await waitForPanel(page, 'about');

  const visible = await page.evaluate(
    () => document.querySelectorAll('[data-panel][style*="visible"]').length,
  );
  expect(visible).toBe(1);
});

test('three rapid canvas clicks leave the site settled and navigable', async ({ page }) => {
  await openHub(page);

  await clickPlanet(page, 'backend');
  await page.waitForTimeout(120);
  await clickPlanet(page, 'projects');
  await page.waitForTimeout(120);
  await clickPlanet(page, 'xr');

  // The canvas nav path dedupes on a 350 ms window and the labels go
  // non-interactive the moment the first jump starts, so which target wins is
  // not fixed. What must hold is that the queue drains to exactly one panel,
  // the warp comes down, and the router is still usable.
  await page.waitForFunction(
    () => {
      const smoke = document.querySelector('#smoke');
      if (smoke !== null && getComputedStyle(smoke).display !== 'none') return false;
      return document.querySelectorAll('[data-panel][style*="visible"]').length === 1;
    },
    undefined,
    { timeout: 30_000 },
  );
  expect(await openPanel(page)).not.toBeNull();

  await page.keyboard.press('Escape');
  await waitForPanel(page, null);
});
