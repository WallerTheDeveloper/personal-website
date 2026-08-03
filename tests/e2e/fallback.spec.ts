/**
 * ACCEPTANCE.md group E — the three ways a visitor ends up on the text edition.
 *
 * No WebGL, a context lost mid-session, and no JavaScript at all. All three land
 * in the same place: `html[data-dg-flat]`, the scene gone, and the four panels
 * flowed into one continuous document whose in-page links work.
 *
 * WebGL is blocked by overriding `HTMLCanvasElement.prototype.getContext` in an
 * init script, never by a browser flag — the flag would also change what the
 * rest of the suite runs against, and the head probe has to see the same failure
 * the engine would.
 */

import { expect, test, type Page } from '@playwright/test';

import { blockWebGL, clickLabel, openHub, PANELS, waitForPanel } from './helpers';

/**
 * Everything that makes the flat document the flat document, asserted in one
 * place so the three routes into it cannot drift apart.
 */
async function expectFlatDocument(page: Page): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1');
  await expect(page.locator('html')).not.toHaveAttribute('data-dg-3d', /.*/);

  await expect(page.locator('#stage')).toBeHidden();
  await expect(page.locator('#smoke')).toBeHidden();
  await expect(page.locator('#fallback')).toBeVisible();

  // One continuous document: every panel on screen, in source order, each one
  // clear of the next. This is the assertion that fails if a panel is left
  // pinned as a fixed overlay on top of the others.
  //
  // Consecutive panels are compared against each other rather than against a
  // running total from zero: boxes are viewport-relative, and a context lost
  // with a panel open scrolls that panel to the top, which puts the ones above
  // it at negative coordinates.
  let bottom: number | null = null;
  for (const id of PANELS) {
    const panel = page.locator(`[data-panel="${id}"]`);
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-hero]')).toBeHidden();
    const box = await panel.boundingBox();
    expect(box, `panel ${id} has no box`).not.toBeNull();
    expect(box!.height).toBeGreaterThan(200);
    if (bottom !== null) expect(box!.y).toBeGreaterThanOrEqual(bottom - 1);
    bottom = box!.y + box!.height;
  }

  // And the whole CV is genuinely there, not a stub: one <h1> per panel.
  await expect(page.locator('[data-panel] h1')).toHaveCount(PANELS.length);
}

/** Follow a text-edition card and prove the browser actually went there. */
async function expectCardScrollsTo(page: Page, id: (typeof PANELS)[number]): Promise<void> {
  await page.locator(`#fallback a[href="#${id}"]`).click();
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  // The anchor sits at the panel's top edge, so a resolved fragment brings that
  // edge to the top of the viewport. A dangling `#id` leaves it hundreds of
  // pixels away, which is the failure this catches — the tolerance is for the
  // web fonts landing after the scroll and reflowing everything above by a few
  // px, not for a fragment that half worked.
  await expect
    .poll(async () => {
      const box = await page.locator(`[data-panel="${id}"]`).boundingBox();
      return box === null ? Number.NaN : Math.abs(box.y);
    })
    .toBeLessThan(50);
}

test.describe('no WebGL', () => {
  test.beforeEach(async ({ page }) => {
    await blockWebGL(page);
  });

  test('the text edition is the whole site', async ({ page }) => {
    await page.goto('/');
    await expectFlatDocument(page);
    // Nothing waited on the module to decide this: the document ships flat and
    // the probe leaves it flat, so it was correct before any script ran.
    await expect(page.locator('#fallback .te__cv')).toHaveAttribute('href', 'cv.pdf');
  });

  test('every destination is reachable from the text edition', async ({ page }) => {
    await page.goto('/');
    await expectFlatDocument(page);
    for (const id of PANELS) await expectCardScrollsTo(page, id);
  });

  test('a panel cross-link is an in-page scroll, not a route', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-panel="backend"] a[href="#xr"]').first().click();
    await expect(page).toHaveURL(/#xr$/);
    await expect.poll(async () => (await page.locator('[data-panel="xr"]').boundingBox())?.y ?? NaN).toBeLessThan(2);
    // Still one document load — the router never re-entered routing.
    expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(1);
  });
});

test.describe('a lost context', () => {
  /** What a driver reset does. The engine gets `webglcontextlost` either way. */
  async function loseContext(page: Page): Promise<void> {
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('#scene');
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      const ext = (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context') as {
        loseContext(): void;
      } | null;
      if (ext == null) throw new Error('WEBGL_lose_context is unavailable');
      ext.loseContext();
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-dg-flat'), undefined, {
      timeout: 15_000,
    });
  }

  test('hands the hub back to the text edition', async ({ page }) => {
    await openHub(page);
    await loseContext(page);
    await expectFlatDocument(page);
    expect(await page.evaluate(() => window.__dg3dReady)).toBe(false);
  });

  test('leaves the site navigable', async ({ page }) => {
    await openHub(page);
    await loseContext(page);
    for (const id of PANELS) await expectCardScrollsTo(page, id);
  });

  test('keeps an open panel in view, and does not dispose the renderer', async ({ page }) => {
    await openHub(page);
    await clickLabel(page, 'xr');
    await waitForPanel(page, 'xr');

    await loseContext(page);
    await expectFlatDocument(page);

    // The visitor was reading XR; they should still be looking at XR.
    await expect
      .poll(async () => {
        const box = await page.locator('[data-panel="xr"]').boundingBox();
        return box === null ? Number.NaN : Math.abs(box.y);
      })
      .toBeLessThan(50);

    // One renderer per document, disposed only on pagehide. A lost context is
    // not a teardown, and disposing here would break that rule.
    expect(await page.evaluate(() => window.__dgHub !== null && window.__dgHub !== undefined)).toBe(true);
  });
});

test.describe('no JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the text edition is complete and every link works', async ({ page }) => {
    await page.goto('/');
    await expectFlatDocument(page);
    // Same helper as the WebGL-blocked runs: it touches nothing but locators, so
    // it holds with script execution disabled outright.
    for (const id of PANELS) await expectCardScrollsTo(page, id);

    await expect(page.locator('#fallback .te__cv')).toHaveAttribute('href', 'cv.pdf');
  });
});
