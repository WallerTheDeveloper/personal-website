# Port plan

Build order for recreating the prototype as a real project. Each step is
independently verifiable; do them in order — the router and the engine both
depend on the DOM contract existing first.

Read `design/BUILD_NOTES.md` before step 6. It documents every bug the prototype
hit and why each invariant exists.

---

## 0 — Feel it first

Serve the prototype and use it. It uses ES-module imports, so `file://` will not
work — opened directly it silently falls back to the text edition and you will
see no scene at all:

```
cd design
npx serve .          # or: python3 -m http.server 8000
```

Open the printed URL (needs internet: `three` comes from unpkg, fonts from the
Google Fonts CDN). Then click each planet. Hover them. Tab through. Press
Escape. Resize. Then throttle to a slow CPU and do it again. You cannot match
this from the README alone.

If you genuinely cannot serve it, `../screenshots/` shows all six views — but
they are framing references only, with none of the motion.

## 1 — Scaffold

```
npm create vite@latest . -- --template vanilla-ts
npm i three
npm i -D vitest @playwright/test @types/three
```

Target layout:

```
index.html
public/
  cv.pdf  og.png  robots.txt  sitemap.xml
  models/            (empty for now — see step 10)
src/
  main.ts            entry: boot, wire everything
  router.ts          route / go / jump / commit / finish / exit
  hub.ts             ← space-engine.js, TS strict
  warp.ts            ← warp.js, TS strict
  content.ts         the {{TOKEN}} table (pending owner confirmation)
  head.ts            title + meta + JSON-LD from content
  styles.css
tests/
  unit/              vitest
  e2e/               playwright
vite.config.ts
tsconfig.json        strict: true
```

`tsconfig.json`: `strict`, `noUncheckedIndexedAccess`,
`noFallthroughCasesInSwitch`, `exactOptionalPropertyTypes`, `target: ES2022`,
`moduleResolution: bundler`.

`vite.config.ts`: default single-entry build. **Do not** copy the prototype's
five-entry `rollupOptions.input` idea from `BUILD_NOTES.md` — that predates the
single-document architecture and is obsolete.

## 2 — `index.html`

Take `design/index.dc.html` and unwrap the authoring layer:

1. Drop `<x-dc>` / `</x-dc>` and the `<script src="./support.js">`.
2. `<helmet>` contents become the real `<head>`. Keep, in order: charset,
   viewport, the real `<title>`, description, OG/Twitter tags, canonical,
   `preconnect` to `fonts.gstatic.com`, the Google Fonts `<link>`, then
   `styles.css`, then the inline WebGL-probe script.
3. `<link rel="canonical" href="https://golosov-danylo.com/">`; OG image
   `https://golosov-danylo.com/og.png`.
4. **Keep the inline WebGL probe in `<head>`, inline and blocking.** It must run
   before first paint, or the text edition flashes on every load. It sets
   `data-dg-3d` on `<html>` and injects the rule that fades `#fallback` out.
5. Convert `{<!---->{TOKEN}}` → `{{TOKEN}}` (`s/\{<!---->\{/{{/g`).
6. Rewrite `style-hover` / `style-before` attributes as real CSS (step 3).
7. Everything else — the `<main id="stage">` block, `#fallback`, the four
   `<section data-panel>`s, `<canvas id="smoke">` — carries over as-is,
   in the same order, with the same ids and `data-` attributes.

**The DOM contract.** The engine and router select on these; keep every one:
`#stage`, `#scene`, `#smoke`, `#labels`, `#reticle`, `#hub-head`, `#hub-foot`,
`#hud-hint`, `#quality-toggle`, `#fps-readout`, `#skip-scene`, `#fallback`,
`#panel-{backend,projects,xr,about}`, `[data-panel]`, `[data-panel-top]`,
`[data-hero]`, `[data-exit]`, `[data-planet]`, `[data-leader]`, `[data-name]`,
`[data-grain]`, `[data-elsewhere]`, `[data-repo="n"]`, `[data-demo="n"]`,
`#lnk-email`, `#lnk-github`, `#lnk-linkedin`, and `html[data-dg-flat]` /
`html[data-dg-3d]`.

