/**
 * Every copy token in the site, in one typed table.
 *
 * The owner fills these in code. Until they do, each value is the literal
 * `{{TOKEN}}` string it replaces — that is deliberate, not a placeholder bug:
 * the markup renders the same tokens, so an unfilled site reads identically
 * whether or not this module has run. Never invent copy, never "improve" a
 * token, never delete one (README "Copy tokens", CLAUDE.md "Copy").
 *
 * Most tokens live in the markup as text. The ones collected here that markup
 * *cannot* hold — `<title>` is RCDATA, and attributes/structured data are not
 * text nodes — are applied on mount by `head.ts`:
 *
 *   - the document title, description and OG tags
 *   - the `Person` JSON-LD
 *   - `PROJECT_n_REPO_URL` / `PROJECT_n_DEMO_URL` onto `[data-repo]`/`[data-demo]`
 *   - `EMAIL` / `GITHUB_URL` / `LINKEDIN_URL` onto the three contact anchors
 *
 * `tests/unit/content.test.ts` asserts this table and `index.html` agree, so a
 * token added to one and not the other fails the build rather than shipping
 * half-filled.
 */

/** The four destinations, in DOM order. `null` elsewhere means "the hub". */
export const PANEL_IDS = ['backend', 'projects', 'xr', 'about'] as const;

export type PanelId = (typeof PANEL_IDS)[number];

export function isPanelId(value: string): value is PanelId {
  return (PANEL_IDS as readonly string[]).includes(value);
}

/**
 * Panel titles. Literal copy, not tokens — they are the destination names, and
 * they appear verbatim in the markup (labels, "Elsewhere" lists, panel `<h1>`s).
 * Carried over from the prototype's `TITLES` map unchanged.
 */
export const TITLES: Readonly<Record<PanelId, string>> = {
  backend: 'Backend & Platform',
  projects: 'Independent Projects',
  xr: 'XR / AR',
  about: 'About & Contact',
};

/** Must stay in step with `<link rel="canonical">` in `index.html`. */
export const SITE_URL = 'https://golosov-danylo.com/';

