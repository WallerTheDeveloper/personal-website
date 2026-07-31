/**
 * The hub scene: one renderer, one camera on a damped orbit, four planets, and
 * the ship that flies between them.
 *
 * Ported from `design/space-engine.js`. Two things were deleted on the way in
 * (PORT_PLAN step 5): `initPlanetBand()`, a thin per-page planet strip from the
 * abandoned multi-page version, and the `href` field on every `PLANETS` entry.
 * `export { THREE }` is gone too — nothing outside this module needs three, and
 * re-exporting it would defeat tree-shaking against a < 900 KB budget.
 *
 * Non-negotiables, all bought with debugging time (CLAUDE.md "Performance"):
 *
 *   - **One `WebGLRenderer` per document.** Created here, held on
 *     `window.__dgHub`, disposed only on `pagehide`. A canvas can hold exactly
 *     one context; re-initialising destroys it permanently and leaves a black
 *     hub.
 *   - **Zero allocations in the render loop.** Every vector, quaternion and
 *     screen-space slot below is created once at init and mutated in place.
 *     Nothing in `step()` may construct an object, close over a value, or take
 *     an array copy.
 *   - **Nothing procedural per frame.** All four surfaces are baked once.
 */

import * as THREE from 'three';

import type { PanelId } from './content';
import {
  detectQuality,
  maxPixelRatio,
  reducedMotion,
  type Quality,
} from './engine/capabilities';
import { createPlanet, type PlanetView } from './engine/planet-mesh';
import { createShip } from './engine/ship';
import { createNebula, createStarfield } from './engine/sky';
import { byId, PLANETS, type Planet } from './engine/planets';

export { byId, PLANETS } from './engine/planets';
export { detectQuality, hasWebGL, reducedMotion, setQuality } from './engine/capabilities';
export { createPlanet } from './engine/planet-mesh';
export { createShip } from './engine/ship';
export type { Planet, PlanetFeature, SurfaceMode } from './engine/planets';
export type { Quality } from './engine/capabilities';
export type { PlanetView } from './engine/planet-mesh';
export type { ShipView } from './engine/ship';

/* ------------------------------------------------------------- invariants */

/** Camera azimuth easing per frame. Slower reads as drag, faster as snap. */
const DAMP = 0.08;
/** How far the hub view may swing either way, radians. Widened while parked. */
const AZ_LIMIT = 0.5;
const PARK_AZ_LIMIT = 0.95;
/** Hover/focus swell on a planet group. */
const HOVER_SCALE = 1.055;
/** ~30 Hz. Raycasting on every `pointermove` is the one input-side cost worth capping. */
const RAY_INTERVAL_MS = 33;
/** A parked planet reads as this fraction of viewport height, panel below it. */
const PARK_HEIGHT_FRACTION = 0.24;
/** Star counts per tier. */
const STAR_COUNT = { high: 3200, low: 1800 } as const;

/* ------------------------------------------------------------------ types */

/** The prototype's three scene arrangements. `arc` is the shipping one. */
export type Composition = 'arc' | 'deep' | 'drift';

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

export interface LabelPlacement extends ScreenPoint {
  /** Projected planet radius in CSS pixels. The label hangs just below it. */
  pr: number;
  id: PanelId;
}

export interface HubOptions {
  /** Defaults to `detectQuality()`. */
  quality?: Quality;
  composition?: Composition;
  /**
   * Called once per frame with the reused placement array — never copy it, and
   * never hold an element past the callback.
   */
  onLabels?: (out: readonly LabelPlacement[]) => void;
  onHover?: (id: PanelId | null) => void;
  /** `null` when the HUD is off, so the FPS counter costs nothing. */
  onFps?: ((fps: number) => void) | null;
}

export interface HubApi {
  readonly quality: Quality;
  readonly reduce: boolean;
  readonly planets: readonly PlanetView[];
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly ship: THREE.Group;
  readonly canvasEl: HTMLCanvasElement;

  onLabels: (out: readonly LabelPlacement[]) => void;
  onHover: (id: PanelId | null) => void;
  onFps: ((fps: number) => void) | null;

