/**
 * ACCEPTANCE.md group C — the two failure modes that must not strand the site.
 *
 * Both are about the same rule: `_going` is never released solely by
 * `warp.clear().then(…)`, and navigation never waits on `history`. Each test
 * breaks one of those dependencies and asserts the site still lands and stays
 * navigable.
 */

import { expect, test } from '@playwright/test';

import { clickLabel, openHub, openPanel, waitForPanel } from './helpers';

test.describe('sandboxed history', () => {
  test.beforeEach(async ({ page }) => {
    // What a sandboxed iframe does: pushState throws instead of navigating.
    await page.addInitScript(() => {
      window.history.pushState = (): never => {
        throw new Error('history is sandboxed');
      };
    });
  });

  test('navigation still works when pushState throws', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'backend');

    // The hash cannot change — `go()` drives `jump()` directly, which is why
    // the panel opens anyway.
    await waitForPanel(page, 'backend');
    expect(await page.evaluate(() => window.location.hash)).toBe('');
  });

  test('Escape still returns to the hub when pushState throws', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'xr');
    await waitForPanel(page, 'xr');

    await page.keyboard.press('Escape');
    await waitForPanel(page, null);

    // And the hub is live, not merely blank.
    await clickLabel(page, 'about');
    await waitForPanel(page, 'about');
    expect(await openPanel(page)).toBe('about');
  });
});

test.describe('a warp that never finishes clearing', () => {
  test.beforeEach(async ({ page }) => {
    // Patch the served module so `clear()` returns a promise nobody resolves.
    // `dispose()` can no longer resolve it either, since the override does not
    // register with the instance — which is exactly the stalled-promise case
    // the watchdog exists for.
    await page.route('**/src/warp.ts*', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        response,
        body: `${body}\nWarp.prototype.clear = function () { return new Promise(function () {}); };\n`,
      });
    });
  });

  test('the watchdog still lands the jump and leaves the site navigable', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'projects');

    // Nothing resolves the clear, so only the watchdog at COVER + CLEAR + 700
    // can land this — and it also has to hide #smoke on the way out.
    await waitForPanel(page, 'projects');
    await expect(page.locator('#smoke')).toBeHidden();

    // `_going` was released by the watchdog, so the next jump is not queued
    // behind the stalled one.
    await page.keyboard.press('Escape');
    await waitForPanel(page, null);
    expect(await openPanel(page)).toBeNull();
  });
});

/**
 * The sequence behind `JumpGuard`: a jump's `clear()` resolving *after* the next
 * jump has begun, so a stale `finish()` lands in the middle of a live one.
 *
 * What this test does **not** claim is that it would catch the guard's token
 * check being removed — it was written to, and it does not. That check is
 * defence in depth, and the reason is worth writing down: a jump has three
 * independent ways to land (`cover()`'s `onOpaque`, the `clear()` promise, and
 * its watchdog), so a stale `finish()` running against the live jump performs
 * cleanup that the live jump was going to do for itself moments later. The
 * damage is a jump settling on another jump's behalf — an early `going = false`
 * and an early `drainPending()`, which is how two jumps come to interleave — and
 * the end state converges anyway. Verified by deleting the check and watching
 * this pass.
 *
 * The contract is therefore pinned where it is observable, in
 * `tests/unit/jump-guard.test.ts`, which fails on exactly that deletion. What
 * this covers is the sequence end to end: nothing throws, the router does not
 * wedge, and the visitor still lands.
 */
test.describe('a stalled jump that resolves after the next one has begun', () => {
  test.beforeEach(async ({ page }) => {
    // The first jump's `clear()` hangs until the *second* jump starts covering,
    // and every later one hangs for good — so the second jump can only be landed
    // by its own watchdog, and the stale `finish()` arrives before it has
    // committed anything. Chained off `cover()` rather than released on a timer:
    // the window is ~430 ms wide and no wall-clock guess survives a software
    // rasteriser under parallel workers.
    await page.route('**/src/warp.ts*', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        response,
        body: `${body}
let __covers = 0;
let __release = null;
const __cover = Warp.prototype.cover;
Warp.prototype.cover = function (options) {
  __covers++;
  if (__covers === 2 && __release !== null) {
    const release = __release;
    __release = null;
    release();
  }
  return __cover.call(this, options);
};
Warp.prototype.clear = function () {
  if (__covers <= 1) return new Promise(function (resolve) { __release = resolve; });
  return new Promise(function () {});
};
`,
      });
    });
  });

  test('does not wedge the router', async ({ page }) => {
    await openHub(page);

    // Jump 1 stalls on `clear()` and is landed by its watchdog.
    await clickLabel(page, 'projects');
    await waitForPanel(page, 'projects');

    // Escape starts jump 2, which resolves jump 1's stalled promise on its way
    // past — so a `finish()` belonging to a jump that is over runs while jump 2
    // is covering and has committed nothing yet, and jump 2's own `clear()`
    // never resolves. The hub still has to come back, off jump 2's watchdog.
    await page.keyboard.press('Escape');

    await waitForPanel(page, null);
    expect(await openPanel(page)).toBeNull();

    // And the router is still usable, not merely showing the right thing.
    await clickLabel(page, 'about');
    await waitForPanel(page, 'about');
    expect(await openPanel(page)).toBe('about');
  });
});
