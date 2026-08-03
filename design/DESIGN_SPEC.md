# Design spec

Measurements of record for the site. `src/styles.css` and `index.html` are
authoritative — this file documents *intent*, so a value that drifts in code can
be judged as a fix or a regression rather than guessed at. The reference
prototype (`design/index.dc.html`) is where the numbers came from; measure there
when something here is ambiguous.

Editorial rules (the Projects notice, the single employment treatment, the two
skills groups) live in `CLAUDE.md`. The history behind each router invariant
lives in `design/BUILD_NOTES.md`.

---

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

Per-destination accents come from `[data-panel="…"] { --accent: … }`, never from
duplicated rulesets. No magic hexes in rules.

## Type

Three families, all from the Google Fonts CDN:

- **Bodoni Moda** (`opsz 6..96`, weights 400/500) — display: `h1`, `h2`, `h3`,
  planet names, card titles. **Always weight 400.** Fallback `Georgia, serif`.
- **Archivo** (400/500/600) — body copy. Fallback
  `'Helvetica Neue', Helvetica, sans-serif`.
- **IBM Plex Mono** (400/500) — chrome, dates, stack rows, all uppercase
  micro-labels. Fallback `monospace`.

Scale in use: `clamp(38px,7vw,84px)` text-edition h2 · `clamp(38px,6vw,62px)`
panel h1 · `clamp(26px,3.4vw,34px)` employment h3 · `clamp(24px,3vw,30px)` entry
h2 · `clamp(23px,2.8vw,28px)` project h2 · `clamp(22px,2.6vw,27px)` card h3 ·
`clamp(22px,2.4vw,32px)` hub h1 · `clamp(17px,1.9vw,20px)` intro · 20px planet
name · 18px links · 17px body · 16px bullets · 12px mono meta · 11px mono chrome
· 10px mono eyebrows.

## Spacing, radii, depth

Section gap `clamp(40–48px, 7–8vh, 64–80px)`; entry padding
`clamp(28px,4vw,38px) 0`; card padding `clamp(24px,3.4vw,34px)`; column
`max-width: 720px`; measure caps `60ch` / `62ch` / `46ch` / `34ch`; bullet gap
9px; list gap 14px; link-row gap 22px.

Radii are **0 everywhere** except the 2 px fps chip and the circular reticle.
The loading dial is round too, but as SVG geometry rather than a radius — not a
third exception to reach for.

**No shadows anywhere.** Depth comes from the scene, gradients, and hairlines.

---

## Hub (route: no hash)

Full-viewport `<main id="stage">`, `overflow: hidden`, background `#05060d`.
Stacked children, back to front:

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

**Header** — `<h1>` Bodoni Moda 400, `clamp(22px, 2.4vw, 32px)`,
`line-height 1.1`, `letter-spacing .005em`, `#f2f0f8`, text `{{FULL_NAME}}`.
Below it two IBM Plex Mono 12px lines, `letter-spacing .09em`, uppercase,
`line-height 1.6`, `max-width 34ch`: `{{ROLE_TAGLINE}}` in `#9294ab`
(margin-top 10px) and `{{LOCATION}}` in `#8a8ca3` (margin-top 6px).

**Foot** — an `<a href="#about" id="skip-scene">` reading *“Skip the scene →
read the CV”*: IBM Plex Mono 11px, `letter-spacing .14em`, uppercase, `#83859c`,
`border-bottom: 1px solid rgba(131,133,156,0.35)`, `padding-bottom: 2px`; hover
`#ffb877` with border `rgba(255,184,119,0.6)`. Then
`<div id="fps" aria-hidden="true">` — transparent, `1px solid
rgba(131,133,156,0.28)`, `radius 2px`, `padding 5px 9px`, mono 10px,
`letter-spacing .14em`, uppercase, `#9294ab`; content
`<span id="fps-readout">--</span> fps`.

