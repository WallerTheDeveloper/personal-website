/**
 * The four destinations as scene objects: where each planet sits, how it spins,
 * and which surface the bake shader paints on it.
 *
 * Carried over from `design/space-engine.js` with one field removed — each
 * entry used to hold `href: 'backend.dc.html'`, a leftover from the abandoned
 * multi-page version (PORT_PLAN step 5.5). Routing keys on `id`, which is the
 * same `PanelId` the router and the copy table use, so the two cannot drift.
 */

import { TITLES, type PanelId } from '../content';

/** Extra geometry hung off a planet. Exactly one per entry. */
export type PlanetFeature = 'clouds' | 'moon' | 'ring' | 'atmos';

/** `uMode` in `BAKE_FRAG`: 0 ocean world · 1 rocky · 2 ice giant · 3 cratered desert. */
export type SurfaceMode = 0 | 1 | 2 | 3;

export interface Planet {
  readonly id: PanelId;
  /**
   * Descriptive only. The label copy a visitor actually reads is static markup
   * in `index.html` (`#labels .label__name` / `.label__sub`) so the text
   * edition carries it with JS disabled — nothing renders these two fields.
   */
  readonly label: string;
  readonly sub: string;
  /** Angle around the hub, radians. Also seeds the bake and the park solve. */
  readonly theta: number;
  /** Distance from the hub centre. */
  readonly dist: number;
  readonly y: number;
  /** Sphere radius. The park solve frames this as ~24 % of viewport height. */
  readonly r: number;
  /** Ambient rotation, radians per second. */
  readonly spin: number;
  readonly feature: PlanetFeature;
  readonly mode: SurfaceMode;
  readonly rough: number;
  readonly bump: number;
  /** Bake palette, dark → light, plus the accent the rim and aura glow with. */
  readonly deep: string;
  readonly mid: string;
  readonly hi: string;
  readonly glow: string;
}

/**
 * Exactly four, in DOM order. Typed as a fixed-length tuple so `byId()`'s
 * fallback to `PLANETS[0]` is a `Planet` rather than `Planet | undefined`, and
 * so a fifth destination has to be a deliberate edit here.
 */
export const PLANETS: readonly [Planet, Planet, Planet, Planet] = [
  {
    id: 'backend', label: TITLES.backend, sub: 'Services, data, delivery',
    theta: -0.482, dist: 8.47, y: 0.68, r: 1.16, spin: 0.045, feature: 'clouds', mode: 0,
    rough: 0.72, bump: 0.030,
    deep: '#04203a', mid: '#1c86b8', hi: '#8ff0ff', glow: '#3fd8ff',
  },
  {
    id: 'projects', label: TITLES.projects, sub: 'Personal work',
    theta: -0.293, dist: 6.27, y: 2.00, r: 0.66, spin: 0.062, feature: 'moon', mode: 1,
    rough: 0.96, bump: 0.055,
    deep: '#042a1e', mid: '#12a870', hi: '#9dffd6', glow: '#38ffb0',
  },
  {
    id: 'xr', label: TITLES.xr, sub: 'Unity, spatial',
    theta: 0.225, dist: 6.87, y: 0.08, r: 0.82, spin: 0.038, feature: 'ring', mode: 2,
    rough: 0.88, bump: 0.018,
    deep: '#1a0b33', mid: '#6f3fd6', hi: '#dcb6ff', glow: '#b26bff',
  },
  {
    id: 'about', label: TITLES.about, sub: 'CV, languages',
    theta: 0.694, dist: 6.50, y: 3.00, r: 0.57, spin: 0.055, feature: 'atmos', mode: 3,
    rough: 0.98, bump: 0.060,
    deep: '#2d1204', mid: '#c46a1c', hi: '#ffd39a', glow: '#ff9b3d',
  },
];

/**
 * Takes a plain `string` on purpose: the router resolves it from the hash,
 * which is whatever the visitor typed. An unknown id falls back to the first
 * planet rather than throwing — a bad hash must never be able to break the hub.
 */
export function byId(id: string): Planet {
  return PLANETS.find((p) => p.id === id) ?? PLANETS[0];
}
