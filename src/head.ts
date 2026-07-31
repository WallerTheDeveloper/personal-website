/**
 * Everything from `content.ts` that markup cannot carry, applied to the live
 * document: the title, the head meta, the `Person` JSON-LD, and the hrefs that
 * sit in attributes rather than text nodes.
 *
 * The prototype's `assertTitle()` and its `document.head` MutationObserver are
 * deliberately absent (PORT_PLAN step 4). They existed only because the
 * authoring tool injected its own `<title>` at an unpredictable time. A real
 * `<head>` needs neither, and a permanent observer on `<head>` is a cost with
 * nothing left to pay for.
 */

import {
  CONTENT,
  PROJECT_LINKS,
  SITE_URL,
  TITLES,
  type PanelId,
} from './content';

/** The hub title, and what every panel title falls back to. */
export const BASE_TITLE = `${CONTENT.FULL_NAME} — ${CONTENT.ROLE_TAGLINE}`;

const JSON_LD_ID = 'person-jsonld';

/**
 * A DOM-contract element is missing. Loud rather than silent: every selector
 * used here is listed in PORT_PLAN step 2, so a miss means the markup drifted.
 */
function missing(what: string): void {
  console.warn(`[head] DOM contract: ${what} not found`);
}

/**
 * `<Panel title> — <name>` on a destination, the base title on the hub.
 * Pure, so the router and the unit tests can both use it.
 */
export function titleFor(current: PanelId | null): string {
  return current === null ? BASE_TITLE : `${TITLES[current]} — ${CONTENT.FULL_NAME}`;
}

/**
 * Called from `commit()` — the one place a destination is actually swapped in —
 * so the title changes with the content, not with the click.
 */
export function applyTitle(current: PanelId | null): void {
  const want = titleFor(current);
  if (document.title !== want) document.title = want;
}

function setMetaContent(selector: string, value: string): void {
  const el = document.head.querySelector(selector);
  if (el === null) {
    missing(selector);
    return;
  }
  el.setAttribute('content', value);
}

function setHref(selector: string, value: string): void {
  const el = document.querySelector(selector);
  if (el === null) {
    missing(selector);
    return;
  }
  el.setAttribute('href', value);
}

/**
 * `index.html` already ships these tokens as static markup, which is what a
 * crawler with JS off reads. Mirroring them from `content.ts` on mount is what
 * makes `content.ts` the single place the owner edits: fill it, and the head
 * follows without a second pass over the markup.
 */
function applyMeta(): void {
  setMetaContent('meta[name="description"]', CONTENT.META_DESCRIPTION);
  setMetaContent('meta[property="og:title"]', BASE_TITLE);
  setMetaContent('meta[property="og:description"]', CONTENT.META_DESCRIPTION);
}

/**
 * `Person` JSON-LD, exactly the fields README step 4 lists.
 *
 * `jobTitle` is `ROLE_TAGLINE` verbatim. It is a role description — no
 * seniority claim goes in copy, chrome, meta tags or structured data
 * (README "Content rules" 5). Do not enrich this with a level, a grade or
 * years of experience.
 */
function personJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: CONTENT.FULL_NAME,
    jobTitle: CONTENT.ROLE_TAGLINE,
    url: SITE_URL,
    address: {
      '@type': 'PostalAddress',
      addressLocality: CONTENT.LOCATION,
    },
    sameAs: [CONTENT.GITHUB_URL, CONTENT.LINKEDIN_URL],
  };
}

function applyJsonLd(): void {
  // Idempotent: `applyHead()` runs once per document, but a re-entry must not
  // leave two Person nodes for a crawler to reconcile.
  const existing = document.getElementById(JSON_LD_ID);
  const script = existing instanceof HTMLScriptElement ? existing : document.createElement('script');
  script.id = JSON_LD_ID;
  script.type = 'application/ld+json';
  // textContent, not innerHTML — the value is never parsed as markup.
  script.textContent = JSON.stringify(personJsonLd());
  if (existing === null) document.head.appendChild(script);
}

/**
 * Hrefs that live in attributes and so cannot be tokens in markup.
 *
 * These are applied unconditionally, including while the values are still
 * literal `{{TOKEN}}` strings. That is the safer of the two placeholder states:
 * the markup ships them as `href="#"`, and the router intercepts every
 * `href="#…"` — so leaving them would make "Repository", "Live demo" and the
 * three contact rows warp the visitor back to the hub. A dead link is better
 * than a link that navigates somewhere it never claimed to go. The build test
 * for `{{` in `dist/` is what catches them before launch.
 */
function applyLinks(): void {
  for (const project of PROJECT_LINKS) {
    setHref(`[data-repo="${project.n}"]`, project.repo);
    setHref(`[data-demo="${project.n}"]`, project.demo);
  }
  setHref('#lnk-email', `mailto:${CONTENT.EMAIL}`);
  setHref('#lnk-github', CONTENT.GITHUB_URL);
  setHref('#lnk-linkedin', CONTENT.LINKEDIN_URL);
}

/**
 * Everything that is applied once, on mount. The per-route part is
 * `applyTitle()`, which the router calls from `commit()`.
 */
export function applyHead(): void {
  applyMeta();
  applyJsonLd();
  applyLinks();
}
