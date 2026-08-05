/**
 * ACCEPTANCE.md group A — visual fidelity, at 1440 / 1024 / 768 / 390.
 *
 * **Not screenshot comparison, deliberately.** ACCEPTANCE sketches this file as
 * golden images, and three properties of this project make that the weaker test
 * here:
 *
 *   1. The hub is a live WebGL scene on a software rasteriser, with a camera
 *      that sways forever and a grain layer animating in four steps a second.
 *      There is no still frame to golden.
 *   2. The type comes from the Google Fonts CDN. A baseline captured with the
 *      fonts warm fails on a cold cache or offline, so the suite would depend on
 *      the network to say anything at all.
 *   3. Every value below was *measured* against the served prototype in Phase 3
 *      — a pixel diff at these four widths plus a computed-style parity walk
 *      over 314 nodes × 3 states. A screenshot re-asserts that comparison
 *      against this machine's rasteriser; these assertions re-assert it against
 *      the numbers themselves, and say which one moved when they fail.
 *
 * So the numbers here are transcribed from the prototype, and duplicating them
 * is the mechanism, not an oversight: an edit to `styles.css` that moves one is
 * exactly what this file exists to catch.
 *
 * Nothing here boots the hub. The panels' presentation is CSS; the router's only
 * contribution to it is the `visibility`/`opacity` pair `commit()` writes, which
 * these tests write themselves and which `routing.spec.ts` and `print.spec.ts`
 * already prove the router writes. Standing the entry module down instead buys a
 * page that holds still and costs no GPU — see the harness note in TASKS.md
 * Phase 9.
 */

import { expect, test, type Page } from '@playwright/test';

import { WIDTHS } from '../../playwright.config';
import { blockWebGL, PANELS, type Panel } from './helpers';

/** Portrait for the phone widths, landscape for the rest. */
const HEIGHTS: Readonly<Record<number, number>> = {
  1440: 900,
  1024: 768,
  768: 900,
  390: 844,
  375: 667,
};

/**
 * `--type-scale` in `styles.css`.
 *
 * Every font-size in the site is authored at the value measured off the
 * prototype and multiplied by this one token, so the numbers below stay the
 * measured ones and the scale is stated once, here. That is the whole reason it
 * is a token: the prototype in `design/` remains the thing these were taken
 * from, and it is still legible against this file.
 *
 * Type only. The hero's `44vh`, the column measures and every padding clamp are
 * *not* scaled — the parked-planet solve in `hub.ts` is hand-tuned against them
 * — and the assertions further down that pin those unscaled are what prove the
 * scope held.
 */
const TYPE_SCALE = 1.5;

/**
 * …and what it becomes on a phone.
 *
 * The desktop 1.5 is what turns several layouts from tight into broken at 375px
 * — a 138px label column against 183px of room, four ~280px planet labels on a
 * 375px canvas. Since the token multiplies type and *only* type, dropping it is
 * one rule that fixes all of them at once, and the unscaled assertions below
 * (the 44vh hero, the column measures, the padding clamps) are what prove the
 * scope of that rule held: the parked-planet solve in `hub.ts` is tuned against
 * those, and none of them may move.
 *
 * 640px, matching the width at which the hub foot already wraps to two rows.
 */
const PHONE_TYPE_SCALE = 1.18;
const PHONE_MAX_WIDTH = 640;

const scaleAt = (width: number): number =>
  width <= PHONE_MAX_WIDTH ? PHONE_TYPE_SCALE : TYPE_SCALE;

/** A prototype font-size, as the browser reports it once scaled. */
const size = (base: number): string => `${base * TYPE_SCALE}px`;

/**
 * A prototype letter-spacing, resolved. It is authored in `em`, so it follows
 * the font-size on its own — which is the point, and what this re-checks.
 * Rounded because `0.14 × 16.5` is not exact in binary and Chromium's
 * serialisation and JavaScript's do not have to agree on the tail.
 */
const track = (em: number, base: number): number =>
  Math.round(em * base * TYPE_SCALE * 1000) / 1000;

/**
 * The routed document, with the scene stood down.
 *
 * The head probe still runs — it is inline and blocking — so `<html>` carries
 * `data-dg-3d` and every panel is laid out as the fixed overlay it is at
 * runtime. Only `main.ts` is replaced, so no router mounts, no engine loads,
 * and nothing repaints while a measurement is being taken.
 */
async function openStill(page: Page, width: number): Promise<void> {
  await page.route('**/src/main.ts*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-dg-3d', '1');
  // The measurements below are all type metrics, so wait for the faces the
  // stylesheet asks for rather than measuring against the fallback stack.
  await page.evaluate(() => document.fonts.ready);
}

