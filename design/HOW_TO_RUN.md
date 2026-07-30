# Running the prototype

`index.dc.html` is the design reference of record. Everything it needs is in this
folder.

## It must be served over HTTP

```
cd design
npx serve .            # or: python3 -m http.server 8000
```

Then open the printed URL and you get the full experience: hub, planets, hover,
the ship flight, the warp, all four panels.

**Do not open it with a double-click / `file://`.** The page loads its logic with
ES-module `import()`, which browsers block on `file://`. The failure is silent by
design: the import rejects, the site logs `3D unavailable, using the text
edition` and flattens to the text CV. You will see no scene at all and may
wrongly conclude the 3D is broken.

**First load needs internet.** `space-engine.js` imports `three` from
`unpkg.com/three@0.160.0`, and the three fonts come from the Google Fonts CDN.
(In the port, `three` comes from npm — the unminified CDN build must not ship.)

## What's in here

| File | Role |
| --- | --- |
| `index.dc.html` | The prototype: markup, styles, router, all logic |
| `space-engine.js` | three.js hub — `initHub` / `park` / `unpark` / `returnShip` / `launch` |
| `warp.js` | Hyperspace cover. Only the `Warp` class is live; `writeLaunch` / `readLaunch` / `whenLoaded` / `bindDepartures` are dead multi-page leftovers |
| `support.js` | Runtime of the tool the prototype was authored in. **Reference only — do not port.** |
| `cv.pdf`, `og.png` | So the CV links resolve while you're browsing locally |
| `BUILD_NOTES.md` | The original build notes: every bug hit, and why each invariant exists. Read before touching the router. |

## Things to look at specifically

- The top 44 vh of every panel is **transparent** — the planet you flew to is live behind it and parallaxes with panel scroll. That's why the renderer never stops.
- Click a planet, then immediately click a different one: jumps queue, never interleave.
- Press Escape from a panel: you land on the **hub**, never on the previously visited panel.
- Tab from load: the four labels take focus in order and Enter launches.
- Emulate `prefers-reduced-motion`: the flight becomes a 200 ms cross-fade.
- Print preview: the whole CV flattens into one continuous document.
