/* space-engine.js — hub scene + shared 3D primitives.
   Every surface is baked once into render targets at init; no procedural
   noise runs per frame. No allocations in the render loop. */
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
export { THREE };

/* mode: 0 ocean world · 1 rocky · 2 ice giant · 3 cratered desert */
export const PLANETS = [
  { id: 'backend',  href: 'backend.dc.html',  label: 'Backend & Platform',   sub: 'Services, data, delivery',
    theta: -0.482, dist: 8.47, y: 0.68, r: 1.16, spin: 0.045, feature: 'clouds', mode: 0,
    rough: 0.72, bump: 0.030,
    deep: '#04203a', mid: '#1c86b8', hi: '#8ff0ff', glow: '#3fd8ff' },
  { id: 'projects', href: 'projects.dc.html', label: 'Independent Projects', sub: 'Personal work',
    theta: -0.293, dist: 6.27, y: 2.00, r: 0.66, spin: 0.062, feature: 'moon', mode: 1,
    rough: 0.96, bump: 0.055,
    deep: '#042a1e', mid: '#12a870', hi: '#9dffd6', glow: '#38ffb0' },
  { id: 'xr',       href: 'xr.dc.html',       label: 'XR / AR',              sub: 'Unity, spatial',
    theta: 0.225,  dist: 6.87, y: 0.08, r: 0.82, spin: 0.038, feature: 'ring', mode: 2,
    rough: 0.88, bump: 0.018,
    deep: '#1a0b33', mid: '#6f3fd6', hi: '#dcb6ff', glow: '#b26bff' },
  { id: 'about',    href: 'about.dc.html',    label: 'About & Contact',      sub: 'CV, languages',
    theta: 0.694,  dist: 6.50, y: 3.00, r: 0.57, spin: 0.055, feature: 'atmos', mode: 3,
    rough: 0.98, bump: 0.060,
    deep: '#2d1204', mid: '#c46a1c', hi: '#ffd39a', glow: '#ff9b3d' },
];

export const byId = (id) => PLANETS.find(p => p.id === id) || PLANETS[0];

export function detectQuality() {
  const stored = (typeof localStorage !== 'undefined') && localStorage.getItem('dg-quality');
  if (stored === 'low' || stored === 'high') return stored;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  return (small || cores <= 4 || mem <= 4) ? 'low' : 'high';
}

export const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/* ---------------------------------------------------------------- shaders */

const NOISE_GLSL = `
float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
vec3 hash3(vec3 p){
  p = vec3(dot(p,vec3(127.1,311.7,74.7)), dot(p,vec3(269.5,183.3,246.1)), dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453);
}
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<4;i++){ s += a*vnoise(p); p = p*2.05 + vec3(0.7); a *= 0.5; }
  return s;
}
float ridged(vec3 p){
  float a = 0.5, s = 0.0;
  for(int i=0;i<3;i++){ s += a*(1.0-abs(vnoise(p)*2.0-1.0)); p = p*2.08 + vec3(1.3); a *= 0.5; }
  return s;
}
float worley(vec3 p){
  vec3 i = floor(p), f = fract(p);
  float d = 9.0;
  for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){
    vec3 g = vec3(float(x),float(y),float(z));
    vec3 o = hash3(i+g);
    d = min(d, length(g+o-f));
  }
  return d;
}
vec3 warp(vec3 q, float amt){
  return q + amt*vec3(fbm(q+vec3(1.7,9.2,3.3)), fbm(q+vec3(8.3,2.8,7.1)), fbm(q+vec3(4.1,5.9,1.2)));
}`;

