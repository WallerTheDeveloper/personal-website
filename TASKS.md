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

- [ ] Unwrap `design/index.dc.html` into `index.html`: drop `<x-dc>` and `support.js`, hoist `<helmet>` into a real `<head>`.
- [ ] Real `<title>` in `<head>`. Delete `assertTitle()` and the head `MutationObserver`.
- [ ] Canonical + OG image → `https://golosov-danylo.com`.
- [ ] Keep the inline WebGL probe blocking in `<head>` (before first paint, or the text edition flashes).
- [ ] Convert `{<!---->{TOKEN}}` → `{{TOKEN}}` throughout.
- [ ] Verify the full DOM contract survives (id/`data-` list in `PORT_PLAN.md` step 2).
- [ ] Confirm one `<h1>` per panel and the `aria-label` / `aria-labelledby` on every section.

## Phase 3 — Styles

- [ ] `styles.css` with all tokens as `:root` custom properties.
- [ ] Replace every inline style with classes; per-destination accents via `[data-panel="…"] { --accent: … }`.
- [ ] Rewrite `style-hover` / `style-before` attributes as `:hover` / `::before` rules.
- [ ] Carry over verbatim: `grainShift` keyframes, `html[data-dg-flat]` rules, the `prefers-reduced-motion` block, the whole `@media print` block.
- [ ] Global `a` / `a:hover` defined.
- [ ] Side-by-side diff against the prototype at 1440, 1024, 768 and 390 px wide. Zero visual drift.

## Phase 4 — Content plumbing

- [ ] `content.ts` with every token from README “Copy tokens”, values = the literal `{{TOKEN}}` strings. *(pending Phase 0 ASK)*
- [ ] `head.ts`: title per route (`<Panel> — {{FULL_NAME}}`), description, `og:title`, `og:description`, `Person` JSON-LD (no seniority claim).
- [ ] Apply project repo/demo hrefs to `[data-repo="n"]` / `[data-demo="n"]`.
- [ ] Apply contact hrefs to `#lnk-email` (`mailto:`), `#lnk-github`, `#lnk-linkedin`.
- [ ] `analytics.ts` — Umami, behind `VITE_UMAMI_SRC` / `VITE_UMAMI_ID`, no-op when either is unset (owner has not supplied them yet). Hash routing performs **zero** document loads, so auto-pageviews never fire: track explicitly from `commit()`, which is the one place a destination is actually swapped in. Must not run inside the click handler — see the < 8 ms budget in `ACCEPTANCE.md` B.

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
