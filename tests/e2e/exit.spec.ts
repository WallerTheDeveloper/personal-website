/**
 * ACCEPTANCE.md group C — leaving a panel.
 *
 * `exit()` is hard-wired to `go(null)`. The temptation is `history.back()`, and
 * these are the two reasons it is wrong: Back replays the *previously visited
 * panel* rather than returning to the scene, and where History is sandboxed it
 * does nothing at all, stranding `current` on a closed panel and dead-locking
 * canvas input. The third test below is the one that catches the first case.
 */

import { expect, test } from '@playwright/test';

import { clickElsewhere, clickLabel, hash, openHub, openPanel, PANELS, waitForPanel } from './helpers';

for (const id of PANELS) {
  test(`Escape closes #${id} and returns to the hub`, async ({ page }) => {
    await openHub(page, `/#${id}`);
    expect(await openPanel(page)).toBe(id);

    await page.keyboard.press('Escape');
    await waitForPanel(page, null);

    expect(await hash(page)).toBe('');
    await expect(page.locator('#labels')).toHaveCSS('opacity', '1');
  });

  test(`the [data-exit] link closes #${id}`, async ({ page }) => {
    await openHub(page, `/#${id}`);
    await page.locator(`[data-panel="${id}"] [data-exit]`).first().click();
    await waitForPanel(page, null);

    expect(await hash(page)).toBe('');
  });
}

test('Escape returns to the hub, never to the previously visited panel', async ({ page }) => {
  await openHub(page);
  await clickLabel(page, 'backend');
  await waitForPanel(page, 'backend');
  await clickElsewhere(page, 'backend', 'projects');
  await waitForPanel(page, 'projects');

  await page.keyboard.press('Escape');
  await waitForPanel(page, null);

  // history.back() would land on #backend here. It must be the hub.
  expect(await openPanel(page)).toBeNull();
  expect(await hash(page)).toBe('');
});

test('Escape after a deep link leaves a fully interactive hub', async ({ page }) => {
  await openHub(page, '/#xr');
  await page.keyboard.press('Escape');
  await waitForPanel(page, null);

  // Input is gated on `current` only, so a released panel means live input.
  await clickLabel(page, 'about');
  await waitForPanel(page, 'about');
  expect(await openPanel(page)).toBe('about');
});
