# Ship model spec

Carried over from `assets/models-README.md` (PORT_PLAN step 9). The **Expected
glTF** table below is the contract with whoever makes the model and is verbatim
from the handoff bundle. The paths and the swap procedure are updated to the
port — the original referenced `space-engine.js`, which this repo does not have.

`createShip()` in `src/engine/ship.ts` currently builds a placeholder primitive
assembly (capsule hull, cone nose, two fins, tail, engine glow). Replacing it
with the real asset is a one-function change — nothing else in the codebase
references ship geometry.

## Expected glTF

| Property | Requirement |
|---|---|
| Format | `.glb`, Draco-compressed |
| Size | under 300 KB |
| Triangles | under 5 000 |
| Forward axis | **+Z** |
| Up axis | +Y |
| Origin | centre of mass |
| Scale | ~1 unit long |
| Materials | single material |
| Textures | none required; baked vertex colour or a small atlas is fine |

## Swap procedure

1. Drop the file at `public/models/ship.glb`. It is served at `/models/ship.glb`
   — `public/` is copied to `dist/` verbatim, so the path is the same in dev and
   in the build.
2. In `src/engine/ship.ts`, replace the body of `createShip()` with a
   `GLTFLoader` load returning the same `ShipView`:
   - `group` — a `THREE.Group`
   - `glow` — the emissive engine mesh (opacity is animated)
   - `halo` — the additive glow sphere behind the engine

   The original spec put the last two on `group.userData`; this port makes them
   typed fields of `ShipView` instead, and `hub.ts` reads them directly. If the
   model has no glow meshes, keep the two primitives from the placeholder and
   parent them to the loaded model.
3. `createShip()` may become async. `initHub()` calls it synchronously and
   parents `shipView.group` to the camera before the first frame, so wrap the
   load in a promise and add the group when it resolves — the scene runs
   correctly with the ship missing. Note that `hub.ts` also parents the exhaust
   `trail` mesh to that group; re-parent it in the same place.
4. Adding the loader adds to the bundle. `three`'s `GLTFLoader` and Draco
   decoder are separate entry points, not part of the core import, and the
   transfer budget is < 900 KB (README "Performance budget"). Measure after.

## Why this is the only asset

Everything else in the scene — planets, starfield, nebula, smoke — is generated
in code, and planet textures are baked once at init. This is the only asset file
in the project.

One thing the real model can buy back: the hub draws **29** calls against a ≤ 25
budget, and three of those are second passes on `transparent` + `DoubleSide`
materials, one of which is the ship's exhaust trail. See TASKS.md Phase 11.
