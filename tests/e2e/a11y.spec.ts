/**
 * ACCEPTANCE E — axe clean on the hub, all four panels and the text edition.
 *
 * CLAUDE.md treats accessibility as a functional requirement rather than
 * polish, so nothing here is disabled to make the suite pass. In particular
 * `color-contrast` stays on: the chrome is specified at ≥ 4.5:1 on `--void`
 * with `#8a8ca3` as the dimmest permitted text, which is a claim worth a
 * machine check rather than a promise in a document.
 *
 * Six documents, because the site presents six. The text edition is not a
 * degraded copy of the panels — it is the default state, complete with JS
 * disabled — so it is scanned the same way and held to the same bar.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { PANELS, blockWebGL, openHub } from './helpers';

/**
 * WCAG 2.0 and 2.1, A and AA. Not `best-practice`: that tag carries axe's
 * house opinions (every node inside a landmark, one `main` per document) which
 * are not the standard ACCEPTANCE names, and mixing them in would make a
 * failure here ambiguous about whether the site broke a rule or a preference.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A 1×1 transparent PNG, so a stubbed thumbnail decodes rather than erroring. */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Scan, and fail with something worth reading.
 *
 * axe's own object dump is unusable in a terminal, and a bare count tells you
 * a rule broke without saying where. This prints the rule, its impact, and the
 * selector and failure summary of each offending node — enough to fix from the
 * test output alone.
 */
async function scan(page: Page, what: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  const report = violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `      ${n.target.join(' ')}\n        ${n.failureSummary?.split('\n').join('\n        ')}`)
        .join('\n');
      return `  [${v.impact ?? 'unknown'}] ${v.id} — ${v.help}\n    ${v.helpUrl}\n${nodes}`;
    })
    .join('\n\n');

  expect(violations.map((v) => v.id), `axe violations on ${what}:\n\n${report}\n`).toEqual([]);
}

/**
 * The hub, once the WebGL probe has torn the text edition down.
 *
 * `#fallback` is removed in two steps — opacity and pointer-events, then
 * `display: none` on a timer — and until that timer fires the document holds
 * two copies of every heading and link. Scanning inside that window measures a
 * state no user is ever in, and would report duplicated landmarks that are an
 * artefact of the teardown. Waiting for it is the honest read.
 */
test('the hub is axe clean', async ({ page }) => {
  await openHub(page);
  await expect(page.locator('#fallback')).toBeHidden();
  await scan(page, 'the hub');
});

for (const id of PANELS) {
  test(`the ${id} panel is axe clean`, async ({ page }) => {
    // Deep link: the panel is composed and the camera parked on arrival, with
    // no warp to wait out. The other three panels stay in the DOM behind
    // inline `visibility`, which is exactly how a real visitor's document is
    // shaped — so they are in scope here on purpose.
    await openHub(page, `/#${id}`);
    await expect(page.locator('#fallback')).toBeHidden();
    await expect(page.locator(`[data-panel="${id}"]`)).toBeVisible();
    await scan(page, `the ${id} panel`);
  });
}

/**
 * The Projects panel again, with a project detail open over it.
 *
 * A separate scan because it is a materially different document: a
 * `role="dialog" aria-modal="true"` element with a hand-rolled focus trap, over
 * a card grid that is still in the accessibility tree. There is no `inert` to
 * take that grid out of it — every element that could carry `inert` is an
 * ancestor of the dialog — so `aria-modal` is doing that work alone, and this is
 * what checks the declaration is well-formed.
 */
test('a project detail is axe clean with the dialog open', async ({ page }) => {
  await openHub(page, '/#projects/p1');
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(page.locator('[id="projects/p1"]')).toHaveClass(/is-open/);
  await scan(page, 'the projects panel with a detail open');
});

/**
 * The Projects panel a third time, with the card players upgraded.
 *
 * The facade turns a plain link into an image with a badge over it, and it sits
 * *outside* the card's anchor — because an interactive element inside an `<a>`
 * is invalid HTML and an axe `nested-interactive` failure under wcag2a. That
 * rule is the whole reason the card stopped being an anchor, so it is worth a
 * scan of the upgraded state rather than only of the shipped one.
 *
 * The still is stubbed: a real `i.ytimg.com` fetch would fail offline, the error
 * handler would unwind the facade, and this would quietly scan the plain link.
 */
test('the projects panel is axe clean with the card players upgraded', async ({ page }) => {
  await page.route('**://i.ytimg.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
  );
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      for (const cover of document.querySelectorAll<HTMLAnchorElement>('.project__video-cover')) {
        cover.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      }
    });
  });

  await openHub(page, '/#projects');
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(page.locator('.card--project .project__video-thumb').first()).toBeVisible();
  await scan(page, 'the projects panel with card players');
});

/**
 * The text edition, reached by denying WebGL rather than by disabling JS.
 *
 * `javaScriptEnabled: false` is the more faithful route to this document and it
 * is the one `fallback.spec.ts` and `loading.spec.ts` take — but axe-core runs
 * *inside* the page, so with JS off there is nothing to run it. The choice is
 * between scanning this document with JS on and not scanning it at all.
 *
 * Denying WebGL lands on the same `html[data-dg-flat]` document: same served
 * markup, same copy (substitution is build-time), same stylesheet, same links.
 * What differs is only that the router is alive behind it. The no-JS document's
 * structure is covered separately and without axe by `fallback.spec.ts`.
 */
test.describe('the text edition', () => {
  test('is axe clean', async ({ page }) => {
    await blockWebGL(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1');
    await expect(page.locator('#fallback')).toBeVisible();
    await scan(page, 'the text edition');
  });
});
