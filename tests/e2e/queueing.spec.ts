/**
 * ACCEPTANCE.md group B — "rapid double-click on two different planets: jumps
 * queue, never interleave, and you land on the second target".
 *
 * A jump in flight does not start another one; the request is held in
 * `_pending` and drained by `finish()`. Only the *last* request survives, so a
 * visitor who changes their mind mid-warp lands where they last asked.
 */

import { expect, test } from '@playwright/test';

import { clickElsewhere, clickLabel, openHub, openPanel, planetPoint, waitForPanel } from './helpers';

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

  // All three points are read from the hub at rest, *before* the first click,
  // and then clicked as fixed coordinates.
  //
  // Reading each one at click time instead makes the test depend on the camera
  // still framing that planet several round-trips later — and it does not: the
  // first click launches the ship and, once the jump commits, parks the camera,
  // which sweeps the others off screen. The 120 ms waits are wall-clock, but a
  // `mouse.click` plus an `evaluate` under four parallel workers on a software
  // rasteriser costs far more than that, so the third read could land after the
  // park and fail with "planet is not fully on screen" — a starved browser
  // reading as a router bug.
  //
  // Fixed coordinates are also the truer model of the thing under test: someone
  // clicking three times in half a second is clicking where the planets were
  // when they started, not where the engine has since moved them.
  const targets: { x: number; y: number }[] = [];
  for (const id of ['backend', 'projects', 'xr'] as const) targets.push(await planetPoint(page, id));

  for (const [i, target] of targets.entries()) {
    if (i > 0) await page.waitForTimeout(120);
    await page.mouse.click(target.x, target.y);
  }

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