## 3 — `styles.css`

Extract every inline style. Write the tokens from README “Design tokens” as
custom properties on `:root`, then class-based rules. Suggested classes:
`.panel`, `.panel__top`, `.panel__hero`, `.panel__body`, `.col`, `.entry`,
`.card`, `.bullets`, `.stack`, `.section-title`, `.elsewhere`, `.meta`,
`.eyebrow`, `.notice`, `.label` (+ `.label__leader`, `.label__name`).

Per-destination accents via a data attribute, not four copies of every rule:

```css
[data-panel="backend"]  { --accent: var(--backend);  --accent-hover: var(--backend-hover); }
[data-panel="projects"] { --accent: var(--projects); --accent-hover: var(--projects-hover); }
[data-panel="xr"]       { --accent: var(--xr);       --accent-hover: var(--xr-hover); }
[data-panel="about"]    { --accent: var(--about);    --accent-hover: var(--about-hover); }
```

Then carry over verbatim, without re-deriving: the `grainShift` keyframes, the
`html[data-dg-flat]` rules, the `prefers-reduced-motion` block, and the entire
`@media print` block. Those four are behavioural, not decorative.

Global `a` and `a:hover` colours must be defined (`#e9e7f2` / `#ffb877`).

## 4 — `content.ts` + `head.ts`

One exported object holding every token from README “Copy tokens”, values being
the literal `{{TOKEN}}` strings. `head.ts` applies:

- `document.title` = `${TITLES[current]} — ${FULL_NAME}` on a panel, else the base title.
- `meta[name=description]`, `og:title`, `og:description`.
- The `Person` JSON-LD (name, jobTitle from `ROLE_TAGLINE`, address from `LOCATION`, `sameAs` from GitHub/LinkedIn, `url`). **No seniority claim.**
- Projects repo/demo `href`s onto `[data-repo="n"]` / `[data-demo="n"]`.
- Contact `href`s onto `#lnk-email` (`mailto:`), `#lnk-github`, `#lnk-linkedin`.

**Delete `assertTitle()` and the head `MutationObserver`.** They existed only
because the authoring tool injected its own `<title>` at an unpredictable time.
A real `<head>` needs neither.

Confirm the `content.ts` approach with the owner before doing it (open question 3).

## 5 — `hub.ts` (from `space-engine.js`)

Already a dependency-free ES module — mostly a typing exercise.

1. Change `import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js'` to `import * as THREE from 'three'`. Pin `three@0.160.x` in `package.json` — later versions change lighting/colour-management defaults and would shift the look.
2. Keep the `export { THREE }` re-export only if `warp.ts` or `main.ts` needs it; otherwise drop it so tree-shaking works.
3. Type the exports: `PLANETS`, `byId`, `detectQuality`, `reducedMotion`, `hasWebGL`, `createPlanet`, `createShip`, `initHub`, and the `initHub` return API (`park`, `unpark`, `returnShip`, `launch`, …). Write a `Planet` interface and a `HubApi` interface.
4. **Delete `initPlanetBand`** — a leftover from the abandoned multi-page version. Nothing calls it.
5. **Delete the `href` field on each `PLANETS` entry** (`'backend.dc.html'` etc.) — also multi-page leftovers. Routing uses `id`.
6. Preserve exactly: `DAMP = 0.08`, `AZ_LIMIT = ±0.5`, hover scale `1.055`, 30 Hz raycast throttle, the 24 %-of-viewport-height park solve, the bake sizes (640²/384² albedo, 256²/160² bump), the DPR clamps, and the zero-allocation render loop.

Verify after this step: the hub renders, planets orbit, hover works, drag pans.
No routing yet.

## 6 — `router.ts`

Port the logic class body from `index.dc.html`'s `<script data-dc-script>`.
`componentDidMount` becomes `boot()` (called on `DOMContentLoaded`);
`componentWillUnmount` becomes a `pagehide` handler; `this.props.x` becomes a
module-level config object:

```ts
export const config = {
  composition: 'arc' as 'arc' | 'drift' | 'deep',
  warpColor: 'planet' as 'planet' | 'ice' | 'amber' | 'white',
  parallax: 0.10,
  showHud: true,
};
```

