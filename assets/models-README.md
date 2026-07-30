# Ship model spec

`createShip()` in `space-engine.js` currently builds a placeholder primitive
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

1. Drop the file at `public/models/ship.glb`.
2. In `space-engine.js`, replace the body of `createShip()` with a
   `GLTFLoader` load that returns the same shape of object:
   - a `THREE.Group`
   - `group.userData.glow` — the emissive engine mesh (opacity is animated)
   - `group.userData.halo` — the additive glow sphere behind the engine
   If the model has no glow meshes, keep the two primitives from the
   placeholder and parent them to the loaded model.
3. `createShip()` may become async; the hub already builds the ship before the
   first frame, so wrap the load in a promise and add the group to the camera
   when it resolves — the scene runs correctly with the ship missing.

Everything else in the scene (planets, starfield, nebula, smoke) is generated
in code. This is the only asset file in the project.
