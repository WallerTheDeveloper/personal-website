/**
 * The About panel's skills.
 *
 * The chip itself is `chipFor`, pinned in `project-tags.test.ts`. What is
 * pinned here is the shape around it — a subtitle and a chip row per category —
 * and the slot contract: every group has a slot, every slot has a group, and
 * the real table resolves.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { categoryFor, fillSkills } from '../../build/skill-tags';
import { SKILL_GROUPS, type SkillGroup } from '../../src/content';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

const SLOT = '<div class="skills__categories" data-skills="production"></div>';

/** A minimal stand-in, so a table change cannot silently rewrite these cases. */
const table = (tech: SkillGroup['categories'][number]['tech']): readonly SkillGroup[] => [
  { id: 'production', categories: [{ title: 'Test', tech }] },
];

/** A filled group, as `[title, labels[]]` per category in document order. */
const outline = (filled: string, id: string): [string, string[]][] => {
  // From the slot to the end of the Skills section: everything the group wrote.
  const from = filled.indexOf(`data-skills="${id}"`);
  const group = from < 0 ? '' : filled.slice(from, filled.indexOf('</section>', from));
  return Array.from(
    group.matchAll(/<h4 class="skills__category-title">(.*?)<\/h4><ul class="skills__tech">(.*?)<\/ul>/gs),
    (m) => [
      m[1] as string,
      Array.from((m[2] as string).matchAll(/<li class="skills__tag">(.*?)<\/li>/gs), (c) =>
        (c[1] as string).replace(/<svg.*?<\/svg>/s, ''),
      ),
    ],
  );
};

const escaped = (text: string): string => text.replace(/&/g, '&amp;');

describe('fillSkills', () => {
  it('resolves every slug the skills table uses', () => {
    // If the owner adds a skill with a slug that does not exist, this is what
    // says so.
    expect(() => fillSkills(html)).not.toThrow();
  });

  it('writes every category as its subtitle and chips, in table order', () => {
    const filled = fillSkills(html);
    for (const group of SKILL_GROUPS) {
      expect(outline(filled, group.id), group.id).toEqual(
        group.categories.map((c) => [escaped(c.title), c.tech.map((t) => escaped(t.label))]),
      );
    }
  });

  it('leaves no slot unfilled', () => {
    expect(fillSkills(html)).not.toMatch(/data-skills="[^"]+"><\/div>/);
  });

  it('throws on a slot with no entry in the table', () => {
    const orphan = '<div class="skills__categories" data-skills="personal"></div>';
    expect(() => fillSkills(orphan, table([{ label: 'X' }]))).toThrow(/no entry in SKILL_GROUPS/);
  });

  it('throws on an entry with no slot in the markup', () => {
    // A deleted or hand-edited slot would otherwise drop the skills silently.
    expect(() => fillSkills('<p>nothing here</p>', table([{ label: 'X' }]))).toThrow(/no <div/);
  });

  it('throws on a slug simple-icons does not export', () => {
    expect(() => fillSkills(SLOT, table([{ icon: 'nosuchbrand', label: 'Nope' }]))).toThrow(
      /not a simple-icons slug/,
    );
  });
});

describe('categoryFor', () => {
  it('heads the chips with an h4, under the group h3', () => {
    expect(categoryFor({ title: 'Languages', tech: [{ label: 'SQL' }] })).toBe(
      '<div class="skills__category">' +
        '<h4 class="skills__category-title">Languages</h4>' +
        '<ul class="skills__tech"><li class="skills__tag">SQL</li></ul>' +
        '</div>',
    );
  });

  it('draws the mark where the table names one, and text only where it does not', () => {
    const block = categoryFor({
      title: 'T',
      tech: [{ icon: 'python', label: 'Python' }, { label: 'GLSL' }],
    });
    expect(block).toContain(
      '<li class="skills__tag"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><use href="#si-python"/></svg>Python</li>',
    );
    expect(block).toContain('<li class="skills__tag">GLSL</li>');
  });

  it('escapes the subtitle', () => {
    // "XR, 3D & graphics" is a real one.
    expect(categoryFor({ title: 'XR, 3D & graphics', tech: [{ label: 'X' }] })).toContain(
      '>XR, 3D &amp; graphics</h4>',
    );
  });
});