  /** Clamped to the current azimuth limit. `instant` skips the easing. */
  setAzimuth(a: number, instant?: boolean): void;
  nudge(d: number): void;
  readonly azimuth: number;
  focusPlanet(id: string, instant?: boolean): void;
  setHovered(id: PanelId | null): void;
  setFocused(id: PanelId | null): void;
  /** Raycast in client coordinates. `null` if the pointer is on empty sky. */
  pick(clientX: number, clientY: number): PanelId | null;
  /** Same, throttled to ~30 Hz, raising `onHover` only on a change. */
  rayThrottled(clientX: number, clientY: number, now: number): void;
  /** Normalised pointer (-1..1). The idle ship noses toward it. */
  setPointer(nx: number, ny: number): void;

  launch(id: PanelId, duration?: number): Promise<void>;
  dockShip(duration?: number): Promise<void>;
  returnShip(): void;
  isLaunching(): boolean;
  shipScreenPos(): ScreenPoint;

  park(id: string): void;
  unpark(): void;

  resize(): void;
  pause(v: boolean): void;
  dispose(): void;
}

declare global {
  interface Window {
    /**
     * The one renderer + scene per document (README "Runtime globals"). The
     * router owns assignment; the engine only ever reads it back.
     */
    __dgHub?: HubApi | null;
    /** True once the scene has booted. Cleared if the context is lost. */
    __dg3dReady?: boolean;
  }
}

/** Per-planet handles plus its reused screen-space slot. */
interface HubPlanet extends PlanetView {
  readonly label: LabelPlacement;
}

interface HubState {
  az: number;
  azTarget: number;
  azLimit: number;
  hovered: PanelId | null;
  focused: PanelId | null;
  launching: boolean;
  docking: boolean;
  paused: boolean;
  t0: number;
  fps: number;
  /** Ship roll toward the hovered planet, and its eased target. */
  bank: number;
  bankTarget: number;
  camDolly: number;
  camRoll: number;
  shipBaseY: number;
  /** Normalised pointer, screen space (+y down). */
  px: number;
  py: number;
  baseFov: number;
  fovBoost: number;
  /** Park solve: look-at height, camera height, dolly — each with an eased target. */
  aimY: number;
  aimT: number;
  camY: number;
  camYT: number;
  parkDolly: number;
  parkDollyT: number;
  /** Invalidates an in-flight launch/dock animation when it changes. */
  flightToken: number;
  /** Which way the last departure curved, so the arrival mirrors it. */
  lastSide: number;
  /** Blends the orbital camera into the chase camera, 0..1. */
  flyK: number;
  flyPos: THREE.Vector3;
  flyLook: THREE.Vector3;
}

/* -------------------------------------------------------------------- hub */