/** Reveal one panel exactly as `commit()` does — inline visibility and opacity. */
async function reveal(page: Page, id: Panel): Promise<void> {
  await page.evaluate((panel) => {
    const el = document.querySelector<HTMLElement>(`[data-panel="${panel}"]`);
    if (el === null) throw new Error(`no panel "${panel}"`);
    el.style.visibility = 'visible';
    el.style.opacity = '1';
  }, id);
}

/** The text edition: WebGL blocked, so the document stays in the state it ships in. */
async function openTextEdition(page: Page, width: number): Promise<void> {
  await blockWebGL(page);
  await page.setViewportSize({ width, height: HEIGHTS[width] ?? 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-dg-flat', '1');
  await page.evaluate(() => document.fonts.ready);
}

/** Every computed value this file compares, in one round trip. */
async function typeOf(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      family: s.fontFamily.split(',')[0]?.replace(/["']/g, '') ?? '',
      size: s.fontSize,
      weight: s.fontWeight,
      spacing: Math.round(parseFloat(s.letterSpacing) * 1000) / 1000,
      transform: s.textTransform,
      colour: s.color,
    };
  });
}

test.describe('the hub chrome', () => {
  test('header, foot and HUD hint carry the prototype’s type and colour', async ({ page }) => {
    await openStill(page, 1440);

    // Bodoni for the display line, always weight 400 (CLAUDE.md "Styling").
    expect(await typeOf(page, '.hub-head__name')).toEqual({
      family: 'Bodoni Moda',
      size: size(32), // clamp(22px, 2.4vw, 32px), capped at 1440
      weight: '400',
      spacing: track(0.005, 32),
      transform: 'none',
      colour: 'rgb(242, 240, 248)', // --ink-hub
    });

    // Mono, uppercase, for every piece of chrome.
    expect(await typeOf(page, '.hub-head__role')).toEqual({
      family: 'IBM Plex Mono',
      size: size(12),
      weight: '400',
      spacing: track(0.09, 12),
      transform: 'uppercase',
      colour: 'rgb(146, 148, 171)', // --chrome
    });
    expect(await typeOf(page, '#skip-scene')).toEqual({
      family: 'IBM Plex Mono',
      size: size(11),
      weight: '400',
      spacing: track(0.14, 11),
      transform: 'uppercase',
      colour: 'rgb(131, 133, 156)', // --muted
    });
    expect(await typeOf(page, '#hud-hint')).toEqual({
      family: 'IBM Plex Mono',
      size: size(10),
      weight: '400',
      spacing: track(0.16, 10),
      transform: 'uppercase',
      colour: 'rgb(138, 140, 163)', // --dim, the dimmest text the palette allows
    });
  });

  test('each label is numbered in its own accent and named in Bodoni', async ({ page }) => {
    await openStill(page, 1440);

    // The accents, in DOM order. Positions are the engine's, per frame; what is
    // CSS — and what would silently go wrong in a rewrite — is which accent each
    // label resolves through its own `data-planet`.
    const accents = ['rgb(63, 216, 255)', 'rgb(56, 255, 176)', 'rgb(178, 107, 255)', 'rgb(255, 155, 61)'];
    for (const [i, id] of PANELS.entries()) {
      expect(await typeOf(page, `#lbl-${id} .label__index`), id).toEqual({
        family: 'IBM Plex Mono',
        size: size(11),
        weight: '400',
        spacing: track(0.22, 11),
        transform: 'uppercase',
        colour: accents[i]!,
      });
      expect(await typeOf(page, `#lbl-${id} .label__name`), id).toEqual({
        family: 'Bodoni Moda',
        size: size(20),
        weight: '400',
        spacing: track(0.01, 20),
        transform: 'none',
        colour: 'rgb(236, 234, 244)', // --ink-label, the resting tint
      });
    }
  });

  test('the vignette and the grain are the prototype’s, exactly', async ({ page }) => {
    await openStill(page, 1440);

    const vignette = await page.locator('.vignette').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(vignette).toBe(
      'radial-gradient(120% 85% at 50% 42%, rgba(0, 0, 0, 0) 42%, rgba(3, 4, 10, 0.55) 78%, rgba(2, 3, 8, 0.92) 100%)',
    );

    const grain = await page.locator('[data-grain]').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        opacity: s.opacity,
        blend: s.mixBlendMode,
        name: s.animationName,
        duration: s.animationDuration,
        timing: s.animationTimingFunction,
        iteration: s.animationIterationCount,
      };
    });
    expect(grain).toEqual({
      opacity: '0.16',
      blend: 'overlay',
      name: 'grainShift',
      duration: '1.1s',
      timing: 'steps(4)',
      iteration: 'infinite',
    });
  });
});

