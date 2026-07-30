/* warp.js — hyperspace transition.
   Radial streak field on a 2D overlay canvas. No textures, no per-pixel work,
   nothing generated at click time: construction is a few hundred plain objects,
   and each frame is a few hundred line strokes. Cheap enough to run alongside
   the WebGL scene, and cheap enough to keep running on the destination page
   until the document has genuinely finished loading.

   Phases: cover (streaks accelerate, screen washes out) → hold (sustained
   hyperspace, persists until onload) → clear (decelerate, reveal). */

const KEY = 'dg-launch';
export const MIN_COVER = 900;
export const MAX_COVER = 2200;
export const HOLD_CAP = 3400;

const ACCENTS = {
  'index': '#ff9b3d',
  'backend': '#3fd8ff',
  'projects': '#38ffb0',
  'xr': '#b26bff',
  'about': '#ff9b3d',
};

const BASE = '#05060d';

function hexToRgb(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Warp {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.accent = opts.accent || '#9fd8ff';
    this.rgb = hexToRgb(this.accent);
    const small = window.innerWidth < 720;
    this.count = opts.count || (small ? 260 : 460);
    this.s = new Array(this.count);
    for (let i = 0; i < this.count; i++) this.s[i] = this._seed({}, true);
    this.phase = 'idle';
    this.k = 0;            // 0 = still stars, 1 = full hyperspace
    this.coverAlpha = 0;
    this.flash = 0;
    this.raf = 0;
    this._resize = this._resize.bind(this);
    this._tick = this._tick.bind(this);
    window.addEventListener('resize', this._resize);
    this._resize();
  }

  _seed(q, fresh) {
    q.a = Math.random() * Math.PI * 2;
    q.r = fresh ? Math.pow(Math.random(), 0.6) : 0.004 + Math.random() * 0.02;
    q.sp = 0.55 + Math.random() * 2.4;      // radial velocity multiplier
    q.len = 0.10 + Math.random() * 0.55;    // streak length at full warp
    q.w = 0.6 + Math.random() * 1.9;        // stroke width
    q.tint = Math.random();                 // white ↔ accent
    q.a += (Math.random() - 0.5) * 0.02;
    return q;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cx = this.w / 2;
    this.cy = this.h / 2;
    this.rad = Math.hypot(this.w, this.h) / 2;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Jump to lightspeed. Resolves nothing; onOpaque fires when the screen is covered. */
  cover(opts = {}) {
    this.canvas.style.display = 'block';
    this.phase = 'cover';
    this.coverDur = (opts.duration || 950) / 1000;
    this.t = 0;
    this.onOpaque = opts.onOpaque;
    this._firedOpaque = false;
    this._start();
    return this;
  }

  /** Sustained hyperspace. Runs until clear(). */
  startHold() {
    this.canvas.style.display = 'block';
    this.phase = 'hold';
    this.k = 1;
    this.coverAlpha = 1;
    this._start();
    return this;
  }

  /** Drop out of hyperspace and reveal the page. */
  clear(duration = 950) {
    if (this.phase === 'clear' || this.phase === 'done') return Promise.resolve();
    this.phase = 'clear';
    this.clearDur = duration / 1000;
    this.t = 0;
    this.flash = 0.5;
    return new Promise(res => { this._onClear = res; });
  }

  /** Paint opaque immediately, before the module-driven animation starts. */
  fill() {
    this.canvas.style.display = 'block';
    const c = this.ctx;
    c.globalAlpha = 1;
    c.fillStyle = BASE;
    c.fillRect(0, 0, this.w, this.h);
  }

  _start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this._tick);
  }

  _tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const c = this.ctx;

    if (this.phase === 'cover') {
      this.t += dt;
      const p = Math.min(1, this.t / this.coverDur);
      this.k = Math.pow(p, 1.7);                                  // spool up
      this.coverAlpha = Math.max(0, Math.min(1, (p - 0.30) / 0.45));
      if (p > 0.82) this.flash = Math.max(this.flash, Math.min(0.7, (p - 0.82) / 0.18));
      if (!this._firedOpaque && p >= 0.92) {
        this._firedOpaque = true;
        this.onOpaque && this.onOpaque();
      }
      if (p >= 1) { this.phase = 'hold'; this.k = 1; this.coverAlpha = 1; }
    } else if (this.phase === 'clear') {
      this.t += dt;
      const p = Math.min(1, this.t / this.clearDur);
      this.k = Math.max(0, 1 - Math.pow(p, 0.75));                // decelerate
      this.coverAlpha = Math.max(0, 1 - Math.max(0, (p - 0.35) / 0.65));
      this.flash = Math.max(0, this.flash - dt * 5.5);
      if (p >= 1) {
        this.phase = 'done';
        c.clearRect(0, 0, this.w, this.h);
        this.canvas.style.display = 'none';
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this._onClear && this._onClear();
        return;
      }
    } else if (this.phase === 'hold') {
      this.flash = Math.max(0, this.flash - dt * 3.0);
    }

    const k = this.k;
    c.clearRect(0, 0, this.w, this.h);

    // opaque base — no seams, ever
    if (this.coverAlpha > 0) {
      c.globalAlpha = this.coverAlpha;
      c.fillStyle = BASE;
      c.fillRect(0, 0, this.w, this.h);
    }

    // streaks
    const R = this.rad;
    const [r0, g0, b0] = this.rgb;
    c.lineCap = 'round';
    for (let i = 0; i < this.count; i++) {
      const q = this.s[i];
      q.r += q.sp * dt * (0.09 + k * 2.4) * (0.25 + q.r * 1.6);
      if (q.r > 1.25) this._seed(q, false);

      const cosA = Math.cos(q.a), sinA = Math.sin(q.a);
      const tail = Math.max(0, q.r - q.len * k * (0.35 + q.r));
      const x1 = this.cx + cosA * tail * R;
      const y1 = this.cy + sinA * tail * R;
      const x2 = this.cx + cosA * q.r * R;
      const y2 = this.cy + sinA * q.r * R;

      const a = Math.min(1, q.r * 3.2) * (0.30 + 0.70 * k);
      if (a <= 0.01) continue;
      const t = q.tint;
      const rr = Math.round(255 - (255 - r0) * t * 0.85);
      const gg = Math.round(255 - (255 - g0) * t * 0.85);
      const bb = Math.round(255 - (255 - b0) * t * 0.85);
      c.globalAlpha = a;
      c.strokeStyle = 'rgb(' + rr + ',' + gg + ',' + bb + ')';
      c.lineWidth = q.w * (0.5 + k * 0.9);
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
    }

    // core bloom at the vanishing point
    if (k > 0.02) {
      const gr = c.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, R * (0.20 + k * 0.55));
      gr.addColorStop(0, 'rgba(255,255,255,' + (0.55 * k).toFixed(3) + ')');
      gr.addColorStop(0.35, 'rgba(' + r0 + ',' + g0 + ',' + b0 + ',' + (0.30 * k).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.globalAlpha = 1;
      c.fillStyle = gr;
      c.fillRect(0, 0, this.w, this.h);
    }

    // the jump itself
    if (this.flash > 0.002) {
      c.globalAlpha = Math.min(1, this.flash) * 0.75;
      c.fillStyle = '#eaf4ff';
      c.fillRect(0, 0, this.w, this.h);
    }

    c.globalAlpha = 1;
    this.raf = requestAnimationFrame(this._tick);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.phase = 'done';
    window.removeEventListener('resize', this._resize);
    // release the shared canvas: an instance that is torn down mid-cover must
    // not leave the screen covered forever
    try {
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } catch (e) {}
    this.canvas.style.display = 'none';
    if (this._onClear) { const f = this._onClear; this._onClear = null; f(); }
    this.s.length = 0;
  }
}

