# Handoff: 3D space-hub portfolio (golosov-danylo.com)

## Overview

A single-page personal portfolio built as a cinematic space scene. Four planets
float in a starfield; each is a destination. Clicking a planet (or its label)
flies a ship out, the screen washes to lightspeed, and the site decelerates out
of hyperspace onto the destination's content — which is a full-screen overlay
panel whose top 44 vh is transparent, so the planet you just flew to frames the
top of the page and parallaxes as you scroll.

There is a complete non-WebGL **text edition** of the same content for machines,
printers, and devices that can't or shouldn't run the scene.

Content is a CV: backend/platform work, independent projects, XR/AR work, and
about/contact. All copy is currently `{{TOKEN}}` placeholders — **the owner will
fill them in code**, so preserve them exactly (see “Copy tokens”).

## About the design files

Everything in `design/` is a **design reference authored in HTML** — a working
prototype that demonstrates the intended look, motion, and behaviour. It is not
production source to copy verbatim.

There is no existing codebase: this is greenfield. Your job is to **stand up a
real project and recreate the prototype in it**, pixel-for-pixel, with the
prototype as the specification of record. Where this README and the prototype
disagree, the prototype wins for *visuals* and this README wins for *intent*.

Two things in the prototype exist only because of the authoring environment and
must not be carried over:

- `support.js` — the runtime of the design tool the prototype was written in.
  Included for reference only. **Delete it.** The prototype's `<x-dc>` wrapper,
  `<helmet>` element, `style-hover` / `style-before` attributes and
  `class Component extends DCLogic` all belong to it.
- **Inline styles on every element.** The authoring tool required them. Real CSS
  is expected in the port (see “Design tokens”).

The prototype uses ES-module imports, so it **must be served over HTTP** —
`file://` blocks them and the page silently drops to the text edition. From this
bundle: `cd design && npx serve .` (or `python3 -m http.server`), then open the
printed URL. Internet access is needed on first load: `space-engine.js` imports
`three` from unpkg, and the fonts come from the Google Fonts CDN. See
`design/HOW_TO_RUN.md`.

Do this before you write anything — you cannot match the motion from this README
alone.

### Chosen stack

The owner's only hard requirement is **three.js**. Everything else was left to
this handoff, so:

| Concern | Decision |
| --- | --- |
| Build | **Vite** (latest), single HTML entry |
| Language | **TypeScript, `strict: true`** |
| Framework | **None.** Vanilla DOM + three.js |
| 3D | **`three` from npm** (the prototype loads an unminified CDN build; that must not ship) |
| Styles | Hand-written CSS with custom properties, one `styles.css` |
| Routing | Hash routes, exactly as the prototype (`#backend`, `#projects`, `#xr`, `#about`) |
| Tests | **Vitest** for units, **Playwright** for end-to-end |
| Output | Plain static `dist/` — host-agnostic |
| Fonts | Google Fonts CDN (approved; do not spend time self-hosting) |

Why no framework: the site has one page, four overlay panels, and a WebGL scene
that must never be unmounted. A framework's lifecycle is a liability here — the
prototype's hardest bugs were all remounts destroying the WebGL context. Keep it
as plain DOM.

## Fidelity

**High-fidelity.** Colours, type, spacing, and timings in the prototype are
final. Match them exactly. Every number in this document is a real value taken
from the prototype, not an approximation.

## Screens / views

Everything lives in one document. `#stage` (the WebGL hub) is always mounted at
`position: fixed; inset: 0`. Each destination is a sibling
`<section data-panel="…">`, also `position: fixed; inset: 0; z-index: 45`,
`visibility: hidden; opacity: 0` until routed to. `#smoke` (the hyperspace
canvas) is `position: fixed; z-index: 60; display: none`.

### 1 — Hub (route: no hash)

**Purpose:** the landing view. Orient the visitor, offer four destinations, be
memorable.

**Layout** — full-viewport `<main id="stage">`, `overflow: hidden`, background
`#05060d`. Stacked children, back to front:

| z | Element | Notes |
| --- | --- | --- |
| — | `<canvas id="scene">` | `inset: 0`, `opacity: 0` → `1` over `900ms ease` once the scene boots. `aria-hidden="true"` |
| — | Vignette | `radial-gradient(120% 85% at 50% 42%, rgba(0,0,0,0) 42%, rgba(3,4,10,0.55) 78%, rgba(2,3,8,0.92) 100%)`, `pointer-events: none` |
| — | Grain | `inset: -12%`, `opacity: 0.16`, `mix-blend-mode: overlay`, an inline SVG `feTurbulence` tile (`baseFrequency 0.85`, `numOctaves 3`, 180×180) animated by `grainShift` — `1.1s steps(4) infinite`, translating ±3%. Disabled under `prefers-reduced-motion` |
| — | `<nav id="labels">` | Four planet labels. `opacity: 0` → `1` over `700ms ease` on boot; `pointer-events: none` on the nav, `auto` on each `<a>` |
| 5 | `<header id="hub-head">` | Top-left, `left: clamp(20px,4vw,56px)`, `top: clamp(20px,4vh,44px)` |
| 5 | `#hub-foot` | Bottom-left, `bottom: clamp(18px,3vh,34px)`, flex, `gap: 18px` |
| 5 | `#hud-hint` | Bottom-right, same offsets |
| 8 | `#reticle` | 34×34, `margin: -17px 0 0 -17px`, `1px solid rgba(255,184,119,0.75)`, `border-radius: 50%`, `mix-blend-mode: screen`, `opacity 0 → 1` + `scale(0.6) → 1` over `200ms ease` |

