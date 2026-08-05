import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CONTENT,
  PANEL_IDS,
  PROJECT_DETAILS,
  PROJECT_DETAIL_IDS,
  PROJECT_LINKS,
  TITLES,
  isPanelId,
  type TokenName,
} from '../../src/content';
import { BASE_TITLE, titleFor } from '../../src/head';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** Every `{{TOKEN}}` written in the markup, deduplicated. */
const markupTokens = new Set(
  Array.from(html.matchAll(/\{\{([A-Z0-9_]+)\}\}/g), (match) => match[1] as string),
);

/**
 * Tokens that cannot appear as markup text — they live in attributes or in
 * structured data and are applied on mount by head.ts. See README "Copy tokens".
 */
const ATTRIBUTE_ONLY_TOKENS: readonly TokenName[] = [
  'PROJECT_1_REPO_URL',
  'PROJECT_1_DEMO_URL',
  'PROJECT_2_REPO_URL',
  'PROJECT_2_DEMO_URL',
  'PROJECT_3_REPO_URL',
  'PROJECT_3_DEMO_URL',
  'PROJECT_4_REPO_URL',
  'PROJECT_4_DEMO_URL',
];

describe('content table', () => {
  it('covers every token written in the markup', () => {
    const keys = new Set<string>(Object.keys(CONTENT));
    const uncovered = [...markupTokens].filter((token) => !keys.has(token)).sort();
    expect(uncovered).toEqual([]);
  });

  it('has no token the markup and head.ts both ignore', () => {
    const applied = new Set<string>(ATTRIBUTE_ONLY_TOKENS);
    const unused = Object.keys(CONTENT)
      .filter((token) => !markupTokens.has(token) && !applied.has(token))
      .sort();
    expect(unused).toEqual([]);
  });

  it('leaves an unfilled value as its own literal token', () => {
    // The owner fills these in code, panel by panel, so the table is part real
    // copy and part placeholder for as long as that takes. A value still in
    // placeholder form must be the exact `{{TOKEN}}` the markup shows, so the
    // unfilled half of the site reads identically whether or not this module
    // has run — and so a block copy-pasted from its neighbour that kept the
    // neighbour's placeholder (`BACKEND_BLOCK_2_ORG: '{{BACKEND_BLOCK_1_ORG}}'`)
    // fails here instead of rendering one entry twice.
    const mismatched = Object.entries(CONTENT).filter(
      ([key, value]) => /^\{\{[A-Z0-9_]+\}\}$/.test(value) && value !== `{{${key}}}`,
    );
    expect(mismatched).toEqual([]);
  });

  it('never half-fills a value', () => {
    // `fillTokens` substitutes in one pass: a token left inside otherwise real
    // copy ("Berlin, {{LOCATION}}") is not looked at again, so it reaches the
    // served HTML as visible braces. Filled means filled.
    const halfFilled = Object.entries(CONTENT).filter(
      ([key, value]) => value !== `{{${key}}}` && /\{\{[A-Z0-9_]+\}\}/.test(value),
    );
    expect(halfFilled).toEqual([]);
  });
});

describe('project links', () => {
  it('matches the [data-repo] / [data-demo] slots in the markup', () => {
    const slots = (attribute: string): number[] =>
      Array.from(html.matchAll(new RegExp(`data-${attribute}="(\\d+)"`, 'g')), (m) =>
        Number(m[1]),
      ).sort();

    const numbers = PROJECT_LINKS.map((project) => project.n);
    expect(slots('repo')).toEqual(numbers);
    expect(slots('demo')).toEqual(numbers);
  });
});

describe('project details', () => {
  it('has one entry per detail id, in DOM order, with tags on each', () => {
    expect(PROJECT_DETAILS.map((d) => d.id)).toEqual([...PROJECT_DETAIL_IDS]);
    expect(PROJECT_DETAILS.map((d) => d.n)).toEqual(PROJECT_LINKS.map((p) => p.n));
    for (const entry of PROJECT_DETAILS) {
      expect(entry.tech.length, `${entry.id} has no tags`).toBeGreaterThan(0);
    }
  });

  it('carries simple-icons slugs, never a path or a title', () => {
    // The glyphs live in the library now, and `build/project-tags.ts` resolves
    // them — including throwing on a slug that does not exist, which is the real
    // coverage check and lives in `project-tags.test.ts`. This only pins the
    // shape: lower-case, punctuation-free, the form simple-icons.org publishes.
    for (const entry of PROJECT_DETAILS) {
      for (const { icon, label } of entry.tech) {
        if (icon === undefined) continue;
        expect(icon, `${entry.id} / ${label}`).toMatch(/^[a-z0-9]+$/);
      }
    }
  });

  it('names a technology on every tag', () => {
    for (const entry of PROJECT_DETAILS) {
      for (const tech of entry.tech) {
        expect(tech.label.trim(), `${entry.id}`).not.toBe('');
      }
    }
  });
});

describe('panel ids', () => {
  it('matches the [data-panel] sections, in DOM order', () => {
    const inMarkup = Array.from(html.matchAll(/data-panel="([a-z]+)"/g), (m) => m[1]);
    expect(inMarkup).toEqual([...PANEL_IDS]);
  });

  it('accepts only the four destinations', () => {
    expect(PANEL_IDS.every(isPanelId)).toBe(true);
    expect(isPanelId('hub')).toBe(false);
    expect(isPanelId('')).toBe(false);
  });
});

describe('titleFor', () => {
  it('uses the base title on the hub', () => {
    expect(titleFor(null)).toBe(BASE_TITLE);
    expect(BASE_TITLE).toBe(`${CONTENT.FULL_NAME} — ${CONTENT.ROLE_TAGLINE}`);
  });

  it('is "<Panel> — <name>" on a destination', () => {
    for (const id of PANEL_IDS) {
      expect(titleFor(id)).toBe(`${TITLES[id]} — ${CONTENT.FULL_NAME}`);
    }
  });

  it('never claims a seniority level', () => {
    // README "Content rules" 5. Guards the title, which is the one string that
    // gets rewritten at runtime and so is easiest to embellish by accident.
    const forbidden = /\b(senior|junior|lead|principal|staff|head of|chief)\b/i;
    for (const id of [...PANEL_IDS, null]) {
      expect(titleFor(id)).not.toMatch(forbidden);
    }
  });
});
