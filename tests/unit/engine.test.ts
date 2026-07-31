/**
 * The engine's pure surface: the planet table and the capability probes.
 *
 * Everything here runs without a WebGL context on purpose — these are the parts
 * that decide how much work the renderer will do, and they should be provable
 * without one. The scene itself is verified in a real browser (Phase 5 notes in
 * `TASKS.md`) and by the Playwright suite in `ACCEPTANCE.md`.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PANEL_IDS, TITLES } from '../../src/content';
import { PLANETS, byId } from '../../src/engine/planets';
import {
  detectQuality,
  hasWebGL,
  isSmallViewport,
  maxPixelRatio,
  reducedMotion,
  setQuality,
} from '../../src/engine/capabilities';

interface EnvironmentOptions {
  width?: number;
  height?: number;
  dpr?: number;
  cores?: number;
  /** `undefined` models Firefox and Safari, which do not implement it. */
  memory?: number | undefined;
  stored?: string | null;
  /** Sandboxed iframes and blocked-cookie profiles throw on access. */
  storageThrows?: boolean;
  reduce?: boolean;
}

const writes: string[] = [];

/** A desktop with room to spare, unless a test says otherwise. */
function stubEnvironment(options: EnvironmentOptions = {}): void {
  const {
    width = 1440,
    height = 900,
    dpr = 1,
    cores = 8,
    stored = null,
    storageThrows = false,
    reduce = false,
  } = options;
  // Not destructured with a default: a default fires on `undefined`, which is
  // exactly the case being modelled — a browser that does not report memory.
  const memory = 'memory' in options ? options.memory : 8;

  vi.stubGlobal('window', {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
    matchMedia: (query: string) => ({ matches: reduce && query.includes('reduce') }),
  });
  vi.stubGlobal('navigator', { hardwareConcurrency: cores, deviceMemory: memory });
  vi.stubGlobal('localStorage', {
    getItem: () => {
      if (storageThrows) throw new Error('SecurityError: storage is not available');
      return stored;
    },
    setItem: (_key: string, value: string) => {
      if (storageThrows) throw new Error('SecurityError: storage is not available');
      writes.push(value);
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  writes.length = 0;
});

describe('PLANETS', () => {
  it('holds exactly the four destinations, in panel order', () => {
    expect(PLANETS).toHaveLength(4);
    expect(PLANETS.map((p) => p.id)).toEqual([...PANEL_IDS]);
  });

  it('takes its labels from the copy table, so the two cannot drift', () => {
    for (const planet of PLANETS) {
      expect(planet.label).toBe(TITLES[planet.id]);
    }
  });

  it('carries no `href` — routing keys on `id` (PORT_PLAN step 5.5)', () => {
    // The prototype's entries held 'backend.dc.html' and friends, left over from
    // the abandoned multi-page version. A document swap is what this whole
    // architecture exists to avoid; an href here would invite one back.
    for (const planet of PLANETS) {
      expect(Object.keys(planet)).not.toContain('href');
    }
  });

  it('gives every planet its own surface and its own feature', () => {
    expect(new Set(PLANETS.map((p) => p.mode)).size).toBe(4);
    expect(new Set(PLANETS.map((p) => p.feature)).size).toBe(4);
  });

  it('states every colour as a six-digit hex the bake can parse', () => {
    for (const planet of PLANETS) {
      for (const colour of [planet.deep, planet.mid, planet.hi, planet.glow]) {
        expect(colour).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

describe('byId', () => {
  it('resolves each destination', () => {
    for (const id of PANEL_IDS) {
      expect(byId(id).id).toBe(id);
    }
  });

  it('falls back to the first planet rather than throwing', () => {
    // It is reached from the hash, which is whatever the visitor typed. A bad
    // hash must never be able to break the hub.
    expect(byId('nonsense').id).toBe('backend');
    expect(byId('').id).toBe('backend');
  });
});

describe('detectQuality', () => {
  it('honours a stored choice over anything the device reports', () => {
    stubEnvironment({ stored: 'low', cores: 32, memory: 64 });
    expect(detectQuality()).toBe('low');

    stubEnvironment({ stored: 'high', width: 390, height: 844, cores: 2, memory: 2 });
    expect(detectQuality()).toBe('high');
  });

  it('ignores a stored value that is not a tier', () => {
    stubEnvironment({ stored: 'ultra' });
    expect(detectQuality()).toBe('high');
  });

  it('falls through to the heuristics when storage throws', () => {
    // A sandboxed iframe raises on property access, which the prototype's
    // `typeof localStorage !== 'undefined'` guard does not cover. Throwing here
    // would take the scene down before it booted.
    stubEnvironment({ storageThrows: true });
    expect(detectQuality()).toBe('high');
  });

  it('is high only on a roomy desktop', () => {
    stubEnvironment({ cores: 8, memory: 8 });
    expect(detectQuality()).toBe('high');
  });

  it('drops to low on a small viewport, few cores, or little memory', () => {
    stubEnvironment({ width: 390, height: 844 });
    expect(detectQuality()).toBe('low');

    stubEnvironment({ cores: 4 });
    expect(detectQuality()).toBe('low');

    stubEnvironment({ memory: 4 });
    expect(detectQuality()).toBe('low');
  });

  it('treats an unreported deviceMemory as 4 GiB, so it lands on low', () => {
    // Inherited from the prototype's `navigator.deviceMemory || 4`, and it means
    // every non-Chromium desktop renders the low tier. Deliberate, and pinned
    // here so it is a decision rather than a surprise.
    stubEnvironment({ memory: undefined });
    expect(detectQuality()).toBe('low');
  });
});

describe('setQuality', () => {
  it('persists the choice', () => {
    stubEnvironment();
    setQuality('low');
    expect(writes).toEqual(['low']);
  });

  it('stays silent when storage is unavailable', () => {
    stubEnvironment({ storageThrows: true });
    expect(() => setQuality('high')).not.toThrow();
  });
});

describe('maxPixelRatio', () => {
  it('clamps to 2 on desktop and 1.5 on a phone', () => {
    stubEnvironment({ dpr: 3 });
    expect(maxPixelRatio()).toBe(2);

    stubEnvironment({ dpr: 3, width: 390, height: 844 });
    expect(maxPixelRatio()).toBe(1.5);
  });

  it('never raises a ratio the device did not ask for', () => {
    stubEnvironment({ dpr: 1 });
    expect(maxPixelRatio()).toBe(1);
  });

  it('treats a missing devicePixelRatio as 1', () => {
    stubEnvironment({ dpr: 0 });
    expect(maxPixelRatio()).toBe(1);
  });
});

describe('isSmallViewport', () => {
  it('measures the shorter edge, so a landscape phone still counts', () => {
    stubEnvironment({ width: 844, height: 390 });
    expect(isSmallViewport()).toBe(true);

    stubEnvironment({ width: 1024, height: 768 });
    expect(isSmallViewport()).toBe(false);
  });
});

describe('reducedMotion', () => {
  it('reads the media query', () => {
    stubEnvironment({ reduce: true });
    expect(reducedMotion()).toBe(true);

    stubEnvironment({ reduce: false });
    expect(reducedMotion()).toBe(false);
  });
});

describe('hasWebGL', () => {
  function stubCanvas(context: unknown): void {
    vi.stubGlobal('window', { WebGLRenderingContext: class {} });
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  }

  it('is true when a context can be created', () => {
    stubCanvas({});
    expect(hasWebGL()).toBe(true);
  });

  it('is false when it cannot', () => {
    stubCanvas(null);
    expect(hasWebGL()).toBe(false);
  });

  it('is false rather than throwing when canvas creation itself fails', () => {
    vi.stubGlobal('window', { WebGLRenderingContext: class {} });
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('blocked');
      },
    });
    expect(hasWebGL()).toBe(false);
  });
});