/* uOutput: 0 albedo · 1 height (bump) · 2 cloud coverage */
const BAKE_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uDeep, uMid, uHi;
uniform float uSeed, uMode, uOutput;
${NOISE_GLSL}
void main(){
  float a = vUv.x * 6.2831853;
  vec3 q = vec3(cos(a)*1.55, vUv.y*2.45, sin(a)*1.55) + uSeed;
  float lat = abs(vUv.y - 0.5) * 2.0;
  float h = 0.0;
  vec3 c = uDeep;

  if (uOutput > 1.5) {                       // cloud coverage
    vec3 w = warp(q*1.05 + vec3(4.2), 0.95);
    float cl = fbm(w*2.1);
    cl = smoothstep(0.56, 0.88, cl);
    cl *= 0.35 + 0.65 * smoothstep(0.02, 0.30, abs(sin(vUv.y*7.0 + fbm(w*1.1)*3.0)));
    cl *= 1.0 - smoothstep(0.88, 1.0, lat);
    gl_FragColor = vec4(vec3(cl), 1.0);
    return;
  }

  if (uMode < 0.5) {                          // ocean world
    vec3 w = warp(q*1.22, 0.62);
    float cont = smoothstep(0.50, 0.68, fbm(w*1.45));
    float relief = ridged(q*3.4);
    float shelf = smoothstep(0.34, 0.52, fbm(w*1.45));
    h = cont * (0.45 + 0.55*relief);
    vec3 sea = mix(uDeep*0.75, uDeep, smoothstep(0.0, 0.5, fbm(q*2.2)));
    sea = mix(sea, uMid*0.85, shelf*0.55);
    vec3 land = mix(uMid*0.7, uHi, smoothstep(0.35, 0.95, relief));
    land = mix(land, uHi*0.72, smoothstep(0.2, 0.7, fbm(q*5.5)));
    c = mix(sea, land, cont);
    float ice = smoothstep(0.88, 1.02, lat + 0.10*fbm(q*3.0));
    c = mix(c, vec3(0.90, 0.94, 0.99), ice);
    h = mix(h, 0.55, ice*0.5);
  } else if (uMode < 1.5) {                   // rocky
    vec3 w = warp(q*1.55, 0.45);
    float base = fbm(w*2.1);
    float rid = ridged(q*4.2);
    float cr = worley(q*5.2);
    float floorC = smoothstep(0.0, 0.24, cr);
    float rim = exp(-pow((cr - 0.17)/0.075, 2.0));
    h = base*0.55 + rid*0.25 + floorC*0.2 + rim*0.28;
    c = mix(uDeep, uMid, smoothstep(0.28, 0.72, base));
    c = mix(c, uHi, smoothstep(0.78, 1.12, rid*0.6 + rim*0.35));
    c *= 0.80 + 0.26*floorC;
    c = mix(c, uDeep*0.8, smoothstep(0.55, 0.9, fbm(q*1.4))*0.45);
  } else if (uMode < 2.5) {                   // ice giant, banded
    vec3 w = warp(q*0.85, 0.85);
    float flow = fbm(w*1.35);
    float bands = 0.5 + 0.5*sin(vUv.y*28.0 + flow*8.0);
    float fine = 0.5 + 0.5*sin(vUv.y*84.0 + flow*11.0);
    float storm = smoothstep(0.74, 0.96, fbm(w*2.6));
    h = bands*0.3 + storm*0.25;
    c = mix(uDeep, uMid, smoothstep(0.02, 0.98, bands*0.82 + fine*0.18));
    c = mix(c, uHi, storm*0.42);
    c *= 0.92 + 0.14*fine;
  } else {                                    // cratered desert
    vec3 w = warp(q*1.85, 0.4);
    float dunes = 0.5 + 0.5*sin(fbm(w*2.3)*13.0);
    float cr = worley(q*6.4);
    float floorC = smoothstep(0.0, 0.19, cr);
    float rim = exp(-pow((cr - 0.14)/0.055, 2.0));
    float rid = ridged(q*5.0);
    h = dunes*0.4 + floorC*0.3 + rim*0.32 + rid*0.18;
    c = mix(uDeep, uMid, dunes*0.62 + 0.38*fbm(q*4.4));
    c = mix(c, uHi, smoothstep(0.80, 1.15, dunes*0.6 + rim*0.5));
    c *= 0.82 + 0.26*floorC;
  }

  if (uOutput > 0.5) { gl_FragColor = vec4(vec3(clamp(h, 0.0, 1.0)), 1.0); return; }
  c *= 1.0 - 0.30*pow(lat, 3.0);
  gl_FragColor = vec4(c, 1.0);
}`;

const RIM_VERT = `
varying vec3 vN; varying vec3 vV;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

const RIM_FRAG = `
varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uPower; uniform float uStrength;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
  gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
}`;