The fps chip is **a readout, not a control**: no hover state, no
`cursor: pointer`, not in the tab order, and it does not grow the reticle. The
quality tier it once claimed to toggle is fixed at `initHub()` and cannot change
live under the one-renderer-per-document rule.

**HUD hint** — mono 10px, `letter-spacing .16em`, uppercase, `#8a8ca3`, text
*“Drag / scroll to pan · Tab to cycle”*.

**Planet labels** — one `<a>` per destination, `position: absolute`,
`transform: translate(-50%, 0)`, `display: grid; justify-items: center`,
`padding: 6px 10px 8px`, `text-align: center`, `outline-offset: 6px`. The
`left`/`top` in markup are **initial values only** — the engine repositions each
label every frame from the projected planet position. Screenshots and markup
disagree on purpose.

Each label stacks four children:

1. `[data-leader]` — 1px × 26px, `linear-gradient(to bottom, <accent>/0, <accent>/0.85)`, `transition: height 300ms ease`, extends on hover.
2. Index — mono 11px, `letter-spacing .22em`, uppercase, in the planet's accent.
3. `[data-name]` — Bodoni Moda 20px, `letter-spacing .01em`, `#eceaf4`, `transition: color 300ms ease`; on hover/focus becomes the planet's hover tint.
4. Kicker — mono 10px, `letter-spacing .14em`, uppercase, `#eceaf4`.

| id | href | Index | Name | Kicker | Accent | Hover tint |
| --- | --- | --- | --- | --- | --- | --- |
| `lbl-backend` | `#backend` | 01 | Backend &amp; Platform | Services · Data · Delivery | `#3fd8ff` | `#8ce7ff` |
| `lbl-projects` | `#projects` | 02 | Independent Projects | Personal work | `#38ffb0` | `#84ffcb` |
| `lbl-xr` | `#xr` | 03 | XR / AR | Unity · Spatial | `#b26bff` | `#d0a6ff` |
| `lbl-about` | `#about` | 04 | About &amp; Contact | CV · Languages | `#ff9b3d` | `#ffc182` |

## Text edition (`#fallback`)

The whole site without WebGL — no-WebGL devices, context loss, crawlers, print,
scripting off. **This is the default state**, faded out on success; it is not an
error branch.

`position: fixed; inset: 0; z-index: 20; overflow-y: auto`,
`background: linear-gradient(180deg, #05060d 0%, #080a15 60%, #05060d 100%)`,
`padding: clamp(28px,7vh,88px) clamp(20px,6vw,96px)`. Inner wrapper
`max-width: 1080px; margin: 0 auto`.

- Eyebrow — mono 11px, `letter-spacing .2em`, uppercase, `#8a8ca3`, *“Portfolio · Text edition”*, `margin-bottom: clamp(28px,6vh,56px)`.
- `<h2>` — Bodoni Moda 400, `clamp(38px,7vw,84px)`, `line-height 1.02`, `letter-spacing -.01em`, `#f2f0f8`, `{{FULL_NAME}}`.
- Lede — `clamp(16px,1.6vw,19px)`, `line-height 1.6`, `#b6b7c8`, `max-width 46ch`, `{{ROLE_TAGLINE}} · {{LOCATION}}`.
- Card grid — `repeat(auto-fit, minmax(240px, 1fr))`, `gap: 1px` on a `rgba(255,255,255,0.07)` background with a matching 1px border, so the gap draws the hairlines. Each card `padding: clamp(20px,3vw,30px)`, `background: #070912`, hover `#0c1020`; index in the destination accent (mono 11px, `letter-spacing .2em`), name in Bodoni Moda `clamp(20px,2.2vw,26px)` `#eceaf4`, `margin-top 14px`.
- Footer line — mono 11px uppercase `#8a8ca3`, *“Full navigation without 3D.”* plus a CV link (`#a9aabd`, hairline underline).

