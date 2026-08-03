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

/**
 * Must stay in step with `<link rel="canonical">` in `index.html`, and with
 * `base` in `vite.config.ts` — the path segment is the GitHub Pages project
 * path, not decoration. `tests/unit/site-files.test.ts` pins all three together.
 */
export const SITE_URL = 'https://wallerthedeveloper.github.io/personal-website/';

export const CONTENT = {
  // ---------------------------------------------------------- hub / global
  FULL_NAME: 'Danylo Golosov',
  ROLE_TAGLINE: 'Software Engineer & XR Developer',
  LOCATION: 'Berlin, Germany',
  META_DESCRIPTION: '{{META_DESCRIPTION}}',
  /** The micro-label under the wordmark on the loading screen. */
  LOADING_LABEL: 'Loading the website...',

  // ----------------------------------------------------------------- backend
  // Neutral, non-employment blocks. If one becomes employment it moves to the
  // XR employment treatment — the Backend blocks are never restyled
  // (README "Content rules" 3).
  BACKEND_INTRO: 'Backend & Platform work, including server-side development and system architecture',

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
  XR_INTRO: 'Showcase of my XR / AR work, including both employment and personal projects',

  ZAUBAR_ROLE_TITLE: 'AR & Web Developer',
  ZAUBAR_DATES: 'Aug 2023 - Jul 2025',
  ZAUBAR_LOCATION: 'Berlin, Germany (On-Site)',
  ZAUBAR_SUMMARY: 'Engineering team member, was responsible for XR & Web development, including AR mobile apps development and distribution, VR experiences for conferences, and web applications feature development',
  ZAUBAR_POINT_1: 'Shipped 10 augmented reality applications over two years and was sole developer on 4, owning each from build through the full CI/CD release cycle to distribution',
  ZAUBAR_POINT_2: 'Rebuilt the Tunnel 57 VR experience on OpenXR and the XR Interaction Toolkit, integrating SenseGlove Nova 2 and Actronika Skinetic hardware to add physical haptic feedback',
  ZAUBAR_POINT_3: 'Built the Euro 2024 multiplayer AR demo and was the first engineer on the team to integrate its in-house multiplayer SDK, validating the SDK for later projects',
  ZAUBAR_POINT_4: 'Wrote a Swift QR-scanning plugin and trimmed the zxing library so App Clips and Instant Apps stayed under the 15 MB platform size limit',
  ZAUBAR_POINT_5: 'Profiled and optimised 3 production applications with the Unity Profiler to improve runtime performance',
  ZAUBAR_POINT_6: 'Built the web frontends in Vue.js, TypeScript, and Tailwind CSS and engineered a Unity-to-web protocol bridge so native AR scenes could exchange data with the web layer',
  ZAUBAR_POINT_7: 'Set up and administered a Directus CMS and its API, enabling non-engineers to manage app content without developer involvement',
  ZAUBAR_STACK: 'Unity Engine, C#, TypeScript, Swift, Vue.js, Tailwind CSS, OpenXR, AR Foundation, ARCore, ARKit, Directus CMS, Firebase App Distribution, GitHub Actions',

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
  ABOUT_BIO: 'Software Engineer with a focus on XR & backend development. I have 2 years of production experience in XR mobile app development, and experience in creating backend systems and web application. Prefer taking responsibility and owning features through the full release process: creating REST API design, relational data modeling, and CI/CD automation. Independent backend work include a production FastAPI & async PostgreSQL SaaS (live, multiple active users) and an authoritative multiplayer game server built from scratch in Rust. Core languages are C#, C++, TypeScript, Python, and Rust',

  EMAIL: 'golo7ov.danil@gmail.com',
  GITHUB_URL: 'https://github.com/WallerTheDeveloper',
  LINKEDIN_URL: 'https://www.linkedin.com/in/danylo-golosov-047bb8212',

  EDUCATION_QUALIFICATION: 'Bachelor of Computer Science',
  EDUCATION_INSTITUTION: 'Lublin University of Technology',
  EDUCATION_DATES: 'Oct 2019 - Feb 2023',
  EDUCATION_LOCATION: 'Lublin, Poland',
  EDUCATION_NOTE: '',

  LANGUAGE_1_NAME: 'Ukrainian',
  LANGUAGE_1_CEFR: 'Native',
  LANGUAGE_2_NAME: 'Russian',
  LANGUAGE_2_CEFR: 'C2',
  LANGUAGE_3_NAME: 'English',
  LANGUAGE_3_CEFR: 'B2',
  LANGUAGE_4_NAME: 'Polish',
  LANGUAGE_4_CEFR: 'B2',
  LANGUAGE_5_NAME: 'German',
  LANGUAGE_5_CEFR: 'A2',


  SKILLS_PRODUCTION: 'C#, C++, TypeScript, Swift, React, Unity Engine, AR Foundation, OpenXR, ARCore, ARKit, Vue.js, Vite, Tailwind CSS, Github Actions, Directus CMS, Firebase App Distribution, Git, Jenkins, Blender',
  SKILLS_PERSONAL_PROJECTS: 'Python, Rust, OpenGL, GLSL, FastAPI, PostgreSQL',
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
