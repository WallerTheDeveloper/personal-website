/**
 * Phase 9 — the files served out of `public/`.
 *
 * `tests/unit/site-files.test.ts` pins their *contents*; these pin that they are
 * actually reachable over HTTP at the paths the document asks for. The two halves
 * catch different failures: a `publicDir` that stops being copied, or a link
 * whose relative path stops resolving, both leave the files perfect on disk.
 *
 * The CV matters most. Every panel footer, the contact card and the text edition
 * link it, and the text edition is the no-JS state — a 404 there breaks the one
 * edition that has to work with nothing running.
 *
 * Nothing here boots the hub, deliberately. Every claim in this file is about
 * served bytes or URL resolution, neither of which involves the engine, and
 * `openHub()` costs a whole WebGL scene on a software rasteriser. The two
 * slowest specs in the suite run within seconds of the 60 s timeout even when
 * they have the machine to themselves, so a spec that waits on the GPU for no
 * reason is enough to starve them under parallel workers — which it did.
 */

import { expect, test } from '@playwright/test';

test('serves the CV as a real PDF', async ({ request }) => {
  const res = await request.get('/cv.pdf');
  expect(res.status()).toBe(200);
  // The magic bytes rather than the content-type header: the header is the dev
  // server's guess and the host's to set, the payload is the actual contract.
  expect((await res.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');
});

test('serves the OG image as a real PNG', async ({ request }) => {
  const res = await request.get('/og.png');
  expect(res.status()).toBe(200);
  expect([...(await res.body()).subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('serves robots.txt and sitemap.xml on the real domain', async ({ request }) => {
  // The published origin is the GitHub Pages project URL, path segment included.
  // Served here from the dev server's root — `base` is build-only (vite.config.ts)
  // — so these paths are the dev paths and the *contents* are the live claim.
  const ORIGIN = 'https://wallerthedeveloper.github.io/personal-website';

  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  const robotsText = await robots.text();
  expect(robotsText).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  expect(robotsText).not.toContain('example.com');

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain(`<loc>${ORIGIN}/</loc>`);
  expect(sitemapText).not.toContain('example.com');
});

test('every CV link resolves, with and without a hash on the URL', async ({ page, request }) => {
  // Read the hrefs the browser actually resolved, not the literal attribute.
  // `cv.pdf` is relative, so this is what proves it still lands on /cv.pdf once
  // a hash is on the URL — the state the site spends most of its life in. The
  // anchors are static markup, so this holds whether or not a panel is open and
  // whether or not the scene ever came up.
  const resolved = async (path: string): Promise<readonly string[]> => {
    // `domcontentloaded`, not the default `load`: the anchors are parsed with
    // the document, while `load` additionally waits on the Google Fonts CDN and
    // the 506 kB hub chunk. Neither can change how a relative href resolves.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const hrefs = await page
      .locator('a[href="cv.pdf"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).href));
    expect(hrefs.length, `${path} has no CV links`).toBeGreaterThan(0);
    return hrefs;
  };

  const all = new Set([...(await resolved('/')), ...(await resolved('/#about'))]);
  for (const href of all) {
    expect(new URL(href).pathname).toBe('/cv.pdf');
    expect((await request.get(href)).status(), href).toBe(200);
  }
});

test('declares a favicon, so no load spends a request on a 404', async ({ page }) => {
  // The icon is in <head>, so it is parsed long before `load` — and the point
  // of an inline data URI is that there is no request to wait for.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveCount(1);

  // Resolved through the DOM: this is the value the browser parsed, so an
  // unencoded `#` — which would truncate the URI at the fragment and silently
  // leave the tab blank — cannot pass here.
  const href = await icon.evaluate((el) => (el as HTMLLinkElement).href);
  expect(href.startsWith('data:image/svg+xml,')).toBe(true);
  const svg = decodeURIComponent(href.slice('data:image/svg+xml,'.length));
  expect(svg).toMatch(/^<svg[\s\S]*<\/svg>$/);
});
