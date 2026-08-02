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
- [x] **ASK** — final host. → **GitHub Pages**, apex `golosov-danylo.com`.
      *Answered in Phase 11, superseding this phase's original "undecided; plain
      static `dist/`, no host config". The build is still a plain static `dist/`
      and nothing in `src/` knows about the host; what the decision added is
      `.github/workflows/deploy.yml` and `public/CNAME`. Pages serves no custom
      headers — see the Phase 11 note.*
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
      *One real drift was found: the text edition's "Download CV (PDF)" link. Its colour is inline in the prototype with no `style-hover`, so the inline value beats `a:hover` and it does **not** warm to `--hover` — unlike every other CV link. Phase 3 reproduced that with `.te__cv:hover`. **Resolved in Phase 4 — the owner confirmed it was a prototype oversight, and the rule is deleted.** `.te__cv` now warms to `#ffb877` like `.cv-link` and `.contact__row--cv`; its resting colour is untouched. This is the port's one deliberate deviation from the prototype — do not "restore fidelity" here.*

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

- [x] **Owner decision** — how the copy reaches the body markup: **build-time
      substitution**. `build/copy-tokens.ts` is a Vite `transformIndexHtml`
      plugin that fills every `{{TOKEN}}` in `index.html` from `content.ts`, in
      dev and in the build. The owner fills one file.
      *Chosen over a runtime DOM walk because the text edition is the site's default state and must be complete with JS disabled — the copy has to be in the served HTML, not applied by a script that may never run. Every value is HTML-escaped (`& < > " '`), which is correct in both text and attribute positions, so an ampersand or a quote in real copy cannot break the markup. An undefined token **fails the build** rather than shipping as visible `{{TYPPO}}` text.*
      *Two things deliberately do not come through the plugin: the `Person` JSON-LD is raw text inside a `<script>`, where HTML escaping would corrupt the JSON (`head.ts` uses `JSON.stringify`, which escapes itself), and the eleven hrefs stay in `head.ts` per PORT_PLAN step 4.*
      *While every value is still its own literal token the transform is an **identity** — asserted directly in `tests/unit/copy-tokens.test.ts` — so Phase 3's verified pixel parity is untouched and `dist/index.html` still carries all 115 tokens. That also means broken wiring would be invisible, so it was proved live: adding an undefined token to `index.html` fails the build with the plugin's own message.*

**Seams left for Phase 7** — `main.ts` calls `applyHead()` and `initAnalytics()` at
mount and nothing else. The router must call `applyTitle(current)` and
`trackView(current)` from `commit()`, and `trackView(null)` from `boot()` for the
hub. Neither belongs in a click handler. Deep-load `/#xr` therefore still shows
the base title until Phase 7 wires `commit()` — that is the seam, not a bug.

**Verified:** `tsc --noEmit` clean; 17 unit tests green; `vite build` emits a
2.69 kB / 1.15 kB gzip JS chunk. Driven in a real browser against the served
`dist/` in both states — WebGL on and WebGL blocked at `getContext` — and the
title, all three meta tags, the JSON-LD and all eleven hrefs apply identically in
each: `head.ts` is not gated on WebGL, so the text edition gets the same
treatment. No console errors, no page errors, and with no env vars set, zero
Umami `<script>` tags. The one 404 in the trace is the browser's automatic
`/favicon.ico` request — pre-existing, and Phase 9's to resolve.

## Phase 5 — Engine

- [x] `hub.ts` from `space-engine.js`; `import * as THREE from 'three'`, pinned 0.160.x.
      *Landed as `src/hub.ts` (the module Phase 7 imports) over `src/engine/*`:
      `shaders.ts`, `planets.ts`, `capabilities.ts`, `bake.ts`, `planet-mesh.ts`,
      `ship.ts`, `sky.ts`. One file would have been ~1000 lines against an
      800-line cap; `hub.ts` re-exports the whole public surface, so the split is
      invisible to callers. The directory is `engine/`, not `hub/`, so there is
      never an ambiguous `hub.ts` vs `hub/index.ts`.*
      *`export { THREE }` **dropped** (PORT_PLAN step 5.2): `warp.ts` is a 2D
      canvas and needs none of it, and re-exporting would defeat tree-shaking.*
- [x] Type `Planet` and `HubApi`; type every export.
      *Plus `HubOptions`, `Composition`, `LabelPlacement`, `ScreenPoint`,
      `PlanetView`, `ShipView`, `Quality`, `PlanetFeature`, `SurfaceMode`.
      `Planet.id` **is** `PanelId` from `content.ts`, so the engine table and the
      router cannot drift apart, and `PLANETS` is a fixed 4-tuple so `byId()`'s
      fallback needs no undefined check. `window.__dgHub` / `__dg3dReady` are
      declared here since `HubApi` is; Phase 7 only assigns them.*
- [x] Delete `initPlanetBand` and the `href` field on `PLANETS` (multi-page leftovers).
      *Both gone; the `href` deletion is pinned by a unit test so it cannot creep back.*
- [x] Preserve exactly: `DAMP 0.08`, `AZ_LIMIT ±0.5`, hover scale `1.055`, 30 Hz raycast throttle, the 24 %-of-viewport park solve, bake sizes 640²/384² and 256²/160², DPR clamps, zero-allocation render loop.
      *All verified live, not just read: bakes measured at 640/256/512/192 (high)
      and 384/160/320/192 (low); stars 3200/1800; DPR 3 → 2 desktop, 3 → 1.5 at
      390×844; portrait FOV 62. The park solve lands on **0.2400** of viewport
      height against the prototype's 0.2399 — the same eased quantity, sampled a
      frame apart. Measure it after ~4 s: at 0.09/frame it is still visibly
      converging at 2.6 s (0.2529) and that is not drift.*
      *One deliberate structural change: `createPlanet()` returns resolved
      handles (`PlanetView`) instead of a bare `Group`. The prototype re-found
      the same children with `getObjectByName()` four times per planet per frame;
      the objects never change. Same scene, same output, four fewer traversals
      per frame — and it is what lets the loop index one array under
      `noUncheckedIndexedAccess` without a null-check on children that exist.*
