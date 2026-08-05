/**
 * The `#projects/pN` sub-route and the detail dialog it opens.
 *
 * This file is what CLAUDE.md's "add a Playwright test before changing any
 * router invariant" clause is satisfied by. The change it covers added a second
 * routing axis beside `current`, and three of the tests below fail outright
 * against the router as it was:
 *
 *   - "a card click opens its detail without a jump" — `go()` early-returns on
 *     `id === current`, and a detail always opens over a panel that is already
 *     current, so routing this through `go()` pushes nothing and shows nothing.
 *   - "Back closes the detail" — `route()` early-returned on `target ===
 *     current` and swallowed every same-panel sub-route change.
 *   - "is centred on the viewport" — `position: fixed` only resolves against the
 *     viewport while no ancestor of `.col` carries a `transform`, `filter`,
 *     `perspective`, `will-change` or `contain`. This is the test that fails the
 *     day one of them is added.
 *
 * Selectors use `[id="projects/p1"]` rather than `#projects\/p1` throughout: the
 * id carries a slash so that it can match the sub-route exactly, and an
 * attribute selector sidesteps the CSS escaping that an id selector would need.
 *
 * Nothing here reaches the network. The site makes no third-party request until
 * a detail is open, and the ones it then makes are stubbed below so the suite
 * stays offline-safe and does not depend on a video still existing.
 */

import { expect, test, type Page } from '@playwright/test';

import { hash, openHub, openPanel, waitForPanel } from './helpers';

/** A 1×1 transparent PNG, so a stubbed thumbnail decodes rather than erroring. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const detail = (project: string): string => `[id="projects/${project}"]`;

test.beforeEach(async ({ page }) => {
  await page.route('**://i.ytimg.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
  );
  await page.route('**://*.youtube-nocookie.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }),
  );
});

/** Which detail is open, by the class the layer writes. */
async function openedDetail(page: Page): Promise<string | null> {
  return page.evaluate(
    () => document.querySelector('.project__detail.is-open')?.getAttribute('data-detail') ?? null,
  );
}

/**
 * Watch `#smoke` for a second of real frames. A jump raises the warp cover for
 * ~900 ms, so a jump started by the preceding action cannot hide inside this.
 */
async function warpRan(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    let seen = false;
    for (let i = 0; i < 60; i++) {
      const el = document.querySelector('#smoke');
      if (el !== null && getComputedStyle(el).display !== 'none') seen = true;
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    }
    return seen;
  });
}

test.describe('opening a project detail', () => {
  test('a card click opens its detail without a jump', async ({ page }) => {
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');

    await page.locator('a[href="#projects/p2"]').click();

    expect(await openedDetail(page)).toBe('p2');
    expect(await hash(page)).toBe('projects/p2');
    // The panel underneath never changed, so nothing had to fly: if this ever
    // starts running the warp, the detail has been turned into a fifth
    // destination, which is exactly what the second axis exists to avoid.
    expect(await warpRan(page)).toBe(false);
    expect(await openPanel(page)).toBe('projects');
  });

  test('a deep link arrives with the detail already open', async ({ page }) => {
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');
    expect(await openedDetail(page)).toBe('p1');
    expect(await openPanel(page)).toBe('projects');
  });

  test('an unknown sub-route lands on the panel, not the hub', async ({ page }) => {
    // `parseRoute` drops an unreadable tail to the panel rather than escalating
    // to the hub: the visitor did ask for Projects.
    await openHub(page, '/#projects/p9');
    await waitForPanel(page, 'projects');
    expect(await openPanel(page)).toBe('projects');
    expect(await openedDetail(page)).toBeNull();
  });

  test('sets the project title, and puts it back on close', async ({ page }) => {
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    const panelTitle = await page.title();

    await page.locator('a[href="#projects/p1"]').click();
    const detailTitle = await page.title();
    expect(detailTitle).not.toBe(panelTitle);
    // Whatever the owner has filled the token with, the dialog's own heading is
    // the string the title is built from.
    const heading = await page.locator(`${detail('p1')} .project__detail-title`).textContent();
    expect(detailTitle).toContain((heading ?? '').trim());

    await page.keyboard.press('Escape');
    expect(await page.title()).toBe(panelTitle);
  });
});

