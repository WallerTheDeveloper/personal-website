/**
 * The project detail dialog â€” the view half of the `#projects/pN` sub-route.
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
 * dialog is a descendant of `.col` â†’ `.panel__body` â†’ `[data-panel]`, so every
 * element that could plausibly host `inert` is one of its *ancestors* â€” setting
 * it would make the dialog inert too. `aria-modal` plus the Tab trap below is
 * what stands in for it. Native `<dialog>`/`showModal()` would have given the
 * trap for free but puts the element in the top layer, above `#smoke`, where
 * the warp cover could no longer hide it.
 *
 * Escape is **not** handled here. It chains â€” detail first, then the panel â€” and
 * that ordering lives in the router's one `keydown`, next to the panel half.
 */

import { type ProjectDetailId } from './content';

/* ----------------------------------------------------------------- video */

/**
 * A YouTube id, as the URL carries it. Kept deliberately loose on length and
 * strict on alphabet: the point is to reject an unfilled `{{PROJECT_1_VIDEO_ID}}`
 * and a hand-edited href, not to second-guess YouTube's id format.
 */
const VIDEO_ID = /^[\w-]{6,20}$/;

/**
 * The `v` of a watch URL, or `null` â€” which is what an unfilled token, a
 * malformed href and a foreign host all resolve to, and all three mean the same
 * thing here: build no facade, and leave the plain link the markup shipped.
 *
 * Read off the href rather than from a second table so there is one source of
 * truth for which video a project has.
 */
export function videoIdFrom(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  // Anchored both ends: `youtube.com.evil.test` must not match.
  if (!/(^|\.)youtube\.com$/.test(url.hostname)) return null;
  const v = url.searchParams.get('v') ?? '';
  return VIDEO_ID.test(v) ? v : null;
}

/**
 * `hqdefault`, not `maxresdefault` â€” which 404s for any video never processed at
 * 720p and would leave a hole where the still should be â€” and not `mqdefault`,
 * which is a true 16:9 but only 320Ã—180. This one is generated for every public
 * video. It is 4:3 with letterbox bars, and the `aspect-ratio: 16/9` box with
 * `object-fit: cover` crops exactly those off, leaving the real 480Ã—270 frame.
 */
export function thumbUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/** `youtube-nocookie`, and only ever built after an explicit click on play. */
export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
}

/**
 * The player's accessible name. Both facades â€” the one on the card and the one
 * in the dialog â€” sit inside the same `<article class="project">`, so either
 * heading names either player.
 */
function projectTitle(cover: Element): string {
  const scope = cover.closest('.project');
  const heading =
    scope?.querySelector('.project__detail-title')?.textContent ??
    scope?.querySelector('.project__title')?.textContent ??
    '';
  return heading.trim() === '' ? 'Video' : heading.trim();
}

/**
 * Swap a still for the embed. The iframe is a *sibling* of the anchor, never
 * inside it: an `<a>` wrapping an `<iframe>` is the same nested-interactive
 * problem that keeps the detail out of the card.
 */
function play(e: MouseEvent, cover: HTMLAnchorElement, id: string): void {
  // A modified click still means "open it on YouTube".
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  const slot = cover.parentElement;
  if (slot === null || slot.querySelector('iframe') !== null) return;
  e.preventDefault();

  const hadFocus = document.activeElement === cover;
  const frame = document.createElement('iframe');
  frame.className = 'project__video-frame';
  frame.title = projectTitle(cover);
  frame.allow =
    'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('frameborder', '0');
  frame.src = embedUrl(id);

  cover.hidden = true;
  slot.appendChild(frame);

  // Focus goes to this document's own furniture, **never** into the iframe.
  // Focus inside a cross-origin frame belongs to that document, so its key
  // events never reach this one â€” and Escape is the site's one universal
  // dismissal, a functional requirement rather than a convenience. Focusing the
  // player would trade it for the player's spacebar.
  //
  // It also has to move *somewhere*: the anchor that was focused a moment ago is
  // now `hidden`, and focus left on a hidden element falls to <body>.
  const dialog = cover.closest<HTMLElement>('.project__dialog');
  if (dialog !== null) {
    // Unconditional in the dialog: <body> is outside the trap, and the focus
    // backstop would drag it back here anyway.
    dialog.focus();
    return;
  }
  // On a card there is no trap and nothing to fall out of, so this only has to
  // undo what hiding the anchor did â€” and only for the visitor who was actually
  // on it. Moving focus after a mouse click would be a ring nobody asked for.
  if (hadFocus) cover.closest('.project')?.querySelector<HTMLElement>('.card__link')?.focus();
}

/**
 * Turn the plain link the markup shipped into a still with a play badge over it.
 *
 * Built in JS rather than in the markup so that the served HTML names no
 * third-party host at all, and so the first request to Google happens when the
 * visitor reaches the panel rather than when they reach the site.
 *
 * Idempotent, and marked on the element: a card can be revisited and a detail
 * re-opened without re-fetching the still or binding a second click.
 */