- [x] Verify: hub renders, planets rotate, hover lights up, drag/scroll/arrows pan, azimuth persists across reload.
      *Driven in real Chromium (SwiftShader) against a temporary `engine-check.html`
      harness — deleted afterwards; `main.ts` still does not import the hub, which
      is Phase 7's wiring. Spin per planet matches `spin × dt` to 4 dp; hover eases
      scale → 1.055, aura → 0.5, rim 0.78 → 1.365, emissive → 0.07 and unwinds on
      exit; wheel, drag and arrows all pan and clamp at ±0.5; `pick()` hits all
      four bodies; `pause()` stops the loop dead and resumes; `dispose()` drops
      textures 11 → 1 and geometries 24 → 1 without throwing. Reduced motion is
      exact: spin ×0.08 (0.0452 → 0.0036 rad/s), zero camera bob, zero ship bob.*
      *Then **diffed against the prototype's own live hub** (`design/index.dc.html`
      exposes `__dgHub` too), same probe both sides: draw calls, drawable
      inventory, park fraction, azimuth, FOV, camera height and camera distance
      all identical. This is the check to repeat if the scene ever looks off.*
      *`azimuth persists across reload` **cannot be met by Phase 5** — it is
      `saveAzimuth`/`loadAzimuth` in `warp.js` (Phase 6), called by the router
      (Phase 7). Nothing in the engine reads or writes session storage. Carried
      to Phase 7's checklist rather than ticked here.*

**Two hardening changes, both deliberate:** `localStorage` is read inside
`try/catch`, not behind the prototype's `typeof localStorage !== 'undefined'` —
a sandboxed iframe *throws on property access*, which that guard does not cover,
and an exception there would take the scene down before it booted. And
`dispose()` bumps the flight token, so a launch or dock still driving its own
`requestAnimationFrame` chain stops instead of animating a disposed scene.

**Inherited, not drift — for Phase 11, not for Phase 5:**

1. **29 draw calls, against a ≤ 25 hard rule.** The prototype is also 29, from an
   identical scene graph. 26 drawables, plus 3: three.js draws a `transparent` +
   `DoubleSide` material in two passes, and there are three such objects — the
   XR planet's outer and inner rings, and the ship's exhaust trail. Per subsystem:
   ship 9, XR 7, backend 4, projects 4, about 3, stars 1, nebula 1. `forceSinglePass`
   on those three materials would give 26, still one over; the ship is a
   placeholder awaiting the glTF (Phase 9), which is where the rest would come
   from. **ASK** the owner before changing anything — both options alter how the
   rings read.
2. **`detectQuality()` puts every non-Chromium desktop on `low`.** `deviceMemory`
   is Chromium-only and the prototype's `|| 4` fallback then trips the `≤ 4`
   test. Faithfully ported and pinned by a unit test so it stays a decision.

**Verified:** `tsc --noEmit` clean; 40 unit tests green (17 existing + 23 new in
`tests/unit/engine.test.ts` — `byId()` and the `detectQuality()` tiers, which
Phase 10 lists but which are Phase 5's code); `vite build` unchanged at 2.69 kB
because nothing imports the hub yet. Built against a temporary second entry to
size the engine for real: **506.74 kB raw / 131.38 kB gzip** tree-shaken, so the
< 900 KB transfer budget has comfortable headroom.

## Phase 6 — Warp

- [x] `warp.ts` from `warp.js`. Keep `MIN_COVER 900`, `MAX_COVER 2200`, `HOLD_CAP 3400`, `ACCENTS`, the whole `Warp` class, `dispose()`, `saveAzimuth`/`loadAzimuth`.
      *All three durations, the `Warp` class surface (`cover`, `startHold`, `clear`,
      `fill`, `dispose`, plus the public readonly `canvas`/`accent`/`count`) and the
      `dg-az` session-storage pair carried over. Phase/geometry state is private —
      nothing outside the class reads it. `ACCENTS` is a `Readonly<Record<PanelId |
      'index', string>>`: five keys, `index` being the hub. The four destination
      values **restate** each planet's glow rather than importing it — `hub.ts` is
      the engine's single entry (Phase 5's rule) and importing it would drag three
      into a 2D module, while reaching around it into `engine/planets.ts` breaks
      that rule. A unit test pins the table equal to `PLANETS[].glow`, so the two
      cannot drift silently.*
- [x] Delete `writeLaunch`, `readLaunch`, `whenLoaded`, `bindDepartures` (dead multi-page handoff).
      *All four gone, along with the `dg-launch` sessionStorage key they shared. A
      test asserts none of the four names is exported.*
- [x] Confirm the streak field allocates no textures and nothing is built inside a click handler.
      *Mechanised, not eyeballed. The test's context stub **throws** on
      `createPattern`, `createImageData`, `getImageData`, `putImageData` and
      `drawImage`, and its document stub throws on `createElement`; a full
      `cover()` + `clear()` cycle is then driven frame by frame and every context
      call is asserted against an allow-list. Construction is asserted to issue
      exactly one context call (`setTransform`) and schedule zero frames, so the
      click that constructs a `Warp` does no work.*

**Three deliberate deviations, all documented in-file — do not "restore fidelity":**

1. **Streak colour is resolved at seed time, not rebuilt per frame.** It depends
   only on the tint and the accent, both fixed for a streak's life, so the output
   is byte-identical for ~460 fewer string builds per frame. Same move as Phase 5's
   resolved handles.
