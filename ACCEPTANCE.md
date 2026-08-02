# Acceptance criteria

The port is accepted when every box below passes. Grouped by the six things the
owner named as must-preserve, plus the build.

Timings are asserted with tolerance (±15 %) — the point is the *shape* of the
motion, not frame-exact numbers.

## A — Visual fidelity (pixel-for-pixel)

- [ ] Hub at 1440×900: header, foot, HUD hint and all four labels match the prototype in position, size, colour, letter-spacing and case.
- [ ] Each of the four panels matches the prototype at 1440, 1024, 768 and 390 px wide — column width, `clamp()` paddings, hairline colours, card backgrounds, accent usage.
- [ ] Type: three families only; Bodoni Moda always weight 400; every size from the README scale.
- [ ] Radii 0 except the 2 px quality button and the circular reticle. **No shadows anywhere.**
- [ ] Grain: `opacity .16`, `mix-blend-mode: overlay`, animating in 4 steps over 1.1 s; off under reduced motion.
- [ ] Vignette gradient exact.
- [ ] Hover: label name goes to that destination's hover tint, leader line extends, reticle appears at the pointer.
- [ ] The panel hero is genuinely transparent — the parked planet is visible through the top 44 vh, not a screenshot or gradient.
- [ ] Text edition matches: 1080 px column, 1 px-gap hairline card grid, `clamp(38px,7vw,84px)` display heading.

## B — Warp / jump timing and easing

- [ ] Hub → panel: ship leaves first, cover starts ~380 ms later, ship flight ~1150 ms, FOV opens ~17°.
- [ ] Content swap happens **under** full cover — no frame ever shows a bare or half-composed panel.
- [ ] Opaque time ≥ `MIN_COVER` 900 ms and navigation fires by `MAX_COVER` 2200 ms.
- [ ] Deceleration out of lightspeed ~1 s onto an already-composed panel.
- [ ] Panel → panel and panel → hub use the same `jump()` and look identical in structure.
- [ ] Streak colour follows the destination accent with `warpColor: 'planet'`.
- [ ] Click does not stall: no texture bake, image decode, or canvas generation inside the click handler (assert with a performance mark — handler work < 8 ms).
- [ ] Rapid double-click on two different planets: jumps queue, never interleave, and you land on the second target.

## C — Router invariants

- [ ] `#backend`, `#projects`, `#xr`, `#about` each open the right panel; no hash = hub.
- [ ] Every `href="#…"` in the document is intercepted — **zero** document loads during any navigation (assert `performance.getEntriesByType('navigation').length === 1` after a full tour).
- [ ] Browser Back walks the visited destinations.
- [ ] Escape from any panel returns to the **hub**, not to the previously visited panel.
- [ ] Every `[data-exit]` link returns to the hub.
- [ ] After a full tour (hub → 01 → 02 → 03 → 04 → hub), canvas clicks still launch. This is the dead-input regression; it must be a standing test.
- [ ] With `history.pushState` stubbed to throw, navigation still works and Escape still returns to the hub.
- [ ] With `Warp.clear()` stubbed never to resolve, the site still lands on the destination (watchdog) and remains navigable.
- [ ] `#smoke` is never left visible after a jump completes.
- [ ] Deep-load `/#xr`: panel open immediately, camera already parked, **no warp**.
- [ ] Deep-load `/#xr` then Escape → hub, and the hub is fully interactive.

## D — Performance budget

- [ ] Total transfer < **900 KB** (production build, gzip, cold load).
- [x] `renderer.info.render.calls` ≤ **25** in the hub.
      *Exactly 25, pinned in `budget.spec.ts`. Was 29 for the whole port (and 29
      in the prototype): `forceSinglePass` on the three double-sided transparent
      materials, then merging the ship's capsule and nose cone, which already
      shared a material.*
