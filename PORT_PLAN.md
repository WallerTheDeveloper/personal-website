# Port record

The port is finished. This was the build order that recreated the prototype as a
real project; it is kept because ~20 comments in `src/`, `tests/`, `build/`,
`index.html` and `vite.config.ts` cite it by step number. **The step numbers are
stable anchors — don't renumber them.**

Each step below states what it settled, in the present tense. Where a step's
original instruction has been superseded by later work, the current truth is what
is written here. The narrative of how each one landed is in `TASKS.md`, the bugs
behind the invariants are in `design/BUILD_NOTES.md`, and the measurements are in
`design/DESIGN_SPEC.md`.

---

## 0 — Feel it first

The prototype (`design/index.dc.html`) is the visual specification of record. It
uses ES-module imports, so it must be served over HTTP — `file://` silently drops
to the text edition:

```
cd design && npx serve .      # or: python3 -m http.server 8000
```

`serve` strips `.html`, so the URL is `/index.dc`. Needs internet: `three` comes
from unpkg, fonts from the Google Fonts CDN.

## 1 — Scaffold

Vite + TypeScript `strict`, hand-written rather than scaffolded. `tsconfig.json`
carries `strict`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`,
`exactOptionalPropertyTypes`, `target: ES2022`, `moduleResolution: bundler`.

**Single HTML entry.** The five-entry `rollupOptions.input` in
`design/BUILD_NOTES.md` predates the single-document architecture and is
obsolete. `three` is pinned to `0.160.x` — later versions change lighting and
colour-management defaults and would shift the look.

## 2 — `index.html`

The authoring layer is unwrapped: no `<x-dc>`, no `support.js`, `<helmet>`
hoisted into a real `<head>`, `{<!---->{TOKEN}}` written plainly as `{{TOKEN}}`,
`style-hover` / `style-before` attributes rewritten as CSS (step 3).

The inline WebGL probe stays **inline and blocking in `<head>`**. It must run
before first paint or the text edition flashes on every load.

**The DOM contract.** The engine, the router and several tests select on these;
every one must exist, and `#panel-{id}` in particular is not to be renamed:

`#stage`, `#scene`, `#smoke`, `#labels`, `#reticle`, `#hub-head`, `#hub-foot`,
`#hud-hint`, `#fps`, `#fps-readout`, `#skip-scene`, `#fallback`, `#loading`,
`#panel-{backend,projects,xr,about}`, `[data-panel]`, `[data-panel-top]`,
`[data-hero]`, `[data-exit]`, `[data-planet]`, `[data-leader]`, `[data-name]`,
`[data-grain]`, `[data-elsewhere]`, `[data-esc]`, `[data-screen-label]`,
`[data-repo="n"]`, `[data-demo="n"]`, `#lnk-email`, `#lnk-github`,
`#lnk-linkedin`, plus `html[data-dg-flat]` / `html[data-dg-3d]`.

Each panel also carries a zero-height `<span id="{id}" class="panel__anchor">` as
its first child, so hash links resolve in the flat and no-JS editions without
renaming the panel (step 8).

## 3 — `styles.css`

Every inline style extracted to classes; tokens as `:root` custom properties.
Per-destination accents come from one rule set keyed on `[data-panel="…"]`,
`[data-planet="…"]` **and** `a[href="#…"]` — the third selector tints the index
numerals in the text edition and in each panel's "Elsewhere" list. Do not instead
add `data-planet` to those links: the engine iterates `[data-planet]` and writes
screen positions onto every match.

Carried over verbatim because they are behavioural, not decorative: the
`grainShift` keyframes, the `html[data-dg-flat]` rules, the
`prefers-reduced-motion` block, and the whole `@media print` block. The
`!important` in the flat and print blocks is load-bearing — it overrides the
inline `visibility`/`opacity` the router writes onto each panel.

Global `a` / `a:hover` are defined (`#e9e7f2` / `#ffb877`).

## 4 — `content.ts` + `head.ts`

One typed table holds every token, each value defaulting to the literal
`{{TOKEN}}` string it replaces. Body copy is substituted **at build time** by
`build/copy-tokens.ts` (a `transformIndexHtml` plugin), so the served HTML
carries the copy with JS disabled.

`head.ts` applies what markup cannot hold: the per-route title
(`<Panel> — <name>`, reverting on the hub), `meta[name=description]`, `og:title`,
`og:description`, the `Person` JSON-LD (`name`, `jobTitle` from `ROLE_TAGLINE`
verbatim, `url`, `address`, `sameAs` — **no seniority claim**), the eight
projects `[data-repo]` / `[data-demo]` hrefs, and the three contact hrefs.

`assertTitle()` and the head `MutationObserver` are deliberately absent — they
existed only because the authoring tool injected its own `<title>`.

## 5 — `hub.ts` (from `space-engine.js`)

