/**
 * The site on a phone.
 *
 * The suite already ran a 390px column through `visual.spec.ts` and a 390×844
 * viewport through `budget.spec.ts` and `cursor.spec.ts`, and all three passed
 * against a document that was visibly broken there. That is worth stating,
 * because it is the reason this file exists rather than another width in the
 * existing sweeps: those specs assert *chosen* measurements, so they can only
 * catch a number someone thought to write down. A layout that overflows its own
 * container is not a wrong number, it is a wrong relationship — the text-edition
 * grid was 360px wide inside a 328px box and clipped four nav cards on every
 * phone, while a test measuring the column around it stayed green.
 *
 * So the assertions here are relational and mostly negative: nothing wider than
 * its parent, nothing outside the viewport, no two labels on top of each other.
 * They hold at any width, and they would have caught all of it.
 *
 * Both orientations, because they fail differently. Portrait runs out of width —
 * measures, label columns, unbreakable URLs. Landscape runs out of *height*,
 * where a hero with a 220px floor spent 59 % of the screen before a word of the
 * panel appeared.
 */

import { expect, test, type Page } from '@playwright/test';

import { openHub, PANELS, waitForPanel, type Panel } from './helpers';

/** The narrowest supported viewport, and the same device turned on its side. */
const PORTRAIT = { width: 375, height: 667 } as const;
const LANDSCAPE = { width: 667, height: 375 } as const;

/** Chromium reports sub-pixel layout; a fraction of a pixel is not an overflow. */
const SLOP_PX = 1;

/** Does the document scroll sideways? The one question that covers everything. */
async function overflowsX(page: Page): Promise<boolean> {
  return page.evaluate(
    (slop) => document.documentElement.scrollWidth > document.documentElement.clientWidth + slop,
    SLOP_PX,
  );
}

/**
 * The text edition, laid out and holding still.
 *
 * `#fallback` is the document's default state, so blocking the router is enough
 * to keep it — no WebGL needs to be stubbed and nothing repaints underneath a
 * measurement.
 */
async function openTextEdition(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.route('**/src/main.ts*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.setViewportSize(size);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#fallback')).toBeVisible();
}

/** Every element in `selector` that is wider than the box it sits in. */
async function overflowingChildren(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    ({ sel, slop }) =>
      [...document.querySelectorAll<HTMLElement>(sel)]
        .filter((el) => {
          const parent = el.parentElement;
          if (parent === null) return false;
          return el.getBoundingClientRect().width > parent.getBoundingClientRect().width + slop;
        })
        .map((el) => el.className || el.tagName),
    { sel: selector, slop: SLOP_PX },
  );
}

test.describe('the text edition on a phone', () => {
  test('does not scroll sideways in portrait', async ({ page }) => {
    await openTextEdition(page, PORTRAIT);
    expect(await overflowsX(page)).toBe(false);
  });

  test('the nav grid collapses instead of being clipped', async ({ page }) => {
    await openTextEdition(page, PORTRAIT);

    // The exact failure: `minmax(calc(240px * 1.5), 1fr)` is a 360px floor, and
    // `auto-fit` will not drop below one track — so the grid was 360px wide
    // inside a 328px column and `.te { overflow-x: hidden }` quietly took the
    // right-hand edge off all four cards. Measured against the parent, because
    // the clip meant the *viewport* never overflowed and nothing looked wrong
    // from the outside.
    const fits = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('.te__grid')!;
      const col = document.querySelector<HTMLElement>('.te__col')!;
      return {
        grid: grid.getBoundingClientRect().width,
        col: col.getBoundingClientRect().width,
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      };
    });
    expect(fits.grid).toBeLessThanOrEqual(fits.col + SLOP_PX);
    // One column at this width, rather than four squeezed past their own floor.
    expect(fits.columns).toBe(1);
  });

  test('every card is fully on screen', async ({ page }) => {
    await openTextEdition(page, PORTRAIT);

    const cards = page.locator('.te__card');
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i += 1) {
      const box = await cards.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(-SLOP_PX);
      expect(box!.x + box!.width).toBeLessThanOrEqual(PORTRAIT.width + SLOP_PX);
    }
  });
});

