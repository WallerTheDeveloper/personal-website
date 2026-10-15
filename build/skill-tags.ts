/**
 * Fills the About panel's skills with brand-marked chips under their
 * technology subtitles, at build time.
 *
 * The same renderer as the project tag rows — `chipFor` from
 * `./project-tags`, so the glyph lookup, the path-data check and the text-only
 * fallback are the one implementation — fed from `SKILL_GROUPS` instead of
 * `PROJECT_DETAILS`. Build time for the same reasons: the chips exist in the
 * text edition and in the printed CV, and `simple-icons` never reaches the
 * browser.
 *
 * Checked both ways, like `fillTags`: a slot with no group throws, and a group
 * with no slot throws, so a hand-edited slot fails the build rather than
 * shipping an About panel with no skills on it.
 */

import type { Plugin } from 'vite';

import { SKILL_GROUPS, type SkillCategory, type SkillGroup } from '../src/content';

import { escapeHtml } from './copy-tokens';
import { chipFor } from './project-tags';

/** The empty slot the markup ships, one per skills group. */
const SLOT = /<div class="skills__categories" data-skills="([^"]+)"><\/div>/g;

/**
 * One subtitle and its chips. An `<h4>` because it sits under the group's `<h3>`
 * ("Used in production") under the section's `<h2>`, so a screen reader's
 * heading list reads the same outline a sighted visitor sees.
 */
export function categoryFor({ title, tech }: SkillCategory): string {
  const chips = tech.map((entry) => chipFor(entry, 'skills__tag')).join('');
  return (
    '<div class="skills__category">' +
    `<h4 class="skills__category-title">${escapeHtml(title)}</h4>` +
    `<ul class="skills__tech">${chips}</ul>` +
    '</div>'
  );
}

/**
 * Pure, and takes its table as an argument so it can be tested against groups
 * the owner has not written yet.
 */
export function fillSkills(
  html: string,
  groups: readonly SkillGroup[] = SKILL_GROUPS,
): string {
  const filled = new Set<string>();

  const out = html.replace(SLOT, (_match: string, id: string) => {
    const group = groups.find((entry) => entry.id === id);
    if (group === undefined) {
      throw new Error(
        `[skill-tags] data-skills="${id}" has no entry in SKILL_GROUPS. ` +
          'That table is the single source for the skills.',
      );
    }
    filled.add(id);
    const categories = group.categories.map(categoryFor).join('');
    return `<div class="skills__categories" data-skills="${id}">${categories}</div>`;
  });

  const missing = groups.filter((entry) => !filled.has(entry.id)).map((entry) => entry.id);
  if (missing.length > 0) {
    throw new Error(
      `[skill-tags] no <div class="skills__categories" data-skills="…"></div> slot for ${missing.join(', ')}. ` +
        'The slot must be empty and written exactly that way — this fills it, nothing else does.',
    );
  }
  return out;
}

export function skillTags(): Plugin {
  return {
    name: 'skill-tags',
    transformIndexHtml: {
      order: 'pre',
      handler: (html: string) => fillSkills(html),
    },
  };
}