**Header:** `<h1>` Bodoni Moda 400, `clamp(22px, 2.4vw, 32px)`, `line-height 1.1`,
`letter-spacing .005em`, `#f2f0f8`, text `{{FULL_NAME}}`. Below it two IBM Plex
Mono 12px lines, `letter-spacing .09em`, uppercase, `line-height 1.6`, `max-width 34ch`:
`{{ROLE_TAGLINE}}` in `#9294ab` (margin-top 10px) and `{{LOCATION}}` in `#8a8ca3`
(margin-top 6px).

**Foot:** an `<a href="#about" id="skip-scene">` reading *“Skip the scene → read
the CV”* — IBM Plex Mono 11px, `letter-spacing .14em`, uppercase, `#83859c`,
`border-bottom: 1px solid rgba(131,133,156,0.35)`, `padding-bottom: 2px`;
hover `#ffb877` with border `rgba(255,184,119,0.6)`. Then
`<button id="quality-toggle">` — transparent, `1px solid rgba(131,133,156,0.28)`,
`radius 2px`, `padding 5px 9px`, mono 10px, `letter-spacing .14em`, uppercase,
`#9294ab`; label `Quality: high · <span id="fps-readout">--</span> fps`; hover
border `rgba(255,184,119,0.5)`, colour `#ffb877`. It both reports fps and toggles
the quality tier.

**HUD hint:** mono 10px, `letter-spacing .16em`, uppercase, `#8a8ca3`, text
*“Drag / scroll to pan · Tab to cycle”*.

**Planet labels** — one `<a>` per destination, `position: absolute`,
`transform: translate(-50%, 0)`, `display: grid; justify-items: center`,
`padding: 6px 10px 8px`, `text-align: center`, `outline-offset: 6px`. Their
markup positions (`left`/`top`) are **initial values only** — the engine
repositions them each frame from the projected planet position, so treat the
markup numbers as fallbacks, not layout.

Each label stacks four children:

1. `[data-leader]` — 1px × 26px, `linear-gradient(to bottom, <accent>/0, <accent>/0.85)`, `transition: height 300ms ease`, extends on hover.
2. Index — mono 11px, `letter-spacing .22em`, uppercase, in the planet's accent.
3. `[data-name]` — Bodoni Moda 20px, `letter-spacing .01em`, `#eceaf4`, `transition: color 300ms ease`; on hover/focus becomes the planet's **hover tint**.
4. Kicker — mono 10px, `letter-spacing .14em`, uppercase, `#eceaf4`.

| id | href | Index | Name | Kicker | Accent | Hover tint |
| --- | --- | --- | --- | --- | --- | --- |
| `lbl-backend` | `#backend` | 01 | Backend &amp; Platform | Services · Data · Delivery | `#3fd8ff` | `#8ce7ff` |
| `lbl-projects` | `#projects` | 02 | Independent Projects | Personal work | `#38ffb0` | `#84ffcb` |
| `lbl-xr` | `#xr` | 03 | XR / AR | Unity · Spatial | `#b26bff` | `#d0a6ff` |
| `lbl-about` | `#about` | 04 | About &amp; Contact | CV · Languages | `#ff9b3d` | `#ffc182` |

### 2 — Text edition (`#fallback`)

**Purpose:** the whole site without WebGL — no-WebGL devices, context loss,
crawlers, print.

`position: fixed; inset: 0; z-index: 20; overflow-y: auto`,
`background: linear-gradient(180deg, #05060d 0%, #080a15 60%, #05060d 100%)`,
`padding: clamp(28px,7vh,88px) clamp(20px,6vw,96px)`. Inner wrapper
`max-width: 1080px; margin: 0 auto`.

- Eyebrow: mono 11px, `letter-spacing .2em`, uppercase, `#8a8ca3`, *“Portfolio · Text edition”*, `margin-bottom: clamp(28px,6vh,56px)`.
- `<h2>`: Bodoni Moda 400, `clamp(38px,7vw,84px)`, `line-height 1.02`, `letter-spacing -.01em`, `#f2f0f8`, `{{FULL_NAME}}`.
- Lede: `clamp(16px,1.6vw,19px)`, `line-height 1.6`, `#b6b7c8`, `max-width 46ch`, `{{ROLE_TAGLINE}} · {{LOCATION}}`.
- Card grid: `repeat(auto-fit, minmax(240px, 1fr))`, `gap: 1px` on a `rgba(255,255,255,0.07)` background with a matching 1px border — hairline dividers via the gap. Each card `padding: clamp(20px,3vw,30px)`, `background: #070912`, hover `#0c1020`; index in the destination accent (mono 11px, `letter-spacing .2em`) and name in Bodoni Moda `clamp(20px,2.2vw,26px)` `#eceaf4`, `margin-top 14px`.
- Footer line: mono 11px uppercase `#8a8ca3` — *“Full navigation without 3D.”* plus a CV link (`#a9aabd`, hairline underline).