function upgradeFacade(cover: HTMLAnchorElement): void {
  // `data-facade` marks "already handled", success or failure alike.
  if (cover.dataset['facade'] !== undefined) return;
  const id = videoIdFrom(cover.href);
  // No id means an unfilled token or a hand-edited href. What is left is the
  // plain link the markup shipped, which is the correct *unfilled* state rather
  // than a broken one â€” the owner has not supplied a video yet.
  if (id === null) return;
  cover.dataset['facade'] = 'on';

  const onPlay = (e: MouseEvent): void => play(e, cover, id);
  cover.addEventListener('click', onPlay);

  const img = document.createElement('img');
  img.className = 'project__video-thumb';
  // Decorative: the anchor it sits inside already carries the accessible name.
  img.alt = '';
  img.width = 480;
  img.height = 360;
  img.decoding = 'async';
  // Bound before `src`, so there is never an inline handler in the markup and a
  // cached image cannot fire before anything is listening.
  //
  // A still that will not load usually means the network is not reaching Google
  // at all, in which case an embed would fail too â€” so this unwinds the whole
  // upgrade rather than only the image, and the anchor goes back to being a link
  // that opens the video on YouTube.
  img.addEventListener(
    'error',
    () => {
      img.remove();
      cover.classList.remove('is-facade');
      cover.removeEventListener('click', onPlay);
    },
    { once: true },
  );
  img.src = thumbUrl(id);

  cover.classList.add('is-facade');
  cover.prepend(img);
}

/**
 * Upgrade every facade under `root` â€” the four card players when the Projects
 * panel commits, and the dialog's when a detail opens.
 *
 * Called from the router's `commit()` rather than on mount, deliberately: a
 * visitor who never opens Projects must not pay four `i.ytimg.com` requests for
 * a grid they have not seen.
 */
export function upgradeFacades(root: ParentNode): void {
  for (const cover of root.querySelectorAll<HTMLAnchorElement>('.project__video-cover')) {
    upgradeFacade(cover);
  }
}

/**
 * **Removing the node is what stops the audio.** Nothing else does: `pause()`
 * needs the iframe player API, and an iframe hidden with `display: none` goes on
 * playing.
 *
 * Swept over a whole subtree rather than one dialog, because there are now up to
 * five players in the panel â€” one per card and one in the open detail â€” and
 * every way out has to silence all of them: the close control, Escape, Back, a
 * jump to another panel, `flatten()` and `destroy()`.
 */
export function teardownEmbeds(root: ParentNode | null): void {
  if (root === null) return;
  for (const frame of root.querySelectorAll('.project__video-frame')) frame.remove();
  for (const cover of root.querySelectorAll<HTMLAnchorElement>('.project__video-cover')) {
    cover.hidden = false;
  }
}

/**
 * Tab stops, in DOM order. Deliberately not exhaustive: this has to cover what
 * a detail can actually contain â€” the links, and the video embed once it is
 * mounted â€” not every focusable element the platform defines.
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
  /**
   * Asks the router to close. The layer owns the view and never the URL, so a
   * dismissal has to go back through `closeDetail()` â€” closing here directly
   * would leave the address bar claiming a detail that is no longer on screen.
   */
  private readonly dismiss: () => void;

  /** The open detail's `.project__dialog`, and the null that means "closed". */
  private dialog: HTMLElement | null = null;
  private opened: ProjectDetailId | null = null;

  private readonly onKey = (e: KeyboardEvent): void => this.trapTab(e);
  private readonly onFocusIn = (e: FocusEvent): void => this.pullFocusBack(e);
  private readonly onScrim = (e: MouseEvent): void => this.dismissFromScrim(e);

  constructor(details: ReadonlyMap<ProjectDetailId, HTMLElement>, dismiss: () => void) {
    this.details = details;
    this.dismiss = dismiss;
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
    // A card player still running behind the scrim is the same audio bug the
    // teardown rule exists for â€” the visitor cannot see it, and it does not stop
    // on its own. Silence the whole panel, then upgrade this dialog's own cover.
    teardownEmbeds(detail.closest('[data-panel]'));
    upgradeFacades(dialog);

    // On the element itself, not on a focusable child: a screen reader should
    // read the dialog's name before its first link, and the scroll position
    // should start at the top of the project rather than at its first anchor.
    dialog.focus();
    dialog.scrollTop = 0;
    document.addEventListener('keydown', this.onKey);
    document.addEventListener('focusin', this.onFocusIn);
    detail.addEventListener('click', this.onScrim);
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
    this.details.get(project)?.removeEventListener('click', this.onScrim);
    this.dialog = null;
    this.opened = null;

    teardownEmbeds(dialog);
    dialog.removeAttribute('role');
    dialog.removeAttribute('aria-modal');
    dialog.removeAttribute('aria-labelledby');
    dialog.removeAttribute('tabindex');
    this.details.get(project)?.classList.remove('is-open');

    // Back to the card that opened it â€” which is where the visitor was, and on
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
    // the dialog is still correct â€” it is the one thing Escape acts on.
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
   * A click on the scrim closes, the way a modal is expected to.
   *
   * It is also what keeps the panel's own chrome from reading as broken: the
   * sticky bar shows through the scrim and stays perfectly legible, so
   * "â† Back to system" looks clickable while the scrim is swallowing the click.
   * Dismissing here means that click does something, and the second one reaches
   * the bar.
   */
  private dismissFromScrim(e: MouseEvent): void {
    // Only the scrim itself. Anything inside the dialog bubbles up to here too,
    // and a click on the description must not close what it is describing.
    if (e.target !== e.currentTarget) return;
    this.dismiss();
  }

  /**
   * The backstop for every way focus can arrive somewhere Tab did not put it â€”
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
