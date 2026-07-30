# 3D portfolio site — build notes and handoff

A dark, cinematic space hub with four planets. Clicking a planet flies the ship
to it and the scene jumps to lightspeed; the destination is swapped in under the
cover, and the scene drops out of hyperspace onto it.

It is a **single document**. Destinations are overlay panels, not separate pages.

## Architecture — one document, four overlay panels

The whole site is **`index.dc.html`**. There is no page-to-page navigation and
no second document load, because a document swap tore down the WebGL context and
rebuilt every baked planet texture on arrival — that was the lag.

The hub scene is created **once** and never disposed. Each destination is a
fixed, full-screen `<section data-panel="…">` sitting above the canvas, hidden
until routed to. A jump costs a canvas animation and two style writes.

| File | Role |
| --- | --- |
| `index.dc.html` | Entire site: hub + all four destination panels + text edition |
| `space-engine.js` | Three.js hub. `initHub` once; `park`/`unpark`/`returnShip` reframe it |
| `warp.js` | Hyperspace cover. Only `Warp` is used now; the `writeLaunch`/`readLaunch`/`bindDepartures` handoff helpers are vestigial and can be deleted |
| `support.js` | Design Component runtime |
| `cv.pdf`, `og.png`, `robots.txt`, `sitemap.xml` | Static assets |

### Routing

Hash-based, one entry per destination: `#backend`, `#projects`, `#xr`, `#about`;
bare path is the hub. `go(id)` pushes the entry and drives `jump()` directly
rather than waiting on the resulting `hashchange`, so navigation works even where
the embedding frame sandboxes History. `popstate`/`hashchange` still route, so the
browser back button walks the visited destinations.

Escape and "← Back to system" call `exit()`, which is hard-wired to `go(null)` —
the hub. It must never be `history.back()`: that replays whichever panel was
visited *before* this one (wrong intent — the user asked for the scene), and where
History is sandboxed it silently does nothing, which strands `current` on a closed
panel and then dead-locks canvas input, since `onDown` ignores clicks while a
panel is considered open.
Every `href="#…"` in the document is intercepted by one delegated click handler —
nothing in the site performs a document load.

Deep links work: loading `/#xr` opens that panel immediately with the camera
already parked, and skips the warp (there is nothing to transition *from*).

### The jump

`jump(target)` is the only transition, used for hub→panel, panel→panel and
panel→hub alike:

1. From the hub only, `hub.launch(id)` flies the ship out first (380 ms head start).
2. `Warp.cover()` spools up the streak field and goes opaque.
3. At ~92 % opacity `commit(target)` runs **under the cover** — panel visibility
   swap, `returnShip()`, `park(target)`, title, scroll reset.
4. `Warp.clear()` decelerates out of lightspeed onto the already-composed panel.

Overlapping jumps are queued in `_pending`, not interleaved.

Two invariants keep the router from wedging, both learned the hard way:

- **`_going` is never released solely by `warp.clear().then(...)`.** `finish()` is
  idempotent, carries a jump token, and is reachable from the animation *and* from
  a watchdog armed at `COVER + CLEAR + 700`. A stalled Warp therefore costs one
  ugly transition, not a permanently dead site.
- **Input is gated on `current` only, never on `_going`.** Gating clicks on the
  transition flag converts any hiccup into dead canvas input — the failure looked
  like "only the planet titles work", because label `<a>`s route through the
  delegated click handler instead.

Only one `Warp` owns the shared `#smoke` canvas at a time: `jump()` disposes the
previous instance before constructing the next, and `dispose()` clears the canvas,
hides it, and resolves any pending `clear()` promise — otherwise a torn-down
instance leaves the screen covered forever.

Canvas navigation has two paths into one deduped `nav()`: the `pointerup` pair
(which distinguishes a click from an orbit drag) and a plain `click` on the canvas,
which still fires when the `pointerdown` was swallowed by pointer capture or an
overlapping label hit-box.

### Scene behaviour while a panel is open

