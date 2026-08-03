/**
 * What the device can do, and what the visitor asked for. Every branch that
 * changes how much work the renderer does starts here.
 *
 * Kept apart from the scene so the tiers stay unit-testable without a WebGL
 * context (PORT_PLAN step 11 asks for exactly that).
 */

export type Quality = 'low' | 'high';

const QUALITY_KEY = 'dg-quality';

/**
 * Below this, on the shorter viewport edge, the device is treated as a phone:
 * fewer stars, smaller bakes, a tighter DPR clamp. The prototype computed the
 * same comparison twice under two names (`small`, `mobile`); it is one idea.
 */
const SMALL_VIEWPORT_PX = 700;

declare global {
  interface Navigator {
    /**
     * Chromium-only hint, in GiB, and coarsely quantised by the browser.
     * Absent in Firefox and Safari — always treat `undefined` as "unknown".
     */
    readonly deviceMemory?: number;
  }
}

export function isSmallViewport(): boolean {
  return Math.min(window.innerWidth, window.innerHeight) < SMALL_VIEWPORT_PX;
}

/**
 * Device pixel ratio ceiling: 2 on desktop, 1.5 on a phone. The single largest
 * lever on fill cost, so it is capped rather than trusted (CLAUDE.md
 * "Performance").
 */
export function maxPixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, isSmallViewport() ? 1.5 : 2);
}

/**
 * Reading `localStorage` is not merely possibly-absent, it can *throw*: a
 * sandboxed iframe or a blocked-cookies profile raises on property access. The
 * prototype's `typeof localStorage !== 'undefined'` guard does not cover that,
 * and an exception here would take the whole scene down before it booted.
 */
function storedQuality(): Quality | null {
  try {
    const stored = localStorage.getItem(QUALITY_KEY);
    return stored === 'low' || stored === 'high' ? stored : null;
  } catch {
    return null;
  }
}

/**
 * An explicit choice always wins. Otherwise: a small screen, four cores or
 * fewer, or 4 GiB or less of reported memory all mean `low`.
 */
export function detectQuality(): Quality {
  const stored = storedQuality();
  if (stored !== null) return stored;

  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  return isSmallViewport() || cores <= 4 || memory <= 4 ? 'low' : 'high';
}

/** Persisted so the choice survives a reload. Silent if storage is unavailable. */
export function setQuality(quality: Quality): void {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Nothing to recover: the tier still applies for this document.
  }
}

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Mirrors the inline probe in `index.html`'s `<head>` exactly. That one runs
 * before first paint so the text edition never flashes; this one is what the
 * router checks before it builds a scene.
 */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}