2. **`clear()` calls `start()`.** Only the animation resolves `clear()`'s promise,
   so a `clear()` with no loop behind it would hang its caller forever — and the
   router releases `_going` through there. A no-op on the normal path, where
   `cover()` has already started the loop.
3. **A `Warp` with no 2D context is inert** — phase `done`, one `console.warn`,
   `clear()` resolves immediately — instead of throwing, and `dispose()` sets
   `live = false` so a disposed instance stays disposed. Both exist so a jump can
   never dead-lock; the transition degrades to a cut.

Minor: the streak array is built by `push` rather than `new Array(count)` (holey
arrays are the slower element kind); the alpha early-out moved above the trig in
`paintStreaks` (pure math, identical output); `onClear` is nulled after resolving.

**Verified:** `tsc --noEmit` clean; **68 unit tests green across 4 files** — the
40 from Phase 5 and earlier, plus 28 new in `tests/unit/warp.test.ts`, which runs
with no DOM at all and stubs `requestAnimationFrame` by hand at 16 ms.

## Phase 7 — Router

- [x] `router.ts` from the prototype's logic class. `boot()` on `DOMContentLoaded`, dispose on `pagehide`, props → a `config` object (`composition`, `warpColor`, `parallax 0.10`, `showHud`).
      *`componentDidMount` split into `mount()` (DOM refs, delegated click,
      `popstate`/`hashchange` — everything that does not need the engine) and
      `boot(engine)`. Routing binds **before** the engine loads, so a hash change
      during the download is not lost. `main.ts` now calls `startRouter()`, which
      mounts on `DOMContentLoaded` and tears down on `pagehide` — `pagehide`
      rather than `unload`, which mobile Safari ignores and which blocks the
      back/forward cache everywhere else.*
      *The engine is a **dynamic** `import('./hub')`, as in the prototype. A
      device with no WebGL never downloads `three`: the entry is 20.90 kB and the
      hub chunk 506.23 kB / 131.18 kB gzip beside it.*
- [x] One delegated `click` handler for every `href="#…"`.
      *On `document`, so panel links, the text edition and the hub labels are one
      listener. Modified clicks (meta/ctrl/shift/non-primary) are left alone.*
- [x] `go(id)` pushes history **and** drives `jump()` directly.
- [x] `exit()` = `go(null)`. Never `history.back()`.
- [x] `jump()` stages: 380 ms ship head start → `cover()` → `commit()` at ~92 % opacity → `clear()`.
      *Head start is **520 ms**, not 380, and the ship's flight is 1700 ms, not
      1150 — those are the prototype's numbers (`setTimeout(run, 520)`,
      `launch(target, 1700)`); 1150 is the **dock** duration, which README and
      ACCEPTANCE appear to have conflated. Prototype wins per CLAUDE.md. Worth
      the owner's eye when the motion baselines get measured (Phase 0).*
      *`COVER` is imported as `MIN_COVER` rather than restated. `CLEAR` is 950,
      passed to `clear()` explicitly so the watchdog cannot disagree with it.*