test.describe('the panels', () => {
  for (const width of WIDTHS) {
    test(`the shell holds its measure at ${width}px`, async ({ page }) => {
      await openStill(page, width);
      await reveal(page, 'xr');

      const height = HEIGHTS[width] ?? 900;
      const shell = await page.locator('[data-panel="xr"]').evaluate((el) => {
        const hero = el.querySelector<HTMLElement>('[data-hero]')!;
        const col = el.querySelector<HTMLElement>('.col')!;
        const heroStyle = getComputedStyle(hero);
        const colStyle = getComputedStyle(col);
        return {
          heroHeight: hero.getBoundingClientRect().height,
          heroBackground: heroStyle.backgroundColor,
          heroPointer: heroStyle.pointerEvents,
          panelBackground: getComputedStyle(el).backgroundColor,
          colWidth: col.getBoundingClientRect().width,
          colPadding: colStyle.paddingLeft,
          topPadding: getComputedStyle(el.querySelector<HTMLElement>('[data-panel-top]')!).paddingLeft,
        };
      });

      // The hero is genuinely a hole in the panel, not a gradient standing in
      // for one: the parked planet is what shows through the top 44 vh.
      expect(shell.heroHeight).toBeCloseTo(Math.max(220, height * 0.44), 0);
      expect(shell.heroBackground).toBe('rgba(0, 0, 0, 0)');
      expect(shell.heroPointer).toBe('none');
      expect(shell.panelBackground).toBe('rgba(0, 0, 0, 0)');

      // clamp(20px, 5vw, 40px) either side of a 720px measure, and the sticky
      // bar's clamp(18px, 4vw, 44px). Compared as numbers: Chromium serialises
      // a resolved `vw` to its own rounding, which is not the arithmetic here.
      expect(parseFloat(shell.colPadding)).toBeCloseTo(Math.min(40, Math.max(20, width * 0.05)), 1);
      expect(shell.colWidth).toBeCloseTo(Math.min(720, width), 0);
      expect(parseFloat(shell.topPadding)).toBeCloseTo(Math.min(44, Math.max(18, width * 0.04)), 1);
    });
  }

  test('every panel takes its own accent, and its cards the same hairline', async ({ page }) => {
    await openStill(page, 1440);

    const accents: Readonly<Record<Panel, string>> = {
      backend: 'rgb(63, 216, 255)',
      projects: 'rgb(56, 255, 176)',
      xr: 'rgb(178, 107, 255)',
      about: 'rgb(255, 155, 61)',
    };

    for (const id of PANELS) {
      await reveal(page, id);
      // Resolved from the panel's own `[data-panel]` rule — one rule set for all
      // four, never four copies (PORT_PLAN step 3).
      const marker = page.locator(`[data-panel="${id}"] .panel__hero-label`);
      await expect(marker, id).toHaveCSS('color', accents[id]);

      const card = page.locator(`[data-panel="${id}"] .card`).first();
      if ((await card.count()) === 0) continue;
      // --void-2 on --rule-card, the same everywhere: depth comes from the
      // scene and the hairlines, never from a shadow.
      await expect(card, id).toHaveCSS('background-color', 'rgb(8, 10, 19)');
      await expect(card, id).toHaveCSS('border-top-color', 'rgba(255, 255, 255, 0.08)');
    }
  });

  test('the panel title is Bodoni 400 on the README scale', async ({ page }) => {
    await openStill(page, 1440);
    await reveal(page, 'backend');

    expect(await typeOf(page, '[data-panel="backend"] h1')).toEqual({
      family: 'Bodoni Moda',
      size: size(62), // clamp(38px, 6vw, 62px), capped at 1440
      weight: '400',
      spacing: track(-0.012, 62),
      transform: 'none',
      colour: 'rgb(244, 242, 250)', // --ink
    });
  });

  test('links warm to the one hover colour', async ({ page }) => {
    await openStill(page, 1440);
    await reveal(page, 'backend');

    // The global `a:hover` (PORT_PLAN step 3). The planet labels' hover is the
    // engine's and is asserted in `keyboard.spec.ts`, where focus takes the same
    // path; this is the rule every other link in the document goes through.
    const link = page.locator('[data-panel="backend"] [data-elsewhere] a').first();
    const rest = await link.evaluate((el) => getComputedStyle(el).color);
    await link.hover();
    await expect(link).toHaveCSS('color', 'rgb(255, 184, 119)'); // --hover
    expect(rest).not.toBe('rgb(255, 184, 119)');
  });
});

