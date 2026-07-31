/**
 * TASKS.md Phase 7 — "azimuth persists across reload".
 *
 * `saveAzimuth` / `loadAzimuth` live in `warp.ts` but are called only from the
 * router: the engine keeps no storage of its own, which is why this could not
 * be verified in Phase 5. Session-scoped on purpose — where the camera was left
 * belongs to this visit, not to the profile.
 */

import { expect, test } from '@playwright/test';

import { hash, openHub, openPanel, panHub, settledAzimuth, waitForPanel } from './helpers';

const SESSION_KEY = 'dg-az';

test('the hub camera angle survives a reload', async ({ page }) => {
  await openHub(page);
  const panned = await panHub(page);

  await page.reload();
  await page.waitForFunction(() => window.__dg3dReady === true, undefined, { timeout: 30_000 });

  const stored = await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY);
  expect(stored).not.toBeNull();
  expect(Number(stored)).toBeCloseTo(panned, 2);

  // Applied instantly on boot, so it is exact rather than eased toward.
  const restored = await page.evaluate(() => window.__dgHub?.azimuth ?? 0);
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