/* --------------------------------------------------------------- handoff */

export function writeLaunch(from, to, tone, accent, azimuth) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      from: from, to: to, tone: tone, accent: accent, azimuth: azimuth, t: Date.now(),
    }));
  } catch (e) {}
}

export function readLaunch(expectedTo) {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    sessionStorage.removeItem(KEY);
    if (Date.now() - d.t > 8000) return null;
    if (expectedTo && d.to !== expectedTo) return null;
    return d;
  } catch (e) { return null; }
}

/** Fires once the document has genuinely finished loading, or at the cap. */
export function whenLoaded(cb, cap) {
  let done = false;
  const fire = () => { if (done) return; done = true; cb(); };
  if (document.readyState === 'complete') setTimeout(fire, 0);
  else window.addEventListener('load', fire, { once: true });
  setTimeout(fire, cap || HOLD_CAP);
}

/** Cover the screen before any internal navigation, so no link in the site
    ever produces a bare document swap. */
export function bindDepartures(canvasEl, fromId) {
  if (!canvasEl) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented) return;
    // planet labels run the 3D launch whenever a hub exists at all
    if (a.closest('#labels') && (window.__dg3dReady || window.__dgHub)) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (a.target === '_blank') return;
    const href = a.getAttribute('href') || '';
    const m = href.match(/^([a-z]+)\.dc\.html$/);
    if (!m) return;
    const to = m[1];
    e.preventDefault();
    const accent = ACCENTS[to] || '#9fd8ff';
    const go = () => {
      writeLaunch(fromId, to, 'warp', accent, loadAzimuth() || 0);
      location.href = href;
    };
    if (reduce) { go(); return; }
    const warp = new Warp(canvasEl, { accent: accent });
    let navigated = false;
    const once = () => { if (navigated) return; navigated = true; go(); };
    setTimeout(once, MAX_COVER);
    warp.cover({ duration: 820, onOpaque: once });
  }, true);
}

export function saveAzimuth(a) {
  try { sessionStorage.setItem('dg-az', String(a)); } catch (e) {}
}
export function loadAzimuth() {
  try {
    const v = parseFloat(sessionStorage.getItem('dg-az'));
    return Number.isFinite(v) ? v : null;
  } catch (e) { return null; }
}