**When it shows:** an inline head script probes for a WebGL context. On success
it sets `data-dg-3d` on `<html>`, which fades `#fallback` out
(`opacity 0; pointer-events: none; transition: opacity 400ms ease`). On failure
nothing happens and the text edition simply stays — the fallback is the default
state, not an error branch. **Keep it that way.** Also engaged on
`webglcontextlost`.

### 3–6 — Destination panels

All four panels share one skeleton. Only the accent, the eyebrow text, and the
body composition differ.

```
section[data-panel]        fixed, inset 0, z-index 45, overflow-y auto,
                           background transparent, visibility hidden, opacity 0
├── div[data-panel-top]    sticky top bar
├── div[data-hero]         transparent window onto the live 3D scene
└── div                    background #05060d, min-height 56vh
    └── div                max-width 720px, margin 0 auto,
                           padding clamp(28px,5vh,56px) clamp(20px,5vw,40px) clamp(60px,10vh,120px)
        ├── h1             the panel title (exactly one h1 per panel)
        ├── …              panel body
        ├── nav[data-elsewhere]
        └── footer
```

**Top bar** — `position: sticky; top: 0; z-index: 3`, flex,
`justify-content: space-between`, `gap: 16px`,
`padding: 14px clamp(18px,4vw,44px)`, `background: rgba(5,6,13,0.72)`,
`backdrop-filter: blur(10px)`, `border-bottom: 1px solid rgba(255,255,255,0.07)`.
Left: `<a href="#" data-exit>` *“← Back to system”* — mono 11px,
`letter-spacing .16em`, uppercase, `#b8b9c9`, hover `#ffb877`. Right: a flex
`<span>` with `gap: 18px` — `Esc` in `#5f6178` then `NN · Title` in the accent.

**Hero** — `position: relative; height: 44vh; min-height: 220px;
pointer-events: none; aria-hidden`. Contains only a scrim,
`linear-gradient(180deg, rgba(5,6,13,0) 0%, rgba(5,6,13,0.1) 55%, rgba(5,6,13,0.75) 84%, #05060d 100%)`,
and a bottom-left arrival tag (`left: clamp(18px,4vw,44px); bottom: 18px`, mono
10px, `letter-spacing .24em`, uppercase, accent-coloured, *“Arrived · &lt;Title&gt;”*).
The panel background is `transparent` here, so what you see through it is the
live parked planet. This is load-bearing: it is why the scene must keep
rendering while a panel is open.

**Panel `<h1>`** — Bodoni Moda 400, `clamp(38px,6vw,62px)`, `line-height 1.05`,
`letter-spacing -.012em`, `#f4f2fa`.

**Intro paragraph** — `clamp(17px,1.9vw,20px)`, `line-height 1.65`, `#a9aabe`,
`max-width 60ch`, `margin-top 22px` (24px on Projects, under the notice).

**Shared body atoms:**

- *Neutral entry* (Backend) — `<article>` `padding: clamp(28px,4vw,38px) 0`, `border-bottom: 1px solid rgba(255,255,255,0.07)`. Org line: mono 10px, `letter-spacing .22em`, uppercase, accent. `<h2>`: Bodoni Moda `clamp(24px,3vw,30px)`, `line-height 1.2`, `#eeecf6`, `margin-top 12px`. Meta: mono 12px, `letter-spacing .1em`, `#7b7d95`, `Dates · Location`. Summary: 17px/1.75 `#c2c3d3`. Then a bullet list and a stack line.
- *Panel card* (Projects, XR personal) — `padding: clamp(24px,3.4vw,34px)`, `background: #080a13`, `border: 1px solid rgba(255,255,255,0.08)`; cards in a `grid; gap: 20px`.
- *Bullet list* — `list-style: none`, `display: grid; gap: 9px`, each `li` `position: relative; padding-left: 20px`, 16px/1.65 `#b0b1c4`, with a `::before` em-dash at `left: 0` in `#5e6076` (`#6b5a9e` inside the XR employment block).
- *Stack line* — mono 12px, `line-height 1.7`, `letter-spacing .04em`, `#83859c`, prefixed `Stack — `.
- *Section heading* — mono 11px, weight 500, `letter-spacing .26em`, uppercase; `#9294ab` normally, tinted when it carries meaning (`#dcb6ff` Employment, `#ffd39a` Contact, `#8ff0ff` / `#9dffd6` for the two skills groups).
- *“Elsewhere in the system”* — `margin-top: clamp(48px,8vh,80px)`; label mono 10px `letter-spacing .24em` uppercase `#8a8ca3`; then a `grid; gap: 14px` of the **other three** destinations — flex, `align-items: baseline`, `gap: 14px`, 18px `#d3d4e2`, hover `#ffb877`, with the index in mono 11px `letter-spacing .2em` in that destination's accent.
- *Footer* — `margin-top: clamp(48px,8vh,80px)`, `padding-top: 24px`, `border-top: 1px solid rgba(255,255,255,0.07)`, flex wrap `gap: 10px 26px`, mono 11px `letter-spacing .12em` uppercase `#9294ab`: a CV link (`#a9aabd`, hairline underline) and a second *“← Back to system”* `[data-exit]`.

