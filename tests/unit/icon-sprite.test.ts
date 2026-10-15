/**
 * The inline sprite every chip's `<use>` points into.
 *
 * Pinned here: each mark used is written exactly once, every reference
 * resolves, nothing unused ships, and what goes into `d` is path data and
 * nothing else — the one unescaped interpolation in the document.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fillSprite, markFor } from '../../build/icon-sprite';
import { fillTags } from '../../build/project-tags';
import { fillSkills } from '../../build/skill-tags';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** The document as the build hands it to the sprite: both tag rows filled. */
const served = fillSprite(fillSkills(fillTags(html)));

const used = (doc: string): string[] =>
  Array.from(doc.matchAll(/<use href="#(si-[a-z0-9]+)"\/>/g), (m) => m[1] as string);
const symbols = (doc: string): string[] =>
  Array.from(doc.matchAll(/<symbol id="(si-[a-z0-9]+)"/g), (m) => m[1] as string);

describe('fillSprite', () => {
  it('writes one symbol per mark the document uses — no more, no fewer', () => {
    expect(used(served).length).toBeGreaterThan(0);
    expect(symbols(served)).toEqual([...new Set(used(served))]);
  });

  it('writes a shared mark once, however many chips draw it', () => {
    // Python is on a project card and in the skills: two uses, one symbol.
    expect(used(served).filter((id) => id === 'si-python').length).toBeGreaterThan(1);
    expect(symbols(served).filter((id) => id === 'si-python')).toHaveLength(1);
  });

  it('puts the sprite straight after <body>, once', () => {
    expect(served).toMatch(/<body>\n<svg class="icon-sprite" aria-hidden="true" focusable="false"><symbol /);
    expect(served.match(/class="icon-sprite"/g)).toHaveLength(1);
  });

  it('leaves a document with no marks alone', () => {
    expect(fillSprite('<body><p>nothing</p></body>')).toBe('<body><p>nothing</p></body>');
  });

  it('throws when there is nowhere to put the sprite', () => {
    expect(() => fillSprite('<body class="x"><use href="#si-rust"/></body>')).toThrow(/no bare <body>/);
  });

  it('fills in currentColor so each chip tints its own copy', () => {
    const symbol = /<symbol id="si-rust"[^>]*>(.*?)<\/symbol>/.exec(served)?.[1] ?? '';
    expect(symbol).toMatch(/^<path fill="currentColor" d="M/);
  });

  it('never carries fill-rule', () => {
    // simple-icons paths are authored for the default `nonzero`. Forcing
    // `evenodd` — which the hand-drawn outlines needed — punches holes in every
    // mark that has a counter.
    expect(served).not.toContain('fill-rule');
  });

  it('writes path data and nothing else into the d attribute', () => {
    const sprite = /<svg class="icon-sprite"[^>]*>(.*?)<\/svg>/s.exec(served)?.[1] ?? '';
    const ds = Array.from(sprite.matchAll(/ d="([^"]*)"/g), (m) => m[1] as string);
    expect(ds.length).toBe(symbols(served).length);
    for (const d of ds) {
      expect(d).toMatch(/^[Mm][\d\s.,\-A-Za-z]+$/);
      expect(d).not.toContain('<');
    }
  });
});

describe('markFor', () => {
  it('throws on a slug simple-icons does not export, naming the label', () => {
    expect(() => markFor('nosuchbrand', 'Nope')).toThrow(/"nosuchbrand" \(tagged "Nope"\) is not a simple-icons slug/);
  });
});
