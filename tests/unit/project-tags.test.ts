/**
 * The build-time tag renderer.
 *
 * Two things are worth failing fast on here: a slug `simple-icons` does not
 * carry (which would otherwise ship as an empty chip), and a mark leaking into
 * the document as anything other than path data. Both are build errors by
 * design — this is where that is pinned.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { chipFor, fillTags } from '../../build/project-tags';
import { PROJECT_DETAILS, type ProjectDetail } from '../../src/content';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** A minimal stand-in, so a table change cannot silently rewrite these cases. */
const table = (tech: ProjectDetail['tech']): readonly ProjectDetail[] => [
  { id: 'p1', n: 1, title: 'Test', tech },
];

describe('chipFor', () => {
  it('draws a brand mark for a slug the set carries', () => {
    const chip = chipFor({ icon: 'python', label: 'Python' });
    expect(chip).toContain('<li class="project__tag">');
    expect(chip).toContain('viewBox="0 0 24 24"');
    expect(chip).toContain('fill="currentColor"');
    expect(chip).toContain('aria-hidden="true"');
    expect(chip).toContain('focusable="false"');
    expect(chip).toMatch(/<\/svg>Python<\/li>$/);
  });

  it('renders a text-only chip where the brand has no mark', () => {
    // C#, OpenXR, GLSL and Protocol Buffers are all in this state. Text only is
    // the designed answer; a hand-drawn substitute is what this replaced.
    const chip = chipFor({ label: 'OpenXR' });
    expect(chip).toBe('<li class="project__tag">OpenXR</li>');
    expect(chip).not.toContain('<svg');
  });

  it('escapes the label', () => {
    expect(chipFor({ label: 'A & B' })).toContain('A &amp; B');
    expect(chipFor({ label: '<script>' })).not.toContain('<script>');
  });

  it('throws on a slug simple-icons does not export', () => {
    // The whole reason the glyphs moved to a library: a typo has to be a build
    // failure, not a chip that quietly lost its mark.
    expect(() => chipFor({ icon: 'nosuchbrand', label: 'Nope' })).toThrow(/not a simple-icons slug/);
  });

  it('never carries fill-rule', () => {
    // simple-icons paths are authored for the default `nonzero`. Forcing
    // `evenodd` — which the hand-drawn outlines needed — punches holes in every
    // mark that has a counter.
    expect(chipFor({ icon: 'postgresql', label: 'PostgreSQL' })).not.toContain('fill-rule');
  });
});

describe('fillTags', () => {
  it('resolves every slug the content table uses', () => {
    // The real assertion for the real data: if the owner adds a tag with a slug
    // that does not exist, this is what says so.
    expect(() => fillTags(html)).not.toThrow();
  });

  it('fills every slot in the markup', () => {
    const filled = fillTags(html);
    for (const entry of PROJECT_DETAILS) {
      const slot = new RegExp(`<ul class="project__tech" data-tech="${entry.id}">(.*?)</ul>`, 's');
      const row = slot.exec(filled)?.[1] ?? '';
      expect(row, entry.id).not.toBe('');
      expect((row.match(/<li class="project__tag">/g) ?? []).length, entry.id).toBe(
        entry.tech.length,
      );
      for (const tech of entry.tech) {
        expect(row, `${entry.id} is missing ${tech.label}`).toContain(tech.label.replace('&', '&amp;'));
      }
    }
  });

  it('leaves no slot unfilled', () => {
    expect(fillTags(html)).not.toContain('data-tech="p1"></ul>');
  });

  it('throws on a slot with no entry in the table', () => {
    const orphan = '<ul class="project__tech" data-tech="p9"></ul>';
    expect(() => fillTags(orphan, table([{ label: 'X' }]))).toThrow(/no entry in PROJECT_DETAILS/);
  });

  it('throws on an entry with no slot in the markup', () => {
    // A deleted or hand-edited slot would otherwise drop a whole row silently.
    expect(() => fillTags('<p>nothing here</p>', table([{ label: 'X' }]))).toThrow(/no <ul/);
  });

  it('writes path data and nothing else into the d attribute', () => {
    const ds = Array.from(fillTags(html).matchAll(/ d="([^"]*)"/g), (m) => m[1] as string);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d).toMatch(/^[Mm][\d\s.,\-A-Za-z]+$/);
      expect(d).not.toContain('<');
    }
  });
});
