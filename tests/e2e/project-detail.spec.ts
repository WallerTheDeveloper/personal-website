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

  test('a click anywhere in the card body opens it', async ({ page }) => {
    // The card is a container with an anchor in it now, not an anchor itself —
    // the player could not otherwise live in the card at all. `handleClick`
    // routes on `target.closest('a')`, so everything the anchor wraps still
    // opens the detail; this is what would catch the title falling outside it.
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');

    await page.locator('.card__link[href="#projects/p3"] .project__title').click();

    expect(await openedDetail(page)).toBe('p3');
    expect(await hash(page)).toBe('projects/p3');
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

  test('a click on the scrim dismisses', async ({ page }) => {
    // Expected of a modal, and it is also what stops the panel's own chrome
    // reading as broken: the sticky bar shows through the scrim and stays
    // legible, so "← Back to system" looks clickable while the scrim is
    // swallowing the click. Now that click does something.
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');

    await page.locator(detail('p1')).click({ position: { x: 20, y: 20 } });
    expect(await openedDetail(page)).toBeNull();
    expect(await hash(page)).toBe('projects');
    expect(await openPanel(page)).toBe('projects');
  });

  test('a click inside the dialog does not dismiss', async ({ page }) => {
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');
    await page.locator(`${detail('p1')} .project__detail-title`).click();
    expect(await openedDetail(page)).toBe('p1');
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

test.describe('the video facade', () => {
  /** Every request that left for a Google host, in order. */
  function watchThirdParty(page: Page): string[] {
    const seen: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (/ytimg\.com|youtube(-nocookie)?\.com/.test(url)) seen.push(url);
    });
    return seen;
  }

  /**
   * Put every video cover back to the unfilled state, before anything reads one.
   *
   * These tests count requests to Google hosts, so they have to know exactly how
   * many facades exist. That used to be free: every `PROJECT_n_VIDEO_ID` shipped
   * as an unfilled token, so the only facade in the document was the one the
   * test had just built. It stopped being free the moment the owner filled some
   * of the tokens — which is the entire point of the tokens, and must therefore
   * never be a test failure.
   *
   * So the fixture owns the state now. Blank all four here, fill the one under
   * test with `giveVideo`/`giveCardVideo`, and the counts below hold whatever
   * `src/content.ts` happens to contain.
   *
   * An empty `v` is unfilled as far as `videoIdFrom()` is concerned — it fails
   * the `[\w-]{6,20}` test the same way `{{PROJECT_1_VIDEO_ID}}` does, and
   * without depending on how a browser encodes braces in an href.
   */
  async function clearVideos(page: Page): Promise<void> {
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        for (const cover of document.querySelectorAll<HTMLAnchorElement>('.project__video-cover')) {
          cover.href = 'https://www.youtube.com/watch?v=';
        }
      });
    });
  }

  // Registered before anything in a test body, and before `giveCardVideo`'s own
  // init script — both listen for DOMContentLoaded, and listeners run in the
  // order they were added, so the blanking always lands first.
  test.beforeEach(async ({ page }) => {
    await clearVideos(page);
  });

  /**
   * Fill one project's video id in the DOM, the way the build would.
   *
   * `clearVideos` has just blanked all four, so without this there is no video
   * to build a facade for and the tests below would assert the empty case twice.
   * Set before the detail opens, because the facade is built by `show()`.
   */
  async function giveVideo(page: Page, project: string, id: string): Promise<void> {
    await page.evaluate(
      ([p, v]) => {
        const cover = document
          .querySelector(`[id="projects/${p}"]`)
          ?.querySelector<HTMLAnchorElement>('.project__video-cover');
        if (cover !== null && cover !== undefined) {
          cover.href = `https://www.youtube.com/watch?v=${v}`;
        }
      },
      [project, id],
    );
  }

  /**
   * The same, for one project's **card** — and it has to be an init script.
   *
   * Card facades are upgraded by the router's `commit()`, the first time the
   * Projects panel is committed to, which is well before a `page.evaluate()`
   * could run. Only the named project is filled — `clearVideos` blanked the
   * other three — so the request counts below stay readable.
   */
  async function giveCardVideo(page: Page, project: string, id: string): Promise<void> {
    await page.addInitScript(
      ([p, v]) => {
        document.addEventListener('DOMContentLoaded', () => {
          const cover = document
            .querySelector(`a[href="#projects/${p}"]`)
            ?.closest('.card')
            ?.querySelector<HTMLAnchorElement>('.project__video-cover');
          if (cover !== null && cover !== undefined) {
            cover.href = `https://www.youtube.com/watch?v=${v}`;
          }
        });
      },
      [project, id],
    );
  }

  /** One project's card, reached through the link that identifies it. */
  const card = (page: Page, project: string) =>
    page.locator('.card--project', { has: page.locator(`a[href="#projects/${project}"]`) });

  test('asks Google for nothing while no video is filled in', async ({ page }) => {
    // The unfilled state, which `clearVideos` pins rather than borrowing it from
    // whatever `src/content.ts` currently holds. An unfilled
    // `{{PROJECT_n_VIDEO_ID}}` is not a usable id, so no facade is built and the
    // plain link is what is left — still a working link once the owner fills it.
    const seen = watchThirdParty(page);
    await openHub(page, '/#projects/p1');
    await waitForPanel(page, 'projects');

    expect(seen).toEqual([]);
    const cover = page.locator(`${detail('p1')} .project__video-cover`);
    await expect(cover).toBeVisible();
    await expect(cover).not.toHaveClass(/is-facade/);
    await expect(cover).toHaveAttribute('href', /^https:\/\/www\.youtube\.com\/watch\?v=/);
  });

  test('fetches the still only once a detail opens, and the player only on play', async ({ page }) => {
    const seen = watchThirdParty(page);
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    await giveVideo(page, 'p1', 'dQw4w9WgXcQ');

    // Sitting on the panel with the grid in view costs nothing.
    expect(seen).toEqual([]);

    await page.locator('a[href="#projects/p1"]').click();
    await expect(page.locator(`${detail('p1')} .project__video-thumb`)).toBeVisible();
    expect(seen).toEqual(['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg']);
    // Nothing from the player yet: opening a detail is not consent to load it.
    expect(await page.locator('iframe').count()).toBe(0);

    await page.locator(`${detail('p1')} .project__video-cover`).click();
    const frame = page.locator(`${detail('p1')} .project__video-frame`);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute(
      'src',
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/,
    );
    // The still is gone rather than stacked behind the player.
    await expect(page.locator(`${detail('p1')} .project__video-cover`)).toBeHidden();
  });

  test('takes the embed down on every way out of the dialog', async ({ page }) => {
    // Removing the node is the only thing that stops the audio: `pause()` needs
    // the player API, and an iframe hidden with `display: none` keeps playing.
    for (const leave of ['escape', 'close', 'panel'] as const) {
      await openHub(page, '/#projects');
      await waitForPanel(page, 'projects');
      await giveVideo(page, 'p1', 'dQw4w9WgXcQ');
      await page.locator('a[href="#projects/p1"]').click();
      await page.locator(`${detail('p1')} .project__video-cover`).click();
      expect(await page.locator('iframe').count(), `before ${leave}`).toBe(1);

      if (leave === 'escape') await page.keyboard.press('Escape');
      else if (leave === 'close') await page.locator(`${detail('p1')} [data-detail-close]`).click();
      else {
        await page.evaluate(() => {
          window.location.hash = '#xr';
        });
        await waitForPanel(page, 'xr');
      }

      expect(await page.locator('iframe').count(), `after ${leave}`).toBe(0);
    }
  });

  test('plays on the card without opening the detail', async ({ page }) => {
    // The card player is the point of the second facade: a visitor should be
    // able to watch without committing to the detail. The player therefore sits
    // *outside* the card's anchor, and this is what proves the click does not
    // fall through to it.
    const seen = watchThirdParty(page);
    await giveCardVideo(page, 'p1', 'dQw4w9WgXcQ');
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');

    const grid = card(page, 'p1');
    await expect(grid.locator('.project__video-thumb')).toBeVisible();
    // Only the one card was filled in, so only the one still was fetched — the
    // other three are still on unfilled tokens.
    expect(seen).toEqual(['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg']);

    await grid.locator('.project__video-cover').click();
    await expect(grid.locator('.project__video-frame')).toHaveCount(1);
    // And the card did not navigate: no detail, and the hash is still the panel.
    expect(await openedDetail(page)).toBeNull();
    expect(await hash(page)).toBe('projects');
    expect(await openPanel(page)).toBe('projects');
  });

  test('costs nothing until the panel is reached', async ({ page }) => {
    // Built in `commit()` rather than on mount. A visitor who stays on the hub
    // must not pay four `i.ytimg.com` requests for a grid they have not seen.
    const seen = watchThirdParty(page);
    await giveCardVideo(page, 'p1', 'dQw4w9WgXcQ');
    await openHub(page);
    expect(seen).toEqual([]);

    await page.locator('#labels a[href="#projects"]').click({ force: true });
    await waitForPanel(page, 'projects');
    expect(seen).toEqual(['https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg']);
  });

  test('stops a card player when the detail opens, and when the panel is left', async ({ page }) => {
    // Same audio bug, one level out: a card player behind the scrim — or behind
    // another panel entirely — is one the visitor cannot see and cannot stop.
    for (const leave of ['detail', 'panel'] as const) {
      await giveCardVideo(page, 'p1', 'dQw4w9WgXcQ');
      await openHub(page, '/#projects');
      await waitForPanel(page, 'projects');

      await card(page, 'p1').locator('.project__video-cover').click();
      expect(await page.locator('iframe').count(), `before ${leave}`).toBe(1);

      if (leave === 'detail') {
        await page.locator('a[href="#projects/p1"]').click();
        await expect(page.locator(detail('p1'))).toHaveClass(/is-open/);
      } else {
        await page.evaluate(() => {
          window.location.hash = '#xr';
        });
        await waitForPanel(page, 'xr');
      }

      expect(await page.locator('iframe').count(), `after ${leave}`).toBe(0);
    }
  });

  test('falls back to a plain link when the still will not load', async ({ page }) => {
    await page.route('**://i.ytimg.com/**', (route) => route.abort());
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    await giveVideo(page, 'p1', 'dQw4w9WgXcQ');
    await page.locator('a[href="#projects/p1"]').click();

    const cover = page.locator(`${detail('p1')} .project__video-cover`);
    // A still that will not load usually means Google is unreachable, so the
    // whole upgrade unwinds rather than leaving a click that builds a player
    // which would fail the same way.
    await expect(cover).not.toHaveClass(/is-facade/);
    await expect(page.locator(`${detail('p1')} .project__video-thumb`)).toHaveCount(0);
    await expect(cover).toBeVisible();
  });
});

