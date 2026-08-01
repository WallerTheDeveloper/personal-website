/**
 * ACCEPTANCE.md group E — the keyboard path.
 *
 * "Tab from load reaches all four planet labels in DOM order with a visible
 * focus ring (`outline-offset: 6px`) and the hover treatment; Enter launches."
 *
 * This is not a nice-to-have branch: both canvases are `aria-hidden`, so these
 * four anchors are the *entire* navigation surface for a keyboard or a screen
 * reader (CLAUDE.md "Accessibility"). If focus cannot reach them, or Enter does
 * not launch, the site has no navigation at all for those visitors — while
 * looking perfectly fine to a mouse.
 *
 * That is also why `LabelLayer.setVisible()` hides the layer with `opacity` and
 * `pointer-events` rather than `display` or `hidden`: the first pair leaves the
 * anchors in the accessibility tree, the second would take them out of it.
 *
 * Three hub boots, not six. Every claim about the resting hub is asserted in one
 * test because booting the scene on a software rasteriser is the expensive part
 * of each of them — see the harness note in TASKS.md Phase 9.
 */

import { expect, test, type Page } from '@playwright/test';

import { openHub, openPanel, settledAzimuth, waitForPanel } from './helpers';

/** The id of whatever holds focus. */
async function focusedId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

test('the keyboard reaches the hub: DOM order, a visible ring, and the hover treatment', async ({ page }) => {
  await openHub(page);
  // The text edition is still in the document during the fade-out that follows
  // a successful boot. `pointer-events: none` takes it away from the pointer but
  // not from the tab ring, so wait for it to be gone before counting stops.
  await expect(page.locator('#fallback')).toBeHidden();

  const stops: (string | null)[] = [];
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    stops.push(await focusedId(page));
  }
  expect(stops).toEqual([
    'lbl-backend',
    'lbl-projects',
    'lbl-xr',
    'lbl-about',
    // Then the two hub controls, in the order they are read out.
    'skip-scene',
    'quality-toggle',
  ]);

  await page.locator('#lbl-backend').focus();
  const ring = await page.locator('#lbl-backend').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth, offset: s.outlineOffset };
  });
  // The ring itself is the browser's own `:focus-visible` outline, deliberately
  // not restyled — it is the one affordance that already matches the visitor's
  // platform and their contrast settings. All the stylesheet does is push it
  // clear of the label.
  expect(ring.offset).toBe('6px');
  expect(ring.style).not.toBe('none');
  expect(parseFloat(ring.width)).toBeGreaterThan(0);

  // And focus lights the label the way hover does. The colour is --xr-hover,
  // resolved through the anchor's own `data-planet`; focus reaches it through
  // the *engine* (`focus` → `setHovered` → `onHover` → the layer), so this also
  // proves the DOM tint and the scene's hover state still have one owner.
  const name = page.locator('#lbl-xr [data-name]');
  const rest = await name.evaluate((el) => getComputedStyle(el).color);
  await page.locator('#lbl-xr').focus();
  await expect(name).toHaveCSS('color', 'rgb(208, 166, 255)');
  expect(rest).not.toBe('rgb(208, 166, 255)');
  // 26px at rest, 40px when its planet is hovered or focused.
  await expect(page.locator('#lbl-xr [data-leader]')).toHaveCSS('height', '40px');
});

test('focusing a label swings the camera toward its planet', async ({ page }) => {
  await openHub(page);
  const before = await settledAzimuth(page);

  await page.locator('#lbl-about').focus();
  const after = await settledAzimuth(page);

  // `focusPlanet()` eases to `theta * 0.85`, and About sits at a positive theta.
  // Without this a keyboard visitor would be told about a planet that is off
  // screen, and Enter would fly them somewhere they were never shown.
  expect(after).toBeGreaterThan(before);
  expect(after - before).toBeGreaterThan(0.05);
});

test('Enter on a focused label launches that destination, and Escape brings the hub back', async ({ page }) => {
  await openHub(page);
  await expect(page.locator('#fallback')).toBeHidden();

  await page.locator('#lbl-projects').focus();
  await page.keyboard.press('Enter');
  await waitForPanel(page, 'projects');

  expect(await openPanel(page)).toBe('projects');
  expect(await page.evaluate(() => window.location.hash)).toBe('#projects');

  await page.keyboard.press('Escape');
  await waitForPanel(page, null);
  expect(await openPanel(page)).toBeNull();
});