const NEBULA_FRAG = `
precision mediump float;
varying vec3 vPos;
uniform vec3 uA, uB, uC;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(vPos);
  float h = d.y*0.5+0.5;
  vec3 c = mix(uA, uB, smoothstep(0.0, 0.85, h));
  float n = fbm(d*2.2 + 4.0);
  float n2 = fbm(d*5.0 - 2.0);
  c += uC * pow(smoothstep(0.45, 0.95, n), 2.0) * 0.55;
  c *= 0.82 + 0.35*n2;
  gl_FragColor = vec4(c, 1.0);
}`;

/* -------------------------------------------------------------- factories */

let bakeQuad = null;
function bake(renderer, p, size, output, srgb) {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: true, depthBuffer: false, stencilBuffer: false,
  });
  rt.texture.wrapS = THREE.RepeatWrapping;
  if (srgb) rt.texture.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }',
    fragmentShader: BAKE_FRAG,
    uniforms: {
      uDeep: { value: new THREE.Color(p.deep) },
      uMid: { value: new THREE.Color(p.mid) },
      uHi: { value: new THREE.Color(p.hi) },
      uSeed: { value: (p.theta + 2) * 13.7 },
      uMode: { value: p.mode },
      uOutput: { value: output },
    },
  });
  if (!bakeQuad) bakeQuad = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(bakeQuad, mat);
  scene.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(prev);
  mat.dispose();
  return rt;
}

let GLOW_TEX = null;
function glowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.42)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.70, 'rgba(255,255,255,0.03)');
  g.addColorStop(1.00, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  GLOW_TEX = new THREE.CanvasTexture(c);
  GLOW_TEX.colorSpace = THREE.SRGBColorSpace;
  return GLOW_TEX;
}

function makeRim(radius, color, strength, power) {
  const geo = new THREE.SphereGeometry(radius, 40, 24);
  const mat = new THREE.ShaderMaterial({
    vertexShader: RIM_VERT, fragmentShader: RIM_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power }, uStrength: { value: strength },
    },
    side: THREE.BackSide, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

/** One planet: baked albedo + bump, optional cloud shell, rim, ring or moon. */
export function createPlanet(renderer, p, quality) {
  const low = quality === 'low';
  const albedo = bake(renderer, p, low ? 384 : 640, 0, true);
  const height = bake(renderer, p, low ? 160 : 256, 1, false);
  const g = new THREE.Group();
  g.userData.planet = p;
  g.userData.rts = [albedo, height];

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(p.r, 64, 32),
    new THREE.MeshStandardMaterial({
      map: albedo.texture,
      bumpMap: height.texture,
      bumpScale: p.bump,
      roughness: p.rough,
      metalness: p.mode === 0 ? 0.08 : 0.0,
      emissive: new THREE.Color(p.glow),
      emissiveIntensity: 0,
    })
  );
  body.name = 'body';
  g.add(body);

  if (p.feature === 'clouds') {
    const clouds = bake(renderer, p, low ? 320 : 512, 2, false);
    g.userData.rts.push(clouds);
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(p.r * 1.018, 48, 24),
      new THREE.MeshStandardMaterial({
        color: 0xf3f6ff, alphaMap: clouds.texture, transparent: true,
        opacity: 0.5, roughness: 1, metalness: 0, depthWrite: false,
      })
    );
    shell.name = 'clouds';
    g.add(shell);
  }

  const rim = makeRim(p.r * 1.085, p.glow, p.feature === 'atmos' ? 1.0 : 0.74, 4.2);
  rim.name = 'rim';
  g.add(rim);

  // wide, soft halo — invisible at rest, blooms on hover/focus
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(p.glow), transparent: true,
    opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  aura.scale.setScalar(p.r * 5.2);
  aura.name = 'aura';
  g.add(aura);

  if (p.feature === 'ring') {
    const ringGeo = new THREE.RingGeometry(p.r * 1.42, p.r * 2.10, 128, 1);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: new THREE.Color(p.hi), transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    ring.rotation.x = Math.PI * 0.42;
    ring.rotation.z = 0.22;
    g.add(ring);
    const inner = new THREE.Mesh(
      new THREE.RingGeometry(p.r * 1.52, p.r * 1.74, 128, 1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(p.deep), transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    inner.rotation.copy(ring.rotation);
    g.add(inner);
  }
  if (p.feature === 'moon') {
    const moonRt = bake(renderer, { ...p, mode: 1, deep: '#1d1f22', mid: '#7c7f85', hi: '#d5d8dd' }, 192, 0, true);
    g.userData.rts.push(moonRt);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(p.r * 0.22, 32, 20),
      new THREE.MeshStandardMaterial({ map: moonRt.texture, roughness: 1, metalness: 0 })
    );
    moon.name = 'moon';
    moon.position.set(p.r * 2.1, p.r * 0.55, p.r * 0.4);
    g.add(moon);
  }

  g.position.set(Math.sin(p.theta) * p.dist, p.y, Math.cos(p.theta) * p.dist);
  g.rotation.z = 0.12;
  return g;
}