export function initHub(canvas: HTMLCanvasElement, opts: HubOptions = {}): HubApi {
  const quality = opts.quality ?? detectQuality();
  const reduce = reducedMotion();
  const composition: Composition = opts.composition ?? 'arc';

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality === 'high',
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.38;
  renderer.setPixelRatio(maxPixelRatio());
  renderer.setClearColor(0x05060d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  // Sky and stars counter-rotate against the azimuth for parallax depth.
  const starGroup = new THREE.Group();
  starGroup.add(createStarfield(STAR_COUNT[quality]));
  scene.add(starGroup);

  const nebulaGroup = new THREE.Group();
  nebulaGroup.add(createNebula());
  scene.add(nebulaGroup);

  const sun = new THREE.DirectionalLight(0xfff2e2, 3.25);
  sun.position.set(-6, 4.5, 9);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x4a7fd0, 0.75);
  fill.position.set(7, -2, -6);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x2b3d68, 0.58));

  const planetGroup = new THREE.Group();
  scene.add(planetGroup);

  const views: readonly HubPlanet[] = PLANETS.map((planet) => {
    const view = createPlanet(renderer, planet, quality);
    if (composition === 'deep') {
      view.group.position.z *= 0.86;
      view.group.position.y *= 0.55;
    } else if (composition === 'drift') {
      view.group.position.y += Math.sin(planet.theta * 3.1) * 0.9;
      view.group.position.x *= 1.12;
    }
    planetGroup.add(view.group);
    // `id` never changes, so it is written here rather than every frame.
    return { ...view, label: { x: 0, y: 0, visible: true, pr: 0, id: planet.id } };
  });

  // Built once: the raycast target list, the hit→id lookup, and the array
  // handed to `onLabels`. All three are stable for the life of the hub.
  const bodies: THREE.Object3D[] = views.map((v) => v.body);
  const bodyIds = new Map<THREE.Object3D, PanelId>(views.map((v) => [v.body, v.planet.id] as const));
  const labels: readonly LabelPlacement[] = views.map((v) => v.label);

  const shipView = createShip();
  const ship = shipView.group;
  ship.position.set(0, -1.05, -3.4);
  // The ship rides the camera rig, so it holds station as the hub pans.
  camera.add(ship);
  scene.add(camera);

  const trailMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8f45,
    transparent: true,
    opacity: 0.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const trail = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.55, 12, 1, true), trailMaterial);
  trail.rotation.x = -Math.PI / 2;
  trail.position.z = -0.55;
  ship.add(trail);

  const S: HubState = {
    az: 0, azTarget: 0, azLimit: AZ_LIMIT,
    hovered: null, focused: null,
    launching: false, docking: false, paused: false,
    t0: performance.now(), fps: 0,
    bank: 0, bankTarget: 0,
    camDolly: 0, camRoll: 0, shipBaseY: -1.05, px: 0, py: 0,
    baseFov: 50, fovBoost: 0,
    aimY: 0, aimT: 0, camY: 0, camYT: 0, parkDolly: 0, parkDollyT: 0,
    flightToken: 0, lastSide: 1,
    flyK: 0, flyPos: new THREE.Vector3(), flyLook: new THREE.Vector3(),
  };

  // Scratch. Every one of these is reused in place — see the file header.
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _ndc = new THREE.Vector2(-2, -2);
  const _ray = new THREE.Raycaster();
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _orbit = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _target = new THREE.Vector3(0, 0.9, 0);

  const CAM_R = composition === 'deep' ? 17.6 : 15.5;

  let lastRay = 0;
  let lastFps = performance.now();
  let frames = 0;
  let raf = 0;
  let prev = performance.now();

  /* ----------------------------------------------------------- projection */

  function resize(): void {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    // Portrait needs a wider field or the arc runs off both edges.
    S.baseFov = w / h < 0.85 ? 62 : 50;
    camera.fov = S.baseFov + S.fovBoost;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);

    // Re-seat the ship so it keeps the same share of the frame at any aspect.
    const d = 5.2;
    const halfH = Math.tan(((camera.fov * Math.PI) / 180) / 2) * d;
    S.shipBaseY = -halfH * 0.62;
    ship.position.y = S.shipBaseY;
    ship.position.z = -d;
  }

  function projectTo(obj: THREE.Object3D, out: ScreenPoint): void {
    obj.getWorldPosition(_v);
    _v.project(camera);
    out.x = (_v.x * 0.5 + 0.5) * canvas.clientWidth;
    out.y = (-_v.y * 0.5 + 0.5) * canvas.clientHeight;
    out.visible = _v.z < 1;
  }

  /* ---------------------------------------------------------------- flight */

  /**
   * Departure: the ship keeps the heading it had at the moment of the click,
   * sweeps one wide banked curve out to the planet, and the camera flies with
   * it. No recoil — the motion is continuous from the idle nose-tracking.
   */
  function launch(id: PanelId, duration = 1700): Promise<void> {
    if (S.launching) return Promise.resolve();
    const view = views.find((v) => v.planet.id === id);
    if (view === undefined) return Promise.resolve();

    const token = ++S.flightToken;
    S.docking = false;
    S.launching = true;

    scene.attach(ship); // keeps the cursor-aimed pose
    const p0 = ship.position.clone();
    const q0 = ship.quaternion.clone();
    const s0 = ship.scale.clone();
    const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(q0).normalize();

    const dest = new THREE.Vector3();
    view.group.getWorldPosition(dest);
    const pr = view.planet.r;
    // Stop short of the surface, on the near side.
    const end = new THREE.Vector3()
      .subVectors(p0, dest)
      .normalize()
      .multiplyScalar(pr * 2.1)
      .add(dest);

    const span = Math.max(4, p0.distanceTo(end));
    const UP = new THREE.Vector3(0, 1, 0);
    const toEnd = new THREE.Vector3().subVectors(end, p0).normalize();
    const sideV = new THREE.Vector3().crossVectors(UP, toEnd);
    if (sideV.lengthSq() < 1e-4) sideV.set(1, 0, 0);
    sideV.normalize();
    // Swing the curve to whichever side the nose was already turned.
    const sign = sideV.dot(nose) >= 0 ? 1 : -1;
    S.lastSide = sign;

    const p1 = p0.clone().addScaledVector(nose, span * 0.34).addScaledVector(UP, span * 0.04);
    const p2 = p0
      .clone()
      .lerp(end, 0.68)
      .addScaledVector(sideV, sign * span * 0.3)
      .addScaledVector(UP, span * 0.17);

    const pos = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const back = new THREE.Vector3();
    const qPath = q0.clone();
    const qT = new THREE.Quaternion();
    const qBank = new THREE.Quaternion();
    const m = new THREE.Matrix4();
    const t0 = performance.now();
    const smooth = (k: number): number => k * k * (3 - 2 * k);

    return new Promise<void>((resolve) => {
      const step = (): void => {
        if (token !== S.flightToken) {
          resolve();
          return;
        }
        const t = Math.min(1, (performance.now() - t0) / duration);
        const e = smooth(t);
        const u = 1 - e;

        // Cubic Bézier, and its derivative for the heading.
        pos
          .set(0, 0, 0)
          .addScaledVector(p0, u * u * u)
          .addScaledVector(p1, 3 * u * u * e)
          .addScaledVector(p2, 3 * u * e * e)
          .addScaledVector(end, e * e * e);
        tan
          .set(0, 0, 0)
          .addScaledVector(p0, -3 * u * u)
          .addScaledVector(p1, 3 * (u * u - 2 * u * e))
          .addScaledVector(p2, 3 * (2 * u * e - e * e))
          .addScaledVector(end, 3 * e * e);
        if (tan.lengthSq() < 1e-8) tan.copy(toEnd);
        tan.normalize();
        ship.position.copy(pos);

        // Orientation EASES onto the path tangent out of the click-time angle,
        // so there is no snap on the first frame.
        back.copy(pos).sub(tan);
        m.lookAt(pos, back, UP);
        qT.setFromRotationMatrix(m);
        qPath.slerp(qT, 0.1);
        const bankIn = 0.55 * Math.sin(e * Math.PI);
        const rollOut = 2.6 * smooth(Math.max(0, Math.min(1, (t - 0.45) / 0.55)));
        qBank.setFromAxisAngle(_zAxis, -sign * (bankIn + rollOut));
        ship.quaternion.copy(qPath).multiply(qBank);

        ship.scale.set(
          s0.x + (0.88 - s0.x) * e,
          s0.y + (0.88 - s0.y) * e,
          s0.z + (1.85 - s0.z) * e,
        );
        trailMaterial.opacity = 0.12 + e * 0.48;
        trail.scale.set(1 + e * 0.4, 1 + e * 0.4, 1 + e * 5.0);
        shipView.halo.scale.setScalar(1 + e * 3.4);
        shipView.glow.material.opacity = 0.8 + e * 0.2;

        // Chase camera, slung behind and a touch above.
        S.flyPos.copy(pos).addScaledVector(tan, -2.9 - e * 0.8).addScaledVector(UP, 0.85);
        S.flyLook.copy(pos).addScaledVector(tan, 3.4);
        S.flyK = smooth(Math.min(1, t / 0.22));
        S.camDolly = 0;
        S.camRoll = sign * 0.05 * Math.sin(e * Math.PI);
        S.fovBoost = e * 9;

        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
  }

  /**
   * Arrival: the ship sweeps in past the viewer and settles into the cockpit
   * rig. Mirror of `launch()`, so returning never reads as a cut. The path is
   * in camera space, so it tracks the hub view as it unparks.
   */
  function dockShip(duration = 1200): Promise<void> {
    const token = ++S.flightToken;
    S.launching = false;
    S.docking = true;
    if (ship.parent !== scene) scene.attach(ship);

    const s0 = ship.scale.clone();
    const sign = S.lastSide || 1;
    const flyK0 = S.flyK;
    const L0 = new THREE.Vector3(sign * 4.6, S.shipBaseY - 1.4, 3.2); // behind the viewer
    const L1 = new THREE.Vector3(sign * 2.2, S.shipBaseY - 0.6, -1.2);
    const L2 = new THREE.Vector3(0, S.shipBaseY, -3.4); // the rig
    const lp = new THREE.Vector3();
    const lt = new THREE.Vector3();
    const fwd = new THREE.Vector3(0, 0, -1);
    const up = new THREE.Vector3(0, 1, 0);
    const back = new THREE.Vector3();
    const m = new THREE.Matrix4();
    const qLocal = new THREE.Quaternion();
    const qBank = new THREE.Quaternion();
    const t0 = performance.now();
    const smooth = (k: number): number => k * k * (3 - 2 * k);

    return new Promise<void>((resolve) => {
      const step = (): void => {
        if (token !== S.flightToken) {
          resolve();
          return;
        }
        const t = Math.min(1, (performance.now() - t0) / duration);
        const e = smooth(t);
        const u = 1 - e;

        lp.set(0, 0, 0).addScaledVector(L0, u * u).addScaledVector(L1, 2 * u * e).addScaledVector(L2, e * e);
        lt.set(0, 0, 0).addScaledVector(L0, -2 * u).addScaledVector(L1, 2 * (u - e)).addScaledVector(L2, 2 * e);
        if (lt.lengthSq() < 1e-8) lt.copy(fwd);
        lt.normalize().lerp(fwd, e).normalize();

        camera.updateMatrixWorld();
        ship.position.copy(lp).applyMatrix4(camera.matrixWorld);
        back.copy(lp).sub(lt);
        m.lookAt(lp, back, up);
        qLocal.setFromRotationMatrix(m);
        qBank.setFromAxisAngle(_zAxis, -sign * 0.5 * Math.sin(Math.PI * e) * (1 - e));
        ship.quaternion.copy(camera.quaternion).multiply(qLocal).multiply(qBank);
        ship.scale.set(s0.x + (1 - s0.x) * e, s0.y + (1 - s0.y) * e, s0.z + (1 - s0.z) * e);

        trailMaterial.opacity = 0.1 + 0.42 * (1 - e);
        trail.scale.set(1 + (1 - e) * 0.4, 1 + (1 - e) * 0.4, 1 + (1 - e) * 3.2);
        shipView.halo.scale.setScalar(1 + (1 - e) * 2.2);
        S.flyK = flyK0 * Math.max(0, 1 - t / 0.45);
        S.fovBoost *= 0.88;
        S.camRoll *= 0.88;

        if (t < 1) {
          requestAnimationFrame(step);
          return;
        }
        returnShip();
        S.docking = false;
        S.flyK = 0;
        resolve();
      };
      step();
    });
  }

  /**
   * Re-seat the ship in the cockpit rig, so the hub is reusable without tearing
   * the scene down. Also the reduced-motion path: no flight, just a cut back.
   */
  function returnShip(): void {
    camera.add(ship);
    ship.position.set(0, S.shipBaseY, -3.4);
    ship.rotation.set(0, Math.PI, 0);
    ship.scale.set(1, 1, 1);
    trailMaterial.opacity = 0;
    trail.scale.set(1, 1, 1);
    shipView.halo.scale.setScalar(1);
    shipView.glow.material.opacity = 0.75;
    S.launching = false;
    S.camDolly = 0;
    S.camRoll = 0;
    S.fovBoost = 0;
  }

  /* ------------------------------------------------------------- park solve */

  /**
   * Hold station off one planet, framed high so an overlay panel can occupy the
   * lower two thirds of the viewport.
   */
  function park(id: string): void {
    const p = byId(id);
    S.azLimit = PARK_AZ_LIMIT;
    api.setAzimuth(p.theta, true);
    const tan = Math.tan(((S.baseFov * Math.PI) / 180) / 2);
    // Stand off far enough that the planet reads ~24 % of the viewport height…
    const d = p.r / (PARK_HEIGHT_FRACTION * tan);
    S.parkDollyT = Math.max(-0.6, Math.min(1.6, (p.dist + d) / CAM_R - 1));
    S.camYT = p.y - 0.9;
    // …and aim low, so it sits high in frame with the panel below it.
    S.aimT = p.y - 0.56 * tan * d - 0.9;
  }

  function unpark(): void {
    S.aimT = 0;
    S.camYT = 0;
    S.parkDollyT = 0;
    S.azLimit = AZ_LIMIT;
    api.setAzimuth(S.azTarget);
  }

  /* ------------------------------------------------------------------ api */

  const api: HubApi = {
    quality,
    reduce,
    planets: views,
    camera,
    renderer,
    scene,
    ship,
    canvasEl: canvas,

    onLabels: opts.onLabels ?? ((): void => {}),
    onHover: opts.onHover ?? ((): void => {}),
    onFps: opts.onFps ?? null,

    setAzimuth(a, instant) {
      S.azTarget = Math.max(-S.azLimit, Math.min(S.azLimit, a));
      if (instant === true) S.az = S.azTarget;
    },
    nudge(d) {
      api.setAzimuth(S.azTarget + d);
    },
    get azimuth() {
      return S.az;
    },
    focusPlanet(id, instant) {
      api.setAzimuth(byId(id).theta * 0.85, instant);
    },
    setHovered(id) {
      S.hovered = id;
      const p: Planet | null = id === null ? null : byId(id);
      // The ship leans toward whatever the pointer is over.
      S.bankTarget = p === null ? 0 : Math.max(-0.14, Math.min(0.14, -p.theta * 0.32));
      api.onHover(id);
    },
    setFocused(id) {
      S.focused = id;
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _ray.setFromCamera(_ndc, camera);
      // Bodies only, non-recursive: rims and auras must not be clickable.
      const hit = _ray.intersectObjects(bodies, false)[0];
      return hit === undefined ? null : bodyIds.get(hit.object) ?? null;
    },
    rayThrottled(clientX, clientY, now) {
      if (S.launching) return;
      if (now - lastRay < RAY_INTERVAL_MS) return;
      lastRay = now;
      const id = api.pick(clientX, clientY);
      if (id !== S.hovered) api.setHovered(id);
    },
    setPointer(nx, ny) {
      S.px = Math.max(-1, Math.min(1, nx));
      S.py = Math.max(-1, Math.min(1, ny));
    },

    launch,
    dockShip,
    returnShip,
    isLaunching: () => S.launching || S.docking,
    shipScreenPos() {
      // Allocates, and is meant to: this is a one-shot query, never per frame.
      const out: ScreenPoint = { x: 0, y: 0, visible: true };
      projectTo(ship, out);
      return out;
    },

    park,
    unpark,
    resize,
    pause(v) {
      S.paused = v;
    },

    dispose() {
      cancelAnimationFrame(raf);
      // Orphans any launch/dock animation still driving its own rAF chain —
      // their step functions bail the moment the token no longer matches.
      S.flightToken++;
      scene.traverse(disposeObject);
      for (const view of views) {
        for (const target of view.targets) target.dispose();
      }
      renderer.dispose();
    },
  };

  /* ------------------------------------------------------------ the loop */

  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    if (S.paused) {
      prev = now;
      return;
    }
    // A throw must not break the rAF chain — that would freeze the hub for good.
    try {
      step(now);
    } catch (err: unknown) {
      console.error('[hub frame]', err);
    }
  }

  function step(now: number): void {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    const el = (now - S.t0) / 1000;

    S.az += (S.azTarget - S.az) * DAMP;
    const sway = reduce ? 0 : Math.sin(el * 0.23) * 0.012;
    const bob = reduce ? 0 : Math.sin(el * 0.31) * 0.06;
    if (Math.abs(camera.fov - (S.baseFov + S.fovBoost)) > 0.01) {
      camera.fov = S.baseFov + S.fovBoost;
      camera.updateProjectionMatrix();
    }

    S.aimY += (S.aimT - S.aimY) * 0.09;
    S.camY += (S.camYT - S.camY) * 0.09;
    S.parkDolly += (S.parkDollyT - S.parkDolly) * 0.09;

    const R = CAM_R * (1 + S.camDolly + S.parkDolly);
    _orbit.set(Math.sin(S.az + sway) * R, 0.9 + bob + S.camY, Math.cos(S.az + sway) * R);
    _target.y = 0.9 + S.aimY;
    if (S.flyK > 0.001) {
      camera.position.copy(_orbit).lerp(S.flyPos, S.flyK);
      _look.copy(_target).lerp(S.flyLook, S.flyK);
    } else {
      camera.position.copy(_orbit);
      _look.copy(_target);
    }
    camera.lookAt(_look);
    camera.rotateZ(S.az * -0.06 * (1 - S.flyK) + S.camRoll);

    starGroup.rotation.y = -S.az * 0.1;
    nebulaGroup.rotation.y = -S.az * 0.22;

    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      // `noUncheckedIndexedAccess` bookkeeping; `i` is always in range.
      if (view === undefined) continue;
      const p = view.planet;

      const spin = (reduce ? p.spin * 0.08 : p.spin) * dt;
      view.group.rotation.y += spin;
      if (view.clouds !== null) view.clouds.rotation.y += spin * 0.35;

      const on = S.hovered === p.id || S.focused === p.id;

      const want = on ? HOVER_SCALE : 1.0;
      view.group.scale.x += (want - view.group.scale.x) * 0.12;
      view.group.scale.y = view.group.scale.z = view.group.scale.x;

      const base = p.feature === 'atmos' ? 1.05 : 0.78;
      const wantRim = on ? base * 1.75 : base;
      view.rimStrength.value += (wantRim - view.rimStrength.value) * 0.14;

      const auraMat = view.aura.material;
      auraMat.opacity += ((on ? 0.5 : 0.0) - auraMat.opacity) * 0.1;
      const as = p.r * (on ? 6.0 : 5.2);
      view.aura.scale.x += (as - view.aura.scale.x) * 0.1;
      view.aura.scale.y = view.aura.scale.x;

      const bodyMat = view.body.material;
      bodyMat.emissiveIntensity += ((on ? 0.07 : 0.0) - bodyMat.emissiveIntensity) * 0.12;

      if (!S.launching) {
        projectTo(view.group, view.label);
        view.group.getWorldPosition(_v2);
        const dcam = camera.position.distanceTo(_v2);
        view.label.pr =
          ((p.r * view.group.scale.x) / dcam) *
          (canvas.clientHeight / 2) /
          Math.tan((camera.fov * Math.PI) / 360);
      }
    }

    if (!S.launching && !S.docking) {
      S.bank += (S.bankTarget - S.bank) * 0.09;
      // px/py are screen-space (+y is down); the nose follows the cursor and
      // banks INTO the turn, so roll is negative when the cursor is right.
      const wantYaw = Math.PI - S.px * 0.62 + S.bank * 0.5;
      const wantPitch = -S.py * 0.34;
      const wantRoll = S.bank - S.px * 0.26;
      ship.rotation.y += (wantYaw - ship.rotation.y) * 0.1;
      ship.rotation.x += (wantPitch - ship.rotation.x) * 0.1;
      ship.rotation.z += (wantRoll - ship.rotation.z) * 0.1;
      ship.position.y = S.shipBaseY + (reduce ? 0 : Math.sin(el * 2.5) * 0.02);

      const pulse = 0.75 + Math.sin(el * 3.4) * 0.2;
      shipView.glow.material.opacity = pulse;
      shipView.halo.material.opacity = 0.18 + pulse * 0.14;
      trailMaterial.opacity = 0.07 + pulse * 0.06;
    }

    if (!S.launching) api.onLabels(labels);

    renderer.render(scene, camera);

    frames++;
    if (api.onFps !== null && now - lastFps > 500) {
      S.fps = Math.round((frames * 1000) / (now - lastFps));
      frames = 0;
      lastFps = now;
      api.onFps(S.fps);
    }
  }

  /* ------------------------------------------------------------ lifecycle */

  // A lost context must not leave a black page — hand back to the text edition.
  // Phase 8 owns the full fallback story; this is the engine's half of it.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    window.__dg3dReady = false;
    document.documentElement.removeAttribute('data-dg-3d');
    const fallback = document.getElementById('fallback');
    if (fallback !== null) {
      fallback.style.display = 'block';
      fallback.style.opacity = '1';
      fallback.style.pointerEvents = 'auto';
    }
    const labelsEl = document.getElementById('labels');
    if (labelsEl !== null) labelsEl.style.opacity = '0';
  });

  ship.rotation.y = Math.PI;
  resize();
  raf = requestAnimationFrame(frame);
  return api;
}

/**
 * `Object3D` declares neither `geometry` nor `material` — they belong to the
 * subclasses — so the disposal walk has to ask before it reaches.
 */
function disposeObject(o: THREE.Object3D): void {
  if ('geometry' in o) {
    const geometry = (o as { geometry: unknown }).geometry;
    if (geometry instanceof THREE.BufferGeometry) geometry.dispose();
  }
  if ('material' in o) {
    const material = (o as { material: unknown }).material;
    if (Array.isArray(material)) {
      for (const one of material) if (one instanceof THREE.Material) one.dispose();
    } else if (material instanceof THREE.Material) {
      material.dispose();
    }
  }
}
