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