/** Placeholder ship. Swap the whole body of this function for the glTF. */
export function createShip() {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b2, roughness: 0.45, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x363b47, roughness: 0.7, metalness: 0.4 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.30, 4, 12), hullMat);
  body.rotation.x = Math.PI / 2;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.26, 12), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.30;
  g.add(nose);

  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.10, 0.16), darkMat);
    fin.position.set(s * 0.11, -0.02, -0.14);
    fin.rotation.z = s * 0.32;
    g.add(fin);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.078, 0.07, 12), darkMat);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.235;
  g.add(tail);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xff9a4d, transparent: true, opacity: 0.95 })
  );
  glow.position.z = -0.28;
  glow.name = 'glow';
  g.add(glow);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff7a2a, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  halo.position.z = -0.30;
  halo.name = 'halo';
  g.add(halo);

  g.userData.glow = glow;
  g.userData.halo = halo;
  return g;
}

function createStarfield(count) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 60 + Math.random() * 90;
    const t = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(t);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.55;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(t);
    const warm = Math.random();
    c.setHSL(warm > 0.9 ? 0.08 : 0.58 + Math.random() * 0.08, 0.35, 0.55 + Math.random() * 0.45);
    const b = 0.35 + Math.random() * 0.65;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.42, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 1.0, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geo, mat);
}

function createNebula() {
  const geo = new THREE.SphereGeometry(150, 32, 20);
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: NEBULA_FRAG,
    uniforms: {
      uA: { value: new THREE.Color('#08091a') },
      uB: { value: new THREE.Color('#141a3e') },
      uC: { value: new THREE.Color('#4a2f9c') },
    },
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  return new THREE.Mesh(geo, mat);
}

/* -------------------------------------------------------------- the hub */

const AZ_LIMIT = 0.50;
const DAMP = 0.08;

