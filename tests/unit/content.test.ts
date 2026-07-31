import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { CONTENT, PANEL_IDS, PROJECT_LINKS, TITLES, isPanelId, type TokenName } from '../../src/content';
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

  it('defaults every value to its own literal token', () => {
    // The owner fills these in code. Until then the table must render exactly
    // what the markup already shows, so an unfilled site reads identically
    // whether or not this module has run.
    const wrong = Object.entries(CONTENT).filter(([key, value]) => value !== `{{${key}}}`);
    expect(wrong).toEqual([]);
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