The renderer keeps running. `api.park(id)` puts the camera on station off the
destination planet — azimuth set to the planet's `theta`, standoff distance solved
so the planet reads about 24 % of viewport height, and the aim point dropped so it
frames high, above the panel's opaque slab. The panel's top 44 vh is transparent,
so that framing is what you actually see on arrival.

A single rAF loop adds a slow sine wander plus an offset from the panel's own
`scrollTop` — that is the parallax. Amount is the `parallax` prop (default 0.10).

`api.unpark()` eases all of it back and restores the hub's `AZ_LIMIT`; the hub's
azimuth is remembered in `hubAz` so returning lands where you left.

### Text edition (no WebGL, or engine failure)

`flatten()` sets `data-dg-flat` on `<html>`, hides the stage, and unpins the
panels — they become one continuous scrolling document behind the `#fallback`
index, with the transparent heroes removed. Same markup, no duplication. The
print stylesheet does the same thing.

## Converting to the Vite MPA

The pages are authored as Design Components so they stream and render live in
this environment. Converting to the specified stack is mechanical:

1. Rename `index.dc.html` to `index.html`. There is only one HTML entry, so the
   "MPA" is a single page — drop the multi-entry Rollup config.
2. Move `<helmet>` contents into a real `<head>`; the rest of the template is
   the `<body>`.
3. Move the logic class into `src/main.ts`. The class body is already plain DOM
   code: `componentDidMount` becomes the entry function called on
   `DOMContentLoaded`, `componentWillUnmount` becomes a `pagehide` handler, and
   `this.props.x` becomes a module-level config object.

   If you want real crawlable URLs (`/xr` rather than `/#xr`), keep the panel
   markup as-is and prerender: emit one HTML file per destination with that
   panel's `visibility` pre-set and a `<link rel=canonical>`, then swap
   `location.hash` for `history.pushState('/xr')` and match on `pathname`. The
   routing code already funnels through `route()`/`go()`/`hashId()` — only
   `hashId()` needs to read the path instead.
4. Port `space-engine.js` and `smoke.js` to TypeScript (strict). They are
   already ES modules with no framework dependency. Change the `three` import
   at the top of `space-engine.js` from the CDN URL to a bare `three`
   specifier and `npm i three`.
5. `vite.config.ts` — `build.rollupOptions.input` with the five entries.
6. Inline styles were required by the authoring environment. Extract the
   repeated values (colours, type scale, spacing) into custom properties in a
   hand-written `styles.css` before shipping; the palette is listed below.
7. Self-host the fonts. Right now `Bodoni Moda`, `Archivo` and `IBM Plex Mono`
   load from the Google Fonts CDN, which the brief forbids in production.
   All three are OFL — subset to latin, convert to `woff2`, `font-display: swap`.

## Design tokens

```
--void        #05060d   page base, blue-violet cast
--void-2      #080a13   panels
--ink         #f4f2fa   headings
--body        #c2c3d3   body text
--muted       #83859c   metadata
--dim         #8a8ca3   chrome text (min 4.5:1 on --void)
--marker      #5e6076   decoration only — list markers, hairlines
--ember       #ff9a4d   engine glow, the one warm accent
backend       #3fd8ff   projects #38ffb0   xr #b26bff   about #ff9b3d   (neon accents)
```

Type: `Bodoni Moda` (display), `Archivo` (body), `IBM Plex Mono`
(dates, stack rows, chrome).

## Copy tokens

In-page tokens render literally as `{{TOKEN}}`. Find-and-replace works on the
rendered text; in source they are written as `{<!---->{TOKEN}}` so the template
parser leaves them alone — replace the whole `{<!---->{TOKEN}}` string, or
strip the comments first with a single pass (`s/\{<!---->\{/{{/g`).

Tokens that must sit in an attribute or in structured data cannot be written
in markup, so they live as string constants at the top of each page's logic
class and are applied on mount:

- `assertTitle()` — `{{FULL_NAME}}`, `{{ROLE_TAGLINE}}`, and the panel titles.
  `<title>` is the one place a token cannot live in markup: it is RCDATA, so the
  `{<!---->{…}}` escape would leak the comment verbatim, and a bare `{{…}}` would
  be read as a template hole. So the helmet ships a plain `Portfolio` as a
  non-token fallback, and a `MutationObserver` on `document.head` re-asserts the
  real title whenever anything rewrites it. This is deliberately self-healing
  rather than timed: the helmet injects its own `<title>` at a point that depends
  on how long module imports and font loads take, so every fixed delay we tried
  lost the race. In the Vite port, put the real title in `<head>` and delete the
  fallback, the observer, and `assertTitle()` — none of it is needed there.
- `applyHeadTokens()` — mirrors `{{META_DESCRIPTION}}` and `{{FULL_NAME}} — {{ROLE_TAGLINE}}`
  onto `meta[name=description]`, `og:title` and `og:description`.
- `TITLES` — panel titles, combined with `{{FULL_NAME}}` on every jump.
- Projects panel `LINKS` — `{{PROJECT_n_REPO_URL}}`, `{{PROJECT_n_DEMO_URL}}`
- About panel `DATA` — `{{EMAIL}}`, `{{GITHUB_URL}}`, `{{LINKEDIN_URL}}`,
  `{{FULL_NAME}}`, `{{ROLE_TAGLINE}}`, `{{LOCATION}}` (also feeds the `Person` JSON-LD)

Full list by section:

- **Hub** — `FULL_NAME`, `ROLE_TAGLINE`, `LOCATION`, `META_DESCRIPTION`
- **Backend** — `BACKEND_INTRO`, and per block 1–4: `_ORG`, `_TITLE`, `_DATES`,
  `_LOCATION`, `_SUMMARY`, `_POINT_1..3`, `_STACK`
- **Projects** — `PROJECTS_INTRO`, and per project 1–4: `_TITLE`, `_STATUS`,
  `_SUMMARY`, `_POINT_1..2`, `_STACK`, `_REPO_URL`, `_DEMO_URL`
- **XR** — `XR_INTRO`, `ZAUBAR_ROLE_TITLE`, `ZAUBAR_DATES`, `ZAUBAR_LOCATION`,
  `ZAUBAR_SUMMARY`, `ZAUBAR_POINT_1..3`, `ZAUBAR_STACK`, and per project 1–3:
  `XR_PROJECT_n_TITLE`, `_DATES`, `_SUMMARY`, `_STACK`
- **About** — `ABOUT_BIO`, `EDUCATION_QUALIFICATION`, `EDUCATION_INSTITUTION`,
  `EDUCATION_DATES`, `EDUCATION_LOCATION`, `EDUCATION_NOTE`,
  `LANGUAGE_n_NAME` / `LANGUAGE_n_CEFR` (1–3),
  `SKILLS_PRODUCTION`, `SKILLS_PERSONAL_PROJECTS`

### Content rules baked into the markup

- The projects page carries the visible notice *“Independent projects —
  personal work, not employment.”* Its blocks are bordered panels.
- The **only** employment styling is on the XR page: a section headed
  `Employment`, a 2 px violet top rule, larger heading, no panel. The XR
  personal projects sit below under their own heading with the same panel
  styling as the projects page.
- Backend page blocks use the neutral (non-employment) styling. If one of them
  is employment, move it to the XR page's employment treatment — do not
  restyle the backend blocks.
- Skills are two separate headed groups: *Used in production* and *Used in
  personal projects*. There is no “currently learning” group anywhere.
- No seniority claim appears in copy, chrome, meta tags, or JSON-LD.
  `ROLE_TAGLINE` is a role description; keep it that way.

## Behaviour reference

**Camera** — scroll, horizontal drag, and ←/→ pan the camera along a fixed
azimuth arc clamped at ±0.5 rad. Critically damped lerp, factor 0.08.
Starfield parallaxes least, nebula more, planets most. Azimuth persists in
`sessionStorage` and is restored on return. `/#backend` (or any planet id)
orients the camera on load. A one-time ~10° drift plays on first load if the
user hasn't interacted.

**Hover / focus** — raycast throttled to 30 Hz and skipped during transitions.
Planet scales to 1.055 and lights up: the fresnel rim strengthens, a soft
additive halo sprite blooms around it, and the surface picks up a low emissive
in the planet's own hue. Leader line extends, label brightens, custom reticle
appears, destination is prefetched. At rest the ship noses toward the pointer. Tab cycles the four labels
with the same treatment; Enter launches.