- [ ] No effect composer / post-processing in the bundle.
- [ ] DPR ≤ 2 desktop, ≤ 1.5 mobile.
- [ ] Steady-state render loop allocates nothing: heap stays flat over 30 s idle in the hub (±1 MB).
- [ ] Planet textures baked once — no bake calls after init (spy on `createPlanet`/`bake`).
- [x] Renderer pauses on `visibilitychange`; keeps rendering while parked behind a panel **and under the warp cover**.
      *Amended in Phase 11 — the original clause asked for a pause under full
      cover. Neither this port nor the prototype has ever done it, and it is not
      a defect to fix: the park solve eases over frames, so a renderer stopped
      under the cover would lift it onto a camera that had not moved. Pausing
      would mean making the solve instant, which is the motion the cover exists
      to hide.*
- [ ] Low-quality tier engages on a small/low-core device and drops texture, star and particle counts.
- [ ] 60 fps in the hub on a mid-range laptop; no jank spike > 50 ms during a jump.

## E — Accessibility and text edition

- [ ] axe/Lighthouse clean on the hub, all four panels, and the text edition.
- [ ] Both canvases `aria-hidden="true"`.
- [ ] Tab from load reaches all four planet labels in DOM order with a visible focus ring (`outline-offset: 6px`) and the hover treatment; Enter launches.
- [ ] Escape closes any panel.
- [ ] Exactly one `<h1>` per panel; `main`, `nav[aria-label="Destinations"]` and per-section labels present.
- [ ] Chrome text ≥ 4.5:1 on `#05060d`.
- [ ] `prefers-reduced-motion`: no drift, bob or parallax; ambient rotation ~0; grain animation off; planet click cross-fades in ~200 ms.
- [ ] WebGL unavailable → the text edition stays, `#scene` hidden, all four destinations reachable, CV downloadable.
- [ ] `webglcontextlost` mid-session → text edition restored, site still navigable.
- [ ] JS disabled → the text edition is complete and every link works.
- [ ] Decorative layers (vignette, grain, hero, reticle) are `aria-hidden` and `pointer-events: none`.

## F — Print

- [ ] Print preview: white background, `#111` text.
- [ ] Scene, warp canvas, reticle, grain, sticky bars and heroes all hidden.
- [ ] All four panels flow as **one continuous document** — no clipped panel, no blank pages, no overlap.
- [ ] Every section prints in the same order as the text edition.

## G — Build hygiene

- [ ] `tsc --noEmit` clean under `strict`.
- [ ] No `support.js`, no `<x-dc>`, no `<helmet>`, no `style-hover` attribute anywhere in the source.
- [ ] No `{<!---->{` escapes remain; tokens read `{{TOKEN}}`.
- [ ] `initPlanetBand`, `PLANETS[].href`, `writeLaunch`, `readLaunch`, `whenLoaded`, `bindDepartures` all deleted.
- [ ] `https://example.com` appears nowhere; canonical, OG and sitemap use `https://golosov-danylo.com`.
- [ ] No `three` CDN URL in the shipped bundle.

---

## Playwright suite to write

One file per group; these are the tests that would have caught the prototype's
real bugs.

```
tests/e2e/
  routing.spec.ts       hash → panel for all four; no-hash → hub; Back walks
                        destinations; deep link parks with no warp; zero extra
                        document loads across a full tour
  exit.spec.ts          Escape → hub from each panel; every [data-exit] → hub;
                        Escape after a deep link → interactive hub
  dead-input.spec.ts    full tour, then canvas click still launches
  resilience.spec.ts    pushState throws → still navigates; clear() never
                        resolves → watchdog lands it; #smoke never left visible
  queueing.spec.ts      rapid double-click on two planets lands on the second,
                        one jump at a time
  keyboard.spec.ts      Tab order over the four labels, focus ring, Enter launches
  fallback.spec.ts      WebGL blocked → text edition complete; contextlost →
                        restored; JS off → all links work
  reduced-motion.spec.ts  emulate reduce → cross-fade path, no parallax
  visual.spec.ts        screenshot comparison, hub + 4 panels + text edition,
                        at 1440 / 1024 / 768 / 390
  print.spec.ts         emulate print media → one continuous document
  budget.spec.ts        transfer size, draw calls, idle heap flat
```

Block WebGL for `fallback.spec.ts` by overriding
`HTMLCanvasElement.prototype.getContext` in an init script — do not rely on a
browser flag.