export const CONTENT = {
  // ---------------------------------------------------------- hub / global
  FULL_NAME: '{{FULL_NAME}}',
  ROLE_TAGLINE: '{{ROLE_TAGLINE}}',
  LOCATION: '{{LOCATION}}',
  META_DESCRIPTION: '{{META_DESCRIPTION}}',

  // ----------------------------------------------------------------- backend
  // Neutral, non-employment blocks. If one becomes employment it moves to the
  // XR employment treatment — the Backend blocks are never restyled
  // (README "Content rules" 3).
  BACKEND_INTRO: '{{BACKEND_INTRO}}',

  BACKEND_BLOCK_1_ORG: '{{BACKEND_BLOCK_1_ORG}}',
  BACKEND_BLOCK_1_TITLE: '{{BACKEND_BLOCK_1_TITLE}}',
  BACKEND_BLOCK_1_DATES: '{{BACKEND_BLOCK_1_DATES}}',
  BACKEND_BLOCK_1_LOCATION: '{{BACKEND_BLOCK_1_LOCATION}}',
  BACKEND_BLOCK_1_SUMMARY: '{{BACKEND_BLOCK_1_SUMMARY}}',
  BACKEND_BLOCK_1_POINT_1: '{{BACKEND_BLOCK_1_POINT_1}}',
  BACKEND_BLOCK_1_POINT_2: '{{BACKEND_BLOCK_1_POINT_2}}',
  BACKEND_BLOCK_1_POINT_3: '{{BACKEND_BLOCK_1_POINT_3}}',
  BACKEND_BLOCK_1_STACK: '{{BACKEND_BLOCK_1_STACK}}',

  BACKEND_BLOCK_2_ORG: '{{BACKEND_BLOCK_2_ORG}}',
  BACKEND_BLOCK_2_TITLE: '{{BACKEND_BLOCK_2_TITLE}}',
  BACKEND_BLOCK_2_DATES: '{{BACKEND_BLOCK_2_DATES}}',
  BACKEND_BLOCK_2_LOCATION: '{{BACKEND_BLOCK_2_LOCATION}}',
  BACKEND_BLOCK_2_SUMMARY: '{{BACKEND_BLOCK_2_SUMMARY}}',
  BACKEND_BLOCK_2_POINT_1: '{{BACKEND_BLOCK_2_POINT_1}}',
  BACKEND_BLOCK_2_POINT_2: '{{BACKEND_BLOCK_2_POINT_2}}',
  BACKEND_BLOCK_2_POINT_3: '{{BACKEND_BLOCK_2_POINT_3}}',
  BACKEND_BLOCK_2_STACK: '{{BACKEND_BLOCK_2_STACK}}',

  BACKEND_BLOCK_3_ORG: '{{BACKEND_BLOCK_3_ORG}}',
  BACKEND_BLOCK_3_TITLE: '{{BACKEND_BLOCK_3_TITLE}}',
  BACKEND_BLOCK_3_DATES: '{{BACKEND_BLOCK_3_DATES}}',
  BACKEND_BLOCK_3_LOCATION: '{{BACKEND_BLOCK_3_LOCATION}}',
  BACKEND_BLOCK_3_SUMMARY: '{{BACKEND_BLOCK_3_SUMMARY}}',
  BACKEND_BLOCK_3_POINT_1: '{{BACKEND_BLOCK_3_POINT_1}}',
  BACKEND_BLOCK_3_POINT_2: '{{BACKEND_BLOCK_3_POINT_2}}',
  BACKEND_BLOCK_3_POINT_3: '{{BACKEND_BLOCK_3_POINT_3}}',
  BACKEND_BLOCK_3_STACK: '{{BACKEND_BLOCK_3_STACK}}',

  BACKEND_BLOCK_4_ORG: '{{BACKEND_BLOCK_4_ORG}}',
  BACKEND_BLOCK_4_TITLE: '{{BACKEND_BLOCK_4_TITLE}}',
  BACKEND_BLOCK_4_DATES: '{{BACKEND_BLOCK_4_DATES}}',
  BACKEND_BLOCK_4_LOCATION: '{{BACKEND_BLOCK_4_LOCATION}}',
  BACKEND_BLOCK_4_SUMMARY: '{{BACKEND_BLOCK_4_SUMMARY}}',
  BACKEND_BLOCK_4_POINT_1: '{{BACKEND_BLOCK_4_POINT_1}}',
  BACKEND_BLOCK_4_POINT_2: '{{BACKEND_BLOCK_4_POINT_2}}',
  BACKEND_BLOCK_4_POINT_3: '{{BACKEND_BLOCK_4_POINT_3}}',
  BACKEND_BLOCK_4_STACK: '{{BACKEND_BLOCK_4_STACK}}',

  // ---------------------------------------------------------------- projects
  // The panel carries the visible notice "Independent projects — personal work,
  // not employment." That notice is markup, not a token, and never comes out.
  PROJECTS_INTRO: '{{PROJECTS_INTRO}}',

  PROJECT_1_TITLE: '{{PROJECT_1_TITLE}}',
  PROJECT_1_STATUS: '{{PROJECT_1_STATUS}}',
  PROJECT_1_SUMMARY: '{{PROJECT_1_SUMMARY}}',
  PROJECT_1_POINT_1: '{{PROJECT_1_POINT_1}}',
  PROJECT_1_POINT_2: '{{PROJECT_1_POINT_2}}',
  PROJECT_1_STACK: '{{PROJECT_1_STACK}}',
  PROJECT_1_REPO_URL: '{{PROJECT_1_REPO_URL}}',
  PROJECT_1_DEMO_URL: '{{PROJECT_1_DEMO_URL}}',

  PROJECT_2_TITLE: '{{PROJECT_2_TITLE}}',
  PROJECT_2_STATUS: '{{PROJECT_2_STATUS}}',
  PROJECT_2_SUMMARY: '{{PROJECT_2_SUMMARY}}',
  PROJECT_2_POINT_1: '{{PROJECT_2_POINT_1}}',
  PROJECT_2_POINT_2: '{{PROJECT_2_POINT_2}}',
  PROJECT_2_STACK: '{{PROJECT_2_STACK}}',
  PROJECT_2_REPO_URL: '{{PROJECT_2_REPO_URL}}',
  PROJECT_2_DEMO_URL: '{{PROJECT_2_DEMO_URL}}',

  PROJECT_3_TITLE: '{{PROJECT_3_TITLE}}',
  PROJECT_3_STATUS: '{{PROJECT_3_STATUS}}',
  PROJECT_3_SUMMARY: '{{PROJECT_3_SUMMARY}}',
  PROJECT_3_POINT_1: '{{PROJECT_3_POINT_1}}',
  PROJECT_3_POINT_2: '{{PROJECT_3_POINT_2}}',
  PROJECT_3_STACK: '{{PROJECT_3_STACK}}',
  PROJECT_3_REPO_URL: '{{PROJECT_3_REPO_URL}}',
  PROJECT_3_DEMO_URL: '{{PROJECT_3_DEMO_URL}}',

  PROJECT_4_TITLE: '{{PROJECT_4_TITLE}}',
  PROJECT_4_STATUS: '{{PROJECT_4_STATUS}}',
  PROJECT_4_SUMMARY: '{{PROJECT_4_SUMMARY}}',
  PROJECT_4_POINT_1: '{{PROJECT_4_POINT_1}}',
  PROJECT_4_POINT_2: '{{PROJECT_4_POINT_2}}',
  PROJECT_4_STACK: '{{PROJECT_4_STACK}}',
  PROJECT_4_REPO_URL: '{{PROJECT_4_REPO_URL}}',
  PROJECT_4_DEMO_URL: '{{PROJECT_4_DEMO_URL}}',

  // ---------------------------------------------------------------------- xr
  // The ZAUBAR block is the site's only employment section (README
  // "Content rules" 2). The XR personal projects below it are not employment.
  XR_INTRO: '{{XR_INTRO}}',

  ZAUBAR_ROLE_TITLE: '{{ZAUBAR_ROLE_TITLE}}',
  ZAUBAR_DATES: '{{ZAUBAR_DATES}}',
  ZAUBAR_LOCATION: '{{ZAUBAR_LOCATION}}',
  ZAUBAR_SUMMARY: '{{ZAUBAR_SUMMARY}}',
  ZAUBAR_POINT_1: '{{ZAUBAR_POINT_1}}',
  ZAUBAR_POINT_2: '{{ZAUBAR_POINT_2}}',
  ZAUBAR_POINT_3: '{{ZAUBAR_POINT_3}}',
  ZAUBAR_STACK: '{{ZAUBAR_STACK}}',

  XR_PROJECT_1_TITLE: '{{XR_PROJECT_1_TITLE}}',
  XR_PROJECT_1_DATES: '{{XR_PROJECT_1_DATES}}',
  XR_PROJECT_1_SUMMARY: '{{XR_PROJECT_1_SUMMARY}}',
  XR_PROJECT_1_STACK: '{{XR_PROJECT_1_STACK}}',

  XR_PROJECT_2_TITLE: '{{XR_PROJECT_2_TITLE}}',
  XR_PROJECT_2_DATES: '{{XR_PROJECT_2_DATES}}',
  XR_PROJECT_2_SUMMARY: '{{XR_PROJECT_2_SUMMARY}}',
  XR_PROJECT_2_STACK: '{{XR_PROJECT_2_STACK}}',

  XR_PROJECT_3_TITLE: '{{XR_PROJECT_3_TITLE}}',
  XR_PROJECT_3_DATES: '{{XR_PROJECT_3_DATES}}',
  XR_PROJECT_3_SUMMARY: '{{XR_PROJECT_3_SUMMARY}}',
  XR_PROJECT_3_STACK: '{{XR_PROJECT_3_STACK}}',

  // ------------------------------------------------------------------- about
  // Skills are exactly two groups. There is no "currently learning" group
  // anywhere, and adding one is a content-rule violation (README 4).
  ABOUT_BIO: '{{ABOUT_BIO}}',

  EMAIL: '{{EMAIL}}',
  GITHUB_URL: '{{GITHUB_URL}}',
  LINKEDIN_URL: '{{LINKEDIN_URL}}',

  EDUCATION_QUALIFICATION: '{{EDUCATION_QUALIFICATION}}',
  EDUCATION_INSTITUTION: '{{EDUCATION_INSTITUTION}}',
  EDUCATION_DATES: '{{EDUCATION_DATES}}',
  EDUCATION_LOCATION: '{{EDUCATION_LOCATION}}',
  EDUCATION_NOTE: '{{EDUCATION_NOTE}}',

  LANGUAGE_1_NAME: '{{LANGUAGE_1_NAME}}',
  LANGUAGE_1_CEFR: '{{LANGUAGE_1_CEFR}}',
  LANGUAGE_2_NAME: '{{LANGUAGE_2_NAME}}',
  LANGUAGE_2_CEFR: '{{LANGUAGE_2_CEFR}}',
  LANGUAGE_3_NAME: '{{LANGUAGE_3_NAME}}',
  LANGUAGE_3_CEFR: '{{LANGUAGE_3_CEFR}}',

  SKILLS_PRODUCTION: '{{SKILLS_PRODUCTION}}',
  SKILLS_PERSONAL_PROJECTS: '{{SKILLS_PERSONAL_PROJECTS}}',
} as const satisfies Readonly<Record<string, string>>;

export type TokenName = keyof typeof CONTENT;

/**
 * The four Projects cards, in DOM order, keyed by the `n` in `[data-repo="n"]`
 * / `[data-demo="n"]`. Listed rather than derived by string concatenation so a
 * typo is a compile error instead of a missing link at runtime.
 */
export interface ProjectLinks {
  readonly n: number;
  readonly repo: string;
  readonly demo: string;
}

export const PROJECT_LINKS: readonly ProjectLinks[] = [
  { n: 1, repo: CONTENT.PROJECT_1_REPO_URL, demo: CONTENT.PROJECT_1_DEMO_URL },
  { n: 2, repo: CONTENT.PROJECT_2_REPO_URL, demo: CONTENT.PROJECT_2_DEMO_URL },
  { n: 3, repo: CONTENT.PROJECT_3_REPO_URL, demo: CONTENT.PROJECT_3_DEMO_URL },
  { n: 4, repo: CONTENT.PROJECT_4_REPO_URL, demo: CONTENT.PROJECT_4_DEMO_URL },
];