**Transition** — clicking a planet *or its label* launches. Labels fade, the
ship flies to the planet along a quadratic Bézier over 1150 ms (wind-up recoil,
banked arc, committed roll, stretched exit) while the camera dollies back and
its field of view opens 17°. At 380 ms the hyperspace overlay spools up —
a radial streak field accelerating out of the vanishing point, tinted with the
destination planet's hue — washing to full opacity with a flash at the jump.
Navigation fires once opaque (~1.4 s), never later than `MAX_COVER` (2200 ms),
and the WebGL scene is paused the moment nothing under the cover is visible.

The destination covers itself in three stages so the screen is never bare:
an inline `<script>` in the head paints a flat veil before first paint if a
launch record is present; `warp.js` is imported *before* three.js and takes the
veil over with live streaks; the warp then **holds** at full speed until
`window.onload` actually fires (capped at `HOLD_CAP`, 3400 ms), and only then
decelerates out of lightspeed over 1 s. Total opaque time always clears
`MIN_COVER` (900 ms).

Every `href="#…"` in the document is intercepted by one delegated click handler,
so every navigation in the site is a warp — nothing loads a document. Planet
labels are exempted only while `window.__dg3dReady` is set, so if the scene
fails to boot the labels still get the covered navigation instead of a bare
document swap. State is handed over in `sessionStorage` (`dg-launch`); a direct
visit with no launch record skips the transition entirely.

The streak field is deliberately texture-free: no image data, no canvas
generation, nothing built at click time — construction is a few hundred plain
objects and each frame is a few hundred line strokes. The earlier sprite-based
smoke had to bake and tint sixteen 160² textures synchronously inside the click
handler, which is what made the click feel like it hung.

**Renderer lifetime** — the hub keeps one `WebGLRenderer` per document in
`window.__dgHub`. A canvas can only ever hold one context, so re-initialising
on a component remount destroyed it permanently and left a black hub; remounts
now reuse the existing renderer and rebind callbacks, and disposal happens on
`pagehide`. `webglcontextlost` restores the designed text hub.

**Performance** — each planet bakes an albedo (640², 384² low) and a bump map
(256², 160² low) once at init — domain-warped FBM, ridged noise and 3D worley
for craters, in four surface archetypes (ocean world with a separate cloud
shell, rocky, banded ice giant, cratered desert) — then samples them with a
standard material. Nothing procedural runs per frame. Rim glow is a back-face fresnel
shell. No effect composer — glow is additive geometry, which keeps the hub
under the 25 draw-call budget. DPR clamped to 2 desktop / 1.5 mobile.
Renderer pauses on `visibilitychange` and keeps running (parked) behind an open
panel, so the hero framing is live. No allocations in the render
loop. `detectQuality()` drops texture resolution, star count and particle count
on small or low-core devices, and the hub's quality readout doubles as an fps
meter.

**Fallbacks** — `hasWebGL()` runs before init; failure leaves the designed text
hub in place (four large linked cards) and hides the canvas. Under
`prefers-reduced-motion` there is no drift, bob or parallax, ambient rotation
drops to near zero, and clicking a planet does a 200 ms cross-fade instead of
the flight. Canvases are `aria-hidden`; navigation is exposed only through the
real anchors. Each panel has exactly one `h1`.

## Before deploy

- [ ] Replace every `{{TOKEN}}`, including the string constants in the logic classes.
- [ ] Regenerate `og.png` with the final name and role.
- [ ] Replace `https://example.com` in `sitemap.xml` and `robots.txt`, and the
      `<link rel="canonical">` in `index.dc.html`.
- [ ] Self-host the three fonts and remove the Google Fonts `<link>`s.
- [ ] Swap the placeholder ship for the glTF (see `public/models/README.md`).
- [ ] Verify the transfer budget (< 900 KB) after fonts are subset — the CDN
      `three` build is currently unminified and must be bundled instead.
