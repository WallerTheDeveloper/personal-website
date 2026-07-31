/**
 * Texture baking. Every planet surface is rendered **once**, at init, into a
 * render target — the reason nothing procedural runs per frame and the reason
 * a document swap was unacceptable: arriving on a new document rebuilt all of
 * this from scratch (CLAUDE.md "Architecture").
 */

import * as THREE from 'three';

import { BAKE_FRAG, BAKE_VERT } from './shaders';
import type { Planet } from './planets';

/** `uOutput`: which channel of `BAKE_FRAG` to keep. */
export const BAKE_ALBEDO = 0;
export const BAKE_HEIGHT = 1;
export const BAKE_CLOUDS = 2;

export type BakeOutput = typeof BAKE_ALBEDO | typeof BAKE_HEIGHT | typeof BAKE_CLOUDS;

/**
 * Everything the bake shader reads off a planet. Narrower than `Planet` so the
 * moon — which is a colour override on its parent's entry, not a destination —
 * can be baked without inventing an id for it.
 */
export type BakeSource = Pick<Planet, 'deep' | 'mid' | 'hi' | 'theta' | 'mode'>;

/**
 * One clip-space quad, shared by every bake and never added to the hub scene,
 * so `HubApi.dispose()`'s scene traversal cannot dispose it out from under a
 * later bake. Created lazily: a text-edition visit never allocates it.
 */
let bakeQuad: THREE.PlaneGeometry | null = null;

/**
 * Renders one channel of one surface into a texture and hands back the target.
 *
 * The caller owns the result and must `dispose()` it — `HubApi.dispose()` walks
 * every planet's target list for exactly this reason. Restores whatever render
 * target the renderer had, so this is safe to call mid-frame.
 */
export function bake(
  renderer: THREE.WebGLRenderer,
  source: BakeSource,
  size: number,
  output: BakeOutput,
  srgb: boolean,
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
    stencilBuffer: false,
  });
  // The surface wraps a sphere: u must repeat or the seam shows.
  target.texture.wrapS = THREE.RepeatWrapping;
  // Colour goes through sRGB; height and coverage are data and must not.
  if (srgb) target.texture.colorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    uniforms: {
      uDeep: { value: new THREE.Color(source.deep) },
      uMid: { value: new THREE.Color(source.mid) },
      uHi: { value: new THREE.Color(source.hi) },
      // theta doubles as the seed, so each planet gets a different surface.
      uSeed: { value: (source.theta + 2) * 13.7 },
      uMode: { value: source.mode },
      uOutput: { value: output },
    },
  });

  bakeQuad ??= new THREE.PlaneGeometry(2, 2);
  scene.add(new THREE.Mesh(bakeQuad, material));

  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous);
  material.dispose();

  return target;
}

/**
 * The soft halo behind a hovered planet. One 128² canvas gradient, cached for
 * the life of the document and shared by all four auras — it is tinted per
 * planet through `SpriteMaterial.color`, not rebaked.
 */
let glowTex: THREE.CanvasTexture | null = null;

export function glowTexture(): THREE.CanvasTexture {
  if (glowTex !== null) return glowTex;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('[hub] 2D context unavailable for the glow sprite');

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.42)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.13)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.03)');
  gradient.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  glowTex = new THREE.CanvasTexture(canvas);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
