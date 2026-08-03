# Tasks

The port is complete; this is its record. Phase headings are cited by number from
`src/router.ts`, several e2e specs and `public/models/README.md` — **don't
renumber them.** Each phase below keeps the decisions that still constrain the
code and drops the blow-by-blow, which is in git history.

Build order and the DOM contract are in `PORT_PLAN.md`. Invariants are in
`CLAUDE.md`. Measurements are in `design/DESIGN_SPEC.md`.

---

## Outstanding

- [ ] **DPR clamps verified on a real phone.** Correct in Chromium at
      `deviceScaleFactor: 3` — 2 desktop, 1.5 at 390×844, pinned in
      `budget.spec.ts`. A real handset is still the check that counts, and Phase
      13 widened what it should cover: scrolling a panel from its hero, tapping a
      planet, dragging to pan, and rotating to landscape.
- [ ] **ASK — the planet arc is wider than a phone screen.** At 375px the
      outermost labels sit off both edges at rest. Phase 13 made every
      destination *reachable* (the swing limit widens to 0.9 rad on a narrow
      viewport, and `mobile.spec.ts` sweeps the range to prove all four come
      fully into frame), but fitting all four at rest needs the camera pulled
      back or the arc narrowed on small viewports — a change to the hub's
      composition and to the parked-planet solve tuned against it. **Owner's
      call**; not taken unilaterally.

### Owner's pre-launch list (not the developer's)

- [ ] Fill every `{{TOKEN}}` in `src/content.ts`.
- [ ] Final `cv.pdf`.
- [ ] Regenerate `og.png` with the real name and role.
- [ ] Supply the ship glTF (later milestone) — contract in `public/models/README.md`.
- [ ] **If an apex domain is ever registered:** point DNS at Pages (`A` →
      185.199.108–111.153, plus the `AAAA` records), enable *Settings → Pages →
      Enforce HTTPS*, then restore `public/CNAME`, set `base` back to `/` in
      `vite.config.ts`, and update the origin in `index.html`, `src/content.ts`,
      `public/robots.txt`, `public/sitemap.xml` and the two tests that pin it.
      The site currently ships as a **project** site at
      `wallerthedeveloper.github.io/personal-website/` — see Phase 12.

---

## Phase 0 — Orientation

The prototype was served and driven through a Playwright harness on the same
SwiftShader Chromium the suite uses, so the baselines below are measurements, not
readings of its source. **The port matches all of them:** 29 draw calls (now 25 —
Phase 11), 11 textures, 24 geometries at 1440; `devicePixelRatio` 3 → renderer 2
desktop and 1.5 at 390×844, where the tier is `low` and FOV 62; arrow-key
hammering approaches the ±0.5 clamp asymptotically rather than snapping; Escape
and Back both land on the **hub**; two clicks 150 ms apart end with exactly one
panel visible; at 6× CPU throttling the hub boots in 4.0 s and a click still
routes cleanly.

Three measurements settled open questions:

1. **The transition is 520 / 1700, not 380 / 1150.** `hub.launch('xr', 1700)`
   fires 25 ms after the click and `#smoke` is shown at 557 ms — a ~532 ms head
   start. 1150 is the **dock** duration, which the handoff docs conflated with
   the flight.
2. **There is no scroll parallax.** With a panel open the camera is a function of
   *time*, not `scrollTop`: drift over ~90 idle frames (Δx −0.123) exceeds the
   change across a full top→bottom scroll (Δx −0.0723), and returning `scrollTop`
   to 0 does not return the camera. The prototype's scroll listener assigns
   `scrollK = 0` under a stale comment. See Phase 7.
3. **The quality button was inert.** Clicking it left `quality: high`, the pixel
   ratio unchanged and `localStorage` untouched; only the live fps figure in its
   own label moved. Resolved in Phase 7 — it is a readout now, which is why
   `keyboard.spec.ts` no longer expects a sixth tab stop or an Enter handler.

