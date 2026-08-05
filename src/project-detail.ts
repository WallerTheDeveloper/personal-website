/**
 * The project detail dialog — the view half of the `#projects/pN` sub-route.
 *
 * The markup this drives is already in the document, in flow, directly under
 * each project's card: that is what the text edition and the printed CV render,
 * and this module never runs for either of them. All it does is add `is-open`,
 * which the `html[data-dg-3d]` rules in `styles.css` turn into a centred dialog,
 * and put the modal semantics on top.
 *
 * **The ARIA and the trap are added on open and taken off on close, never
 * written in the markup.** A flat document that shipped four permanently
 * declared `role="dialog"` elements would be lying to a screen reader about a
 * modal that is not there and cannot be dismissed.
 *
 * There is no `inert` here, and that is a decision rather than an omission. The
 * dialog is a descendant of `.col` → `.panel__body` → `[data-panel]`, so every
 * element that could plausibly host `inert` is one of its *ancestors* — setting
 * it would make the dialog inert too. `aria-modal` plus the Tab trap below is
 * what stands in for it. Native `<dialog>`/`showModal()` would have given the
 * trap for free but puts the element in the top layer, above `#smoke`, where
 * the warp cover could no longer hide it.
 *
 * Escape is **not** handled here. It chains — detail first, then the panel — and
 * that ordering lives in the router's one `keydown`, next to the panel half.
 */

import { type ProjectDetailId } from './content';

/**
 * Tab stops, in DOM order. Deliberately not exhaustive: this has to cover what
 * a detail can actually contain — the links, and the video embed once it is
 * mounted — not every focusable element the platform defines.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Rendered, so it can take focus. Covers `display: none` and a zero-size box. */
function focusable(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

export class ProjectDetailLayer {
  private readonly details: ReadonlyMap<ProjectDetailId, HTMLElement>;

  /** The open detail's `.project__dialog`, and the null that means "closed". */
  private dialog: HTMLElement | null = null;
  private opened: ProjectDetailId | null = null;

  private readonly onKey = (e: KeyboardEvent): void => this.trapTab(e);
  private readonly onFocusIn = (e: FocusEvent): void => this.pullFocusBack(e);

  constructor(details: ReadonlyMap<ProjectDetailId, HTMLElement>) {
    this.details = details;
  }

  show(project: ProjectDetailId): void {
    const detail = this.details.get(project) ?? null;
    const dialog = detail?.querySelector<HTMLElement>('.project__dialog') ?? null;
    if (detail === null || dialog === null) return;
    if (this.opened !== null) this.hide();

    // The heading is the dialog's accessible name. Its id is set here rather
    // than in the markup for the same reason the role is: nothing about the
    // modal exists until there is a modal.
    const heading = dialog.querySelector<HTMLElement>('.project__detail-title');
    if (heading !== null) {
      if (heading.id === '') heading.id = `${project}-detail-title`;
      dialog.setAttribute('aria-labelledby', heading.id);
    }
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    detail.classList.add('is-open');

    this.dialog = dialog;
    this.opened = project;

    // On the element itself, not on a focusable child: a screen reader should
    // read the dialog's name before its first link, and the scroll position
    // should start at the top of the project rather than at its first anchor.
    dialog.focus();
    dialog.scrollTop = 0;
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('focusin', this.onFocusIn);
  }

  hide(): void {
    const project = this.opened;
    const dialog = this.dialog;
    if (project === null || dialog === null) return;

    // Both listeners come off *before* focus is restored, or the backstop below
    // would see the card take focus, decide it is outside the dialog, and pull
    // it straight back in.
    document.removeEventListener('keydown', this.onKey);
    document.removeEventListener('focusin', this.onFocusIn);
    this.dialog = null;
    this.opened = null;

    dialog.removeAttribute('role');
    dialog.removeAttribute('aria-modal');
    dialog.removeAttribute('aria-labelledby');
    dialog.removeAttribute('tabindex');
    this.details.get(project)?.classList.remove('is-open');

    // Back to the card that opened it — which is where the visitor was, and on
    // a deep link is the most useful place to arrive. The slash is fine inside
    // an attribute selector; it is only an *id* selector that would need
    // CSS.escape.
    const card = document.querySelector<HTMLElement>(`a[href="#projects/${project}"]`);
    if (card !== null && focusable(card)) card.focus();
  }

  destroy(): void {
    this.hide();
  }

  /**
   * Tab wraps inside the dialog. This is the whole of what `aria-modal` promises
   * and cannot enforce: with no `inert` available (see the file header), nothing
   * else stops Tab walking out into the card grid and the hub labels behind.
   */
  private trapTab(e: KeyboardEvent): void {
    const dialog = this.dialog;
    if (e.key !== 'Tab' || dialog === null) return;
    const stops = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(focusable);
    const active = document.activeElement;

    // An unfilled detail can genuinely have no links in it yet. Holding focus on
    // the dialog is still correct — it is the one thing Escape acts on.
    if (stops.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }

    const first = stops[0] as HTMLElement;
    const last = stops[stops.length - 1] as HTMLElement;
    if (e.shiftKey && (active === first || active === dialog)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /**
   * The backstop for every way focus can arrive somewhere Tab did not put it —
   * a click that lands behind the scrim, a browser find-in-page, a screen
   * reader's own navigation.
   */
  private pullFocusBack(e: FocusEvent): void {
    const dialog = this.dialog;
    if (dialog === null) return;
    const target = e.target;
    if (target instanceof Node && dialog.contains(target)) return;
    dialog.focus();
  }
}
