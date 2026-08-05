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

import { blockWebGL, clickLabel, openHub, PANELS, waitForPanel } from './helpers';

/** Nothing from the scene, the transition, or the sticky chrome may print. */
const HIDDEN = [
  '#stage',
  '#scene',
  '#smoke',
  '#reticle',
  // Covered by `#stage { display: none }` rather than by a rule of its own —
  // which is exactly why it is asserted here. The loading screen lives inside
  // #stage so that the flat and print states need no teardown for it, and this
  // is what would notice if it were ever moved out.
  '#loading',
  '[data-grain]',
  '[data-panel-top]',
  '[data-hero]',
];

async function expectPrintsAsOneDocument(page: Page): Promise<void> {
  for (const selector of HIDDEN) {
    const count = await page.locator(selector).count();
    expect(count, `${selector} is missing from the document`).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(page.locator(selector).nth(i)).toBeHidden();
    }
  }

  // A project detail is part of the CV, not an overlay over it. Printing from
  // the routed edition still carries `data-dg-3d`, so without the `!important`
  // rules in the print block three of the four would be `display: none` and the
  // fourth pinned to the viewport — neither of which survives pagination.
  const details = page.locator('.project__detail');
  const count = await details.count();
  expect(count, 'the project details are missing from the document').toBe(4);
  for (let i = 0; i < count; i++) {
    const style = await details.nth(i).evaluate((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, display: s.display, visibility: s.visibility };
    });
    expect(style, `project detail ${i + 1}`).toEqual({
      position: 'static',
      display: 'block',
      visibility: 'visible',
    });
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

    // Same test, one level down: a detail still pinned to the viewport would
    // sit outside the panel that contains it and stamp itself over page one.
    if (id === 'projects') {
      for (let i = 0; i < count; i++) {
        const inner = await details.nth(i).boundingBox();
        expect(inner, `project detail ${i + 1} has no box`).not.toBeNull();
        expect(inner!.y, `project detail ${i + 1} starts above its panel`).toBeGreaterThanOrEqual(
          box!.y - 1,
        );
        expect(
          inner!.y + inner!.height,
          `project detail ${i + 1} runs past its panel`,
        ).toBeLessThanOrEqual(box!.y + box!.height + 1);
      }
    }
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

test('an open project detail prints inside the CV, not over it', async ({ page }) => {
  // The worst case for the print block: the routed edition, `data-dg-3d` still
  // on, one detail `position: fixed` over the whole viewport and the other three
  // `display: none`. All four have to come back into the flow.
  await openHub(page, '/#projects/p1');
  await waitForPanel(page, 'projects');
  await expect(page.locator('[id="projects/p1"]')).toHaveClass(/is-open/);

  await page.emulateMedia({ media: 'print' });
  await expectPrintsAsOneDocument(page);
});

test('the text edition prints the same document', async ({ page }) => {
  await blockWebGL(page);
  await page.goto('/');
  await page.emulateMedia({ media: 'print' });
  await expectPrintsAsOneDocument(page);
});
