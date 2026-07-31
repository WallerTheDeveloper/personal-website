/**
 * ACCEPTANCE.md group C — "after a full tour, canvas clicks still launch".
 *
 * This is the dead-input regression and it is a standing test. It had two
 * causes in the prototype, both of which this file would have caught:
 *
 *   1. Gating pointer input on the `_going` transition flag as well as on
 *      `current`. Any hiccup that left `_going` set killed canvas input for
 *      the rest of the session.
 *   2. `exit()` using `history.back()` where History was sandboxed, which left
 *      `current` pointing at a panel that was no longer on screen — so every
 *      subsequent pointer handler returned early.
 */

import { expect, test } from '@playwright/test';

import {
  clickElsewhere,
  clickLabel,
  clickNearestPlanet,
  openHub,
  openPanel,
  panHub,
  PANELS,
  waitForPanel,
} from './helpers';

test('canvas clicks still launch after a full tour', async ({ page }) => {
  await openHub(page);

  await clickLabel(page, PANELS[0]);
  await waitForPanel(page, PANELS[0]);
  for (let i = 1; i < PANELS.length; i++) {
    await clickElsewhere(page, PANELS[i - 1]!, PANELS[i]!);
    await waitForPanel(page, PANELS[i]!);
  }
  await page.keyboard.press('Escape');
  await waitForPanel(page, null);

  // The whole point: the pointer path, on the canvas, after all of that.
  const launched = await clickNearestPlanet(page);
  await waitForPanel(page, launched);
  expect(await openPanel(page)).toBe(launched);
});

test('the camera still pans after a full tour', async ({ page }) => {
  await openHub(page);

  for (const id of PANELS) {
    await clickLabel(page, id);
    await waitForPanel(page, id);
    await page.keyboard.press('Escape');
    await waitForPanel(page, null);
  }

  // `panHub` throws if the camera does not move. It also picks its direction
  // from the current angle: focusing a label swings the camera toward that
  // planet, so after a tour the hub sits near the last one visited — about
  // 0.47 rad, a hair off the ±0.5 clamp. Nudging further that way would
  // measure the clamp rather than the input.
  await panHub(page, 2);
});
