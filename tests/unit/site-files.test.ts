/**
 * The site files that are not code: `public/` and the head's link tags.
 *
 * ACCEPTANCE.md group G asks that `https://example.com` appear nowhere and that
 * the canonical, the OG image and the sitemap all agree on one origin. The
 * handoff bundle shipped both `assets/robots.txt` and `assets/sitemap.xml` with
 * the placeholder domain, so this is exactly the drift worth pinning: an origin
 * that is wrong in one file out of three is invisible until a crawler reads it.
 *
 * Also pins the favicon, because a data URI is easy to break silently — an
 * unencoded `#` truncates it as a fragment and the tab simply shows nothing.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://golosov-danylo.com';

const read = (path: string): string => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const readBytes = (path: string): Buffer => readFileSync(new URL(`../../${path}`, import.meta.url));

const html = read('index.html');
const css = read('src/styles.css');
const robots = read('public/robots.txt');
const sitemap = read('public/sitemap.xml');

/**
 * `index.html` with its comments removed.
 *
 * Use this for anything asserting the document *contains* a tag. The head is
 * heavily commented and one of those comments spells out the favicon's decoded
 * SVG, so a structural claim checked against the raw file can be satisfied by
 * prose — which is how a `rel="icon"` count of 1 first came back as 2.
 */
const markup = html.replace(/<!--[\s\S]*?-->/g, '');

describe('one origin, everywhere', () => {
  it('has retired the placeholder domain', () => {
    for (const [name, text] of [
      ['index.html', html],
      ['robots.txt', robots],
      ['sitemap.xml', sitemap],
    ] as const) {
      expect(text, name).not.toContain('example.com');
    }
  });

  it('points the canonical and the OG image at it', () => {
    expect(markup).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
    expect(markup).toContain(`content="${ORIGIN}/og.png"`);
  });

  it('points robots.txt at the sitemap', () => {
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it('lists exactly one URL, because routing is by hash', () => {
    // Owner decision (TASKS Phase 0): destinations are `/#xr`, not `/xr`. A
    // fragment is not a separate URL to a crawler, so per-destination entries
    // would be four claims about one page. Revisit only if that decision does.
    const locs = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (m) => m[1] as string);
    expect(locs).toEqual([`${ORIGIN}/`]);
  });

  it('keeps the sitemap URL identical to the canonical, trailing slash included', () => {
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(markup)?.[1];
    const loc = /<loc>([^<]+)<\/loc>/.exec(sitemap)?.[1];
    expect(loc).toBe(canonical);
  });
});

describe('public/ assets', () => {
  it('ships the CV as a real PDF', () => {
    // Every panel footer, the contact card and the text edition link `cv.pdf`,
    // and the text edition is the no-JS state — a missing file breaks the one
    // edition that has to work without scripting.
    expect(readBytes('public/cv.pdf').subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('links the CV relatively, so it resolves under any hash', () => {
    expect(markup).toContain('href="cv.pdf"');
    expect(markup).not.toContain('assets/cv.pdf');
  });

  it('ships the OG image as a real PNG', () => {
    const sig = readBytes('public/og.png').subarray(0, 8);
    expect([...sig]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('keeps the glTF contract, pointed at this port rather than the prototype', () => {
    const models = read('public/models/README.md');
    expect(models).toContain('src/engine/ship.ts');
    expect(models).toContain('public/models/ship.glb');
  });
});

describe('favicon', () => {
  const icon = /<link rel="icon" href="([^"]+)"/.exec(markup)?.[1] ?? '';

  it('is declared, so the browser stops asking for /favicon.ico', () => {
    expect(markup.match(/rel="icon"/g)?.length).toBe(1);
    expect(icon).toMatch(/^data:image\/svg\+xml,/);
  });

  it('is a strictly legal URL — no bare `#`, no raw space', () => {
    // An unencoded `#` ends the URI at the fragment and the icon silently
    // vanishes; this is the whole failure mode of hand-written data URIs.
    const payload = icon.slice('data:image/svg+xml,'.length);
    expect(payload).not.toMatch(/[#\s<>"]/);
    expect(() => new URL(icon)).not.toThrow();
  });

  it('decodes to well-formed SVG', () => {
    const svg = decodeURIComponent(icon.slice('data:image/svg+xml,'.length));
    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain("xmlns='http://www.w3.org/2000/svg'");
    expect(svg).toContain("viewBox='0 0 32 32'");
  });

  it('draws the ember disc on the void, in the palette the site actually uses', () => {
    const svg = decodeURIComponent(icon.slice('data:image/svg+xml,'.length));
    const token = (name: string): string =>
      new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(css)?.[1] ?? `--${name} missing`;
    // Read from styles.css rather than restated, so the mark cannot drift away
    // from the palette the way a hard-coded hex would.
    expect(svg).toContain(`fill='${token('void')}'`);
    expect(svg).toContain(`fill='${token('ember')}'`);
  });
});