- [x] `finish()` idempotent + jump token + watchdog at `COVER + CLEAR + 700`.
- [x] Input gated on `current` only.
- [x] Both canvas nav paths into one deduped `nav()`.
- [x] `_pending` queues overlapping jumps.
- [x] `park()` / `unpark()` / `returnShip()` wired; ~~scroll-driven parallax at `config.parallax`~~.
      *Park, unpark and the reduced-motion `returnShip()` are wired. **The
      parallax is not, and that is the prototype's own decision, not drift.**
      README "Parked scene" describes a sine wander plus a `scrollTop` offset at
      `config.parallax`, and the prototype still carries the prop — but it
      removed both behaviours and said so in its comments ("no drift, no scroll
      parallax", "panel scroll no longer drives the camera"). Its `scroll`
      listener only assigns `scrollK = 0`. Ported as: `config.parallax` kept as
      the knob, the panel `scroll` listener **not** registered (an empty one
      lies about what happens), and the reasoning recorded in `startDrift()`.
      **ASK** the owner whether the README or the prototype is what ships.*
- [x] Deep link `/#xr` → panel open, camera parked, no warp.
- [x] Escape and every `[data-exit]` return to the hub.
- [x] Azimuth persists across reload — `saveAzimuth`/`loadAzimuth` (Phase 6) wired
      from the router. Carried down from Phase 5's checklist: the engine holds no
      session storage of its own, so this cannot be verified before Phase 6 + 7.
      *Restored instantly on boot, before the deep-link branch. Saved from
      `destroy()` **and** on `visibilitychange → hidden`, because a backgrounded
      mobile tab may be killed without ever firing `pagehide`. What is banked is
      the **hub** angle, not the parked one — a panel is holding its planet's
      `theta`, which is not where the visitor left the camera.*

**Two deliberate departures from the prototype's structure:**

1. **`labels.ts`.** `placeLabels` and the presentation half of `setHover` are
   not routing, so they moved to a `LabelLayer`. The router keeps `hovered`,
   because the hub has to be told about it too and that value needs one owner.
   The prototype's `HOVER_TINT` table of four hexes went with it — those are
   exactly `--accent-hover`, which every anchor already resolves through its own
   `data-planet`, so the layer writes the custom property instead. Same rendered
   colour, one fewer place for the accents to drift, and no magic hexes in JS.
2. **Hover comes back through the engine.** The prototype kept its own 33 ms
   raycast throttle in `pointermove`; the hub already has one (`rayThrottled`),
   so the router calls that and takes the result via the `onHover` callback.
   One throttle, one place `hovered` is written, and the DOM tint can no longer
   disagree with the scene's own hover state.

Minor: the projected screen slot is now on the public engine type
(`HubPlanet`, `HubApi.planets`) rather than engine-private. It was already
handed out every frame through `onLabels`; naming it lets the e2e helpers read
planet positions against real types instead of a hand-written shape.

**ASK — the quality button does not toggle anything.** README says it "both
reports fps and toggles the quality tier"; the prototype only ever wrote its
label, and this port does the same. A live toggle is not possible under the
one-renderer-per-document rule — the tier is chosen at `initHub()` and changing
it means re-initialising, which is forbidden. `setQuality()` already persists to
`localStorage` and `detectQuality()` honours it, so the only honest wiring is
*click → store the other tier → reload the page*. Owner's call: leave it as a
readout (and drop the `<button>` for a `<span>`, since a button that does
nothing is a genuine a11y defect), or accept the reload.

**Verified:** `tsc --noEmit` clean; 68 unit tests still green; **31 Playwright
tests green across three consecutive full runs** at 2 and 4 workers. Build:
entry 20.90 kB, hub chunk 506.23 kB (131.18 kB gzip), CSS 15.82 kB, HTML
21.60 kB — comfortably inside the 900 KB transfer budget.

## Phase 8 — Fallbacks

**The organising change: the flat text edition is now a state the *document*
ships in, not one the router assembles.** `index.html` carries
`data-dg-flat="1"` on `<html>` and the head probe removes it — before first
paint — only when it has just confirmed WebGL. Everything else follows from
that: with JS off, with no WebGL, with the engine chunk unreachable, or after a
lost context, the page is laid out correctly by CSS alone, and `flatten()` is
left with the small job of undoing what the *3D* path wrote. It is the same rule
the probe already followed, applied one level further out: the text edition is
the default state and the scene is the thing that has to prove itself.

- [x] Reduced motion: no drift/bob/parallax, ambient ~0, grain off, 200 ms cross-fade instead of the flight.
      *Drift/bob/parallax and the ~0 ambient rotation were already exact in the
      engine (Phase 5, measured: spin ×0.08 → 0.0036 rad/s, zero camera bob,
      zero ship bob) and there is no parallax to suppress (Phase 7). Grain is
      the CSS rule carried over verbatim. **The cross-fade is new, and it is the
      one place the spec beats the prototype:** the prototype's reduce path is a
      bare `commit()` — no flight, no warp, and no fade either — but README
      "Reduced motion", CLAUDE.md's accessibility rules and ACCEPTANCE E all ask
      for 200 ms, and accessibility here is a functional requirement, not
      polish. It is not drift and it is not a prototype behaviour that was
      "removed on purpose" like the parallax was; the prototype simply never
      wrote it.*
      *It lands as CSS, inside the `prefers-reduced-motion` block:
      `.panel { transition: opacity 200ms ease, visibility 200ms ease }`, driven
      by the same inline visibility/opacity `commit()` has always written. No
      second timeline in the router that could disagree with the stylesheet, and
      the warp path is untouched because the rule only exists under reduce.
      `visibility` is transitioned deliberately — it is a discrete property, so
      the outgoing panel holds `visible` for the full 200 ms and only then
      flips, which is what makes it a cross-fade rather than a cut.*
      *One fix on the way past: `hideReticle()` moved above the reduce branch in
      `jump()`. It used to sit below, so the reduced-motion path left the
      reticle floating over the open panel.*
- [x] `webglcontextlost` restores the text edition.
      *The engine's half shrank to what is genuinely its own: `preventDefault()`,
      cancel the loop, pause, clear `__dg3dReady`, then raise a new
      `onContextLost` option. It no longer touches `#fallback`, `#labels` or
      `data-dg-3d` — the router's `flatten()` writes that DOM, and with both of
      them writing it they were two owners of one restore. With no handler
      supplied the engine warns rather than blanking silently.*
      *The renderer is **not** disposed on context loss — one renderer per
      document, disposed only from `destroy()` on `pagehide` (CLAUDE.md), and a
      canvas that has lost its context cannot be given another anyway. Pinned by
      a test.*
      *`boot()`'s fade-out timer now checks `flat` before hiding `#fallback`: a
      context lost inside that 420 ms window would otherwise have had the stale
      timer hide the text edition that had just been handed back.*
- [x] `flatten()` produces one continuous scrolling document with heroes removed.
      *Rewritten around the shipped-flat default. The presentation moved
      wholesale into `html[data-dg-flat]` in `styles.css` — including `#stage`
      and `#smoke` hidden and `#fallback` unpinned, which used to be inline
      writes and therefore invisible to a no-JS visitor. What is left in the
      router is clearing the inline styles the 3D path wrote (the `#fallback`
      fade, the panels' visibility/opacity) and standing routing down: drift
      loop cancelled, watchdog cleared, live `Warp` disposed, `going` released.
      It is idempotent now, because context loss can fire twice.*
      *The re-id trick is **gone**. `flatten()` used to rename `panel-xr` → `xr`
      so hashes would scroll, which no-JS never gets and which also fought the
      `#panel-{id}` DOM contract in PORT_PLAN step 2. Each panel instead carries
      a zero-height `<span id="xr" class="panel__anchor">` as its first child:
      one static target that resolves in every edition, inert while routing
      (`display: block; height: 0` generates no line box, so it cannot shift the
      sticky bar below it). A unit test walks every `href="#…"` in the markup and
      fails on any that names an id the document does not contain.*
      *Mid-session loss scrolls the open panel into view — the visitor was
      reading XR and should still be looking at XR.*
- [x] Print: whole CV prints as one document, no scene, no bars, no heroes.
      *Two additions to the block that was carried over verbatim, both real
      defects rather than tidying. `#stage` is now hidden: the prototype hides
      `#scene` but not its container, and the rest of the hub layer — labels,
      header, foot, hint — is `position: fixed`, so printing from the hub
      stamped all of it across page one of the CV. And `html[data-dg-flat] body`
      outranks the print block's bare `body`, so printing the text edition kept
      `overflow: auto`; it is forced back to `visible` for both editions.*
- [x] JS disabled: the text edition is complete and navigable.
      *This did not work before and could not have: with no JS nothing set
      `data-dg-flat`, so every panel stayed `visibility: hidden` behind a fixed
      `#fallback` whose four cards pointed at ids that did not exist. Now the
      document ships flat and the anchors are static, so the whole CV is one
      scrolling document and all nine in-page links resolve natively. Driven in
      Playwright with `javaScriptEnabled: false`, not simulated.*

**Also landed here, because the no-WebGL path went through it:** `mount()` reads
`data-dg-3d` off `<html>` and flattens immediately when it is absent, instead of
importing the engine and asking `hasWebGL()` afterwards. That makes Phase 7's
claim — "a device with no WebGL never downloads `three`" — actually true; it was
downloading all 506 kB and then discarding it. It also closes the window in
which the router intercepted every hash link and dropped it (no hub to jump
with) while that download was in flight. `boot()` still re-checks with the
engine's own `hasWebGL()`, which is the stricter test.

**Verified:** `tsc --noEmit` clean; **76 unit tests green** (68 + 8 new in
`tests/unit/fallback-markup.test.ts`, which pins the no-JS contract in the
served bytes: the shipped attribute, the probe removing it only on the success
path, an anchor per destination, no dangling `href="#…"`, and the flat/print
rules living in CSS). **45 Playwright tests green across two consecutive full
runs**, at 4 and at 2 workers — the 31 from Phase 7 plus `fallback.spec.ts` (7),
`reduced-motion.spec.ts` (4) and `print.spec.ts` (3). Build: HTML 23.04 kB, CSS
16.14 kB, entry 21.24 kB, hub chunk 506.16 kB = **566.58 kB raw / 147.31 kB
gzip**.

## Phase 9 — Assets

- [x] `public/cv.pdf`, `public/og.png` (placeholders from `assets/`).
      *Copied byte-for-byte; `.gitattributes` already marks both binary, so
      neither churns. `public/` is Vite's default `publicDir`, so the files are
      served from the root in dev and copied to `dist/` verbatim on build — the
      markup's relative `href="cv.pdf"` therefore resolves identically in both,
      and under a hash, without a leading slash anywhere.*
      *Neither file is fetched by the page: `og.png` is read by crawlers and
      `cv.pdf` only when a visitor asks for it. They add 813 kB to `dist/` and
      **nothing** to the cold-load transfer — see the re-measure below, and do
      not let `dist/`'s total on disk be mistaken for the budget.*
- [x] `robots.txt` + `sitemap.xml`: `https://example.com` → `https://golosov-danylo.com`.
      *Both were still on the placeholder domain in the handoff bundle, which is
      the last thing in ACCEPTANCE G left to satisfy. The sitemap carries
      **exactly one** URL: destinations are `/#xr`, and a fragment is not a
      separate URL to a crawler, so per-destination entries would be four claims
      about one page. Pinned, along with the sitemap `<loc>` being byte-identical
      to the canonical `<link>` — trailing slash included, since those two
      disagreeing is the classic duplicate-URL own goal.*
- [x] `public/models/README.md` kept for the future glTF. Ship the primitive placeholder ship as-is.
      *The **Expected glTF** table is verbatim from `assets/models-README.md` —
      it is the contract with whoever makes the model. The rest is corrected to
      this port, and that is not tidying: it told the reader to edit
      `space-engine.js` (does not exist here — it is `src/engine/ship.ts`) and to
      hang the two glow meshes off `group.userData`, which Phase 5 replaced with
      typed `ShipView` fields that `hub.ts` reads directly. Following it as
      written would not have worked. Added: the served path, and the fact that
      `hub.ts` parents the exhaust `trail` to the ship group, so a swap has to
      re-parent it.*
      *Note it is publicly reachable at `/models/README.md`. Nothing sensitive,
      and it is what PORT_PLAN step 9 asks for.*
- [x] ~~A favicon.~~ **ASK resolved — the owner chose the inline SVG data URI.**
      *A `<link rel="icon">` in `<head>` holding a `data:image/svg+xml` URI: no
      file, no request, and it cannot 404. A 7-radius disc of `--ember` on a 32²
      of `--void` — the ship's engine glow, square because radii are 0
      everywhere but the quality button and the reticle. Placeholder mark; the
      owner replaces it with real branding.*
      *Two encoding traps, both pinned by tests rather than trusted: `#` must be
      `%23` or the URI truncates at the fragment and the tab silently goes
      blank, and spaces are `%20` so the value is a strictly legal URL. The
      colours are asserted **against `styles.css`**, not restated, so the mark
      cannot drift from the palette. Safari ignores SVG data-URI icons — it
      shows no icon there, but also no 404, which was the defect.*

**Verified:** `tsc --noEmit` clean; **89 unit tests green** (76 + 13 new in
`tests/unit/site-files.test.ts`); **50 Playwright tests green** (45 + 5 new in
`tests/e2e/assets.spec.ts`) across two consecutive full runs at 4 workers, plus
a 45-test run with the new spec excluded to attribute the flake below, and a
50-test run at 2 workers. Build re-measured with `public/` in place: HTML 23.92 kB, CSS
16.14 kB, entry 21.20 kB, hub chunk 506.16 kB = **567.42 kB raw / 147.79 kB
gzip** cold load, unchanged but for the ~0.9 kB of head the favicon adds. The
813 kB in `public/` sits outside that.

**A harness fact worth not rediscovering.** The suite is now 50 tests, and the
slowest — `dead-input`'s "the camera still pans after a full tour" — runs within
seconds of the 60 s timeout *even with the machine to itself* (57.8 s measured).
Adding five tests to the pool was enough to starve the neighbourhood: 3 failed at
the default 6 workers and 2 at 4, while every one of them passed in isolation and
all 50 passed at 2. The failures read as router bugs — a label that never
appears, "planet is not fully on screen" — and none of them were.

Two changes, and it took both:

1. **The new spec no longer competes for the GPU.** It boots no hub and loads
   with `waitUntil: 'domcontentloaded'`, because every claim in it is about
   served bytes or URL resolution and neither involves the engine. Its slowest
   test went 9.2 s → 1.1 s. **Before adding an e2e test, check whether it needs
   `openHub()` — most do not.**
2. **`queueing`'s three-click test no longer reads planet positions at click
   time.** It captures all three points from the hub at rest and then clicks
   fixed coordinates. Reading them live made it depend on the camera still
   framing each planet several round-trips later, which it does not: the first
   click launches the ship and, on commit, parks the camera. The 120 ms waits
   are wall-clock, but a `mouse.click` plus an `evaluate` under four workers on
   a software rasteriser costs much more, so the third read could land after the
   park. Fixed coordinates are also the truer model — someone clicking three
   times in half a second clicks where the planets *were*.

Change 1 alone was not enough; the next 4-worker run still lost that test. This
is the general shape of the trap, and it is worth stating plainly: **anything
that reads a live scene position and then acts on it is racing the engine.**
`waitForPanel` and `settledAzimuth` exist for the same reason. The router is
untouched by either change.

## Phase 10 — Tests

- [x] Vitest: `hashId()`, ~~`byId()`~~, ~~`detectQuality()` tiers~~, `finish()` token/idempotency.
      *`byId()` and the `detectQuality()` tiers landed with Phase 5 in
      `tests/unit/engine.test.ts` — they are Phase 5's code, and they also pin the
      `href` deletion and the non-Chromium `low` tier.*
      *The two remaining ones needed a seam, which PORT_PLAN step 11 anticipated
      ("pure, extract it if needed"). Two small extractions; no behaviour moved:*
      1. *`parseHash()` is now an exported pure function in `router.ts`, and
         `hashId()` is that plus "and this document actually carries that panel".
         9 tests in `tests/unit/router.test.ts`, mostly about what has to land on
         the hub rather than open something: `#`, `#/xr`, `#XR`, `#xrq`,
         `#panel-xr`, `#xr?utm_source=…`. There is no error route on a
         single-document site.*
      2. *`src/jump-guard.ts` states the two rules `finish()` is built on — the
         commit runs exactly once per jump, and a superseded jump can no longer
         settle — with `jump()` composing them from a `commit` and a `settle`
         step. 9 tests, each a state this transition genuinely reaches and which
         needs a stalled promise and precise timing to set up in a browser.*
- [x] Playwright: the suite in `ACCEPTANCE.md`.
      *Group **C is complete** and part of B, landed with Phase 7:
      `routing`, `exit`, `dead-input`, `resilience`, `queueing`, `session` —
      31 tests. Phase 8 added `fallback`, `reduced-motion` and `print` — 14 more,
      covering the rest of E and all of F. Phase 10 adds `keyboard` (3),
      `visual` (16) and `budget` (4), plus one more in `resilience`: **74 tests**.*
      *Harness notes, so they are not rediscovered: `playwright.config.ts` now
      resolves the newest **installed** Chromium rather than the exact build
      `@playwright/test` pins (this machine has 1217, not the pinned one), and
      launches with the SwiftShader flags — headless has no GPU, so without them
      every test falls through to the text edition. Software WebGL runs at
      roughly 22 fps, which is why `tests/e2e/helpers.ts` waits on **state**
      (`waitForPanel`) and samples eased values across **real animation frames**
      (`settledAzimuth`) instead of on wall-clock timers. Fixed waits flake here,
      and they flake in a way that reads as a router bug.*
      *`vite.config.ts` gained a `test.include` for `tests/unit` — the e2e specs
      match Vitest's default glob, so `npm test` was collecting Playwright files
      and reporting failing suites that had never run.*
- [x] Build-artifact test: no `{{` in `dist/` once real copy lands (skip while tokens are intentional).
      *`tests/unit/build-artifact.test.ts` **builds the site itself**, into a
      temp directory, in `beforeAll` — about 2 s — rather than reading whatever
      happens to be in `dist/`. A test that measures a stale build, or skips
      because nobody ran one, cannot fail, and this is the file standing between
      the transfer budget and a dependency added on a Friday. 13 assertions live
      plus the skipped one: the cold load's exact file list, the 900 KB gzip
      budget, a no-WebGL load coming in under the hub chunk alone, ACCEPTANCE G's
      "must not ship" strings read off the emitted bytes (`<x-dc>`, `<helmet>`,
      `support.js`, `style-hover`, `{<!---->{`, `example.com`, any three CDN
      URL), and no composer or pass anywhere in the JS.*
      *The `{{` test is skipped **with its reason in the test body**: every value
      in `content.ts` is still its own literal token, so it would fail for the
      wrong reason today. Its complement runs — the built HTML carries the tokens,
      which is what proves the copy is in the bytes a crawler reads rather than
      applied by a script.*

**The three new specs, and why two of them boot no hub.**

- **`keyboard.spec.ts`** — ACCEPTANCE E's keyboard path, which matters more than
  its size suggests: both canvases are `aria-hidden`, so those four anchors are
  the *entire* navigation surface for a keyboard or a screen reader. Tab order
  over the four labels then the two hub controls; the `outline-offset: 6px` ring
  (the ring itself is the browser's own `:focus-visible`, deliberately not
  restyled); focus taking the same treatment as hover — name warms to
  `--accent-hover`, leader 26 → 40 px; the camera swinging to a focused planet;
  Enter launching. Three boots, not six — every claim about the resting hub
  shares one.
- **`visual.spec.ts`** — ACCEPTANCE A at 1440/1024/768/390. **Not screenshot
  comparison, and that is a decision rather than a shortcut.** Golden images want
  a still frame; this page has a camera that sways forever, grain animating in
  four steps a second, and type from a CDN, so a baseline would encode this
  machine's rasteriser and this run's network. Phase 3 already did the pixel diff
  against the served prototype at these four widths, plus a computed-style parity
  walk over 314 nodes × 3 states — these 16 tests re-assert *that measurement's
  numbers*, and they name the value that moved when they fail. The strongest are
  the two sweeps over every rendered element: three font families and no more,
  Bodoni always weight 400, `border-radius: 0` everywhere but the 2 px quality
  button and the circular reticle, and **no shadow anywhere** — both editions.
- **`budget.spec.ts`** — ACCEPTANCE D's runtime half: draw calls, the DPR clamps,
  "baked once", and what the loop does while nobody is looking. The transfer half
  is the build-artifact test above; bytes measured off the dev server, which
  ships unbundled modules, would mean nothing.

`visual.spec.ts` boots no hub at all. It replaces `main.ts` with an empty module,
which leaves the head probe's `data-dg-3d` on `<html>` — so the panels are laid
out as the fixed overlays they are at runtime — and reveals one by writing the
same `visibility`/`opacity` pair `commit()` writes. Their presentation is CSS;
the router's only contribution to it is that pair, and `routing.spec.ts` and
`print.spec.ts` already prove the router writes it. All 16 run in **9 s** with no
GPU, against roughly 4 s for a single hub boot.

**Measured while writing `budget.spec.ts`:** 29 draw calls, DPR 3 → 2 on desktop
and → 1.5 at 390×844, 11 textures and 24 geometries, none of which move across an
8 s idle. Identical to Phase 5's live measurements, which is the point of pinning
them. `deviceScaleFactor: 3` is set deliberately — at the default of 1 the clamps
never bind and the assertion would pass on a renderer that had dropped them.

**Two findings for the owner, neither of them drift:**

1. **The renderer does not pause under an opaque warp cover.** CLAUDE.md
   "Performance" and ACCEPTANCE D both say it should; the router only ever calls
   `hub.pause()` from `visibilitychange`. **The prototype is the same** — its one
   `pause()` call is `this.onVis = () => this.hub.pause(document.hidden)` — so
   this was never built rather than lost in the port. It is also not free to add:
   the park solve eases over frames, so a renderer stopped under the cover would
   lift it onto a camera that had not moved yet. `budget.spec.ts` pins what is
   true — pauses on `visibilitychange`, keeps rendering while parked behind a
   panel — and the rest is an **ASK**.
2. **The `finish()` token check cannot be caught from a browser.** An e2e test
   was written for it and it passed with the check deleted. The reason is worth
   keeping: a jump has three independent ways to land (`onOpaque`, the `clear()`
   promise, its watchdog), so a stale `finish()` running against the live jump
   does the cleanup that jump was about to do anyway, and the end state
   converges. The damage is real but internal — an early `going = false` and an
   early `drainPending()`, which is how two jumps come to interleave. The
   contract is therefore pinned in `tests/unit/jump-guard.test.ts`, which *does*
   fail on that deletion, and the e2e test was rewritten to claim only what it
   proves: the stalled-then-superseded sequence does not wedge the router. A test
   that cannot fail is worse than no test; it was rewritten rather than kept for
   the count.

**One deliberate ordering change in `jump()`,** from moving the teardown into the
guard's `settle` step: `clearTimeout(this.watchdog)` now runs *after* the commit
rather than before. On every reachable path the two are identical. Where they
differ the new order is strictly better — a commit that threw used to leave
`going` set with the watchdog already cancelled, which is a permanent wedge;
now the watchdog survives to release it.

**One knock-on in the unit suite, worth knowing about.** `npm test` now runs a
`vite build`, and Vitest runs files in parallel workers — so that build competes
with whatever else is running. It surfaced a latent cost in `warp.test.ts`'s
"draws streaks without ever asking for a texture": 1200 ms of frames is ~75
frames of ~460 streaks, and the test ran an `expect()` per recorded context call,
so tens of thousands of assertions took 7.7 s against Vitest's 5 s default
timeout on a loaded machine. It now reduces to the distinct call names and
asserts once — the same claim, and the failure names the disallowed call instead
of the first one it reached. The whole unit suite got faster.

**And the harness trap repeated itself, exactly as Phase 9 predicted it would.**
Adding 24 tests to the pool broke `session.spec.ts`'s "the hub camera angle
survives a reload" — green at four workers, red at two, and reading like a
router bug ("restored -0.139, expected -0.298"). It was not one. The test read
`__dgHub.azimuth` over a round trip after the reload, and the **first-load
hint** — the ~10° swing at 900 ms that only an already-interacting visitor
cancels — had time to start, so the reading was a number easing toward
`HINT_AZIMUTH`. It now captures the angle *inside the page*, on the first frame
after boot, roughly 900 ms ahead of the hint. Same family as Phase 9's
three-click fix, and worth restating: **anything that reads a live scene value
after a round trip is racing the engine.** Nothing in the router changed.

**Verified:** `tsc --noEmit` clean; **120 unit tests green** (89 + 9 `router`,
9 `jump-guard`, 13 `build-artifact`) plus the one deliberately skipped `{{` test,
and the whole suite still runs in under 2 s *including* the production build;
**74 Playwright tests green** across three consecutive full runs — two at 4
workers, one at 2 — in 4.8 minutes at 4 and 5.8 at 2. The slowest are still the
ones that walk the whole site: `dead-input`'s tour, and `session`'s pair, the
worse of which measured 44.7 s against the 60 s timeout before the fix above and
27 s after it. Build: HTML 23.92 + CSS 16.14 + entry 21.44 + hub 506.16 =
**567.66 kB raw**, the 0.24 kB being the guard and its comments. The artifact
test measures the cold load at **144.4 kB gzip** against the 900 KB budget, of
which the hub chunk is 131.2 — Vite's own banner says 147.8 for the same files,
because it gzips at a different level. Either number has the same headroom;
`du dist/` says 1351.5 kB and is, as ever, not the budget.

## Phase 11 — Budget & ship

- [ ] `vite build`; total transfer < 900 KB. `three` minified and tree-shaken.
      *Re-measured with the router landed: HTML 21.60 kB + CSS 15.82 kB + entry
      20.90 kB + hub chunk 506.23 kB = **564.55 kB raw**, 146.67 kB gzip. The
      hub is a separate chunk because the router imports it dynamically, so a
      no-WebGL device pays 58 kB, not 565. Re-check after Phase 9's assets.*
      *Re-checked with Phase 9 landed: **567.42 kB raw / 147.79 kB gzip**, the
      difference being the favicon's ~0.9 kB of head. `public/` adds 813 kB to
      `dist/` (`og.png` 705, `cv.pdf` 108) but **none** of it to a cold load —
      the page references neither. Measure the budget from what the document
      actually fetches, not from `du dist/`.*
      *Both of those are now assertions rather than notes —
      `tests/unit/build-artifact.test.ts` builds and measures on every `npm test`,
      including the one that fails if `dist/`'s weight on disk is ever mistaken
      for the budget.*
- [x] `renderer.info.render.calls` ≤ 25 in the hub. **ASK answered — bring it to
      25.** It was **29**, and 29 in the prototype too, so this budget had never
      been met. Three transparent double-sided materials (XR's two rings, the
      ship's trail) each cost two passes; `forceSinglePass` on all three took it
      to 26. The last one came off the ship: `body` (capsule) and `nose` (cone)
      always shared the `hull` material, so they merge into one geometry with
      their transforms baked in the order a mesh applies them. That is
      pixel-identical and unconditional — 25 at rest, parked, and mid-launch.
      *The rings are the visible cost. A/B'd on a parked XR at 1440 with only the
      flag changing: full sweep on both sides of the planet, slightly less
      density, most visible on the arc crossing the planet's face. Owner accepted
      it. The rings reading lighter than `design/` is now correct, not a porting
      error.*
      *`budget.spec.ts` asserts the resting desktop hub is **exactly** 25 — a
      floor as well as a ceiling, so a drawable going missing fails too. The
      phone and parked-panel readings stay ceilings; different quality tier,
      different camera.*
- [x] **ASK** — should the renderer pause under an opaque warp cover? → **No.
      Amend the docs; do not implement.** CLAUDE.md, ACCEPTANCE D and README all
      claimed it did; neither this port nor the prototype has ever done it.
      Adding it means the park solve, which eases over frames, has to be made
      instant, or the cover lifts onto a camera that has not moved — and that
      motion is the thing the cover exists to hide. All three documents now say
      what the code does and why, so it cannot be re-derived as a bug.
- [ ] DPR clamps verified on a real phone.
      *Clamped correctly in Chromium at `deviceScaleFactor: 3` — 2 desktop,
      1.5 at 390×844, pinned in `budget.spec.ts`. A real handset is still the
      check that counts.*
- [x] Lighthouse a11y pass; axe clean on hub + all four panels + the text edition.
      *`@axe-core/playwright` added; `tests/e2e/a11y.spec.ts` scans all six
      documents on the WCAG 2.0/2.1 A and AA tags with nothing disabled.
      Lighthouse accessibility is **100** against `vite preview`.*
      *The text edition is scanned by denying WebGL rather than by disabling JS:
      axe-core runs inside the page, so with JS off there is nothing to run it.
      Same `html[data-dg-flat]` document either way — the no-JS route is covered
      structurally, without axe, by `fallback.spec.ts`.*
      *Found and fixed: the Esc hint at 3.33:1, under the 4.5:1 floor. It is the
      only place the site advertises how to close a panel from the keyboard.*
      *`blockWebGL()` now lives in `tests/e2e/helpers.ts`. Five specs
      (`fallback`, `visual`, `print`, `loading`, `cursor`) still carry their own
      copy from before it was shared; they can adopt it when next touched — not
      rewritten here, mid-ship, for no functional gain.*
- [x] Deploy `dist/` (host per Phase 0 ASK). **ASK answered — GitHub Pages**,
      apex `golosov-danylo.com`. `.github/workflows/deploy.yml` builds on push to
      `master` and publishes `dist/`; `public/CNAME` carries the domain into the
      artifact, which is what stops a deploy from clearing it. `base` stays `/` —
      correct for an apex domain, and a project-path base would break every asset
      URL. `public/robots.txt` and `public/sitemap.xml` already named the apex
      domain, so nothing else moved.
      *The gate is `npm test` + `npm run build`, not Playwright. `npm test`
      builds into a temp directory and asserts the transfer budget itself, so the
      budget is CI-enforced; the e2e suite needs `--workers=3` to be trustworthy
      and would put six minutes on every push.*
      *Known cost of this host: **GitHub Pages serves no custom headers**, so
      `Cache-Control` cannot be tuned. Vite's content-hashed asset names still
      cache well and `index.html` gets Pages' short default TTL. This is the
      price of the choice, not a defect to go hunting for later.*

## Owner's pre-launch list (not the developer's)

- [ ] Point apex DNS at GitHub Pages: `A` → 185.199.108–111.153, plus the `AAAA`
      records, then *Settings → Pages → Enforce HTTPS* once the cert issues.
      Nobody but the owner has the registrar.
- [ ] Fill every `{{TOKEN}}`, including the ones in the content table.
- [ ] Final `cv.pdf`.
- [ ] Regenerate `og.png` with the real name and role.
- [ ] Supply the ship glTF (later milestone).
