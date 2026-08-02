/**
 * One planet, assembled: baked body, optional cloud shell, fresnel rim, hover
 * aura, and whichever feature the entry asks for.
 *
 * `createPlanet()` hands back resolved handles rather than a bare `Group`. The
 * prototype re-found the same children with `getObjectByName()` four times per
 * frame; the objects never change, so they are resolved once here. Same scene,
 * same output — one fewer traversal per planet per frame, and the render loop
 * needs no null-checks on children that provably exist.
 */

import * as THREE from 'three';

import { BAKE_ALBEDO, BAKE_CLOUDS, BAKE_HEIGHT, bake, glowTexture } from './bake';
import { RIM_FRAG, RIM_VERT } from './shaders';
import type { Planet } from './planets';
import type { Quality } from './capabilities';

/** Bake resolutions per tier. Tuned; do not round these off. */
const ALBEDO_SIZE = { high: 640, low: 384 } as const;
const HEIGHT_SIZE = { high: 256, low: 160 } as const;
const CLOUD_SIZE = { high: 512, low: 320 } as const;
const MOON_SIZE = 192;

export interface PlanetView {
  readonly planet: Planet;
  /** Positioned in hub space. Scaled as a whole on hover. */
  readonly group: THREE.Group;
  readonly body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  readonly clouds: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial> | null;
  /**
   * The rim's `uStrength` uniform, held by reference. Looking it up by string
   * key each frame would be a fresh index-signature read for no gain.
   */
  readonly rimStrength: THREE.IUniform<number>;
  readonly aura: THREE.Sprite;
  /** Every bake this planet owns. `HubApi.dispose()` releases them. */
  readonly targets: readonly THREE.WebGLRenderTarget[];
}

interface Rim {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly strength: THREE.IUniform<number>;
}

/**
 * Back-face fresnel shell. Additive, depth-write off, no composer involved —
 * this is the entire glow budget (CLAUDE.md "Performance").
 */
function makeRim(radius: number, color: string, strength: number, power: number): Rim {
  const uStrength: THREE.IUniform<number> = { value: strength };
  const material = new THREE.ShaderMaterial({
    vertexShader: RIM_VERT,
    fragmentShader: RIM_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uStrength,
    },
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 40, 24), material);
  mesh.name = 'rim';
  return { mesh, strength: uStrength };
}

export function createPlanet(
  renderer: THREE.WebGLRenderer,
  planet: Planet,
  quality: Quality,
): PlanetView {
  const albedo = bake(renderer, planet, ALBEDO_SIZE[quality], BAKE_ALBEDO, true);
  const height = bake(renderer, planet, HEIGHT_SIZE[quality], BAKE_HEIGHT, false);
  const targets: THREE.WebGLRenderTarget[] = [albedo, height];

  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(planet.r, 64, 32),
    new THREE.MeshStandardMaterial({
      map: albedo.texture,
      bumpMap: height.texture,
      bumpScale: planet.bump,
      roughness: planet.rough,
      // Only the ocean world has anything to specular off.
      metalness: planet.mode === 0 ? 0.08 : 0.0,
      emissive: new THREE.Color(planet.glow),
      // Raised toward 0.07 on hover, back to 0 at rest, by the render loop.
      emissiveIntensity: 0,
    }),
  );
  body.name = 'body';
  group.add(body);

  let clouds: PlanetView['clouds'] = null;
  if (planet.feature === 'clouds') {
    const coverage = bake(renderer, planet, CLOUD_SIZE[quality], BAKE_CLOUDS, false);
    targets.push(coverage);
    clouds = new THREE.Mesh(
      new THREE.SphereGeometry(planet.r * 1.018, 48, 24),
      new THREE.MeshStandardMaterial({
        color: 0xf3f6ff,
        alphaMap: coverage.texture,
        transparent: true,
        opacity: 0.5,
        roughness: 1,
        metalness: 0,
        depthWrite: false,
      }),
    );
    clouds.name = 'clouds';
    group.add(clouds);
  }

  const rim = makeRim(planet.r * 1.085, planet.glow, planet.feature === 'atmos' ? 1.0 : 0.74, 4.2);
  group.add(rim.mesh);

  // Wide, soft halo — invisible at rest, blooms on hover and on focus.
  const aura = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color: new THREE.Color(planet.glow),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.scale.setScalar(planet.r * 5.2);
  aura.name = 'aura';
  group.add(aura);

  // `forceSinglePass` on both bands below is the draw-call budget, not a style
  // choice. three.js draws a `transparent` + `DoubleSide` material twice — back
  // faces, then front — and these two were 2 of the 4 extra passes that put the
  // hub at 29 against a rule of 25.
  //
  // The cost, A/B'd on a parked XR at 1440 with only this flag changing: the
  // ring keeps its full sweep on both sides of the planet, but loses a little
  // density, most visibly on the arc that crosses the planet's face. Owner
  // accepted that trade in Phase 11. It is the reason the rings read slightly
  // lighter here than they do in `design/`, which is not a porting error.
  if (planet.feature === 'ring') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(planet.r * 1.42, planet.r * 2.1, 128, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(planet.hi),
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = Math.PI * 0.42;
    ring.rotation.z = 0.22;
    group.add(ring);

    // A darker inner band, so the ring reads as structure rather than a glow.
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(planet.r * 1.52, planet.r * 1.74, 128, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(planet.deep),
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
      }),
    );
    inner.rotation.copy(ring.rotation);
    group.add(inner);
  }

  if (planet.feature === 'moon') {
    // Its parent's surface in grey: a rocky bake with the palette overridden.
    const moonTarget = bake(
      renderer,
      { ...planet, mode: 1, deep: '#1d1f22', mid: '#7c7f85', hi: '#d5d8dd' },
      MOON_SIZE,
      BAKE_ALBEDO,
      true,
    );
    targets.push(moonTarget);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(planet.r * 0.22, 32, 20),
      new THREE.MeshStandardMaterial({ map: moonTarget.texture, roughness: 1, metalness: 0 }),
    );
    moon.name = 'moon';
    moon.position.set(planet.r * 2.1, planet.r * 0.55, planet.r * 0.4);
    group.add(moon);
  }

  group.position.set(
    Math.sin(planet.theta) * planet.dist,
    planet.y,
    Math.cos(planet.theta) * planet.dist,
  );
  group.rotation.z = 0.12;

  return { planet, group, body, clouds, rimStrength: rim.strength, aura, targets };
}
