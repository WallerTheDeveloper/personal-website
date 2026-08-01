/**
 * ACCEPTANCE.md group F — print.
 *
 * The whole CV has to print as one continuous document, from either edition:
 * the routed site (where three panels are hidden overlays and one is open) and
 * the flat text edition. `emulateMedia({ media: 'print' })` resolves the print
 * stylesheet without a print dialog, so these assert the same computed styles a
 * printer would get.
 */

import { expect, test, type Page } from '@playwright/test';

import { clickLabel, openHub, PANELS, waitForPanel } from './helpers';

/** Nothing from the scene, the transition, or the sticky chrome may print. */
const HIDDEN = ['#stage', '#scene', '#smoke', '#reticle', '[data-grain]', '[data-panel-top]', '[data-hero]'];

async function expectPrintsAsOneDocument(page: Page): Promise<void> {
  for (const selector of HIDDEN) {
    const count = await page.locator(selector).count();
    expect(count, `${selector} is missing from the document`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(page.locator(selector).nth(i)).toBeHidden();
    }
  }

  let bottom: number | null = null;
  for (const id of PANELS) {
    const panel = page.locator(`[data-panel="${id}"]`);
    const style = await panel.evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, visibility: s.visibility, opacity: s.opacity };
    });
    expect(style, `panel ${id}`).toEqual({ position: 'static', visibility: 'visible', opacity: '1' });

    const box = await panel.boundingBox();
    expect(box, `panel ${id} has no box`).not.toBeNull();
    expect(box!.height).toBeGreaterThan(200);
    // In order, and never overlapping — an overlap is what a panel left as a
    // fixed overlay looks like, and it prints as one page of soup.
    if (bottom !== null) expect(box!.y).toBeGreaterThanOrEqual(bottom - 1);
    bottom = box!.y + box!.height;
  }

  const body = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return { background: s.backgroundColor, color: s.color, overflow: s.overflowY };
  });
  expect(body.background).toBe('rgb(255, 255, 255)');
  expect(body.color).toBe('rgb(17, 17, 17)');
  expect(body.overflow).toBe('visible');
}

test('the hub prints as the whole CV', async ({ page }) => {
  await openHub(page);
  await page.emulateMedia({ media: 'print' });
  await expectPrintsAsOneDocument(page);
});

test('an open panel prints as the whole CV, not just itself', async ({ page }) => {
  await openHub(page);
  await clickLabel(page, 'projects');
  await waitForPanel(page, 'projects');

  await page.emulateMedia({ media: 'print' });
  // The three panels the router left `visibility: hidden` have to come back —
  // this is what the `!important` in the print block is for.
  await expectPrintsAsOneDocument(page);
});

test('the text edition prints the same document', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    const blocked = new Set(['webgl', 'webgl2', 'experimental-webgl']);
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
      if (blocked.has(String(args[0]))) return null;
      return (real as (...a: unknown[]) => unknown).apply(this, args);
    } as typeof real;
  });
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
  await expectPrintsAsOneDocument(page);
});
