# CLAUDE.md

Project conventions for the golosov-danylo.com portfolio. Copy this file to the
repo root. Read `README.md` (the spec) and `design/BUILD_NOTES.md` (why each
invariant exists) before changing the router or the engine.

## What this is

A single-document personal portfolio: a three.js space hub with four planets,
each a destination rendered as a full-screen overlay panel. Hash-routed. No
framework. No backend. Fully static.

## Stack

Vite · TypeScript `strict` · three.js pinned to **0.160.x** · vanilla DOM ·
hand-written CSS with custom properties · Vitest + Playwright · static `dist/`.

## Hard rules

**Architecture**

- One document. Panels are overlays, never separate pages. A document swap tore down the WebGL context and rebuilt every baked planet texture on arrival — that was the lag this design exists to avoid.
- One `WebGLRenderer` per document, held on `window.__dgHub`, created once, never re-initialised, disposed only on `pagehide`. A canvas can only ever hold one context; re-initialising destroys it permanently and leaves a black hub.
- The renderer keeps rendering while a panel is open — the panel's top 44 vh is transparent and shows the live parked planet.
- No framework, no router library, no state library, no post-processing/effect composer.

**Router invariants** — these were bought with debugging time. Do not relax them.

- `exit()` is hard-wired to `go(null)`. **Never `history.back()`**: Back replays the previously visited panel (wrong intent), and where History is sandboxed it silently does nothing, stranding `current` on a closed panel and dead-locking canvas input.
- Input is gated on `current` only, **never** on `_going`. Gating on the transition flag turns any hiccup into dead canvas input.
- `_going` is never released solely by `warp.clear().then(...)`. `finish()` is idempotent, carries a jump token, and is reachable from the animation *and* from a watchdog at `COVER + CLEAR + 700`.
- `go(id)` pushes history **and** drives `jump()` directly — it never waits on the resulting `hashchange`.
- Exactly one live `Warp` owns `#smoke`; `jump()` disposes the previous instance first, and `dispose()` clears the canvas, hides it, and resolves any pending `clear()`.
- Both canvas nav paths (the `pointerdown`/`pointerup` pair and a plain `click`) feed one deduplicated `nav()`. Keep both — `pointerdown` gets swallowed by pointer capture and by label hit-boxes.
- Overlapping jumps queue in `_pending`. They never interleave.

**Performance**

- Transfer budget **< 900 KB**. `three` is essentially the whole budget.
- **≤ 25 draw calls** in the hub. Glow is a back-face fresnel shell plus additive geometry — that is why there is no composer.
- Planet textures are baked **once** at init. Nothing procedural runs per frame.
- **Zero allocations in the render loop.**
- DPR clamped to 2 desktop / 1.5 mobile. Renderer pauses on `visibilitychange` — and **only** on `visibilitychange`. It keeps rendering under an opaque warp cover: the park solve eases over frames, so a renderer stopped under the cover lifts it onto a camera that has not moved. Pausing there would mean making the solve instant, which is the motion the cover exists to hide. An earlier draft of this file asked for that pause; it was never implemented, in this port or the prototype.
- Nothing expensive in a click handler. An earlier warp baked sixteen 160² textures synchronously on click and the click felt like it hung; the current streak field is texture-free by design.

**Accessibility** — treat as functional requirements, not polish.

- Canvases are `aria-hidden`. Navigation is exposed only through real `<a href="#…">` anchors.
- Planet labels are keyboard-reachable in DOM order; Enter launches; focus gets the same treatment as hover with `outline-offset: 6px`.
- Escape closes any panel.
- The text edition (`#fallback`) is the **default** state; the WebGL probe fades it out on success. It is not an error branch — never invert this.
- One `<h1>` per panel. Chrome text ≥ 4.5:1 on `--void`; `#8a8ca3` is the dimmest permitted text.
- `prefers-reduced-motion`: no drift/bob/parallax, ambient rotation ~0, grain off, 200 ms cross-fade instead of the ship flight.

**Print** — the `@media print` block flattens all four panels into one continuous
document and hides the scene, bars and heroes. The whole CV must print correctly.
Verify after any layout change.

## Styling

- CSS custom properties for all tokens (see README “Design tokens”). No magic hexes in rules.
- Per-destination accents come from `[data-panel="…"] { --accent: … }`, not duplicated rulesets.
- Radii are 0 everywhere except the 2 px fps chip and the circular reticle. The loading dial is round too, but as SVG geometry rather than a radius — it is not a third exception to reach for. **No shadows anywhere** — depth comes from the scene, gradients, and hairlines.
- Type: Bodoni Moda (display, always weight 400), Archivo (body), IBM Plex Mono (chrome/meta/uppercase micro-labels). Google Fonts CDN is approved.
- Define global `a` / `a:hover` (`#e9e7f2` / `#ffb877`).

## Content rules (editorial — do not "tidy")

1. The Projects panel carries the visible notice “Independent projects — personal work, not employment.”
2. The only employment styling in the site is the XR panel's `Employment` section: 2 px violet top rule, larger heading, no card background.
3. Backend blocks use neutral, non-employment styling. If one becomes employment, move it to the XR treatment — don't restyle the Backend blocks.
4. Skills are exactly two groups: *Used in production* and *Used in personal projects*. There is no “currently learning” group.
5. No seniority claim in copy, chrome, meta tags, or JSON-LD. `ROLE_TAGLINE` is a role description.

## Copy

Every visible string is a `{{TOKEN}}` placeholder that **the owner fills in
code**. Never invent copy, never "improve" a token, never remove one. Tokens that
sit in attributes or structured data are applied on mount from the content table.

## Working style

- Ask the owner rather than assume. Outstanding work and the owner's pre-launch list are at the top of `TASKS.md`; do not resolve them unilaterally.
- Small, verifiable commits.
- Before any router or engine change, re-read the relevant invariant above and add a Playwright test that would have caught the regression.
- `design/` holds the reference prototype. When in doubt about a visual, measure it there rather than guessing — `design/DESIGN_SPEC.md` records what was measured.