export function initHub(canvas, opts = {}) {
  const quality = opts.quality || detectQuality();
  const reduce = reducedMotion();
  const composition = opts.composition || 'arc';

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: quality === 'high', alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.38;
  const mobile = Math.min(window.innerWidth, window.innerHeight) < 700;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.setClearColor(0x05060d, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

  const starGroup = new THREE.Group();
  starGroup.add(createStarfield(quality === 'low' ? 1800 : 3200));
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
  const planets = PLANETS.map(p => {
    const g = createPlanet(renderer, p, quality);
    if (composition === 'deep') { g.position.z *= 0.86; g.position.y *= 0.55; }
    else if (composition === 'drift') { g.position.y += Math.sin(p.theta * 3.1) * 0.9; g.position.x *= 1.12; }
    planetGroup.add(g);
    return g;
  });
  const bodies = planets.map(g => g.getObjectByName('body'));

  const ship = createShip();
  ship.position.set(0, -1.05, -3.4);
  camera.add(ship);
  scene.add(camera);

  const trailGeo = new THREE.ConeGeometry(0.034, 0.55, 12, 1, true);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xff8f45, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.rotation.x = -Math.PI / 2;
  trail.position.z = -0.55;
  ship.add(trail);

  const S = {
    az: 0, azTarget: 0, hovered: null, focused: null,
    launching: false, t0: performance.now(), paused: false,
    fps: 0, bank: 0, bankTarget: 0, camDolly: 0, camRoll: 0, shipBaseY: -1.05, px: 0, py: 0,
    baseFov: 50, fovBoost: 0,
    azLimit: AZ_LIMIT,
    aimY: 0, aimT: 0, camY: 0, camYT: 0, parkDolly: 0, parkDollyT: 0,
    // ship-flight state: flyK blends the orbital camera into a chase camera
    docking: false, flightToken: 0, lastSide: 1,
    flyK: 0, flyPos: new THREE.Vector3(), flyLook: new THREE.Vector3(),
  };
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _ndc = new THREE.Vector2(-2, -2);
  const _ray = new THREE.Raycaster();
  const _zAxis = new THREE.Vector3(0, 0, 1);
  const _orbit = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _target = new THREE.Vector3(0, 0.9, 0);
  const CAM_R = composition === 'deep' ? 17.6 : 15.5;

  let lastRay = 0, lastFps = performance.now(), frames = 0, raf = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    S.baseFov = w / h < 0.85 ? 62 : 50;
    camera.fov = S.baseFov + S.fovBoost;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    const d = 5.2;
    const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * d;
    S.shipBaseY = -halfH * 0.62;
    ship.position.y = S.shipBaseY;
    ship.position.z = -d;
  }

  function projectTo(obj, out) {
    obj.getWorldPosition(_v);
    _v.project(camera);
    out.x = (_v.x * 0.5 + 0.5) * canvas.clientWidth;
    out.y = (-_v.y * 0.5 + 0.5) * canvas.clientHeight;
    out.visible = _v.z < 1;
    return out;
  }

  const api = {
    quality, reduce, planets, camera, renderer, scene, ship, canvasEl: canvas,
    onLabels: opts.onLabels || (() => {}),
    onHover: opts.onHover || (() => {}),
    onFps: opts.onFps || null,
    setAzimuth(a, instant) {
      S.azTarget = Math.max(-S.azLimit, Math.min(S.azLimit, a));
      if (instant) S.az = S.azTarget;
    },
    nudge(d) { api.setAzimuth(S.azTarget + d); },
    get azimuth() { return S.az; },
    focusPlanet(id, instant) { api.setAzimuth(byId(id).theta * 0.85, instant); },
    setHovered(id) {
      S.hovered = id;
      const p = id ? byId(id) : null;
      S.bankTarget = p ? Math.max(-0.14, Math.min(0.14, -p.theta * 0.32)) : 0;
      api.onHover(id);
    },
    pick(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      _ray.setFromCamera(_ndc, camera);
      const hit = _ray.intersectObjects(bodies, false)[0];
      return hit ? hit.object.parent.userData.planet.id : null;
    },
    /** Departure: the ship keeps the heading it had at the moment of the click,
        sweeps one wide banked curve out to the planet, and the camera flies with
        it. No recoil — the motion is continuous from the idle nose-tracking. */
    launch(id, duration = 1700) {
      if (S.launching) return Promise.resolve();
      const token = ++S.flightToken;
      S.docking = false;
      S.launching = true;
      const g = planets.find(x => x.userData.planet.id === id);
      scene.attach(ship);                       // keeps the cursor-aimed pose
      const p0 = ship.position.clone();
      const q0 = ship.quaternion.clone();
      const s0 = ship.scale.clone();
      const nose = new THREE.Vector3(0, 0, 1).applyQuaternion(q0).normalize();
      const dest = new THREE.Vector3();
      g.getWorldPosition(dest);
      const pr = g.userData.planet.r;
      // stop short of the surface, on the near side
      const end = new THREE.Vector3().subVectors(p0, dest).normalize()
        .multiplyScalar(pr * 2.1).add(dest);
      const span = Math.max(4, p0.distanceTo(end));
      const UP = new THREE.Vector3(0, 1, 0);
      const toEnd = new THREE.Vector3().subVectors(end, p0).normalize();
      const sideV = new THREE.Vector3().crossVectors(UP, toEnd);
      if (sideV.lengthSq() < 1e-4) sideV.set(1, 0, 0);
      sideV.normalize();
      // swing the curve to whichever side the nose was already turned
      const sign = sideV.dot(nose) >= 0 ? 1 : -1;
      S.lastSide = sign;
      const p1 = p0.clone().addScaledVector(nose, span * 0.34).addScaledVector(UP, span * 0.04);
      const p2 = p0.clone().lerp(end, 0.68)
        .addScaledVector(sideV, sign * span * 0.30)
        .addScaledVector(UP, span * 0.17);

      const pos = new THREE.Vector3(), tan = new THREE.Vector3(), back = new THREE.Vector3();
      const qPath = q0.clone(), qT = new THREE.Quaternion(), qBank = new THREE.Quaternion();
      const m = new THREE.Matrix4();
      const t0 = performance.now();
      const smooth = (k) => k * k * (3 - 2 * k);

      return new Promise(res => {
        const step = () => {
          if (token !== S.flightToken) return res();
          const t = Math.min(1, (performance.now() - t0) / duration);
          const e = smooth(t);
          const u = 1 - e;
          pos.set(0, 0, 0)
            .addScaledVector(p0, u * u * u).addScaledVector(p1, 3 * u * u * e)
            .addScaledVector(p2, 3 * u * e * e).addScaledVector(end, e * e * e);
          tan.set(0, 0, 0)
            .addScaledVector(p0, -3 * u * u).addScaledVector(p1, 3 * (u * u - 2 * u * e))
            .addScaledVector(p2, 3 * (2 * u * e - e * e)).addScaledVector(end, 3 * e * e);
          if (tan.lengthSq() < 1e-8) tan.copy(toEnd);
          tan.normalize();
          ship.position.copy(pos);

          // orientation EASES onto the path tangent out of the click-time angle,
          // so there is no snap on the first frame
          back.copy(pos).sub(tan);
          m.lookAt(pos, back, UP);
          qT.setFromRotationMatrix(m);
          qPath.slerp(qT, 0.10);
          const bankIn = 0.55 * Math.sin(e * Math.PI);
          const rollOut = 2.6 * smooth(Math.max(0, Math.min(1, (t - 0.45) / 0.55)));
          qBank.setFromAxisAngle(_zAxis, -sign * (bankIn + rollOut));
          ship.quaternion.copy(qPath).multiply(qBank);

          ship.scale.set(
            s0.x + (0.88 - s0.x) * e,
            s0.y + (0.88 - s0.y) * e,
            s0.z + (1.85 - s0.z) * e
          );
          trailMat.opacity = 0.12 + e * 0.48;
          trail.scale.set(1 + e * 0.4, 1 + e * 0.4, 1 + e * 5.0);
          ship.userData.halo.scale.setScalar(1 + e * 3.4);
          ship.userData.glow.material.opacity = 0.8 + e * 0.2;

          // chase camera, slung behind and a touch above
          S.flyPos.copy(pos).addScaledVector(tan, -2.9 - e * 0.8).addScaledVector(UP, 0.85);
          S.flyLook.copy(pos).addScaledVector(tan, 3.4);
          S.flyK = smooth(Math.min(1, t / 0.22));
          S.camDolly = 0;
          S.camRoll = sign * 0.05 * Math.sin(e * Math.PI);
          S.fovBoost = e * 9;

          if (t < 1) requestAnimationFrame(step); else res();
        };
        step();
      });
    },
    shipScreenPos() {
      const o = { x: 0, y: 0, visible: true };
      projectTo(ship, o);
      return o;
    },
    /** Normalised pointer (-1..1). The idle ship noses toward it. */
    setPointer(nx, ny) {
      S.px = Math.max(-1, Math.min(1, nx));
      S.py = Math.max(-1, Math.min(1, ny));
    },
    setQuality(q) { try { localStorage.setItem('dg-quality', q); } catch (e) {} },
    pause(v) { S.paused = v; },
    dispose() {
      cancelAnimationFrame(raf);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => m.dispose());
        }
      });
      planets.forEach(g => (g.userData.rts || []).forEach(rt => rt.dispose()));
      renderer.dispose();
    },
  };

  const labelOut = PLANETS.map(() => ({ x: 0, y: 0, visible: true, pr: 0, id: '' }));
  let prev = performance.now();

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (S.paused) { prev = now; return; }
    try { step(now); } catch (err) { console.error('[hub frame]', err); }
  }

  function step(now) {
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

    starGroup.rotation.y = -S.az * 0.10;
    nebulaGroup.rotation.y = -S.az * 0.22;

    for (let i = 0; i < planets.length; i++) {
      const g = planets[i], p = PLANETS[i];
      const spin = (reduce ? p.spin * 0.08 : p.spin) * dt;
      g.rotation.y += spin;
      const cl = g.getObjectByName('clouds');
      if (cl) cl.rotation.y += spin * 0.35;
      const on = (S.hovered === p.id || S.focused === p.id);
      const want = on ? 1.055 : 1.0;
      g.scale.x += (want - g.scale.x) * 0.12;
      g.scale.y = g.scale.z = g.scale.x;
      const rim = g.getObjectByName('rim');
      const base = p.feature === 'atmos' ? 1.05 : 0.78;
      const wantRim = on ? base * 1.75 : base;
      rim.material.uniforms.uStrength.value += (wantRim - rim.material.uniforms.uStrength.value) * 0.14;
      const aura = g.getObjectByName('aura');
      aura.material.opacity += ((on ? 0.5 : 0.0) - aura.material.opacity) * 0.10;
      const as = p.r * (on ? 6.0 : 5.2);
      aura.scale.x += (as - aura.scale.x) * 0.10;
      aura.scale.y = aura.scale.x;
      const bm = bodies[i].material;
      bm.emissiveIntensity += ((on ? 0.07 : 0.0) - bm.emissiveIntensity) * 0.12;
      if (!S.launching) {
        projectTo(g, labelOut[i]);
        g.getWorldPosition(_v2);
        const dcam = camera.position.distanceTo(_v2);
        labelOut[i].pr = (p.r * g.scale.x / dcam) *
          (canvas.clientHeight / 2) / Math.tan(camera.fov * Math.PI / 360);
        labelOut[i].id = p.id;
      }
    }

    if (!S.launching && !S.docking) {
      S.bank += (S.bankTarget - S.bank) * 0.09;
      // px/py are screen-space (+y is down); nose follows the cursor and
      // banks INTO the turn, so roll is negative when the cursor is right
      const wantYaw = Math.PI - S.px * 0.62 + S.bank * 0.5;
      const wantPitch = -S.py * 0.34;
      const wantRoll = S.bank - S.px * 0.26;
      ship.rotation.y += (wantYaw - ship.rotation.y) * 0.10;
      ship.rotation.x += (wantPitch - ship.rotation.x) * 0.10;
      ship.rotation.z += (wantRoll - ship.rotation.z) * 0.10;
      ship.position.y = S.shipBaseY + (reduce ? 0 : Math.sin(el * 2.5) * 0.02);
      const pulse = 0.75 + Math.sin(el * 3.4) * 0.2;
      ship.userData.glow.material.opacity = pulse;
      ship.userData.halo.material.opacity = 0.18 + pulse * 0.14;
      trailMat.opacity = 0.07 + pulse * 0.06;
    }
    if (!S.launching) api.onLabels(labelOut);

    renderer.render(scene, camera);

    frames++;
    if (api.onFps && now - lastFps > 500) {
      S.fps = Math.round((frames * 1000) / (now - lastFps));
      frames = 0; lastFps = now;
      api.onFps(S.fps);
    }
  }

  api.rayThrottled = function (clientX, clientY, now) {
    if (S.launching) return;
    if (now - lastRay < 33) return;
    lastRay = now;
    const id = api.pick(clientX, clientY);
    if (id !== S.hovered) api.setHovered(id);
  };
  api.setFocused = id => { S.focused = id; };
  api.isLaunching = () => S.launching || S.docking;
  api.resize = resize;

  /** Hold station off one planet, framed high so an overlay panel can occupy
      the lower two thirds of the viewport. */
  api.park = (id) => {
    const p = byId(id);
    S.azLimit = 0.95;
    api.setAzimuth(p.theta, true);
    const tan = Math.tan((S.baseFov * Math.PI / 180) / 2);
    // stand off far enough that the planet reads ~24% of the viewport height…
    const d = p.r / (0.24 * tan);
    S.parkDollyT = Math.max(-0.6, Math.min(1.6, (p.dist + d) / CAM_R - 1));
    S.camYT = p.y - 0.9;
    // …and aim low, so it sits high in frame with the panel below it
    S.aimT = p.y - 0.56 * tan * d - 0.9;
  };
  api.unpark = () => {
    S.aimT = 0;
    S.camYT = 0;
    S.parkDollyT = 0;
    S.azLimit = AZ_LIMIT;
    api.setAzimuth(S.azTarget);
  };

  /** Re-seat the ship in the cockpit rig after a launch, so the hub is reusable
      without tearing the scene down. */
  /** Arrival: the ship sweeps in past the viewer and settles into the cockpit
      rig. Mirror of launch(), so returning never reads as a cut. Path is in
      camera space, so it tracks the hub view as it unparks. */
  api.dockShip = (duration = 1200) => {
    const token = ++S.flightToken;
    S.launching = false;
    S.docking = true;
    if (ship.parent !== scene) scene.attach(ship);
    const s0 = ship.scale.clone();
    const sign = S.lastSide || 1;
    const flyK0 = S.flyK;
    const L0 = new THREE.Vector3(sign * 4.6, S.shipBaseY - 1.4, 3.2);   // behind the viewer
    const L1 = new THREE.Vector3(sign * 2.2, S.shipBaseY - 0.6, -1.2);
    const L2 = new THREE.Vector3(0, S.shipBaseY, -3.4);                 // the rig
    const lp = new THREE.Vector3(), lt = new THREE.Vector3();
    const fwd = new THREE.Vector3(0, 0, -1), up = new THREE.Vector3(0, 1, 0);
    const back = new THREE.Vector3(), m = new THREE.Matrix4();
    const qLocal = new THREE.Quaternion(), qBank = new THREE.Quaternion();
    const t0 = performance.now();
    const smooth = (k) => k * k * (3 - 2 * k);
    return new Promise(res => {
      const step = () => {
        if (token !== S.flightToken) return res();
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
        ship.scale.set(
          s0.x + (1 - s0.x) * e, s0.y + (1 - s0.y) * e, s0.z + (1 - s0.z) * e
        );
        trailMat.opacity = 0.10 + 0.42 * (1 - e);
        trail.scale.set(1 + (1 - e) * 0.4, 1 + (1 - e) * 0.4, 1 + (1 - e) * 3.2);
        ship.userData.halo.scale.setScalar(1 + (1 - e) * 2.2);
        S.flyK = flyK0 * Math.max(0, 1 - t / 0.45);
        S.fovBoost *= 0.88;
        S.camRoll *= 0.88;
        if (t < 1) { requestAnimationFrame(step); return; }
        api.returnShip();
        S.docking = false;
        S.flyK = 0;
        res();
      };
      step();
    });
  };

  api.returnShip = () => {
    camera.add(ship);
    ship.position.set(0, S.shipBaseY, -3.4);
    ship.rotation.set(0, Math.PI, 0);
    ship.scale.set(1, 1, 1);
    trailMat.opacity = 0;
    trail.scale.set(1, 1, 1);
    ship.userData.halo.scale.setScalar(1);
    ship.userData.glow.material.opacity = 0.75;
    S.launching = false;
    S.camDolly = 0;
    S.camRoll = 0;
    S.fovBoost = 0;
  };

  // a lost context must not leave a black page — hand back to the text hub
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    window.__dg3dReady = false;
    document.documentElement.removeAttribute('data-dg-3d');
    const fb = document.getElementById('fallback');
    if (fb) { fb.style.display = 'block'; fb.style.opacity = '1'; fb.style.pointerEvents = 'auto'; }
    const lb = document.getElementById('labels');
    if (lb) lb.style.opacity = '0';
  });

  ship.rotation.y = Math.PI;
  resize();
  raf = requestAnimationFrame(frame);
  return api;
}

