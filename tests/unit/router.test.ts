/**
 * `parseRoute()` / `parseHash()` — the router's pure half (PORT_PLAN step 11,
 * "`hashId()` parsing").
 *
 * This is the only place a URL becomes routing state, and it is reached from
 * four directions: the initial deep link in `boot()`, `hashchange`, `popstate`,
 * and every intercepted `href="#…"`. All four hand it whatever is in the
 * address bar, including things no link in this document produces — a hash left
 * by a stale bookmark, a `#/xr` from the abandoned path-routing idea, an id that
 * belongs to some other anchor on the page.
 *
 * Everything unrecognised has to resolve to the hub. There is no error route on
 * a single-document site, and a `null` here is what stops `route()` from trying
 * to open a panel that does not exist.
 *
 * `Router.hashId()` is this plus one more filter — the panel must actually be in
 * the document — which needs a DOM and is covered in `tests/e2e/routing.spec.ts`
 * ("an unknown hash falls back to the hub rather than a blank panel").
 */

import { describe, expect, it } from 'vitest';

import { PANEL_IDS, PROJECT_DETAIL_IDS } from '../../src/content';
import { parseHash, parseRoute } from '../../src/router';

describe('parseHash', () => {
  it('reads every destination', () => {
    for (const id of PANEL_IDS) {
      expect(parseHash(`#${id}`)).toBe(id);
    }
  });

  it('reads the hub as null', () => {
    // What `location.hash` is on a bare URL, and what `go(null)` leaves behind.
    expect(parseHash('')).toBeNull();
  });

  it('reads a bare # as the hub', () => {
    // `<a href="#">` is what all eight [data-exit] links carry.
    expect(parseHash('#')).toBeNull();
  });

  it('accepts the #/id form', () => {
    // Never produced by this document, but it is what the abandoned path-routing
    // idea would have left in old links, and it means the same destination.
    expect(parseHash('#/xr')).toBe('xr');
    expect(parseHash('#/')).toBeNull();
  });

  it('sends an unknown hash to the hub', () => {
    expect(parseHash('#not-a-destination')).toBeNull();
    expect(parseHash('#panel-xr')).toBeNull();
  });

  it('does not match a destination id case-insensitively', () => {
    // Fragments are case-sensitive, and `#XR` is not a link this site writes.
    expect(parseHash('#XR')).toBeNull();
  });

  it('does not match on a prefix or a suffix', () => {
    expect(parseHash('#xrq')).toBeNull();
    expect(parseHash('#about-me')).toBeNull();
    expect(parseHash('#the-about')).toBeNull();
  });

  it('strips only the first #/ pair', () => {
    expect(parseHash('#//xr')).toBeNull();
    expect(parseHash('##xr')).toBeNull();
  });

  it('ignores a query string riding on the fragment', () => {
    // A tracker's `#xr?utm_source=…` is not a destination this router knows;
    // the hub is the safe landing, not a half-matched panel.
    expect(parseHash('#xr?utm_source=x')).toBeNull();
  });
});

/**
 * The sub-route half. `parseHash` is this function's `.panel`, so the suite
 * above is what proves the split changed no destination; these cover the tail.
 */
describe('parseRoute', () => {
  it('reads every project detail off the Projects panel', () => {
    for (const project of PROJECT_DETAIL_IDS) {
      expect(parseRoute(`#projects/${project}`)).toEqual({ panel: 'projects', project });
    }
  });

  it('accepts the #/ form on a sub-route too', () => {
    expect(parseRoute('#/projects/p1')).toEqual({ panel: 'projects', project: 'p1' });
  });

  it('leaves project null on a destination that has no details', () => {
    for (const id of PANEL_IDS) {
      expect(parseRoute(`#${id}`)).toEqual({ panel: id, project: null });
    }
    expect(parseRoute('#xr/p1')).toEqual({ panel: 'xr', project: null });
    expect(parseRoute('#backend/p1')).toEqual({ panel: 'backend', project: null });
  });

  it('drops an unreadable tail to the panel rather than to the hub', () => {
    // The head still parsed: the visitor asked for Projects, and the panel is a
    // better answer than the hub. Only the head decides the destination.
    for (const hash of ['#projects/p9', '#projects/', '#projects/p1/extra', '#projects/P1']) {
      expect(parseRoute(hash)).toEqual({ panel: 'projects', project: null });
    }
  });

  it('sends an unreadable head to the hub, tail or no tail', () => {
    for (const hash of ['#nope/p1', '#//xr', '#', '', '#/']) {
      expect(parseRoute(hash)).toEqual({ panel: null, project: null });
    }
  });
});