test.describe('the tech tags', () => {
  /** One project's tag row. It is on the card, and it is there from the build. */
  const tech = (page: Page, project: string) =>
    page
      .locator('.card--project', { has: page.locator(`a[href="#projects/${project}"]`) })
      .locator('.project__tech');

  test('are on the card, and in the document before anything opens', async ({ page }) => {
    // Rendered into the served HTML by `build/project-tags.ts`, not built when a
    // detail opens — which is what puts them in the text edition and the printed
    // CV. So "already there, on the card" is the assertion, and no detail is
    // opened to reach it.
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');

    const list = tech(page, 'p1');
    const tags = list.locator('li');
    await expect(tags).toHaveCount(6);
    await expect(tags.first()).toHaveText('Python');
    // One glyph per tag, hidden from assistive tech — the label already says it.
    await expect(list.locator('svg')).toHaveCount(6);
    await expect(list.locator('svg').first()).toHaveAttribute('aria-hidden', 'true');
    // And the detail no longer carries a second copy of the row.
    await expect(page.locator(`${detail('p1')} .project__tech`)).toHaveCount(0);
  });

  test('render a brand with no mark as a text-only chip', async ({ page }) => {
    // C# has no logo in simple-icons. Text only is the designed answer — the
    // hand-drawn stand-ins are exactly what this replaced — so the chip must
    // still be there, and still be a chip.
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');

    const list = tech(page, 'p2');
    await expect(list.locator('li')).toHaveCount(4);
    // Unity and Rust are marked; C# and Protocol Buffers are not.
    await expect(list.locator('svg')).toHaveCount(2);

    const bare = list.locator('li', { hasText: 'C#' });
    await expect(bare).toHaveCount(1);
    await expect(bare.locator('svg')).toHaveCount(0);
  });

  test('draw a real glyph, tinted with the panel accent', async ({ page }) => {
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');

    const tag = tech(page, 'p1').locator('.project__tag').first();
    // `currentColor` on the path, `--accent` on the chip: the glyph takes the
    // destination's colour without naming it.
    await expect(tag).toHaveCSS('color', 'rgb(56, 255, 176)');
    await expect(tag.locator('path')).toHaveAttribute('fill', 'currentColor');

    // And it is actually on screen with area, rather than an empty <svg> — a
    // malformed `d` renders as nothing at all and would pass every check above.
    const box = await tag.locator('svg').boundingBox();
    expect(box?.width).toBeGreaterThan(8);
    expect(box?.height).toBeGreaterThan(8);
    const painted = await tag.locator('path').evaluate((el) => {
      const r = (el as SVGGeometryElement).getBBox();
      return { w: r.width, h: r.height };
    });
    expect(painted.w).toBeGreaterThan(4);
    expect(painted.h).toBeGreaterThan(4);
  });

  test('every glyph in the table draws something', async ({ page }) => {
    // One malformed path would render as an empty box, and only on the one
    // project that uses it. All four rows are on screen together now, so the
    // whole set is covered without opening anything — but the count is asserted
    // first, because `evaluateAll` over an empty list passes vacuously and that
    // is exactly how this test would rot.
    await openHub(page, '/#projects');
    await waitForPanel(page, 'projects');
    for (const project of ['p1', 'p2', 'p3', 'p4']) {
      const paths = tech(page, project).locator('.project__tag path');
      expect(await paths.count(), `${project} has no glyphs at all`).toBeGreaterThan(0);
      const empty = await paths.evaluateAll((els) =>
        els
          .map((el, i) => {
            const r = (el as SVGGeometryElement).getBBox();
            return r.width < 4 || r.height < 4 ? i : -1;
          })
          .filter((i) => i >= 0),
      );
      expect(empty, `${project} has glyphs that draw nothing`).toEqual([]);
    }
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