test.describe('the panels on a phone', () => {
  test.use({ viewport: PORTRAIT, hasTouch: true, isMobile: true });

  for (const panel of PANELS) {
    test(`${panel} fits the viewport`, async ({ page }) => {
      await openHub(page);
      await page.goto(`/#${panel}`);
      await waitForPanel(page, panel as Panel);

      expect(await overflowsX(page)).toBe(false);
      // Nothing inside the column may be wider than the column. This is the
      // relationship the contact rows broke: a 138px mono label column plus a
      // 27px unbreakable URL, in 335px of space.
      expect(await overflowingChildren(page, `[data-panel="${panel}"] .col *`)).toEqual([]);
    });
  }

  test('an open project detail fits the viewport', async ({ page }) => {
    await openHub(page);
    await page.goto('/#projects/p1');
    await waitForPanel(page, 'projects');
    await expect(page.locator('[id="projects/p1"]')).toHaveClass(/is-open/);

    expect(await overflowsX(page)).toBe(false);
    // Deliberately not `overflowingChildren('… .col *')`, which the closed case
    // above uses: an open dialog is `position: fixed` and is legitimately wider
    // than the `.col` it is nested in. The viewport is the box that matters.
    const dialog = await page.locator('[id="projects/p1"] .project__dialog').boundingBox();
    expect(dialog).not.toBeNull();
    expect(dialog!.x).toBeGreaterThanOrEqual(-SLOP_PX);
    expect(dialog!.x + dialog!.width).toBeLessThanOrEqual(PORTRAIT.width + SLOP_PX);
  });

  test('the sticky bar wraps rather than overflowing', async ({ page }) => {
    await openHub(page);
    await page.goto('/#backend');
    await waitForPanel(page, 'backend');

    // Back link, Esc hint and section label want ~520px between them against
    // 339px. Without `flex-wrap` the line shrank each past its content and the
    // bar ran off the right-hand edge.
    const bar = await page.locator('[data-panel="backend"] [data-panel-top]').boundingBox();
    expect(bar).not.toBeNull();
    expect(bar!.x).toBeGreaterThanOrEqual(-SLOP_PX);
    expect(bar!.x + bar!.width).toBeLessThanOrEqual(PORTRAIT.width + SLOP_PX);
  });

  test('the contact rows keep their links inside the column', async ({ page }) => {
    await openHub(page);
    await page.goto('/#about');
    await waitForPanel(page, 'about');

    const rows = page.locator('[data-panel="about"] .contact__row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    const col = await page.locator('[data-panel="about"] .col').boundingBox();
    for (let i = 0; i < count; i += 1) {
      const box = await rows.nth(i).boundingBox();
      // A row scrolled out of view has no box; only the visible ones can be
      // measured, and they are the ones that were clipping.
      if (box === null) continue;
      expect(box.x + box.width).toBeLessThanOrEqual(col!.x + col!.width + SLOP_PX);
    }
  });
});

test.describe('the panels on a landscape phone', () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true, isMobile: true });

  test('the hero leaves room for the panel to start', async ({ page }) => {
    await openHub(page);
    await page.goto('/#xr');
    await waitForPanel(page, 'xr');

    // `min-height: 220px` on a 375px-tall viewport is 59 % of the screen spent
    // on a transparent slab. The floor is now `min(220px, 38dvh)`, and the
    // landscape query takes it off altogether below 500px of height.
    const hero = await page.locator('[data-panel="xr"] [data-hero]').boundingBox();
    expect(hero).not.toBeNull();
    expect(hero!.height).toBeLessThanOrEqual(LANDSCAPE.height * 0.5);
  });

  test('does not scroll sideways', async ({ page }) => {
    await openHub(page);
    await page.goto('/#projects');
    await waitForPanel(page, 'projects');
    expect(await overflowsX(page)).toBe(false);
  });
});