#### 3 — Backend &amp; Platform (`#backend`, accent `#3fd8ff`)

`h1` *Backend &amp; Platform*, intro `{{BACKEND_INTRO}}`, then a 1px gradient rule
(`margin-top: clamp(40px,7vh,68px)`,
`linear-gradient(to right, rgba(63,216,255,0.55), rgba(255,255,255,0.05) 60%, rgba(255,255,255,0))`),
then **four neutral entries** (`BACKEND_BLOCK_1..4`), each with 3 bullets.

Neutral styling is deliberate: these are *not* presented as employment. If one
of them becomes employment, move it to the XR panel's employment treatment —
don't restyle the Backend blocks.

#### 4 — Independent Projects (`#projects`, accent `#38ffb0`)

`h1` *Independent Projects*. Immediately below it a mandatory notice —
`<p role="note">`, `margin-top 24px`, `padding: 14px 18px`,
`border: 1px solid rgba(56,255,176,0.38)`, `background: rgba(56,255,176,0.06)`,
mono 12px, `line-height 1.7`, `letter-spacing .08em`, uppercase, `#9dffd6`:
**“Independent projects — personal work, not employment.”**

Then the intro `{{PROJECTS_INTRO}}` and **four panel cards** (`PROJECT_1..4`):
title `<h2>` Bodoni Moda `clamp(23px,2.8vw,28px)` `#eeecf6` on the left and
status mono 10px `letter-spacing .2em` uppercase `#38ffb0` on the right of a
`flex; align-items: baseline; justify-content: space-between; gap: 16px; wrap`
row; summary; 2 bullets; stack line; then a `flex; gap: 22px` link row with
*Repository ↗* and *Live demo ↗* — mono 12px, `letter-spacing .12em`, uppercase,
`#9dffd6`, `border-bottom: 1px solid rgba(157,255,214,0.45)`, `padding-bottom 3px`,
hover `#ffb877`. Their `href`s are `#` in markup and assigned at runtime from
the token table (`data-repo="n"` / `data-demo="n"`).

#### 5 — XR / AR (`#xr`, accent `#b26bff`)

`h1` *XR / AR*, intro `{{XR_INTRO}}`, then two sections:

**Employment** — `margin-top: clamp(44px,7vh,72px)`, heading *Employment* in
`#dcb6ff`. One `<article>`, `padding: 26px 0 34px`,
`border-top: 2px solid #b26bff`, **no card background** — this is the only
employment styling in the whole site. Eyebrow *Employment · ZAUBAR* (mono 10px,
`letter-spacing .22em`, `#dcb6ff`); `<h3>` `{{ZAUBAR_ROLE_TITLE}}` Bodoni Moda
`clamp(26px,3.4vw,34px)` `#f2f0fa`; meta `{{ZAUBAR_DATES}} · {{ZAUBAR_LOCATION}}`;
summary 17px/1.75 `#c8c9d8`; 3 bullets (violet `::before`); stack line.

**XR work — personal projects** — heading in `#9294ab` plus a sub-line
*“Personal work, not employment.”* (mono 11px, `line-height 1.7`,
`letter-spacing .06em`, uppercase, `#8a8ca3`), then three panel cards
(`XR_PROJECT_1..3`): `<h3>` Bodoni Moda `clamp(22px,2.6vw,27px)`, meta
`Independent · {{…_DATES}}`, summary, stack line. No bullets, no links.

#### 6 — About &amp; Contact (`#about`, accent `#ff9b3d`)

`h1` `{{FULL_NAME}}`; below it mono 12px `letter-spacing .14em` uppercase
`#9294ab` reading `{{ROLE_TAGLINE}} · {{LOCATION}}`; bio
`clamp(17px,1.9vw,20px)`/1.7 `#b6b7c9`, `max-width 62ch`, `margin-top 26px`.
Then four sections, each `margin-top: clamp(40px,7vh,64px)`:

- **Contact** — a panel card (`#080a13`, 1px `rgba(255,255,255,0.08)`), heading `#ffd39a`, then a `grid; gap: 14px` of rows: each row `flex; align-items: baseline; gap: 14px`, 18px `#dcdde9`, hover `#ffb877`, with a `min-width: 92px` mono 11px `letter-spacing .16em` uppercase `#9294ab` label. Rows: Email (`#lnk-email`), GitHub (`#lnk-github`), LinkedIn (`#lnk-linkedin`) — hrefs assigned at runtime — and CV (`cv.pdf`, `#ffd39a`, *Download PDF ↗*).
- **Education** — one `<article>`, `padding-top: 22px`, `border-top: 1px solid rgba(255,255,255,0.09)`: `<h3>` qualification, meta `Institution · Dates · Location`, note.
- **Languages** — a 3-row list; container `border-top: 1px solid rgba(255,255,255,0.09)`, each `li` `flex; justify-content: space-between; padding: 14px 0`, `border-bottom: 1px solid rgba(255,255,255,0.07)`, name 17px `#c8c9d8`, CEFR mono 12px `letter-spacing .14em` `#83859c`.
- **Skills** — exactly two groups, each `padding: 22px 0 26px`, `border-top: 1px solid rgba(255,255,255,0.09)`: *Used in production* (`#8ff0ff`) and *Used in personal projects* (`#9dffd6`), each followed by a 17px/1.85 `#c5c6d5` paragraph. There is no “currently learning” group — do not add one.

## Interactions &amp; behaviour

### Routing

Hash-based, one history entry per destination: `#backend`, `#projects`, `#xr`,
`#about`; no hash = hub. `go(id)` pushes the entry **and drives `jump()`
directly** rather than waiting for the resulting `hashchange` (some embedding
contexts sandbox History). `popstate` / `hashchange` also route, so Back walks
the visited destinations.

One delegated click handler intercepts **every** `href="#…"` in the document, so
nothing performs a document load. Escape and every `[data-exit]` call `exit()`,
which is hard-wired to `go(null)` — the hub.

> `exit()` must never be `history.back()`. Back replays whichever panel was
> visited *before* this one (wrong intent — the user asked for the scene), and
> where History is unavailable it silently does nothing, stranding `current` on a
> closed panel, which then dead-locks canvas input because pointer handling
> ignores clicks while a panel is considered open.

Deep links work: `/#xr` opens that panel immediately with the camera already
parked and **no warp** (there is nothing to transition from).

### The jump

`jump(target)` is the only transition — hub→panel, panel→panel and panel→hub all
use it:

1. From the hub only: `hub.launch(id)` flies the ship out first, a **380 ms** head start.
2. `Warp.cover()` spools the streak field up and goes opaque.
3. At **~92 % opacity**, `commit(target)` runs *under the cover*: panel visibility swap, `returnShip()`, `park(target)`, title update, scroll reset.
4. `Warp.clear()` decelerates out of lightspeed onto the already-composed panel.

Overlapping jumps queue in `_pending` — they never interleave.

Timings, all preserved exactly: ship flight **1150 ms** along a quadratic Bézier
(wind-up recoil → banked arc → committed roll → stretched exit) while the camera
dollies back and FOV opens **17°**; overlay spool-up at **380 ms**; navigation
fires once opaque at **~1.4 s** and never later than `MAX_COVER` **2200 ms**;
minimum opaque time `MIN_COVER` **900 ms**; hold-at-speed cap `HOLD_CAP`
**3400 ms**; deceleration **1 s**; clear-watchdog at `COVER + CLEAR + 700`.

Two invariants keep the router from wedging — both were learned the hard way:

- **`_going` is never released solely by `warp.clear().then(...)`.** `finish()` is idempotent, carries a jump token, and is reachable from the animation *and* from the watchdog. A stalled warp costs one ugly transition, not a dead site.
- **Input is gated on `current` only, never on `_going`.** Gating clicks on the transition flag turns any hiccup into dead canvas input — the symptom is “only the planet titles work”, because label anchors route through the delegated click handler instead.

Only one `Warp` owns the shared `#smoke` canvas at a time: `jump()` disposes the
previous instance before constructing the next, and `dispose()` clears the
canvas, hides it, and resolves any pending `clear()` promise — otherwise a
torn-down instance leaves the screen covered forever.

The streak field is deliberately **texture-free**: no image data, no canvas
generation, nothing built at click time — construction is a few hundred plain
objects, each frame a few hundred line strokes. An earlier sprite-based version
baked and tinted sixteen 160² textures synchronously inside the click handler,
which made the click feel like it hung. Do not reintroduce per-click texture
work.

### Canvas input

Two paths into one deduplicated `nav()`: the `pointerdown`/`pointerup` pair
(which distinguishes a click from an orbit drag) and a plain `click` on the
canvas, which still fires when the `pointerdown` was swallowed by pointer
capture or an overlapping label hit-box. Keep both.

### Camera

Scroll, horizontal drag, and ←/→ pan the camera along a fixed azimuth arc
clamped at **±0.5 rad** (`AZ_LIMIT`). Critically damped lerp, factor **0.08**.
Starfield parallaxes least, nebula more, planets most. Azimuth persists in
`sessionStorage` and is restored on return; `hubAz` remembers it across a panel
visit. A hash on load orients the camera. A one-time ~**10°** drift plays on
first load if the user hasn't interacted.