**When it shows:** an inline head script probes for a WebGL context. On success
it sets `data-dg-3d` on `<html>` and drops the shipped `data-dg-flat`, which
fades `#fallback` out (`opacity 0; pointer-events: none;
transition: opacity 400ms ease`). On failure nothing happens and the text
edition simply stays. `flatten()` puts it back on `webglcontextlost`.

## Loading screen (`#loading`, 3D path only)

Covers the boot gap: the head probe fades `#fallback` out before first paint,
and `.scene` does not come up until the engine chunk has downloaded and the
planet textures have baked. Display is gated on `data-dg-3d`, so with scripting
off it never appears; it sits inside `#stage`, so the flat and print states
already hide it. `aria-hidden`, no focusable node, `z-index` above the panel
shell so a deep link stays covered until there is something behind it.

`{{FULL_NAME}}` in the hub's display face, `{{LOADING_LABEL}}` beneath it in
mono, and below both a **progress dial**: a 2 px ring, track `--rule`, arc
`--hover`, starting at twelve o'clock, percentage in mono at its centre,
`72px × --type-scale` across.

The value is **determinate and real** (`src/loading-ring.ts`). Three boot
milestones set floors the dial may not pass before they have happened; it eases
toward the next one in between:

| Milestone | Floor |
| --- | --- |
| the engine chunk resolves | 70 |
| `initHub()` returns — textures baked, scene built | 90 |
| the first frame is composited | 99 |
| the screen is dismissed | 100 |

The curve approaches each floor without crossing it and the readout is capped at
99 while it runs, so **100 appears only once the scene is genuinely behind the
screen**. A dial that filled on a timer would be decoration pretending to be
data. A boot that stalls past 12 s never reaches 100 — the document flattens to
the text edition instead.

## Destination panels

All four share one skeleton; only the accent, the eyebrow text and the body
composition differ.

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
`<span>` with `gap: 18px` — `Esc` in `#5f6178`, then `NN · Title` in the accent.

**Hero** — `position: relative; height: 44vh; min-height: 220px;
pointer-events: none`, `aria-hidden`. Contains only a scrim,
`linear-gradient(180deg, rgba(5,6,13,0) 0%, rgba(5,6,13,0.1) 55%, rgba(5,6,13,0.75) 84%, #05060d 100%)`,
and a bottom-left arrival tag (`left: clamp(18px,4vw,44px); bottom: 18px`, mono
10px, `letter-spacing .24em`, uppercase, accent-coloured, *“Arrived ·
&lt;Title&gt;”*). The panel background is `transparent` here, so what shows
through is the live parked planet — load-bearing, and the reason the renderer
must keep running while a panel is open.

**Panel `<h1>`** — Bodoni Moda 400, `clamp(38px,6vw,62px)`, `line-height 1.05`,
`letter-spacing -.012em`, `#f4f2fa`.

**Intro paragraph** — `clamp(17px,1.9vw,20px)`, `line-height 1.65`, `#a9aabe`,
`max-width 60ch`, `margin-top 22px` (24px on Projects, under the notice).

### Shared body atoms