Typed and split: `hub.ts` is the single public entry, re-exporting `src/engine/*`
(`shaders`, `planets`, `capabilities`, `bake`, `planet-mesh`, `ship`, `sky`) so
callers never reach past it.

- **5.2** — `export { THREE }` is dropped; re-exporting would defeat tree-shaking, and `warp.ts` is a 2D canvas that needs none of it.
- **5.5** — `PLANETS` entries carry **no `href`** field, and `initPlanetBand` is deleted. Both were multi-page leftovers; routing keys on `id`. Pinned by a unit test.
- Preserved exactly: `DAMP 0.08`, `AZ_LIMIT ±0.5`, hover scale `1.055`, the 30 Hz raycast throttle, the 24 %-of-viewport park solve, bake sizes 640²/384² albedo and 256²/160² bump, the DPR clamps, and the zero-allocation render loop.
- `createPlanet()` returns resolved handles (`PlanetView`) instead of a bare `Group`, so the loop does not re-find children by name four times per planet per frame.

## 6 — `router.ts`

`boot()` on `DOMContentLoaded`, teardown on `pagehide`, the prototype's four
props as a module-level `config` (`composition`, `warpColor`, `parallax 0.10`,
`showHud`). The engine is a **dynamic** import, so a device with no WebGL never
downloads `three`.

The invariants this step exists to protect are listed in `CLAUDE.md` and must be
read before changing anything here: one delegated click handler for every
`href="#…"`; `go(id)` pushes history **and** drives `jump()`; `exit()` is
`go(null)`, never `history.back()`; `finish()` idempotent, token-carrying, and
reachable from a watchdog; input gated on `current` only; both canvas nav paths
into one deduplicated `nav()`; one live `Warp`; deep link = panel open, camera
parked, no warp.

## 7 — `warp.ts` (from `warp.js`)

`MIN_COVER 900`, `MAX_COVER 2200`, `HOLD_CAP 3400`, the `ACCENTS` map, the whole
`Warp` class including `dispose()`, and `saveAzimuth` / `loadAzimuth`.

The dead multi-page handoff helpers — `writeLaunch`, `readLaunch`, `whenLoaded`,
`bindDepartures` — are deleted, along with the `dg-launch` storage key. A test
asserts none of the four names is exported.

The streak field is texture-free: no image data, no canvas generation, nothing
built at click time.

## 8 — Reduced motion, fallback, print

**The flat text edition is a state the document ships in**, not one the router
assembles: `index.html` carries `data-dg-flat="1"` and the head probe removes it
only on confirmed WebGL. With JS off, no WebGL, an unreachable engine chunk, or a
lost context, the page is laid out correctly by CSS alone.

`flatten()` clears what the 3D path wrote and stands routing down; it is
idempotent, because context loss can fire twice. The renderer is **not** disposed
on context loss — one renderer per document, disposed only on `pagehide`.

## 9 — Assets and site files

`public/` holds `cv.pdf`, `og.png`, `robots.txt`, `sitemap.xml` and
`models/README.md` (the glTF contract, publicly reachable at `/models/README.md`
by design). The sitemap carries **exactly one** URL — destinations are fragments,
not separate URLs — and its `<loc>` is byte-identical to the canonical `<link>`,
trailing slash included.

The favicon is an inline SVG data URI: no file, no request, cannot 404.

## 10 — Ship model

`createShip()` builds a placeholder from primitives, and that is what ships. The
function boundary stays clean for a glTF swap later; `public/models/README.md` is
the contract, including the fact that `hub.ts` parents the exhaust trail to the
ship group, so a swap has to re-parent it.

## 11 — Tests

Vitest covers the pure seams — `parseHash()`, `byId()`, `detectQuality()` tiers,
`jump-guard`'s two rules, the content table against the markup, and a
build-artifact test that **builds the site itself** into a temp directory and
measures the cold load. Playwright covers the router invariants and the
accessibility path, which is where the prototype's real bugs lived.

The `{{`-in-`dist/` assertion is deliberately skipped while every token still
defaults to its own literal string; its complement runs instead, proving the copy
is in the served bytes rather than applied by a script.

## 12 — Budget check

Under 900 KB transfer, `three` minified and tree-shaken; ≤ 25 draw calls in the
hub via `renderer.info.render.calls`; DPR clamps confirmed. All three are now
CI-enforced assertions rather than manual checks — see `TASKS.md` Phase 11.

---

## Do not do

- No framework, no router library, no state library.
- No effect composer, bloom pass, or post-processing. The glow is additive geometry, on purpose, for the draw-call budget.
- No multi-page site. A document swap tore down the WebGL context and rebuilt every baked texture on arrival — that was the original lag, and it is why this is one document.
- Do not unmount or re-init the renderer for any reason other than `pagehide`.
- Do not restyle the Backend blocks as employment, add a "currently learning" skills group, remove the Projects notice, or add a seniority claim.
- Do not self-host the fonts. The Google Fonts CDN is approved.
- Do not port `support.js`.