Owner decisions taken here: **hash routes** (sitemap keeps one URL), **one typed
`src/content.ts`**, and **Umami** for analytics (overriding the handoff's "none
included").

Two statements in `design/BUILD_NOTES.md` are superseded and must not be
followed: self-hosting the fonts, and the five-entry Rollup config.

## Phase 1 — Scaffold

Hand-written rather than scaffolded — the directory already held the handoff
docs and Vite's scaffolder offers to wipe it. `vitest` is on 4.x deliberately:
2.x nests an old `vite`/`esbuild` pair carrying a dev-server advisory.
`.gitattributes` sets `eol=lf` so the prototype does not churn on Windows.

## Phase 2 — Markup

Prototype lines 65–482 carried over by script rather than retyped. `lang="en"`
added — the prototype had none and axe requires it. 109 `{<!---->{` escapes
converted; 115 tokens in the document, 104 distinct. The full DOM contract
verified present, and re-checked against `dist/index.html` after a build.

## Phase 3 — Styles

312 style attributes over 125 distinct values, converted through an exact-match
table asserted against both counts so a missed mapping aborted rather than
silently landing. All 65 `style-hover` / `style-before` attributes deleted, then
verified by forcing `:hover` through CDP on every control and diffing computed
colours against the prototype — 47 controls, 46 of which change, all matching.

Every colour is a token, including named tokens for the ~25 one-off inline values
(`--ink-hub`, `--meta-2`, `--marker-xr`, `--violet-soft`, …). `--intro-te`
`#b6b7c8` and `--intro-bio` `#b6b7c9` differ by one digit in the prototype and
are kept distinct rather than "tidied".

Pixel diff over 8 states × 4 widths: hub pixel-identical at 1440/1024/768,
everything else ≤ 0.15 %, entirely on glyph rows of `{{TOKEN}}` text. A
computed-style parity walk over 314 nodes × 3 states × 4 widths surfaced three
classes of difference, all explained: sub-pixel kerning around the prototype's
split brace pair, its React runtime truncating the grain data URI, and esbuild
dropping a redundant final gradient stop.

## Phase 4 — Content plumbing

112 tokens: the 104 the markup renders plus 8 project URLs that can only live in
an attribute. `tests/unit/content.test.ts` asserts table and markup agree **in
both directions**.

Copy reaches the body markup by **build-time substitution**
(`build/copy-tokens.ts`), chosen over a runtime DOM walk because the text edition
is the default state and must be complete with JS disabled. Values are
HTML-escaped; an undefined token **fails the build**. Two things deliberately do
not come through the plugin: the `Person` JSON-LD (HTML escaping would corrupt
the JSON) and the eleven hrefs, which stay in `head.ts` per PORT_PLAN step 4.

Contact and project hrefs are applied **unconditionally**, literal `{{TOKEN}}`
values included. The markup ships them as `href="#"` and the router intercepts
every `href="#…"`, so leaving them would warp a visitor back to the hub. A dead
link beats a link that navigates somewhere it never claimed to go.

Analytics ships `data-auto-track="false"` so Umami's history patching cannot
double-count against `go()`'s `pushState`; views raised before the script lands
are queued and flushed on `load`, and dropped on `error` with one warning.

## Phase 5 — Engine

Split across `src/engine/*` under a re-exporting `hub.ts` — one file would have
been ~1000 lines against an 800-line cap. Everything in PORT_PLAN step 5 verified
live rather than read: bakes at 640/256/512/192 (high) and 384/160/320/192 (low),
stars 3200/1800, park solve landing on 0.2400 of viewport height against the
prototype's 0.2399. Then diffed against the prototype's own live `__dgHub` with
the same probe on both sides — draw calls, drawable inventory, park fraction,
azimuth, FOV, camera height and distance all identical. **This is the check to
repeat if the scene ever looks off.**

Two hardening changes: `localStorage` is read inside `try/catch` rather than
behind a `typeof` guard (a sandboxed iframe *throws on property access*), and
`dispose()` bumps the flight token so an in-flight launch cannot animate a
disposed scene.

Inherited, not drift: `detectQuality()` puts every non-Chromium desktop on `low`,
because `deviceMemory` is Chromium-only and the `|| 4` fallback trips the `≤ 4`
test. Faithfully ported and pinned by a unit test so it stays a decision.

## Phase 6 — Warp

`ACCENTS` **restates** each planet's glow rather than importing it — `hub.ts` is
the engine's single entry and importing it would drag `three` into a 2D module.
A unit test pins the table equal to `PLANETS[].glow`.

Texture-freedom is mechanised, not eyeballed: the test's context stub throws on
`createPattern`, `createImageData`, `getImageData`, `putImageData` and
`drawImage`, and its document stub throws on `createElement`. Construction is
asserted to issue exactly one context call and schedule zero frames, so the click
that constructs a `Warp` does no work.

Three deliberate deviations, all documented in-file: streak colour is resolved at
seed time (byte-identical output, ~460 fewer string builds per frame);
`clear()` calls `start()`, because only the animation resolves `clear()`'s
promise and the router releases `_going` through it; and a `Warp` with no 2D
context is inert rather than throwing, so a jump can never dead-lock.

## Phase 7 — Router

`mount()` (DOM refs, delegated click, `popstate`/`hashchange`) is split from
`boot(engine)`, so routing binds **before** the engine loads and a hash change
during the download is not lost. Teardown is on `pagehide`, not `unload` — mobile
Safari ignores `unload` and it blocks the back/forward cache everywhere else.

Timings are the prototype's: head start **520 ms**, flight **1700 ms**. `COVER`
is imported as `MIN_COVER` rather than restated, and `CLEAR` (950) is passed to
`clear()` explicitly so the watchdog cannot disagree with it.

**Azimuth persists across reload** — `saveAzimuth`/`loadAzimuth` wired from the
router, restored on boot before the deep-link branch, saved from `destroy()`
**and** on `visibilitychange → hidden`, because a backgrounded mobile tab may be
killed without ever firing `pagehide`. What is banked is the **hub** angle, not
the parked one.

**Scroll parallax is not wired, and that is the prototype's decision, not drift**
(Phase 0 measured it). `config.parallax` is kept as the knob, the panel `scroll`
listener is deliberately **not** registered — an empty one lies about what
happens — and the reasoning is recorded in `startDrift()`.

**ASK answered — drop the quality control, keep the readout.** A live toggle is
impossible under the one-renderer-per-document rule: the tier is chosen at
`initHub()`. `<button id="quality-toggle">` became `<div id="fps"
aria-hidden="true">` with the same box and 2 px radius, minus the hover state,
the `cursor: pointer` and the tab stop; the `Quality: high · ` prefix went with
it. `capabilities.ts` is untouched — `detectQuality()` still honours a stored
tier, so `localStorage.setItem('dg-quality','low')` remains a working escape
hatch.

Two structural departures: `labels.ts` owns label placement and the presentation
half of `setHover` (the router keeps `hovered`, which needs one owner), and hover
comes back through the engine's existing 30 Hz throttle rather than a second one
in `pointermove`.

## Phase 8 — Fallbacks

The organising change: **the flat text edition is a state the document ships
in**, not one the router assembles. `index.html` carries `data-dg-flat="1"` and
the probe removes it before first paint only on confirmed WebGL.

- The reduced-motion **200 ms cross-fade is new** — the prototype's reduce path is a bare commit with no fade at all. It lands as CSS inside the `prefers-reduced-motion` block, driven by the same inline pair `commit()` already writes, so no second timeline can disagree with the stylesheet. `visibility` is transitioned deliberately: it is discrete, so the outgoing panel holds `visible` for the full 200 ms, which is what makes it a cross-fade rather than a cut.
- On `webglcontextlost` the engine's half shrank to what is genuinely its own and raises `onContextLost`; the router's `flatten()` owns the DOM. The renderer is **not** disposed — a canvas that has lost its context cannot be given another.
- The re-id trick is **gone**. `flatten()` used to rename `panel-xr` → `xr`, which no-JS never gets and which fought the DOM contract. Each panel carries a zero-height `panel__anchor` span instead; a unit test walks every `href="#…"` and fails on any id the document does not contain.
- Print gained two fixes over the carried-over block, both real defects: `#stage` is hidden (the prototype hides `#scene` but not its container, so the fixed hub layer stamped itself across page one), and `overflow` is forced back to `visible` for both editions.
- With JS disabled the whole CV is one scrolling document and all nine in-page links resolve natively. Driven in Playwright with `javaScriptEnabled: false`, not simulated.

Also landed here: `mount()` reads `data-dg-3d` and flattens immediately when it
is absent, instead of importing the engine and asking afterwards. That is what
makes "a device with no WebGL never downloads `three`" actually true — it was
downloading all 506 kB and discarding it.

## Phase 9 — Assets

`public/` is Vite's `publicDir`, so relative `href="cv.pdf"` resolves identically
in dev, in the build, and under a hash. Neither `cv.pdf` nor `og.png` is fetched
by the page: they add 813 kB to `dist/` and **nothing** to the cold load. Do not
let `du dist/` be mistaken for the budget.

The favicon's two encoding traps are pinned by tests: `#` must be `%23` or the
URI truncates at the fragment and the tab goes blank, and spaces are `%20`. Its
colours are asserted **against `styles.css`** so the mark cannot drift from the
palette.

**The harness fact worth not rediscovering.** Adding five e2e tests to the pool
was enough to starve the neighbourhood: three failed at the default 6 workers,
two at 4, all passed in isolation, and every failure read as a router bug. Two
changes were needed, and it took both:

1. **Don't compete for the GPU.** A spec whose claims are about served bytes or
   URL resolution boots no hub and loads with `waitUntil: 'domcontentloaded'`;
   its slowest test went 9.2 s → 1.1 s. **Before adding an e2e test, check
   whether it needs `openHub()` — most do not.**
2. **Don't read live scene positions and then act on them.** `queueing`'s
   three-click test captures all three points from the hub at rest and clicks
   fixed coordinates, because the first click parks the camera. That is also the
   truer model: someone clicking three times in half a second clicks where the
   planets *were*.

The general shape: **anything that reads a live scene value and then acts on it
is racing the engine.** `waitForPanel` and `settledAzimuth` exist for this
reason. Phase 10 hit the same trap again with `session.spec.ts` reading azimuth
after a round trip, where the ~10° first-load hint had time to start.

## Phase 10 — Tests

Two extractions gave the pure seams unit tests: `parseHash()` in `router.ts`
(`hashId()` is that plus "and this document carries that panel"), and
`src/jump-guard.ts`, which states the two rules `finish()` is built on — the
commit runs exactly once per jump, and a superseded jump can no longer settle.

`visual.spec.ts` is **not screenshot comparison, and that is a decision.** Golden
images want a still frame; this page has a camera that sways forever, grain
animating four times a second, and type from a CDN. It re-asserts Phase 3's
measured numbers instead, and names the value that moved when it fails. Its
strongest tests are the two sweeps over every rendered element: three font
families and no more, Bodoni always weight 400, `border-radius: 0` everywhere but
the fps chip and the reticle, and **no shadow anywhere** — in both editions.

**The `finish()` token check cannot be caught from a browser.** An e2e test was
written for it and passed with the check deleted: a jump has three independent
ways to land, so a stale `finish()` does the cleanup the live jump was about to
do anyway and the end state converges. The damage is real but internal — an early
`going = false` and an early `drainPending()`, which is how two jumps come to
interleave. It is pinned in `tests/unit/jump-guard.test.ts`, which *does* fail on
that deletion, and the e2e test was rewritten to claim only what it proves. A
test that cannot fail is worse than no test.

One deliberate ordering change in `jump()`: `clearTimeout(watchdog)` runs *after*
the commit. On every reachable path the two are identical; where they differ the
new order is strictly better — a commit that threw used to leave `going` set with
the watchdog already cancelled, which is a permanent wedge.

Playwright config resolves the newest **installed** Chromium rather than the
build `@playwright/test` pins, and launches with SwiftShader flags — headless has
no GPU, so without them every test falls through to the text edition. Software
WebGL runs at roughly 22 fps, which is why the helpers wait on state and sample
eased values across real animation frames. **Run the suite at `--workers=3`;** at
the default the baseline itself fails several tests for harness reasons.

## Phase 11 — Budget & ship

- **Transfer budget met with ~6× headroom.** The cold load is HTML + CSS + entry + hub chunk; the hub is a separate chunk because the router imports it dynamically, so a no-WebGL device pays a fraction of it. `tests/unit/build-artifact.test.ts` builds and measures on every `npm test`, including the assertion that fails if `dist/`'s weight on disk is ever mistaken for the budget.
- **Draw calls brought to 25.** It was 29, and 29 in the prototype too, so this budget had never been met. Three transparent double-sided materials (XR's two rings, the ship's exhaust trail) each cost two passes; `forceSinglePass` on all three took it to 26. The last came off the ship: `body` (capsule) and `nose` (cone) always shared the `hull` material, so they merge into one geometry with their transforms baked in the order a mesh applies them — pixel-identical and unconditional. `budget.spec.ts` asserts the resting desktop hub is **exactly** 25, a floor as well as a ceiling, so a drawable going missing fails too. *The rings are the visible cost: full sweep on both sides of the planet, slightly less density. Owner accepted it — the rings reading lighter than `design/` is correct, not a porting error.*
- **ASK answered — the renderer must NOT pause under an opaque warp cover.** Three documents claimed it did; neither this port nor the prototype has ever done it. Adding it means making the park solve instant, or the cover lifts onto a camera that has not moved — and that motion is what the cover exists to hide.
- **Accessibility.** `@axe-core/playwright` scans all six documents on the WCAG 2.0/2.1 A and AA tags with nothing disabled; Lighthouse accessibility is **100** against `vite preview`. The text edition is scanned by denying WebGL rather than disabling JS, since axe runs inside the page; the no-JS route is covered structurally by `fallback.spec.ts`. Found and fixed: the Esc hint at 3.33:1, the only place the site advertises how to close a panel from the keyboard.
- **Deploy.** `.github/workflows/deploy.yml` builds on push to `master` and publishes `dist/`. The gate is `npm test` + `npm run build`, not Playwright — the e2e suite needs `--workers=3` to be trustworthy and would put six minutes on every push. Known cost of this host: **GitHub Pages serves no custom headers**, so `Cache-Control` cannot be tuned; content-hashed asset names carry the caching story instead.

## Phase 12 — Post-launch pass, from a live sitting

- **Dropped the quality toggle, kept the fps readout.** Resolves the Phase 7 ASK. Tab order six stops → five.
- **The ship no longer drops out of frame after a round trip.** Reported as "the camera feels further away on the way back". It was not the camera — that returns exactly. The ship is a child of the camera, so no camera change can move it; what moved was its own seat, written as a literal in three places that disagreed (`resize()` used 5.2 while `returnShip()` and the dock's last control point used 3.4). Since `shipBaseY` is solved against the half-height *at 5.2*, re-seating at 3.4 put the ship 97 % of the way down the viewport, and it stayed there all session because only `y` is rewritten per frame, never `z`. Now one `SHIP_REST_DIST` with `SHIP_FRAME_FRACTION` beside it; the same commit fixes `resize()` solving `halfH` from `camera.fov` rather than `S.baseFov`. `exit.spec.ts` "the ship comes back to the seat it booted in" is the guard, verified failing before the fix. *Three related findings deliberately left alone: the park solve is not re-derived on resize; `sway`/`bob` are never gated on park, so the parked view holds still only to ±0.7°; and an orphaned dock leaves ~0.0007° of `fovBoost`, under the render loop's 0.01° deadband.*
- **Serve the site from the GitHub Pages project path.** `public/CNAME` carried `golosov-danylo.com`, which has never resolved, so Pages fell back to the project URL while the build was still configured for an apex domain — every asset URL resolved to the host root, 404'd, and stranded the live page on the text edition. `base` is now `/personal-website/` for builds only; dev and preview stay rooted, because Playwright drives `npm run dev` with `page.goto('/')`. `tests/unit/build-artifact.test.ts` pins it.
- **The loading screen reads the real boot.** A determinate dial (`src/loading-ring.ts`) with floors at three boot milestones, capped at 99 while it runs, so 100 appears only once the scene is genuinely behind the screen. A boot that stalls past 12 s flattens to the text edition instead. See `design/DESIGN_SPEC.md` for the milestone table.

## Phase 13 — Mobile, and a dial that moves like one

Owner-reported: the site was unusable on a phone, and the dial "gets to 5 % and
then suddenly 100 %". Both confirmed. The dial was to stay **data-driven** — the
fix was more real signals, not a smoother guess.

- **The dial reads bytes.** `import()` reports nothing on the way, so `warmEngineChunk()` (`src/boot-progress.ts`) streams the chunk first for a byte count and the import resolves out of the cache entry it fills. The built site is *one* ~510 KB chunk, so this covers the whole of the slow part. Measurable or nothing: no `content-length`, a non-`ok` response or no `ReadableStream` and it returns without reading the body, rather than downloading half a megabyte twice. The URL is only knowable at build time — `build/engine-chunk.ts` writes it into the head as a meta tag, and a build that cannot find the chunk degrades to the old drift instead of breaking.
- **`initHub()` is asynchronous, and only for this.** It yields a paint between planet bakes, so the four are visible as four. Built synchronously the main thread could not draw *any* of them until the last was done — reporting them would have shown nothing. Costs about four frames. It also makes a new state reachable: the document can flatten mid-build, so `boot()` re-checks and disposes what it was handed. That is an abandoned boot, not a second renderer.
- **The arc eases toward the floor and is rate-limited.** `report()` is what happened; the arc only approaches it, so the number on screen is never ahead of the boot. The rate ceiling is the part that was not obvious: the easing is a function of elapsed time, and parsing 510 KB of engine holds the thread long enough that the next frame's `dt` let an unlimited curve cover the whole remaining gap in one repaint. That was half the reported jump. `loading.spec.ts` records the dial through a `MutationObserver` — not a sampling loop, which cannot tell a glide from a teleport — and asserts the series against the ceiling.
- **The finished dial holds 1.5 s before fading.** Measured from the arc *landing* on 100. The last step used to be written on the same frame the fade started, so a completed dial was never actually seen — the other half of it.
- **The phone breakpoint is mostly one rule.** `--type-scale` 1.5 → 1.18 at ≤ 640px. Type only, so the parked-planet solve is untouched. Beyond it: labels drop their sub-line, contact rows stack, the sticky bar wraps, the hero's floor becomes `min(220px, 38dvh)`, and viewport-height layout moves to `dvh` — which agrees with `canvas.clientHeight`, the thing `PARK_HEIGHT_FRACTION` actually solves against.
- **Two silent clips, both grid blowouts.** `.te__grid`'s `minmax(calc(240px * 1.5), …)` is a 360px floor that `auto-fit` will not drop below, so it ran 360px wide inside a 328px column and `overflow-x: hidden` took the edge off all four nav cards. `.cards` had the same shape by default — an implicit `1fr` floors at `min-content`, so one unbreakable word widened the track past the column. **Neither was visible to `visual.spec.ts`, which measures the column around the grid**, and both were already broken at the 390px it did test. `mobile.spec.ts` asserts relationships instead — nothing wider than its parent, nothing outside the viewport, no two labels overlapping — which is why it caught them.
- **Touch.** `touch-action: none` on `#scene` so a drag pans instead of the browser deciding halfway that it was a scroll; `.panel__hero` becomes `pointer-events: auto` on coarse pointers, or a swipe on the top 44 % of an open panel fell through to a canvas under orders not to scroll. `DRAG_SLOP_PX` is 6 for a mouse and 12 for a finger — both nav paths bail above it, so a tap that travelled 8–12px silently did nothing.
- **DPR is re-clamped on resize**, guarded on a real change, and `resize()` is throttled to one call per frame. The clamp is decided on the shorter viewport edge, so it is a live verdict; the quality tier stays a boot-time one because its textures are already baked.

---

## Deliberate deviations from the prototype

Do not "restore fidelity" on any of these:

1. **The text edition's CV link warms to `--hover`** like every other CV link. In the prototype its colour is inline with no `style-hover`, so it does not — confirmed with the owner as an oversight there (Phase 3/4).
2. **The reduced-motion path cross-fades over 200 ms.** The prototype cuts (Phase 8).
3. **Print hides `#stage`.** The prototype stamps the fixed hub layer over page one of the CV (Phase 8).
4. **Tab order is five stops, not six** — the quality button is a readout (Phase 7).
5. **The ship has one rest seat.** The prototype carries the same three-way mismatch verbatim (`design/space-engine.js:543-547, 848, 893`) (Phase 12).