- *Neutral entry* (Backend) — `<article>` `padding: clamp(28px,4vw,38px) 0`, `border-bottom: 1px solid rgba(255,255,255,0.07)`. Org line: mono 10px, `letter-spacing .22em`, uppercase, accent. `<h2>`: Bodoni Moda `clamp(24px,3vw,30px)`, `line-height 1.2`, `#eeecf6`, `margin-top 12px`. Meta: mono 12px, `letter-spacing .1em`, `#7b7d95`, `Dates · Location`. Summary: 17px/1.75 `#c2c3d3`. Then a bullet list and a stack line.
- *Panel card* (Projects, XR personal) — `padding: clamp(24px,3.4vw,34px)`, `background: #080a13`, `border: 1px solid rgba(255,255,255,0.08)`; cards in a `grid; gap: 20px`.
- *Bullet list* — `list-style: none`, `display: grid; gap: 9px`, each `li` `position: relative; padding-left: 20px`, 16px/1.65 `#b0b1c4`, with a `::before` em-dash at `left: 0` in `#5e6076` (`#6b5a9e` inside the XR employment block).
- *Stack line* — mono 12px, `line-height 1.7`, `letter-spacing .04em`, `#83859c`, prefixed `Stack — `.
- *Section heading* — mono 11px, weight 500, `letter-spacing .26em`, uppercase; `#9294ab` normally, tinted when it carries meaning (`#dcb6ff` Employment, `#ffd39a` Contact, `#8ff0ff` / `#9dffd6` for the two skills groups).
- *“Elsewhere in the system”* — `margin-top: clamp(48px,8vh,80px)`; label mono 10px `letter-spacing .24em` uppercase `#8a8ca3`; then a `grid; gap: 14px` of the **other three** destinations — flex, `align-items: baseline`, `gap: 14px`, 18px `#d3d4e2`, hover `#ffb877`, index in mono 11px `letter-spacing .2em` in that destination's accent.
- *Footer* — `margin-top: clamp(48px,8vh,80px)`, `padding-top: 24px`, `border-top: 1px solid rgba(255,255,255,0.07)`, flex wrap `gap: 10px 26px`, mono 11px `letter-spacing .12em` uppercase `#9294ab`: a CV link (`#a9aabd`, hairline underline) and a second *“← Back to system”* `[data-exit]`.

### Backend & Platform (`#backend`, accent `#3fd8ff`)

`h1` *Backend & Platform*, intro `{{BACKEND_INTRO}}`, then a 1px gradient rule
(`margin-top: clamp(40px,7vh,68px)`,
`linear-gradient(to right, rgba(63,216,255,0.55), rgba(255,255,255,0.05) 60%, rgba(255,255,255,0))`),
then **four neutral entries** (`BACKEND_BLOCK_1..4`), each with 3 bullets.

Neutral styling is deliberate: these are *not* presented as employment.

### Independent Projects (`#projects`, accent `#38ffb0`)

`h1` *Independent Projects*. Immediately below it the mandatory notice —
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
`#9dffd6`, `border-bottom: 1px solid rgba(157,255,214,0.45)`,
`padding-bottom 3px`, hover `#ffb877`. Their `href`s are `#` in markup and
assigned at runtime from the content table (`data-repo="n"` / `data-demo="n"`).

### XR / AR (`#xr`, accent `#b26bff`)

`h1` *XR / AR*, intro `{{XR_INTRO}}`, then two sections.

**Employment** — `margin-top: clamp(44px,7vh,72px)`, heading *Employment* in
`#dcb6ff`. One `<article>`, `padding: 26px 0 34px`,
`border-top: 2px solid #b26bff`, **no card background** — the only employment
styling in the whole site. Eyebrow *Employment · ZAUBAR* (mono 10px,
`letter-spacing .22em`, `#dcb6ff`); `<h3>` `{{ZAUBAR_ROLE_TITLE}}` Bodoni Moda
`clamp(26px,3.4vw,34px)` `#f2f0fa`; meta `{{ZAUBAR_DATES}} ·
{{ZAUBAR_LOCATION}}`; summary 17px/1.75 `#c8c9d8`; 3 bullets (violet `::before`);
stack line.

**XR work — personal projects** — heading in `#9294ab` plus a sub-line
*“Personal work, not employment.”* (mono 11px, `line-height 1.7`,
`letter-spacing .06em`, uppercase, `#8a8ca3`), then three panel cards
(`XR_PROJECT_1..3`): `<h3>` Bodoni Moda `clamp(22px,2.6vw,27px)`, meta
`Independent · {{…_DATES}}`, summary, stack line. No bullets, no links.

### About & Contact (`#about`, accent `#ff9b3d`)