### Hover / focus

Raycast throttled to **30 Hz** and skipped during transitions. On hover the
planet scales to **1.055**, the fresnel rim strengthens, a soft additive halo
sprite blooms, and the surface picks up a low emissive in its own hue; the
leader line extends, the label brightens to its hover tint, the custom reticle
appears at the pointer, and the destination is prefetched. At rest the ship noses
toward the pointer. **Tab** cycles the four labels with the same treatment;
**Enter** launches.

### Parked scene (panel open)

The renderer keeps running. `park(id)` puts the camera on station off the
destination planet: azimuth set to that planet's `theta`, standoff distance
solved so the planet reads ≈**24 % of viewport height**, aim point dropped so it
frames high — above the panel's opaque slab, inside the transparent 44 vh hero.
A single rAF loop adds a slow sine wander plus an offset driven by the panel's
own `scrollTop`; that offset is the parallax, amount **0.10** by default.
`unpark()` eases everything back and restores `AZ_LIMIT`.

### Reduced motion

Under `prefers-reduced-motion: reduce`: no drift, no bob, no parallax, ambient
rotation near zero, grain animation off, and clicking a planet does a **200 ms
cross-fade** instead of the flight.

### Print

The print stylesheet flattens the document: white background, `#111` text, and
`display: none` on `[data-grain]`, `#scene`, `#smoke`, `#reticle`,
`[data-panel-top]`, `[data-hero]`; all `[data-panel]`s become
`position: static; visibility: visible; opacity: 1`. Result: the whole CV prints
as one continuous document. This must survive the port.

## State management

Module-level state in the router (no store needed):

| Name | Meaning |
| --- | --- |
| `current` | Open panel id, or `null` for the hub. **The only input gate.** |
| `_going` | A jump is in flight. Never gates input; only serialises jumps. |
| `_pending` | Queued jump target while one is in flight. |
| `_token` | Per-jump token so a stale `finish()` can't unwedge a newer jump. |
| `warp` | The single live `Warp` instance owning `#smoke`. |
| `hubAz` | Hub azimuth remembered across a panel visit. |
| `window.__dgHub` | The one `WebGLRenderer` + scene per document. |
| `window.__dg3dReady` | Set once the scene has booted. |
| `sessionStorage['dg-az']` | Persisted camera azimuth. |

Transitions: `route(hash)` → `go(id)` → `jump(target)` → `commit(target)` →
`finish(token)`. No data fetching anywhere; the site is fully static.

**Renderer lifetime:** a canvas can only ever hold one WebGL context.
Re-initialising on a remount destroyed it permanently and left a black hub. Init
exactly once, reuse on any re-entry, rebind callbacks rather than rebuilding,
and dispose only on `pagehide`. Pause on `visibilitychange`; keep rendering
(parked) while a panel is open.

## Design tokens

```css
--void:    #05060d;  /* page base, blue-violet cast */
--void-2:  #080a13;  /* panel cards */
--void-3:  #070912;  /* text-edition cards (hover #0c1020) */
--ink:     #f4f2fa;  /* headings */
--body:    #c2c3d3;  /* body text */
--muted:   #83859c;  /* metadata, stack lines */
--dim:     #8a8ca3;  /* chrome text — min 4.5:1 on --void */
--marker:  #5e6076;  /* decoration only: list markers, hairlines */
--ember:   #ff9a4d;  /* engine glow — the one warm accent */
--hover:   #ffb877;  /* universal link hover */

--backend:  #3fd8ff;   --backend-hover:  #8ce7ff;
--projects: #38ffb0;   --projects-hover: #84ffcb;
--xr:       #b26bff;   --xr-hover:       #d0a6ff;
--about:    #ff9b3d;   --about-hover:    #ffc182;

--rule:      rgba(255,255,255,0.07);   /* hairlines, borders */
--rule-card: rgba(255,255,255,0.08);
--rule-2:    rgba(255,255,255,0.09);
--bar:       rgba(5,6,13,0.72);        /* sticky bar, blur(10px) */
```

Type — three families, all from the Google Fonts CDN:

- **Bodoni Moda** (`opsz 6..96`, weights 400/500) — display: `h1`, `h2`, `h3`, planet names, card titles. Always weight 400. Fallback `Georgia, serif`.
- **Archivo** (400/500/600) — body copy. Fallback `'Helvetica Neue', Helvetica, sans-serif`.
- **IBM Plex Mono** (400/500) — chrome, dates, stack rows, all uppercase micro-labels. Fallback `monospace`.

Type scale actually in use: `clamp(38px,7vw,84px)` fallback h2 · `clamp(38px,6vw,62px)` panel h1 · `clamp(26px,3.4vw,34px)` employment h3 · `clamp(24px,3vw,30px)` entry h2 · `clamp(23px,2.8vw,28px)` project h2 · `clamp(22px,2.6vw,27px)` card h3 · `clamp(22px,2.4vw,32px)` hub h1 · `clamp(17px,1.9vw,20px)` intro · 20px planet name · 18px links · 17px body · 16px bullets · 12px mono meta · 11px mono chrome · 10px mono eyebrows.