(These were the prototype's four tweakable props. Keep them as config — they are
the knobs the owner used to tune the scene.)

Then re-read README “Interactions & behaviour” and honour, without shortcuts:

- One delegated `click` handler on `document` for **every** `href="#…"`.
- `go(id)` pushes history **and** calls `jump()` directly.
- `exit()` is `go(null)`. **Never `history.back()`.**
- `finish()` idempotent, jump-token-carrying, reachable from the animation *and* from a watchdog at `COVER + CLEAR + 700`.
- Input gated on `current` only, never on `_going`.
- Both canvas nav paths (`pointerup` pair + plain `click`) into one deduped `nav()`.
- One live `Warp` at a time; `dispose()` clears the canvas, hides it, resolves any pending `clear()`.
- Deep link = panel open, camera parked, **no warp**.

## 7 — `warp.ts` (from `warp.js`)

Keep `MIN_COVER 900`, `MAX_COVER 2200`, `HOLD_CAP 3400`, the `ACCENTS` map, and
the whole `Warp` class including `dispose()`.

**Delete the dead multi-page handoff helpers:** `writeLaunch`, `readLaunch`,
`whenLoaded`, `bindDepartures`. They exist for a document-swap architecture that
no longer exists. Keep `saveAzimuth` / `loadAzimuth`.

The streak field stays texture-free — no image data, no canvas generation,
nothing built at click time.

## 8 — Reduced motion, fallback, print

- `prefers-reduced-motion`: no drift/bob/parallax, ambient rotation ~0, grain animation off, planet click = 200 ms cross-fade instead of the flight.
- `webglcontextlost` → restore the text edition (`flatten()` + remove `data-dg-3d`).
- `flatten()`: set `data-dg-flat` on `<html>`, hide `#stage`, unpin the panels into one continuous document, remove the transparent heroes. Same markup, no duplication.
- Print: verify the whole CV prints as one continuous document (see step 3).

## 9 — Assets and site files

- `public/cv.pdf`, `public/og.png` from `assets/` (both placeholders).
- `public/robots.txt`, `public/sitemap.xml` — replace `https://example.com` with `https://golosov-danylo.com`. With hash routing the sitemap has exactly one URL; only add per-destination URLs if open question 1 is answered "real URLs".
- `public/models/` — copy `assets/models-README.md` as its README for the future glTF.

## 10 — Ship model

**Out of scope.** `createShip()` builds a placeholder from primitives and that is
what ships. Leave the function boundary clean so the body can be swapped for a
glTF load later, and leave `assets/models-README.md` in place as the contract.

## 11 — Tests

See `ACCEPTANCE.md` for the full list. Minimum:

- **Vitest** — `hashId()` parsing, `byId()`, `detectQuality()` tiers, the `finish()` token/idempotency logic (pure, extract it if needed), and a build-artifact test asserting no `{{` survives in `dist/` once real copy is in.
- **Playwright** — the router invariants and the accessibility path. These are the tests that matter; the prototype's real bugs were all router state, and every one of them is reproducible in a browser.

## 12 — Budget check

`npx vite build` then measure. **Under 900 KB transfer.** `three` is the whole
budget — confirm it is minified and tree-shaken (the prototype's CDN build is
neither). Confirm ≤ 25 draw calls in the hub via
`renderer.info.render.calls`. Confirm DPR clamps on a real phone.

---

## Do not do

- Do not introduce a framework, a router library, or a state library.
- Do not add an effect composer, bloom pass, or post-processing. The glow is additive geometry, on purpose, for the draw-call budget.
- Do not move to a real multi-page site (a document swap tore down the WebGL context and rebuilt every baked texture on arrival — that was the original lag, and it is why this is one document).
- Do not unmount or re-init the renderer for any reason other than `pagehide`.
- Do not restyle the Backend blocks as employment, add a "currently learning" skills group, remove the Projects notice, or add a seniority claim. See README “Content rules”.
- Do not spend time self-hosting fonts. The owner approved the Google Fonts CDN.
- Do not port `support.js`.