`h1` `{{FULL_NAME}}`; below it mono 12px `letter-spacing .14em` uppercase
`#9294ab` reading `{{ROLE_TAGLINE}} · {{LOCATION}}`; bio
`clamp(17px,1.9vw,20px)`/1.7 `#b6b7c9`, `max-width 62ch`, `margin-top 26px`.
Then four sections, each `margin-top: clamp(40px,7vh,64px)`:

- **Contact** — a panel card (`#080a13`, 1px `rgba(255,255,255,0.08)`), heading `#ffd39a`, then a `grid; gap: 14px` of rows: each row `flex; align-items: baseline; gap: 14px`, 18px `#dcdde9`, hover `#ffb877`, with a `min-width: 92px` mono 11px `letter-spacing .16em` uppercase `#9294ab` label. Rows: Email (`#lnk-email`), GitHub (`#lnk-github`), LinkedIn (`#lnk-linkedin`) — hrefs assigned at runtime — and CV (`cv.pdf`, `#ffd39a`, *Download PDF ↗*).
- **Education** — one `<article>`, `padding-top: 22px`, `border-top: 1px solid rgba(255,255,255,0.09)`: `<h3>` qualification, meta `Institution · Dates · Location`, note.
- **Languages** — a 3-row list; container `border-top: 1px solid rgba(255,255,255,0.09)`, each `li` `flex; justify-content: space-between; padding: 14px 0`, `border-bottom: 1px solid rgba(255,255,255,0.07)`, name 17px `#c8c9d8`, CEFR mono 12px `letter-spacing .14em` `#83859c`.
- **Skills** — exactly two groups, each `padding: 22px 0 26px`, `border-top: 1px solid rgba(255,255,255,0.09)`: *Used in production* (`#8ff0ff`) and *Used in personal projects* (`#9dffd6`), each followed by a 17px/1.85 `#c5c6d5` paragraph.

---

## Motion & behaviour

### Routing

Hash-based, one history entry per destination: `#backend`, `#projects`, `#xr`,
`#about`; no hash = hub. `go(id)` pushes the entry **and drives `jump()`
directly** rather than waiting for the resulting `hashchange` (some embedding
contexts sandbox History). `popstate` / `hashchange` also route, so Back walks
the visited destinations.

One delegated click handler intercepts **every** `href="#…"` in the document, so
nothing performs a document load. Escape and every `[data-exit]` call `exit()`,
hard-wired to `go(null)` — the hub.

> `exit()` must never be `history.back()`. Back replays whichever panel was
> visited *before* this one (wrong intent — the user asked for the scene), and
> where History is unavailable it silently does nothing, stranding `current` on
> a closed panel, which dead-locks canvas input because pointer handling ignores
> clicks while a panel is considered open.

Deep links work: `/#xr` opens that panel immediately with the camera already
parked and **no warp** — there is nothing to transition from.

### The jump

`jump(target)` is the only transition — hub→panel, panel→panel and panel→hub all
use it:

1. From the hub only: `hub.launch(id)` flies the ship out first, a **380 ms** head start.
2. `Warp.cover()` spools the streak field up and goes opaque.
3. At **~92 % opacity**, `commit(target)` runs *under the cover*: panel visibility swap, `returnShip()`, `park(target)`, title update, scroll reset, analytics view.
4. `Warp.clear()` decelerates out of lightspeed onto the already-composed panel.

Timings: ship flight **1150 ms** along a quadratic Bézier (wind-up recoil →
banked arc → committed roll → stretched exit) while the camera dollies back and
FOV opens **17°**; overlay spool-up **380 ms**; navigation fires once opaque at
**~1.4 s** and never later than `MAX_COVER` **2200 ms**; minimum opaque time
`MIN_COVER` **900 ms**; hold-at-speed cap `HOLD_CAP` **3400 ms**; deceleration
**1 s**; clear-watchdog at `COVER + CLEAR + 700`.