Spacing rhythm: section gap `clamp(40–48px, 7–8vh, 64–80px)`; entry padding
`clamp(28px,4vw,38px) 0`; card padding `clamp(24px,3.4vw,34px)`; column
`max-width: 720px`; measure caps `60ch` / `62ch` / `46ch` / `34ch`; bullet gap
9px; list gap 14px; link-row gap 22px.

Radii: **0 everywhere** except the 2px quality button and the circular reticle.
No shadows anywhere — depth comes from the scene, gradients, and hairlines.

## Assets

| Asset | Notes |
| --- | --- |
| `assets/cv.pdf` | Linked from every panel footer, the contact block, and the text edition. Serve at `/cv.pdf`. Placeholder — owner will replace. |
| `assets/og.png` | OG / Twitter card image. **Regenerate** once the real name and role are in. |
| `assets/robots.txt`, `assets/sitemap.xml` | Both still contain `https://example.com`. Replace with `https://golosov-danylo.com`. |
| `assets/models-README.md` | The drop-in contract for the ship model. |
| Grain texture | Inline SVG `feTurbulence` data URI — no file. |
| Planet textures | **Generated at runtime**, no image files: per planet one albedo (640², 384² low) and one bump (256², 160² low), from domain-warped FBM, ridged noise and 3D worley craters, in four archetypes (ocean world with separate cloud shell, rocky, banded ice giant, cratered desert). Baked once at init; nothing procedural runs per frame. |
| Ship | A placeholder built from primitives. **Ship as-is** — the glTF swap is a later task, out of scope here. |

No icon set, no photography, no illustration. If imagery is ever added it goes
in the hero windows, not the body column.

## Copy tokens

Every visible string is `{{TOKEN}}`. **The owner fills these in code — leave them
in place, exactly as they render.** Two mechanisms in the prototype exist purely
because of the authoring tool and should be simplified in the port:

- In markup, tokens are written `{<!---->{TOKEN}}` so the template parser leaves
  them alone; they *render* as `{{TOKEN}}`. **In the port, write them plainly as
  `{{TOKEN}}`** — the escape has no purpose outside the authoring tool. A single
  pass `s/\{<!---->\{/{{/g` converts the markup.
- `<title>` is RCDATA, so it can't hold a token in the prototype's markup. It is
  assigned from JS and re-asserted by a `MutationObserver` on `document.head`,
  because the authoring tool injects its own `<title>` at an unpredictable time.
  **In the port, put the real title in `<head>` and delete the fallback, the
  observer, and `assertTitle()` entirely.** Keep the *behaviour* that the title
  becomes `<Panel title> — {{FULL_NAME}}` on every jump and reverts on the hub.

Tokens that live in attributes or structured data can't sit in markup at all;
they're string constants applied on mount and must stay that way:

- `applyHeadTokens()` — mirrors `{{META_DESCRIPTION}}` and `{{FULL_NAME}} — {{ROLE_TAGLINE}}` onto `meta[name=description]`, `og:title`, `og:description`.
- `TITLES` — the four panel titles.
- Projects `LINKS` — `{{PROJECT_n_REPO_URL}}`, `{{PROJECT_n_DEMO_URL}}`.
- About `DATA` — `{{EMAIL}}`, `{{GITHUB_URL}}`, `{{LINKEDIN_URL}}`, `{{FULL_NAME}}`, `{{ROLE_TAGLINE}}`, `{{LOCATION}}` (also feeds the `Person` JSON-LD).

Full list:

- **Hub / global** — `FULL_NAME`, `ROLE_TAGLINE`, `LOCATION`, `META_DESCRIPTION`
- **Backend** — `BACKEND_INTRO`; per block 1–4: `BACKEND_BLOCK_n_ORG`, `_TITLE`, `_DATES`, `_LOCATION`, `_SUMMARY`, `_POINT_1..3`, `_STACK`
- **Projects** — `PROJECTS_INTRO`; per project 1–4: `PROJECT_n_TITLE`, `_STATUS`, `_SUMMARY`, `_POINT_1..2`, `_STACK`, `_REPO_URL`, `_DEMO_URL`
- **XR** — `XR_INTRO`, `ZAUBAR_ROLE_TITLE`, `ZAUBAR_DATES`, `ZAUBAR_LOCATION`, `ZAUBAR_SUMMARY`, `ZAUBAR_POINT_1..3`, `ZAUBAR_STACK`; per project 1–3: `XR_PROJECT_n_TITLE`, `_DATES`, `_SUMMARY`, `_STACK`
- **About** — `ABOUT_BIO`, `EMAIL`, `GITHUB_URL`, `LINKEDIN_URL`, `EDUCATION_QUALIFICATION`, `EDUCATION_INSTITUTION`, `EDUCATION_DATES`, `EDUCATION_LOCATION`, `EDUCATION_NOTE`, `LANGUAGE_1..3_NAME`, `LANGUAGE_1..3_CEFR`, `SKILLS_PRODUCTION`, `SKILLS_PERSONAL_PROJECTS`