test.describe('closing a project detail', () => {
  test('Escape closes the detail, and a second Escape exits to the hub', async ({ page }) => {
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');

    await page.keyboard.press('Escape');
    expect(await openedDetail(page)).toBeNull();
    expect(await openPanel(page)).toBe('projects');
    expect(await hash(page)).toBe('projects');

    await page.keyboard.press('Escape');
    await waitForPanel(page, null);
    expect(await hash(page)).toBe('');
  });

  test('Back closes the detail and leaves the panel open', async ({ page }) => {
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    await page.locator('a[href="#projects/p3"]').click();
    expect(await openedDetail(page)).toBe('p3');

    await page.goBack();
    expect(await hash(page)).toBe('projects');
    expect(await openedDetail(page)).toBeNull();
    expect(await openPanel(page)).toBe('projects');
  });

  test('the close control pushes, so Back re-opens the detail', async ({ page }) => {
    // Pinned deliberately. `closeDetail()` pushes `#projects` rather than
    // calling `history.back()` — the rule `exit()` lives by, plus the fact that
    // a deep-linked visitor has no `#projects` entry behind them at all. The
    // cost is this re-open, and changing it should have to be a deliberate act.
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');
    await page.locator(`${detail('p1')} [data-detail-close]`).click();
    expect(await openedDetail(page)).toBeNull();

    await page.goBack();
    expect(await openedDetail(page)).toBe('p1');
  });

  test('leaving the panel closes the detail', async ({ page }) => {
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');

    // Driven by the hash rather than by a click, because the scrim covers the
    // panel's own links — see the test below, which is the reason. This is the
    // path a bookmark, an external deep link and the forward button all take:
    // `hashchange` → `route()` → `jump()` → `commit()`, and it is `commit()`
    // that has to notice the sub-route is gone.
    await page.evaluate(() => {
      window.location.hash = '#xr';
    });
    await waitForPanel(page, 'xr');
    expect(await openedDetail(page)).toBeNull();
  });

  test('the scrim takes the clicks the card grid would have got', async ({ page }) => {
    // The other half of "modal": `aria-modal` tells a screen reader to ignore
    // the rest of the document, and this is what makes that true for a pointer.
    // There is no `inert` to do it — every element that could carry it is an
    // ancestor of the dialog (see the header of `src/project-detail.ts`).
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');
    const blocked = await page
      .locator('[data-panel="projects"] a[href="#xr"]')
      .click({ timeout: 2_000 })
      .then(
        () => false,
        () => true,
      );
    expect(blocked).toBe(true);
    expect(await openedDetail(page)).toBe('p1');
  });
});

test.describe('the dialog', () => {
  test('is centred on the viewport, not inside the column', async ({ page }) => {
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');

    const view = page.viewportSize();
    const scrim = await page.locator(detail('p1')).boundingBox();
    expect(view).not.toBeNull();
    expect(scrim).not.toBeNull();
    expect(Math.round(scrim?.x ?? -1)).toBe(0);
    expect(Math.round(scrim?.y ?? -1)).toBe(0);
    expect(Math.round(scrim?.width ?? 0)).toBe(view?.width);
    expect(Math.round(scrim?.height ?? 0)).toBe(view?.height);

    const box = await page.locator(`${detail('p1')} .project__dialog`).boundingBox();
    const left = box?.x ?? 0;
    const right = (view?.width ?? 0) - ((box?.x ?? 0) + (box?.width ?? 0));
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  test('keeps the house rules: radius 0, no shadow', async ({ page }) => {
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');
    const style = await page.locator(`${detail('p1')} .project__dialog`).evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderTopLeftRadius, shadow: s.boxShadow, border: s.borderTopColor };
    });
    expect(style.radius).toBe('0px');
    expect(style.shadow).toBe('none');
    expect(style.border).toBe('rgba(255, 255, 255, 0.08)');
  });

  test('traps focus, and hands it back to the card on close', async ({ page }) => {
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    await page.locator('a[href="#projects/p1"]').click();

    // More presses than the dialog has stops, so a trap that does not wrap walks
    // out into the card grid and the hub labels behind it.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(
        () =>
          document
            .querySelector('.project__detail.is-open .project__dialog')
            ?.contains(document.activeElement) ?? false,
      );
      expect(inside).toBe(true);
    }

    await page.keyboard.press('Escape');
    const restored = await page.evaluate(() => document.activeElement?.getAttribute('href') ?? null);
    expect(restored).toBe('#projects/p1');
  });

  test('declares itself a modal only while it is one', async ({ page }) => {
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    const dialog = page.locator(`${detail('p1')} .project__dialog`);

    // Closed: no claim about a modal at all. The flat document ships in this
    // state and never runs the module that would make the claim true.
    await expect(dialog).not.toHaveAttribute('role', 'dialog');

    await page.locator('a[href="#projects/p1"]').click();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    await expect(dialog).toHaveAttribute('aria-modal', 'true');

    const labelledBy = await dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    await expect(page.locator(`[id="${labelledBy ?? ''}"]`)).toHaveClass(/project__detail-title/);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('role', 'dialog');
    await expect(dialog).not.toHaveAttribute('aria-modal', 'true');
  });
});
