/**
 * TASKS.md Phase 7 — "azimuth persists across reload".
 *
 * `saveAzimuth` / `loadAzimuth` live in `warp.ts` but are called only from the
 * router: the engine keeps no storage of its own, which is why this could not
 * be verified in Phase 5. Session-scoped on purpose — where the camera was left
 * belongs to this visit, not to the profile.
 */

import { expect, test, type Page } from '@playwright/test';

import { hash, openHub, openPanel, panHub, settledAzimuth, waitForPanel } from './helpers';

const SESSION_KEY = 'dg-az';

/** Where the page parks the angle it read one frame after the scene came up. */
interface BootProbe {
  __azAtBoot?: number;
}

/**
 * Capture the hub azimuth from *inside* the page, on the first frame after boot.
 *
 * Reading it over a round trip instead leaves room for the first-load hint — a
 * ~10° swing at 900 ms, cancelled only by a visitor who has already acted — to
 * begin, and then the reading is a number easing toward `HINT_AZIMUTH` rather
 * than the one that was restored. It passed at four workers and failed at two,
 * which is the same trap as everything else in this suite: anything that reads a
 * live scene value after a round trip is racing the engine.
 *
 * Install before the navigation being measured; it re-arms on every load.
 */
async function captureBootAzimuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tick = (): void => {
      const hub = window.__dgHub;
      // `boot()` sets `__dg3dReady` before it restores the angle, but it does
      // both in one synchronous run — so the first frame after it is the first
      // safe moment, and it is ~900 ms ahead of the hint.
      if (window.__dg3dReady === true && hub != null) {
        (window as BootProbe).__azAtBoot = hub.azimuth;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test('the hub camera angle survives a reload', async ({ page }) => {
  await openHub(page);
  const panned = await panHub(page);

  await captureBootAzimuth(page);
  await page.reload();
  await page.waitForFunction(() => typeof (window as BootProbe).__azAtBoot === 'number', undefined, {
    timeout: 30_000,
  });

  const stored = await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY);
  expect(stored).not.toBeNull();
  expect(Number(stored)).toBeCloseTo(panned, 2);

  // Applied instantly on boot, so it is exact rather than eased toward.
  const restored = await page.evaluate(() => (window as BootProbe).__azAtBoot ?? 0);
  expect(restored).toBeCloseTo(panned, 2);
});

test('a panel visit banks the hub angle, not the parked one', async ({ page }) => {
  await openHub(page);
  const hubAngle = await panHub(page);

  // Park on a planet. The live azimuth is now that planet's theta, which is
  // emphatically not what should be remembered.
  await page.goto('/#xr');
  await page.waitForFunction(() => window.__dg3dReady === true, undefined, { timeout: 30_000 });
  await waitForPanel(page, 'xr');
  expect(await openPanel(page)).toBe('xr');
  const parked = await settledAzimuth(page);
  expect(Math.abs(parked - hubAngle)).toBeGreaterThan(0.05);

  await page.keyboard.press('Escape');
  await waitForPanel(page, null);
  expect(await hash(page)).toBe('');

  const restored = await settledAzimuth(page);
  expect(restored).toBeCloseTo(hubAngle, 2);
});
