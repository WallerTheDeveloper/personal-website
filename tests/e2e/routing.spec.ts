/**
 * ACCEPTANCE.md group C — the routing half.
 *
 * These cover the invariants in `src/router.ts`'s header. Every one of them
 * corresponds to a bug the prototype actually had.
 */

import { expect, test } from '@playwright/test';

import {
  clickElsewhere,
  clickLabel,
  clickPlanet,
  hash,
  openHub,
  openPanel,
  PANELS,
  waitForPanel,
} from './helpers';

test.describe('hash → panel', () => {
  for (const id of PANELS) {
    test(`deep-load /#${id} opens that panel with the camera already parked`, async ({ page }) => {
      await openHub(page, `/#${id}`);

      // No warp on first paint: there is nothing to transition from.
      await expect(page.locator('#smoke')).toBeHidden();
      expect(await openPanel(page)).toBe(id);
      await expect(page.locator(`[data-panel="${id}"] h1`)).toBeVisible();

      // Parked means the camera holds that planet's own azimuth.
      const parked = await page.evaluate(() => window.__dgHub?.azimuth ?? null);
      expect(parked).not.toBeNull();
    });
  }

  test('no hash is the hub: labels visible, no panel', async ({ page }) => {
    await openHub(page);
    expect(await openPanel(page)).toBeNull();
    await expect(page.locator('#labels')).toHaveCSS('opacity', '1');
  });

  test('an unknown hash falls back to the hub rather than a blank panel', async ({ page }) => {
    await openHub(page, '/#not-a-destination');
    expect(await openPanel(page)).toBeNull();
  });
});

test.describe('navigation', () => {
  test('a label anchor routes without loading a document', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'xr');
    await waitForPanel(page, 'xr');

    expect(await hash(page)).toBe('xr');
    expect(await openPanel(page)).toBe('xr');
  });

  test('a canvas click on a planet launches it', async ({ page }) => {
    await openHub(page);
    await clickPlanet(page, 'backend');
    await waitForPanel(page, 'backend');

    expect(await hash(page)).toBe('backend');
    expect(await openPanel(page)).toBe('backend');
  });

  test('Back walks the visited destinations', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'backend');
    await waitForPanel(page, 'backend');
    await clickElsewhere(page, 'backend', 'projects');
    await waitForPanel(page, 'projects');

    await page.goBack();
    await waitForPanel(page, 'backend');

    await page.goBack();
    await waitForPanel(page, null);
    expect(await hash(page)).toBe('');
  });

  test('a full tour costs exactly one document load', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, PANELS[0]);
    await waitForPanel(page, PANELS[0]);

    for (let i = 1; i < PANELS.length; i++) {
      await clickElsewhere(page, PANELS[i - 1]!, PANELS[i]!);
      await waitForPanel(page, PANELS[i]!);
    }
    await page.keyboard.press('Escape');
    await waitForPanel(page, null);

    const navigations = await page.evaluate(() => performance.getEntriesByType('navigation').length);
    expect(navigations).toBe(1);
  });

  test('#smoke is never left visible once a jump has completed', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'about');
    await waitForPanel(page, 'about');
    await expect(page.locator('#smoke')).toBeHidden();

    await page.keyboard.press('Escape');
    await waitForPanel(page, null);
    await expect(page.locator('#smoke')).toBeHidden();
  });

  test('the title tracks the open destination and reverts on the hub', async ({ page }) => {
    await openHub(page);
    const base = await page.title();

    await clickLabel(page, 'xr');
    await waitForPanel(page, 'xr');
    expect(await page.title()).not.toBe(base);
    expect(await page.title()).toContain('XR');

    await page.keyboard.press('Escape');
    await waitForPanel(page, null);
    expect(await page.title()).toBe(base);
  });
});