Recommendation (confirm with the owner): put them in one typed
`src/content.ts`, keep the `{{TOKEN}}` strings as the default values, and render
markup from it — one file to fill, and a unit test can assert no `{{` survives
in a production build.

## Content rules baked into the design

These are editorial requirements, not styling preferences. Do not "clean them up".

1. The Projects panel carries the visible notice **“Independent projects — personal work, not employment.”**
2. The **only** employment styling in the site is on the XR panel: a section headed `Employment`, a 2px violet top rule, a larger heading, no card background. The XR personal projects sit below under their own heading with the same card styling as the Projects panel.
3. Backend blocks use neutral (non-employment) styling. If one becomes employment, move it to the XR employment treatment; do not restyle the Backend blocks.
4. Skills are exactly two headed groups: *Used in production* and *Used in personal projects*. There is no “currently learning” group anywhere.
5. No seniority claim appears in copy, chrome, meta tags, or JSON-LD. `ROLE_TAGLINE` is a role description; keep it that way.
6. Each panel has exactly one `<h1>`.

## Accessibility

Non-negotiable — the owner listed it as a must-preserve:

- Both canvases (`#scene`, `#smoke`) are `aria-hidden="true"`. All navigation is exposed through real `<a href="#…">` anchors.
- The four planet labels are keyboard-reachable, in DOM order, with `outline-offset: 6px` on focus and the same visual treatment as hover; Enter launches.
- Escape closes any panel.
- Chrome text meets ≥4.5:1 on `--void` (`--dim #8a8ca3` is the floor — don't go dimmer for text).
- Landmarks: `main#stage`, `nav#labels[aria-label="Destinations"]`, one `<h1>` per panel, `aria-label` / `aria-labelledby` on every panel section.
- Decorative layers (vignette, grain, hero, reticle) are `aria-hidden` and `pointer-events: none`.
- The text edition is the no-JS / no-WebGL state, reachable and complete.

## Performance budget

- **Transfer < 900 KB** total. The prototype's CDN `three` build is unminified and must be bundled and tree-shaken instead — this is the single biggest line item.
- **≤ 25 draw calls** in the hub. Rim glow is a back-face fresnel shell and the halo is additive geometry; there is **no effect composer**. Keep it that way.
- DPR clamped to **2** desktop / **1.5** mobile.
- **Zero allocations in the render loop.**
- `detectQuality()` drops texture resolution, star count and particle count on small or low-core devices; the hub's quality readout doubles as an fps meter.
- Renderer pauses on `visibilitychange`; pauses under the warp cover the moment nothing visible is behind it; keeps running while parked behind a panel.

## Files in this bundle

```
README.md                      this document — the specification
PORT_PLAN.md                   file-by-file build order
CLAUDE.md                      drop into the new repo root
TASKS.md                       ordered task checklist
ACCEPTANCE.md                  acceptance criteria + the test suite to write
design/
  index.dc.html                the prototype: markup, styles, router, all logic
  space-engine.js              three.js hub — initHub / park / unpark / returnShip / launch
  warp.js                      hyperspace cover (only the Warp class is live; the
                               writeLaunch/readLaunch/bindDepartures helpers are dead)
  HOW_TO_RUN.md                how to serve this folder and see the real thing
  support.js                   authoring-tool runtime, REFERENCE ONLY — do not port
  BUILD_NOTES.md               the original build notes, incl. every bug and why
                               each invariant exists. Read before touching the router.
assets/
  cv.pdf  og.png  robots.txt  sitemap.xml  models-README.md
screenshots/
  01-hub.png                   hub
  02-backend.png               Backend & Platform on arrival
  03-projects.png              Independent Projects
  04-xr.png                    XR / AR
  05-about.png                 About & Contact
  06-text-edition.png          text edition (flattened, no WebGL)
```

Screenshots are references for framing and rhythm, not for measurement — measure
in the prototype. Note that planet-label positions in `index.dc.html` markup are
initial values the engine overwrites, so the screenshots and the markup disagree
on purpose.

## Open questions for the owner

Raise these before implementing the affected part; do not guess.

1. **Real URLs (`/xr`) instead of hash routes (`/#xr`)?** Better for sharing and crawling; costs a prerender step. The routing code already funnels through `route()` / `go()` / `hashId()` — only `hashId()` would read `pathname` instead.
2. **Analytics** — the answer was "port only", so none is included. Confirm.
3. **Where the copy lives** — one typed `content.ts`, or tokens left inline in the markup?
4. **Host** — undecided, so the build is plain static `dist/`. Naming a host lets us add its config and headers.
5. **`cv.pdf` and `og.png`** are placeholders. Final files needed before launch.
