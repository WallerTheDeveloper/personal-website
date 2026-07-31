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

export class LabelLayer {
  private readonly nav: HTMLElement;
  private readonly anchors: readonly HTMLAnchorElement[];
  private readonly reticle: HTMLElement | null;

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
    if (this.reticle !== null) {
      this.reticle.style.opacity = hovered === null ? '0' : '1';
      this.reticle.style.transform = hovered === null ? 'scale(0.6)' : 'scale(1)';
    }
  }

  /** Follow the pointer. The reticle replaces the cursor over the canvas. */
  moveReticle(clientX: number, clientY: number): void {
    if (this.reticle === null) return;
    this.reticle.style.left = `${clientX}px`;
    this.reticle.style.top = `${clientY}px`;
  }

  hideReticle(): void {
    if (this.reticle === null) return;
    this.reticle.style.opacity = '0';
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
