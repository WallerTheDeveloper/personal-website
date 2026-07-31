# Tasks

Ordered, each independently verifiable. `[ ]` → `[x]` as you land them.
Anything marked **ASK** must go back to the owner before you implement it.

## Phase 0 — Orientation

- [ ] Serve the prototype (`cd design && npx serve .`) and exercise every interaction (click, hover, Tab/Enter, Escape, Back, drag, scroll, resize, throttled CPU). `file://` does **not** work — see `design/HOW_TO_RUN.md`.
      *Served at `http://localhost:4321/index.dc.html`; interactive pass still outstanding — driving a real browser was unavailable, so motion will be measured via Playwright against the prototype before Phase 3 sign-off.*
- [x] Read `design/BUILD_NOTES.md` end to end.
      *Two statements there are superseded and must not be followed: self-hosting the fonts (README approves the Google Fonts CDN) and the five-entry Rollup config (PORT_PLAN step 1 mandates a single entry).*
- [x] **ASK** — real URLs (`/xr`) or hash routes (`/#xr`)? → **hash routes**. Sitemap keeps one URL.
- [x] **ASK** — copy in one typed `src/content.ts`, or `{{TOKEN}}` strings left inline in markup? → **one typed `src/content.ts`**, values = the literal `{{TOKEN}}` strings.
- [x] **ASK** — final host. → **undecided; plain static `dist/`**, no host config.
- [x] **ASK** — analytics. → **Umami** (overrides README's "none included"). See Phase 4.

## Phase 1 — Scaffold

- [x] ~~`npm create vite@latest . -- --template vanilla-ts`~~; `npm i three@0.160`; `npm i -D vitest @playwright/test @types/three`.
      *Scaffold written by hand instead: this directory already held the handoff docs and Vite's scaffolder prompts interactively, with an option to wipe the directory. Same result, no risk to the bundle. `@types/node` added — `vite.config.ts` / `playwright.config.ts` reference `process`. `vitest` is on 4.x, not 2.x: 2.x nests an old `vite`/`esbuild` pair carrying a dev-server advisory. `npm audit` is clean.*
- [x] `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, ES2022, `moduleResolution: bundler`.
- [x] `vite.config.ts` — default single entry. Do **not** use the five-entry config described in `BUILD_NOTES.md`; it predates this architecture.
- [x] Commit the empty scaffold so later diffs are readable.
      *Verified green first: `tsc --noEmit` clean, `vite build` emits `dist/`, `three@0.160.1`, `npm audit` clean. Landed on `master` as two commits — handoff bundle, then scaffold. `.gitattributes` added (`eol=lf`) so the prototype does not churn on Windows.*

## Phase 2 — Markup

- [x] Unwrap `design/index.dc.html` into `index.html`: drop `<x-dc>` and `support.js`, hoist `<helmet>` into a real `<head>`.
      *Prototype lines 65–482 (`<main id="stage">` … `<canvas id="smoke">`) carried over verbatim by script rather than retyped — 418 lines of dense inline styles are not worth the drift risk. `lang="en"` added to `<html>`; the prototype had none and axe requires it.*
- [x] Real `<title>` in `<head>`. Delete `assertTitle()` and the head `MutationObserver`.
      *Title is `{{FULL_NAME}} — {{ROLE_TAGLINE}}`, matching the `baseTitle` the prototype assigned from JS. The per-jump swap to `<Panel> — {{FULL_NAME}}` is Phase 4's `head.ts`, not markup.*
- [x] Canonical + OG image → `https://golosov-danylo.com`.
- [x] Keep the inline WebGL probe blocking in `<head>` (before first paint, or the text edition flashes).
- [x] Convert `{<!---->{TOKEN}}` → `{{TOKEN}}` throughout.
      *109 escapes converted, not the 98 estimated. 115 tokens in the document: 109 body + 6 head (title ×2, description, `og:title` ×2, `og:description`); 104 distinct.*
- [x] Verify the full DOM contract survives (id/`data-` list in `PORT_PLAN.md` step 2).
      *All 23 ids present exactly once. Counts: `data-panel` 4, `data-panel-top` 4, `data-hero` 4, `data-exit` 8, `data-planet` 4, `data-leader` 4, `data-name` 4, `data-grain` 1, `data-elsewhere` 4, `data-esc` 4, `data-screen-label` 4, `data-repo`/`data-demo` 1–4. Both `<html>` state hooks (`data-dg-3d`, `data-dg-flat`) and the `#fallback` fade rule intact. Re-checked against `dist/index.html` after `vite build` — no drift, probe still inline in `<head>`.*
- [x] Confirm one `<h1>` per panel and the `aria-label` / `aria-labelledby` on every section.
      *5 `<h1>` total: one per panel plus the hub's in `#hub-head`. Both canvases still `aria-hidden`; `nav#labels[aria-label="Destinations"]` intact.*

**Carried into Phase 3 on purpose, and now resolved:** every inline `style`
attribute, plus 42 `style-hover` and 23 `style-before` attributes. They were the
*only* record of what the hover and `::before` rules had to be. Phase 3 rewrote
them as real CSS and deleted them.

**Expected intermediate state:** in a WebGL browser the page now goes black ~400 ms
after load. The probe sets `data-dg-3d`, which fades `#fallback` out, and there is
no engine yet to draw the hub. Correct per the design — `#fallback` is the default
state and the probe is the success path — and it resolves when Phase 5/7 land.
With JS disabled or no WebGL, the text edition renders and is fully navigable.

## Phase 3 — Styles

- [x] `styles.css` with all tokens as `:root` custom properties.
      *Landed as `src/styles.css`, `<link>`ed from `index.html` at the position the inline `<style>` held — not imported from `main.ts`, which would flash unstyled content, and the text edition is the default state. Every colour in the document is a token: the README palette verbatim, plus named tokens for the ~25 one-off values the prototype used inline (`--ink-hub`, `--meta-2`, `--marker-xr`, `--violet-soft`, …). `--intro-te: #b6b7c8` and `--intro-bio: #b6b7c9` differ by one digit in the prototype; kept distinct rather than "tidied".*
- [x] Replace every inline style with classes; per-destination accents via `[data-panel="…"] { --accent: … }`.
      *312 style attributes, 125 distinct values. Converted by an exact-match table asserted against both counts, so a missed or duplicated mapping aborted rather than silently landing. Accents are keyed on `[data-panel="…"]`, `[data-planet="…"]` **and** `a[href="#…"]` in one rule set — the third selector is what tints the `01`/`02` numerals in the text edition and in each panel's "Elsewhere" list. Do not instead add `data-planet` to those links: the engine iterates `[data-planet]` and writes screen positions onto every match. Alpha variants come from `rgba(var(--accent-rgb), …)`.*
- [x] Rewrite `style-hover` / `style-before` attributes as `:hover` / `::before` rules.
      *All 65 deleted. Verified by forcing `:hover` through CDP on **every** `<a>` and `<button>` in the document and diffing computed colours against the prototype: 47 controls, 46 of which change under hover, all matching.*
- [x] Carry over verbatim: `grainShift` keyframes, `html[data-dg-flat]` rules, the `prefers-reduced-motion` block, the whole `@media print` block.
      *Byte-identical. The `!important` in the flat and print blocks is load-bearing — it is what overrides the inline `visibility`/`opacity` the router writes onto each panel.*
- [x] Global `a` / `a:hover` defined.
- [x] Side-by-side diff against the prototype at 1440, 1024, 768 and 390 px wide. Zero visual drift.
      *Two passes against a served `design/index.dc.html`, with `unpkg.com/three@*` blocked so neither side has an engine (Phase 5 hasn't landed). Only that URL — the prototype's authoring runtime pulls React from unpkg too, and without it the page never renders.*
      *Pixel diff, 8 states × 4 widths: hub pixel-identical at 1440/1024/768; everything else ≤ 0.15 %, entirely on the glyph rows of `{{TOKEN}}` text (see below). Computed-style parity walk — box plus 52 resolved properties and both pseudo-elements, over all 314 nodes × 3 states × 4 widths — surfaced exactly three classes of difference, all explained and none of them drift:*
      1. *Sub-pixel widths (≤ 0.016 px) on shrink-to-fit boxes holding a token. The prototype's `{<!---->{` escape splits the text into two nodes, so Bodoni does not kern across the brace pair; the port's single text node does. Literal copy ("Backend & Platform") is identical to the pixel. Goes away when the owner fills the tokens.*
      2. *The grain tile. The prototype's React runtime truncates the inline data URI to `url("data:image/svg+xml")` — the port renders what the file actually declares. Invisible either way: `mix-blend-mode: overlay` at `opacity: 0.16` over a near-black sky.*
      3. *`rgba(2,3,8,0.92) 100%` → `rgba(2,3,8,0.92)` in the vignette. esbuild drops the redundant final stop when minifying; Chrome reserialises it to the same value.*
      *One real drift was found and fixed: the text edition's "Download CV (PDF)" link. Its colour is inline in the prototype with no `style-hover`, so the inline value beats `a:hover` and it does **not** warm to `--hover` — unlike every other CV link. `.te__cv:hover` reproduces that. It reads like a prototype oversight; deleting that one rule is the whole change if the owner wants it to match. **ASK.***

## Phase 4 — Content plumbing

- [x] `content.ts` with every token from README “Copy tokens”, values = the literal `{{TOKEN}}` strings.
      *112 tokens: the 104 distinct ones the markup renders, plus the 8 `PROJECT_n_REPO_URL` / `_DEMO_URL` that can only live in an attribute. `tests/unit/content.test.ts` asserts the table and `index.html` agree **in both directions** — a token in the markup with no key fails, and a key nothing consumes fails — so the two cannot drift apart silently. Also exports `PANEL_IDS` / `PanelId` / `isPanelId()` and `TITLES` (literal copy, carried from the prototype), which Phase 7 imports rather than redeclaring.*
- [x] `head.ts`: title per route (`<Panel> — {{FULL_NAME}}`), description, `og:title`, `og:description`, `Person` JSON-LD (no seniority claim).
      *`titleFor()` is pure and unit-tested — including a guard that no title ever grows a seniority word, since the title is the one string rewritten at runtime and so the easiest to embellish by accident. `assertTitle()` and the `document.head` MutationObserver are **not** ported; a real `<head>` needs neither. JSON-LD carries exactly the five fields PORT_PLAN step 4 lists (`name`, `jobTitle` = `ROLE_TAGLINE` verbatim, `url`, `address`, `sameAs`) — no `email`, no `description`, nothing added. Injection is idempotent, via `textContent`, under `#person-jsonld`.*
      *The head meta is mirrored from `content.ts` even though `index.html` already ships the same tokens statically. That is what makes `content.ts` the single file the owner edits; the markup copy is what a crawler with JS off reads.*
- [x] Apply project repo/demo hrefs to `[data-repo="n"]` / `[data-demo="n"]`.
- [x] Apply contact hrefs to `#lnk-email` (`mailto:`), `#lnk-github`, `#lnk-linkedin`.
      *Applied **unconditionally**, literal `{{TOKEN}}` values included. This is the safer placeholder state, not an oversight: the markup ships all seven as `href="#"`, and the router intercepts every `href="#…"`, so leaving them would make “Repository”, “Live demo” and the three contact rows warp the visitor back to the hub. A dead link beats a link that navigates somewhere it never claimed to go. Verified afterwards that the only `href="#"` left in the document are the eight `[data-exit]` links, which are meant to be exits.*
- [x] `analytics.ts` — Umami, behind `VITE_UMAMI_SRC` / `VITE_UMAMI_ID`, no-op when either is unset (owner has not supplied them yet). Hash routing performs **zero** document loads, so auto-pageviews never fire: track explicitly from `commit()`, which is the one place a destination is actually swapped in. Must not run inside the click handler — see the < 8 ms budget in `ACCEPTANCE.md` B.
      *Ships `data-auto-track="false"` so Umami's own history patching cannot double-count against `go()`'s `pushState`. Views raised before the async script lands are queued and flushed on `load`; the queue is dropped on `error` with one warning, so a blocked tracker can neither retry-loop nor accumulate. `.env.example` documents both vars — neither is a secret, both are baked into the client bundle.*

**Seams left for Phase 7** — `main.ts` calls `applyHead()` and `initAnalytics()` at
mount and nothing else. The router must call `applyTitle(current)` and
`trackView(current)` from `commit()`, and `trackView(null)` from `boot()` for the
hub. Neither belongs in a click handler. Deep-load `/#xr` therefore still shows
the base title until Phase 7 wires `commit()` — that is the seam, not a bug.

**Verified:** `tsc --noEmit` clean; 9 unit tests green; `vite build` emits a
2.69 kB / 1.15 kB gzip JS chunk. Driven in a real browser against the served
`dist/` in both states — WebGL on and WebGL blocked at `getContext` — and the
title, all three meta tags, the JSON-LD and all eleven hrefs apply identically in
each: `head.ts` is not gated on WebGL, so the text edition gets the same
treatment. No console errors, no page errors, and with no env vars set, zero
Umami `<script>` tags. The one 404 in the trace is the browser's automatic
`/favicon.ico` request — pre-existing, and Phase 9's to resolve.

## Phase 5 — Engine

- [ ] `hub.ts` from `space-engine.js`; `import * as THREE from 'three'`, pinned 0.160.x.
- [ ] Type `Planet` and `HubApi`; type every export.
- [ ] Delete `initPlanetBand` and the `href` field on `PLANETS` (multi-page leftovers).
- [ ] Preserve exactly: `DAMP 0.08`, `AZ_LIMIT ±0.5`, hover scale `1.055`, 30 Hz raycast throttle, the 24 %-of-viewport park solve, bake sizes 640²/384² and 256²/160², DPR clamps, zero-allocation render loop.
- [ ] Verify: hub renders, planets rotate, hover lights up, drag/scroll/arrows pan, azimuth persists across reload.

## Phase 6 — Warp

- [ ] `warp.ts` from `warp.js`. Keep `MIN_COVER 900`, `MAX_COVER 2200`, `HOLD_CAP 3400`, `ACCENTS`, the whole `Warp` class, `dispose()`, `saveAzimuth`/`loadAzimuth`.
- [ ] Delete `writeLaunch`, `readLaunch`, `whenLoaded`, `bindDepartures` (dead multi-page handoff).
- [ ] Confirm the streak field allocates no textures and nothing is built inside a click handler.

## Phase 7 — Router

- [ ] `router.ts` from the prototype's logic class. `boot()` on `DOMContentLoaded`, dispose on `pagehide`, props → a `config` object (`composition`, `warpColor`, `parallax 0.10`, `showHud`).
- [ ] One delegated `click` handler for every `href="#…"`.
- [ ] `go(id)` pushes history **and** drives `jump()` directly.
- [ ] `exit()` = `go(null)`. Never `history.back()`.
- [ ] `jump()` stages: 380 ms ship head start → `cover()` → `commit()` at ~92 % opacity → `clear()`.
- [ ] `finish()` idempotent + jump token + watchdog at `COVER + CLEAR + 700`.
- [ ] Input gated on `current` only.
- [ ] Both canvas nav paths into one deduped `nav()`.
- [ ] `_pending` queues overlapping jumps.
- [ ] `park()` / `unpark()` / `returnShip()` wired; scroll-driven parallax at `config.parallax`.
- [ ] Deep link `/#xr` → panel open, camera parked, no warp.
- [ ] Escape and every `[data-exit]` return to the hub.

## Phase 8 — Fallbacks

- [ ] Reduced motion: no drift/bob/parallax, ambient ~0, grain off, 200 ms cross-fade instead of the flight.
- [ ] `webglcontextlost` restores the text edition.
- [ ] `flatten()` produces one continuous scrolling document with heroes removed.
- [ ] Print: whole CV prints as one document, no scene, no bars, no heroes.
- [ ] JS disabled: the text edition is complete and navigable.

## Phase 9 — Assets

- [ ] `public/cv.pdf`, `public/og.png` (placeholders from `assets/`).
- [ ] `robots.txt` + `sitemap.xml`: `https://example.com` → `https://golosov-danylo.com`.
- [ ] `public/models/README.md` kept for the future glTF. Ship the primitive placeholder ship as-is.
- [ ] A favicon. There is none, so every load spends a request on a 404 for `/favicon.ico`. Not in the handoff bundle — **ASK** whether the owner wants one, or just a `<link rel="icon">` pointing at an inline SVG.

## Phase 10 — Tests

- [ ] Vitest: `hashId()`, `byId()`, `detectQuality()` tiers, `finish()` token/idempotency.
- [ ] Playwright: the suite in `ACCEPTANCE.md`.
- [ ] Build-artifact test: no `{{` in `dist/` once real copy lands (skip while tokens are intentional).

## Phase 11 — Budget & ship

- [ ] `vite build`; total transfer < 900 KB. `three` minified and tree-shaken.
- [ ] `renderer.info.render.calls` ≤ 25 in the hub.
- [ ] DPR clamps verified on a real phone.
- [ ] Lighthouse a11y pass; axe clean on hub + all four panels + the text edition.
- [ ] Deploy `dist/` (host per Phase 0 ASK).

## Owner's pre-launch list (not the developer's)

- [ ] Fill every `{{TOKEN}}`, including the ones in the content table.
- [ ] Final `cv.pdf`.
- [ ] Regenerate `og.png` with the real name and role.
- [ ] Supply the ship glTF (later milestone).
