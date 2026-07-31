/**
 * Every GLSL string in the hub, carried over from `design/space-engine.js`
 * byte-for-byte. Nothing here is re-derived: the surfaces were tuned against
 * these exact constants, so a "tidier" noise octave or a rounded threshold is a
 * visual change, not a refactor.
 *
 * All of it runs **once**, at init, into a render target. Nothing procedural
 * runs per frame (CLAUDE.md "Performance").
 */

/** Shared noise kit. Interpolated into the bake and nebula fragment shaders. */
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

/** Full-screen clip-space quad. The bake never uses a camera transform. */
export const BAKE_VERT =
  'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }';

/**
 * The whole planet surface library.
 *
 * `uMode` picks the surface (see `SurfaceMode`), `uOutput` picks the channel:
 * 0 albedo · 1 height (bump) · 2 cloud coverage.
 */
export const BAKE_FRAG = `
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

/**
 * Atmospheric rim. A back-face fresnel shell — this is the whole reason the
 * scene needs no effect composer and stays inside 25 draw calls.
 */
export const RIM_VERT = `
varying vec3 vN; varying vec3 vV;
void main(){
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const RIM_FRAG = `
varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uPower; uniform float uStrength;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
  gl_FragColor = vec4(uColor * f * uStrength, f * uStrength);
}`;

export const NEBULA_VERT =
  'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

/** The sky itself: one inside-out sphere, shaded per fragment, drawn once. */
export const NEBULA_FRAG = `
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
