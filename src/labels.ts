/**
 * The hub's four navigation anchors: where they sit, how they light up, and
 * whether they are hit-testable.
 *
 * Split out of the router (`placeLabels` / `setHover` in the prototype) because
 * none of it is routing — it is presentation driven by two inputs, the engine's
 * per-frame projection and the currently hovered id. The router keeps ownership
 * of `hovered` itself, because the hub has to be told about it too, and one
 * owner for that value is the point.
 *
 * The anchors are the site's **only** exposed navigation: the canvases are
 * `aria-hidden`, so these real `<a href="#…">` elements are what a keyboard or
 * a screen reader gets (CLAUDE.md "Accessibility"). Nothing here may remove
 * them from the accessibility tree — visibility is opacity and
 * `pointer-events`, never `display` or `hidden`.
 */

import type { PanelId } from './content';
import type { LabelPlacement } from './hub';

/** Leader-line length, CSS px. It grows when its planet is hovered or focused. */
const LEADER_REST_PX = 26;
const LEADER_ACTIVE_PX = 40;

/** The label hangs this far below the projected planet edge, CSS px. */
const LABEL_GAP_PX = 10;

/** Reticle scale at rest, and while it is over something clickable. */
const RETICLE_REST = 'scale(0.6)';
const RETICLE_GROWN = 'scale(1)';

export class LabelLayer {
  private readonly nav: HTMLElement;
  private readonly anchors: readonly HTMLAnchorElement[];
  private readonly reticle: HTMLElement | null;

  /**
   * Everything the reticle reacts to. Three independent inputs — is the pointer
   * on the hub at all, is it over a planet, is it over a link — reaching one
   * writer, for the same reason the router keeps a single owner for `hovered`:
   * with each input writing `opacity`/`transform` for itself, whichever fired
   * last won and the reticle disagreed with what was under the pointer.
   *
   * `armed` starts false and only the first real pointer position sets it. The
   * reticle is `left: 0; top: 0` until something moves it, so showing it before
   * then puts a ring in the corner of the viewport — which is exactly what
   * tabbing to a label before touching the mouse used to do.
   */
  private readonly ret = { armed: false, planet: false, link: false };

  constructor(nav: HTMLElement, reticle: HTMLElement | null) {
    this.nav = nav;
    this.anchors = Array.from(nav.querySelectorAll('a'));
    this.reticle = reticle;
  }

  /** In DOM order, which is also `PLANETS` order — `place()` relies on it. */
  get items(): readonly HTMLAnchorElement[] {
    return this.anchors;
  }

  /**
   * Position the anchors under their planets. Called once per frame from the
   * engine with the array it reuses, so this must not copy it or keep an
   * element past the call.
   */
  place(out: readonly LabelPlacement[], hovered: PanelId | null): void {
    for (let i = 0; i < out.length; i++) {
      const o = out[i];
      const a = this.anchors[i];
      if (o === undefined || a === undefined) continue;
      if (!o.visible) {
        a.style.opacity = '0';
        a.style.pointerEvents = 'none';
        continue;
      }
      a.style.opacity = '1';
      a.style.pointerEvents = 'auto';
      a.style.left = `${o.x}px`;
      a.style.top = `${o.y + o.pr + LABEL_GAP_PX}px`;
      const leader = a.querySelector<HTMLElement>('[data-leader]');
      if (leader !== null) {
        leader.style.height = `${o.id === hovered ? LEADER_ACTIVE_PX : LEADER_REST_PX}px`;
      }
    }
  }

  /**
   * Warm the hovered label and show the reticle.
   *
   * The prototype carried a `HOVER_TINT` table of four hexes here; those are
   * exactly `--accent-hover`, which every anchor already resolves through its
   * own `data-planet` (styles.css "Per-destination accents"). Reading the
   * custom property instead of restating the hexes keeps the two from drifting
   * and honours CLAUDE.md's "no magic hexes". Same rendered colour.
   */
  tint(hovered: PanelId | null): void {
    for (const a of this.anchors) {
      const name = a.querySelector<HTMLElement>('[data-name]');
      if (name === null) continue;
      name.style.color = a.dataset['planet'] === hovered ? 'var(--accent-hover)' : 'var(--ink-label)';
    }
    this.ret.planet = hovered !== null;
    this.applyReticle();
  }

  /**
   * Follow the pointer, and arm on the way.
   *
   * Arming here rather than at the call site is the point: knowing where the
   * pointer is *is* the precondition for drawing something at it, so the two
   * cannot fall out of step.
   */
  moveReticle(clientX: number, clientY: number): void {
    if (this.reticle === null) return;
    this.reticle.style.left = `${clientX}px`;
    this.reticle.style.top = `${clientY}px`;
    this.setArmed(true);
  }

  /**
   * Whether the pointer is on the hub at all. Taken away when a panel opens, on
   * a jump, and when the pointer leaves the window — in every one of those the
   * OS cursor is back or there is nothing to point at, and a ring left frozen
   * mid-screen would be a stale one.
   */
  setArmed(on: boolean): void {
    if (this.ret.armed === on) return;
    this.ret.armed = on;
    this.applyReticle();
  }

  /**
   * Over a real link or button in the hub chrome. With the OS cursor gone from
   * the whole stage, this is what is left to say "clickable" — the reticle takes
   * the same grown state a planet gives it.
   */
  setLinkHover(on: boolean): void {
    if (this.ret.link === on) return;
    this.ret.link = on;
    this.applyReticle();
  }

  /** The one place the reticle's opacity and transform are written. */
  private applyReticle(): void {
    if (this.reticle === null) return;
    const grown = this.ret.planet || this.ret.link;
    this.reticle.style.opacity = this.ret.armed ? '1' : '0';
    this.reticle.style.transform = this.ret.armed && grown ? RETICLE_GROWN : RETICLE_REST;
  }

  /**
   * Show or hide the whole layer.
   *
   * `pointer-events` stays `none` on the container in both states: it spans the
   * viewport, so giving it hit-testing swallows every canvas click. Only the
   * anchors are ever hit-testable, and `place()` is what grants them that.
   */
  setVisible(on: boolean): void {
    this.nav.style.opacity = on ? '1' : '0';
    this.nav.style.pointerEvents = 'none';
    for (const a of this.anchors) a.style.pointerEvents = on ? 'auto' : 'none';
  }
}
