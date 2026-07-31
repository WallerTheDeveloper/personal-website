/**
 * The backdrop: one point cloud and one inside-out shaded sphere. Two draw
 * calls for the entire sky, both built once at init.
 */

import * as THREE from 'three';

import { NEBULA_FRAG, NEBULA_VERT } from './shaders';

/**
 * Stars, as a single `Points` buffer. Colour is baked into the vertex
 * attribute — mostly cool, roughly one in ten warm — so no per-star material
 * and no per-frame work.
 */
export function createStarfield(count: number): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    // Points on a shell, flattened in y so the field reads as a disc edge-on.
    const radius = 60 + Math.random() * 90;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi) * 0.55;
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const warm = Math.random();
    color.setHSL(warm > 0.9 ? 0.08 : 0.58 + Math.random() * 0.08, 0.35, 0.55 + Math.random() * 0.45);
    const brightness = 0.35 + Math.random() * 0.65;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.42,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  return new THREE.Points(geometry, material);
}

/** The void itself, shaded per fragment on the inside of a 150-unit sphere. */
export function createNebula(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const material = new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    uniforms: {
      uA: { value: new THREE.Color('#08091a') },
      uB: { value: new THREE.Color('#141a3e') },
      uC: { value: new THREE.Color('#4a2f9c') },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(150, 32, 20), material);
}
