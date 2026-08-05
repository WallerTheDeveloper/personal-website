/**
 * Umami, behind `VITE_UMAMI_SRC` / `VITE_UMAMI_ID`.
 *
 * A no-op unless both are set, so the site runs unchanged until the owner
 * supplies a script URL and a website id. No cookies, no consent banner, no
 * personal data — that is why Umami was chosen over the alternatives.
 *
 * Auto-tracking is switched off on purpose. This is one document with hash
 * routing: after the first load there are **zero** further document loads, so
 * Umami's automatic pageview would fire once and never again. Views are sent
 * explicitly from `commit()` instead — the one place a destination is actually
 * swapped in, and late enough that a queued jump does not record a view for a
 * panel the visitor never saw.
 *
 * Never call `trackView()` from a click handler. The handler budget is < 8 ms
 * (ACCEPTANCE.md B) and a click may not become a view at all.
 */

import type { PanelId, ProjectDetailId } from './content';
import { titleFor } from './head';

type TrackPayload = Record<string, unknown>;

declare global {
  interface Window {
    umami?: {
      track: (build: (payload: TrackPayload) => TrackPayload) => void;
    };
  }
}

interface View {
  readonly url: string;
  readonly title: string;
}

const SRC = import.meta.env.VITE_UMAMI_SRC;
const ID = import.meta.env.VITE_UMAMI_ID;

let enabled = false;

/**
 * Views recorded before the async script arrives. `null` once the script has
 * settled either way, so nothing accumulates for a load that never happens.
 */
let queue: View[] | null = null;

let warnedDropped = false;

function warnDroppedOnce(): void {
  if (warnedDropped) return;
  warnedDropped = true;
  console.warn('[analytics] Umami loaded but window.umami is unavailable; views are not being recorded');
}

function send(view: View): void {
  const umami = window.umami;
  if (umami !== undefined) {
    umami.track((payload) => ({ ...payload, url: view.url, title: view.title }));
    return;
  }
  if (queue !== null) {
    queue.push(view);
    return;
  }
  warnDroppedOnce();
}

function flush(): void {
  const pending = queue;
  queue = null;
  if (pending === null) return;
  for (const view of pending) send(view);
}

function fail(): void {
  // Analytics failing is not a reason to retry into a loop, and not a reason to
  // stay quiet about it either.
  enabled = false;
  queue = null;
  console.warn('[analytics] Umami script failed to load; views are not being recorded');
}

/**
 * Hash routes, so the hub is `/`, a destination is `/#xr`, and a project detail
 * is `/#projects/p1` — the URL the visitor can actually copy out of the address
 * bar, which is the whole reason the detail is addressable at all.
 */
function viewUrl(current: PanelId | null, project: ProjectDetailId | null = null): string {
  if (current === null) return '/';
  return project === null ? `/#${current}` : `/#${current}/${project}`;
}

/**
 * Loads the Umami script. Safe to call when unconfigured — it returns without
 * touching the document, and `trackView()` then does nothing.
 */
export function initAnalytics(): void {
  if (SRC === undefined || SRC === '' || ID === undefined || ID === '') return;

  enabled = true;
  queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = SRC;
  script.dataset['websiteId'] = ID;
  script.dataset['autoTrack'] = 'false';
  script.addEventListener('load', flush, { once: true });
  script.addEventListener('error', fail, { once: true });
  document.head.appendChild(script);
}

/**
 * Records one destination view. Called from the router's `commit()` and from
 * `boot()` for the hub — never from a click handler.
 */
export function trackView(
  current: PanelId | null,
  project: ProjectDetailId | null = null,
): void {
  if (!enabled) return;
  send({ url: viewUrl(current, project), title: titleFor(current, project) });
}
