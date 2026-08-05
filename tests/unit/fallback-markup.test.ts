/**
 * The no-JS contract, asserted against the source markup and the stylesheet.
 *
 * With scripting disabled nothing in `src/` ever runs, so every guarantee the
 * text edition makes has to be in the served bytes. These are the four pieces
 * of that: the document ships flat, the probe is the only thing that takes it
 * out of flat, every in-page link has a target that exists without JS, and the
 * flat rules cover what `flatten()` used to write inline.
 *
 * A Playwright run proves the same thing end to end (`tests/e2e/fallback.spec.ts`
 * with `javaScriptEnabled: false`); these fail faster and say which piece broke.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PANEL_IDS, PROJECT_DETAIL_IDS } from '../../src/content';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');

describe('the document ships flat', () => {
  it('carries data-dg-flat on <html>', () => {
    expect(html).toMatch(/<html[^>]*\sdata-dg-flat="1"/);
  });

  it('has the head probe remove it, and only on the WebGL success path', () => {
    const probe = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(probe).toContain("removeAttribute('data-dg-flat')");
    expect(probe).toContain("setAttribute('data-dg-3d', '1')");
    // The early return has to come first, or a device with no WebGL would be
    // unflattened by the probe and left waiting for the module to flatten again.
    expect(probe.indexOf('if (!ok) return;')).toBeLessThan(probe.indexOf('removeAttribute'));
  });

  it('puts the attribute on <html> and nowhere else', () => {
    // The flat rules are all `html[data-dg-flat] …`; the attribute anywhere
    // else would be inert and would read as if it did something.
    expect(html.match(/data-dg-flat="/g)?.length).toBe(1);
  });
});

describe('in-page anchors', () => {
  it('gives every destination a target that resolves with no JS', () => {
    for (const id of PANEL_IDS) {
      expect(html).toContain(`<span id="${id}" class="panel__anchor">`);
    }
  });

  it('keeps the panels on their `panel-` ids, so the two never collide', () => {
    for (const id of PANEL_IDS) {
      expect(html).toContain(`id="panel-${id}" data-panel="${id}"`);
    }
  });

  it('gives every project detail the id its sub-route points at', () => {
    // `#projects/pN` is only a working no-JS destination because the detail
    // carries that exact id — and the dangling-href sweep below is what makes
    // the pair load-bearing rather than decorative. Changing the separator
    // breaks both at once, which is the point of asserting the literal here.
    for (const project of PROJECT_DETAIL_IDS) {
      expect(html).toContain(`id="projects/${project}" class="project__detail"`);
    }
  });

  it('keeps each project detail on exactly one repo/demo pair', () => {
    // The links moved out of the card and into the detail. They are still one
    // per project, so `PROJECT_LINKS` and `applyLinks()` are unchanged — this
    // catches a copy-paste that left two details sharing a slot number, which
    // `content.test.ts` cannot see because it only counts the slots site-wide.
    const starts = PROJECT_DETAIL_IDS.map((p) => html.indexOf(`id="projects/${p}"`));
    for (const [i, from] of starts.entries()) {
      expect(from).toBeGreaterThan(-1);
      const detail = html.slice(from, starts[i + 1] ?? html.indexOf('</section>', from));
      expect(detail.match(/data-repo="\d+"/g)).toEqual([`data-repo="${i + 1}"`]);
      expect(detail.match(/data-demo="\d+"/g)).toEqual([`data-demo="${i + 1}"`]);
    }
  });

  it('sends the video link to YouTube itself, never to a fragment', () => {
    // `href="#"` is what `handleClick` reads as "exit to the hub", so a video
    // link built that way would warp the visitor out of the panel. It has to be
    // an absolute URL in the served bytes, which is why the id is substituted at
    // build time rather than applied on mount like the repo/demo hrefs.
    const covers = Array.from(
      html.matchAll(/class="project__video-cover"\s+href="([^"]+)"/g),
      (m) => m[1] as string,
    );
    expect(covers).toHaveLength(PROJECT_DETAIL_IDS.length);
    for (const href of covers) {
      expect(href).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    }
  });

  it('names no third-party host in the served markup', () => {
    // The facade is built in JS when a detail opens, so a visitor who never
    // opens one — and every visitor of the text edition — asks Google for
    // nothing. Putting the thumbnail in the markup would quietly undo that.
    expect(html).not.toContain('i.ytimg.com');
    expect(html).not.toContain('youtube-nocookie');
  });

  it('leaves no href pointing at something the document does not contain', () => {
    const hrefs = Array.from(html.matchAll(/href="#([^"]*)"/g), (m) => m[1] as string);
    // `href="#"` is the [data-exit] links: intercepted when routing, top of the
    // document when flat. Both are correct destinations.
    const targets = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g), (m) => m[1] as string));
    const dangling = [...new Set(hrefs)].filter((id) => id !== '' && !targets.has(id)).sort();
    expect(dangling).toEqual([]);
  });
});

describe('flat rules', () => {
  it('hide the scene and unpin the text edition from CSS, not from JS', () => {
    expect(css).toMatch(/html\[data-dg-flat\] #stage[^{]*\{[^}]*display: none/);
    expect(css).toMatch(/html\[data-dg-flat\] #fallback\s*\{[^}]*position: static/);
  });

  it('cross-fade panels in 200 ms under reduced motion', () => {
    const block = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(block).toMatch(/\.panel\s*\{[^}]*transition: opacity 200ms ease, visibility 200ms ease/);
  });
});