test.describe('the text edition', () => {
  for (const width of WIDTHS) {
    test(`holds its 1080px measure and hairline grid at ${width}px`, async ({ page }) => {
      await openTextEdition(page, width);

      const te = await page.locator('#fallback').evaluate((el) => {
        const col = el.querySelector<HTMLElement>('.te__col')!;
        const grid = el.querySelector<HTMLElement>('.te__grid')!;
        const gridStyle = getComputedStyle(grid);
        return {
          colWidth: col.getBoundingClientRect().width,
          heading: getComputedStyle(el.querySelector<HTMLElement>('.te__name')!).fontSize,
          gap: gridStyle.gap,
          gridBackground: gridStyle.backgroundColor,
          cardBackground: getComputedStyle(el.querySelector<HTMLElement>('.te__card')!).backgroundColor,
        };
      });

      // clamp(20px, 6vw, 96px) of page padding either side of a 1080px column.
      const pad = Math.min(96, Math.max(20, width * 0.06));
      expect(te.colWidth).toBeCloseTo(Math.min(1080, width - pad * 2), 0);
      // clamp(38px, 7vw, 84px), every leg through --type-scale — which is the
      // phone value below 640px, and is the only thing that changes there.
      expect(parseFloat(te.heading)).toBeCloseTo(
        Math.min(84, Math.max(38, width * 0.07)) * scaleAt(width),
        1,
      );
      // The hairlines *are* the 1px gap: the grid's background shows through
      // between cards. Nothing here draws a border per card. Chromium collapses
      // an equal row/column gap to one value.
      expect(te.gap).toBe('1px');
      expect(te.gridBackground).toBe('rgba(255, 255, 255, 0.07)');
      expect(te.cardBackground).toBe('rgb(7, 9, 18)');
    });
  }
});

test.describe('house rules, over the whole document', () => {
  /**
   * Every element the document renders, in both editions.
   *
   * From `<body>` down: `<html>` carries no font of its own — the stylesheet
   * sets the family on `body` — so it computes to the browser's default serif
   * and would report a family the site never draws with.
   */
  const sweep = async (page: Page) =>
    page.evaluate(() => {
      const families = new Set<string>();
      const radii: string[] = [];
      const shadows: string[] = [];
      const heavyDisplay: string[] = [];
      const name = (el: Element): string =>
        `${el.tagName.toLowerCase()}${el.id === '' ? '' : `#${el.id}`}${el.className === '' ? '' : `.${String(el.className).split(' ')[0]}`}`;

      for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
        const s = getComputedStyle(el);
        if (s.display === 'none') continue;
        const first = (s.fontFamily.split(',')[0] ?? '').replace(/["']/g, '');
        if (first !== '') families.add(first);
        if (first === 'Bodoni Moda' && s.fontWeight !== '400') heavyDisplay.push(`${name(el)} @ ${s.fontWeight}`);

        const radius = new Set([s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius]);
        if (!(radius.size === 1 && radius.has('0px'))) radii.push(`${name(el)} → ${s.borderRadius}`);
        if (s.boxShadow !== 'none' || s.textShadow !== 'none') {
          shadows.push(`${name(el)} → ${s.boxShadow} / ${s.textShadow}`);
        }
      }
      return { families: [...families].sort(), radii, shadows, heavyDisplay };
    });

  test('three families, Bodoni always 400, radii 0 but for the two, no shadows anywhere — routed', async ({ page }) => {
    await openStill(page, 1440);
    for (const id of PANELS) await reveal(page, id);
    // A project detail is `display: none` until it opens, and the sweep skips
    // exactly those — so without this the dialog would be the one part of the
    // site the house rules never reach. Set directly rather than routed: this
    // test is about what the stylesheet draws, not about how it got there.
    await page.evaluate(() => document.querySelector('[id="projects/p1"]')?.classList.add('is-open'));
    const seen = await sweep(page);

    expect(seen.families).toEqual(['Archivo', 'Bodoni Moda', 'IBM Plex Mono']);
    expect(seen.heavyDisplay).toEqual([]);
    // The only two radii in the site: the 2px fps chip and the circular
    // reticle. Anything else is a rule being relaxed.
    expect(seen.radii).toEqual(['div#fps.fps → 2px', 'div#reticle.reticle → 50%']);
    // "No shadows anywhere" is the load-bearing half of the look — depth comes
    // from the scene, the gradients and the hairlines.
    expect(seen.shadows).toEqual([]);
  });

  test('the same rules hold in the text edition', async ({ page }) => {
    await openTextEdition(page, 1440);
    const seen = await sweep(page);

    expect(seen.families).toEqual(['Archivo', 'Bodoni Moda', 'IBM Plex Mono']);
    expect(seen.heavyDisplay).toEqual([]);
    expect(seen.radii).toEqual(['div#fps.fps → 2px', 'div#reticle.reticle → 50%']);
    expect(seen.shadows).toEqual([]);
  });
});