Overlapping jumps queue in `_pending` — they never interleave.

Two invariants keep the router from wedging:

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
appears at the pointer, and the destination is prefetched. At rest the ship
noses toward the pointer. **Tab** cycles the four labels with the same
treatment; **Enter** launches.

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

The loading dial keeps reading, because it is a readout and not decoration — the
same standing the `#fps` chip has. What changes is the cadence: it samples its
curve every 400 ms instead of every frame, so the arc steps rather than glides,
and nothing transitions between the steps. Freezing it would mean an empty ring
for the whole of a slow boot.

### Print

The print stylesheet flattens the document: white background, `#111` text, and
`display: none` on `[data-grain]`, `#scene`, `#smoke`, `#reticle`,
`[data-panel-top]`, `[data-hero]`; all `[data-panel]`s become
`position: static; visibility: visible; opacity: 1`. The whole CV prints as one
continuous document — verify after any layout change.

### Runtime state

Module-level in the router; no store:

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
`finish(token)`. No data fetching anywhere.

**Renderer lifetime:** a canvas can only ever hold one WebGL context.
Re-initialising on a remount destroys it permanently and leaves a black hub.
Init exactly once, reuse on any re-entry, rebind callbacks rather than
rebuilding, dispose only on `pagehide`. Pause on `visibilitychange` — and only
there. Keep rendering while parked behind a panel *and* under the warp cover:
the park solve eases over frames, so a renderer stopped under the cover lifts it
onto a camera that has not moved.

---

## Assets

| Asset | Notes |
| --- | --- |
| `public/cv.pdf` | Linked from every panel footer, the contact block, and the text edition. Served at `/cv.pdf`. Placeholder. |
| `public/og.png` | OG / Twitter card image. Regenerate once the real name and role are in. |
| `public/robots.txt`, `public/sitemap.xml` | Carry the live origin; update both if the origin changes. |
| `public/models/` | Drop-in contract for the ship model. |
| Favicon | Inline SVG data URI in `<head>` — no file, no request, cannot 404. Placeholder mark. |
| Grain texture | Inline SVG `feTurbulence` data URI — no file. |
| Planet textures | **Generated at runtime**, no image files: per planet one albedo (640², 384² low) and one bump (256², 160² low), from domain-warped FBM, ridged noise and 3D worley craters, in four archetypes (ocean world with separate cloud shell, rocky, banded ice giant, cratered desert). Baked once at init; nothing procedural runs per frame. |
| Ship | Built from primitives. The glTF swap is a later task. |

No icon set, no photography, no illustration. If imagery is ever added it goes
in the hero windows, not the body column.

## Performance budget

- **Transfer < 900 KB** total; `three` is essentially the whole budget.
- **≤ 25 draw calls** in the hub. Rim glow is a back-face fresnel shell and the halo is additive geometry; there is **no effect composer**.
- DPR clamped to **2** desktop / **1.5** mobile.
- **Zero allocations in the render loop.**
- `detectQuality()` drops texture resolution, star count and particle count on small or low-core devices. The tier is chosen once at `initHub()` and is not exposed in the chrome.

## Accessibility

- Both canvases (`#scene`, `#smoke`) are `aria-hidden="true"`. All navigation is exposed through real `<a href="#…">` anchors.
- The four planet labels are keyboard-reachable in DOM order, with `outline-offset: 6px` on focus and the same visual treatment as hover; Enter launches.
- Escape closes any panel.
- Chrome text meets ≥ 4.5:1 on `--void` (`--dim #8a8ca3` is the floor — don't go dimmer for text).
- Landmarks: `main#stage`, `nav#labels[aria-label="Destinations"]`, one `<h1>` per panel, `aria-label` / `aria-labelledby` on every panel section.
- Decorative layers (vignette, grain, hero, reticle) are `aria-hidden` and `pointer-events: none`.
- The text edition is the no-JS / no-WebGL state, reachable and complete.