test.describe('the hub on a phone', () => {
  test.use({ viewport: PORTRAIT, hasTouch: true, isMobile: true });

  test('the four planet labels do not overlap each other', async ({ page }) => {
    await openHub(page);

    // Each label was a ~30px display name over a tracked mono sub-line, about
    // 280px across at the desktop type scale — four of those on a 375px canvas.
    // The sub-line is dropped here and the name shrinks, which is what makes
    // four separately tappable targets possible at all.
    const boxes = await page.locator('.label').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
      })),
    );
    expect(boxes).toHaveLength(4);

    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlaps =
          a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlaps, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  /**
   * Two of the four sit off the edges at rest on a 375px screen.
   *
   * That is the composition, not a bug in this breakpoint: the planets are laid
   * out on an arc in world space that is wider than a phone's horizontal field,
   * and no font-size can change where the engine projects them. Fitting all four
   * at rest needs the camera pulled back or the arc narrowed on small viewports
   * — a change to the hub's composition, and to the parked-planet solve tuned
   * against it.
   *
   * So what is asserted is what the design does promise: they are *reachable*.
   * Dragging is the hub's primary interaction, the drag hint fires on first load
   * to say so, and every destination is additionally a real anchor in the
   * keyboard order and in the text edition.
   */
  test('every destination can be brought fully into view', async ({ page }) => {
    await openHub(page);

    // Swept rather than dragged, so this is a statement about the *scene* and
    // not about how far one gesture happens to travel. At rest, `backend` sits
    // entirely off the left edge and `about` off the right; each comes fully
    // into frame at its own azimuth, and every one of those azimuths has to be
    // inside the limit the hub will actually pan to — which is why that limit is
    // widened on a narrow viewport (`NARROW_AZ_LIMIT` in `hub.ts`).
    const reachable = await page.evaluate(async () => {
      const hub = window.__dgHub;
      if (hub == null) return null;
      const ids = ['backend', 'projects', 'xr', 'about'] as const;
      const found: Record<string, boolean> = {};
      const settled = (): Promise<void> =>
        new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      for (let a = -1; a <= 1.001; a += 0.05) {
        // Clamped by `setAzimuth` to the hub's own limit, so the sweep can never
        // claim a position the visitor could not actually reach.
        hub.setAzimuth(a, true);
        await settled();
        for (const id of ids) {
          const r = document.querySelector(`.label[data-planet="${id}"]`)?.getBoundingClientRect();
          if (r !== undefined && r.left >= 0 && r.right <= window.innerWidth) found[id] = true;
        }
      }
      return ids.map((id) => [id, found[id] === true] as const);
    });

    expect(reachable).not.toBeNull();
    for (const [id, ok] of reachable!) {
      expect(ok, `${id} should be reachable on a 375px screen`).toBe(true);
    }
  });

  test('a drag pans the hub rather than scrolling the page', async ({ page }) => {
    await openHub(page);

    const before = await page.evaluate(() => window.__dgHub?.azimuth ?? 0);
    const midY = PORTRAIT.height / 2;
    await page.mouse.move(60, midY);
    await page.mouse.down();
    for (let x = 60; x <= 320; x += 26) await page.mouse.move(x, midY);
    await page.mouse.up();

    await expect
      .poll(async () => Math.abs((await page.evaluate(() => window.__dgHub?.azimuth ?? 0)) - before), {
        timeout: 5_000,
      })
      .toBeGreaterThan(0.1);
    // And the document itself never moved: the hub is fixed, and `touch-action`
    // plus the router's guard keep the browser's own gestures out of it.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('no label is clipped by being wider than the screen', async ({ page }) => {
    await openHub(page);

    // Position is the composition's business; *width* is this breakpoint's. A
    // label wider than the viewport could never be fully read at any azimuth,
    // which is what four ~280px labels on a 375px canvas amounted to.
    const widths = await page
      .locator('.label')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(widths).toHaveLength(4);
    for (const w of widths) expect(w).toBeLessThan(PORTRAIT.width * 0.5);
  });

  test('the scene owns its own gestures', async ({ page }) => {
    await openHub(page);

    // `touch-action: none`, so a drag pans the hub instead of the browser
    // deciding halfway through that it was a scroll or a pull-to-refresh. The
    // router's `touchmove` guard says the same thing, and the two have to agree:
    // `preventDefault` can arrive after the browser has already committed.
    await expect(page.locator('#scene')).toHaveCSS('touch-action', 'none');
  });

  test('a tap on a planet launches it', async ({ page }) => {
    await openHub(page);

    // The regression this is really for is `DRAG_SLOP_PX`. Both nav paths bail
    // above it, and at the mouse-tuned 6px a finger tap — which routinely
    // travels 8-12px before it lifts — silently did nothing at all.
    const target = await page.locator('.label[data-planet="xr"]').boundingBox();
    expect(target).not.toBeNull();
    await page.touchscreen.tap(target!.x + target!.width / 2, target!.y + target!.height / 2);

    await waitForPanel(page, 'xr');
    expect(page.url()).toContain('#xr');
  });

  test('the hero can be dragged to scroll an open panel', async ({ page }) => {
    await openHub(page);
    await page.goto('/#about');
    await waitForPanel(page, 'about');

    // The hero is `pointer-events: none` so a mouse can hover the live planet
    // through it. On touch there is no hover to preserve, and the pass-through
    // sent the swipe to a canvas under orders not to scroll — stranding the
    // reader on the top 44 % of the panel.
    await expect(page.locator('[data-panel="about"] [data-hero]')).toHaveCSS(
      'pointer-events',
      'auto',
    );
  });
});
