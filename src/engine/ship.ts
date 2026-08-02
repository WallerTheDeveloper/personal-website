/**
 * The cockpit ship. Primitives only — no textures, no loader, nothing async, so
 * the hub is interactive the moment the bakes finish.
 *
 * PORT_PLAN step 10 keeps `public/models/` for a real glTF later. Swapping it
 * in means replacing the body of `createShip()` and returning the same
 * `ShipView` handles; nothing else in the engine touches the ship's internals.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type GlowMesh = THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

export interface ShipView {
  /** Parented to the camera at rest, re-attached to the scene during a flight. */
  readonly group: THREE.Group;
  /** Engine core. Pulses at idle, holds near-full through a launch. */
  readonly glow: GlowMesh;
  /** Additive bloom around the core. Scales up as the ship accelerates. */
  readonly halo: GlowMesh;
}

export function createShip(): ShipView {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0x9aa0b2, roughness: 0.45, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x363b47, roughness: 0.7, metalness: 0.4 });

  // Capsule and nose cone as one geometry rather than two meshes.
  //
  // They always shared `hull`, so this is one draw call instead of two and it is
  // the call that brought the hub from 26 to the 25 the rule asks for. The
  // transforms are baked in the same order a mesh applies them — rotate, then
  // translate — so the output is the two meshes' output, pixel for pixel. Both
  // primitives are indexed and carry the same three attributes (position,
  // normal, uv), which is what `mergeGeometries` requires — it returns `null` on
  // a mismatch, but both operands are built right here from fixed primitives, so
  // there is no input that could drift. (`@types/three` declares the return
  // non-nullable, so a guard would not compile against it anyway.)
  const hullGeometry = mergeGeometries([
    new THREE.CapsuleGeometry(0.085, 0.3, 4, 12).rotateX(Math.PI / 2),
    new THREE.ConeGeometry(0.085, 0.26, 12).rotateX(Math.PI / 2).translate(0, 0, 0.3),
  ]);
  group.add(new THREE.Mesh(hullGeometry, hull));

  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.16), dark);
    fin.position.set(side * 0.11, -0.02, -0.14);
    fin.rotation.z = side * 0.32;
    group.add(fin);
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.078, 0.07, 12), dark);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.235;
  group.add(tail);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.95 }),
  );
  glow.position.z = -0.28;
  glow.name = 'glow';
  group.add(glow);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff7a2a,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.position.z = -0.3;
  halo.name = 'halo';
  group.add(halo);

  return { group, glow, halo };
}