/* --------------------------------------------- thin band on content pages */

export function initPlanetBand(canvas, planetId) {
  const p = byId(planetId);
  const quality = detectQuality();
  const reduce = reducedMotion();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 5.4);

  const g = createPlanet(renderer, { ...p, r: 1.5 }, 'low');
  g.position.set(0, -0.55, 0);
  scene.add(g);
  scene.add(createStarfield(500));

  const sun = new THREE.DirectionalLight(0xfff2e2, 3.7);
  sun.position.set(-4, 3, 6);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x2b3d68, 0.62));

  let raf = 0, running = true, prev = performance.now();
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running) { prev = now; return; }
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    const spin = (reduce ? 0.004 : p.spin) * dt * 1.4;
    g.rotation.y += spin;
    const cl = g.getObjectByName('clouds');
    if (cl) cl.rotation.y += spin * 0.35;
    renderer.render(scene, camera);
  }
  resize();
  raf = requestAnimationFrame(frame);

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  const io = new IntersectionObserver(es => { running = es[0].isIntersecting; }, { threshold: 0 });
  io.observe(canvas);
  const vis = () => { running = !document.hidden; };
  document.addEventListener('visibilitychange', vis);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', vis);
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach(m => m.dispose());
        }
      });
      (g.userData.rts || []).forEach(rt => rt.dispose());
      renderer.dispose();
    },
  };
}
