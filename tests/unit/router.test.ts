/**
 * `parseHash()` — the router's pure half (PORT_PLAN step 11, "`hashId()`
 * parsing").
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

import { PANEL_IDS } from '../../src/content';
import { parseHash } from '../../src/router';

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
