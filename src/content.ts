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

  BACKEND_BLOCK_1_TITLE: 'Authoritative Multiplayer Game Server',
  BACKEND_BLOCK_1_DATES: 'Jan 2026 - Mar 2026',
  BACKEND_BLOCK_1_SUMMARY: 'A high-performance, authoritative game server for a Paper.io 2 clone built in Rust with async networking, designed to pair with a Unity 3D client. Demonstrates production-grade multiplayer architecture: deterministic tick simulation, territory claiming via flood-fill, delta-compressed state sync, and seamless reconnection — all at 20 Hz',
  BACKEND_BLOCK_1_POINT_1: 'The server is fully authoritative — the client never determines game outcomes. All simulation (movement, collisions, territory claiming) runs server-side at a fixed 20 Hz tick rate',
  BACKEND_BLOCK_1_POINT_2: 'All communication uses Protocol Buffers over UDP or WebSocket',
  BACKEND_BLOCK_1_POINT_3: 'Generic networking never imports game code — all game-to-network communication flows through the Game trait interface',
  BACKEND_BLOCK_1_STACK: 'Rust, Tokio, Protocol Buffers, UDP, WebSocket',

  BACKEND_BLOCK_2_TITLE: 'Pick MA Job — Multi-User SaaS Platform',
  BACKEND_BLOCK_2_DATES: 'Mar 2026 - Present',
  BACKEND_BLOCK_2_SUMMARY: 'Pick Ma Job is a multi-user SaaS platform that scrapes job postings from Upwork and LinkedIn, evaluates every posting against your profile using Anthropics Claude API, and presents only the most relevant opportunities in a clean, modern React UI. Stop sifting through noise — let AI surface the jobs worth your time',
  BACKEND_BLOCK_2_POINT_1: 'Scrapes Upwork and LinkedIn job postings via Apify actors. Extensible to new platforms in minutes.',
  BACKEND_BLOCK_2_POINT_2: 'Cost-efficient Claude evaluation: a lightweight Pass 1 scores every job (1–10), then only high-scoring jobs undergo detailed Pass 2 analysis. Configurable score threshold.',
  BACKEND_BLOCK_2_POINT_3: 'Company blacklist, configurable keyword exclusions in titles, automatic deduplication — clean before you see it.',
  BACKEND_BLOCK_2_STACK: 'FastAPI, Python, PostgreSQL 14+, Claude API, Apify, Resend, SlowAPI, pypdf, React, TypeScript, Tailwind CSS 4, Vite 6, TanStack Query, Zod, Vitest',

  // ---------------------------------------------------------------- projects
  // The panel carries the visible notice "Independent projects — personal work,
  // not employment." That notice is markup, not a token, and never comes out.
  PROJECTS_INTRO: 'Showcase of my freelance work including web applications, XR experiences, backend systems and simulations',

  PROJECT_1_TITLE: 'Pick MA Job',
  PROJECT_1_STATUS: 'Live, multiple active users',
  PROJECT_1_SUMMARY: 'Pick Ma Job is a multi-user SaaS platform that scrapes job postings from Upwork and LinkedIn, evaluates every posting against your profile using Anthropics Claude API, and presents only the most relevant opportunities in a clean, modern React UI',
  PROJECT_1_POINT_1: 'Scrapes Upwork and LinkedIn job postings via Apify actors. Extensible to new platforms in minutes',
  PROJECT_1_POINT_2: 'Upload your CV as PDF, describe your skills and preferences — every job is evaluated against your actual profile',
  PROJECT_1_STACK: 'FastAPI, Python, PostgreSQL 14+, Claude API, Apify, Resend, SlowAPI, pypdf, React, TypeScript, Tailwind CSS 4, Vite 6, TanStack Query, Zod, Vitest',
  PROJECT_1_REPO_URL: 'https://github.com/WallerTheDeveloper/pick-ma-job',
  PROJECT_1_DEMO_URL: 'https://pickmajob.cc/',

  PROJECT_2_TITLE: 'Paper.io 2 Clone (Multiplayer Game with custom built server)',
  PROJECT_2_STATUS: 'Finished prototype',
  PROJECT_2_SUMMARY: 'A fully authoritative multiplayer territory-capture game inspired by Voodoo Paper.io⁠ 2. Built with a custom Rust server and Unity 3D client (URP) featuring real-time state sync, procedural trail rendering, flood-fill territory claiming, and client-side prediction',
  PROJECT_2_POINT_1: 'The client never determines game outcomes. The server owns simulation, collision, and territory state. The client handles input, rendering, and prediction',
  PROJECT_2_POINT_2: 'Client is built with Unity 3D (URP) and C#, server is built with Rust and Tokio. The server uses a custom binary protocol over TCP for low-latency state sync',
  PROJECT_2_STACK: 'Unity 6, C#, Rust, Tokio, TCP, UDP, Google.Protobuf',
  PROJECT_2_REPO_URL: 'https://github.com/WallerTheDeveloper/paperio-clone',
  PROJECT_2_DEMO_URL: 'https://wallerthedeveloper.itch.io/paperio-clone',

  PROJECT_3_TITLE: 'Solar System Simulation',
  PROJECT_3_STATUS: 'Finished prototype',
  PROJECT_3_SUMMARY: 'A real-time 3D visualization of our solar system, built from scratch using C++ and OpenGL. This project showcases accurate orbital mechanics, realistic planet rendering, and an interactive camera system that lets you explore space at your own pace',
  PROJECT_3_POINT_1: 'Project showcases a custom graphics engine architecture built for real-time 3D rendering. While the solar system simulation demonstrates orbital mechanics using Keplers laws, the underlying engine is designed to be extended into different 3D applications',
  PROJECT_3_POINT_2: 'The simulation features accurate orbital mechanics, realistic planet textures, and a dynamic camera system that allows users to explore the solar system from various perspectives',
  PROJECT_3_STACK: 'C++, OpenGL, GLSL, GLM, GLFW, stb_image, GLAD',
  PROJECT_3_REPO_URL: 'https://github.com/WallerTheDeveloper/solar-system-opengl',
  PROJECT_3_DEMO_URL: 'https://wallerthedeveloper.itch.io/solar-system-simulation',

  PROJECT_4_TITLE: 'VR Tower Defense',
  PROJECT_4_STATUS: 'Finished prototype',
  PROJECT_4_SUMMARY: 'A Virtual Reality tower defense game built with Unity, featuring immersive spatial gameplay where players defend their headquarters using strategic tower placement. Project uses Passthrough feature. Players must defend their headquarters from enemy attacks by strategically placing and managing different types of towers. The VR implementation allows for intuitive hand-based interactions and immersive spatial awareness that traditional tower defense games cannot provide',
  PROJECT_4_POINT_1: 'Players must defend their headquarters from enemy attacks by strategically placing and managing different types of towers',
  PROJECT_4_POINT_2: 'Pinch Gestures for natural selection mechanics',
  PROJECT_4_STACK: 'Unity Engine, C#, OpenXR',
  PROJECT_4_REPO_URL: 'https://github.com/WallerTheDeveloper/vr-tower-defense',
  PROJECT_4_DEMO_URL: 'https://www.linkedin.com/feed/update/urn:li:activity:7366896687132356609/',

  // ---------------------------------------------------------------------- xr
  // The ZAUBAR block is the site's only employment section (README
  // "Content rules" 2). The XR personal projects below it are not employment.
  XR_INTRO: 'Showcase of my XR / AR work, including both employment and freelance projects',

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

  XR_PROJECT_1_TITLE: 'VR Tower Defense',
  XR_PROJECT_1_DATES: 'A Virtual Reality tower defense game built with Unity, featuring immersive spatial gameplay where players defend their headquarters using strategic tower placement',
  XR_PROJECT_1_SUMMARY: 'A Virtual Reality tower defense game built with Unity, featuring immersive spatial gameplay where players defend their headquarters using strategic tower placement. Freelance project for the clients who wanted a VR tower defense prototype for grabbing towers with pinch gestures and placing them in strategic positions',
  XR_PROJECT_1_STACK: 'Unity Engine, C#, OpenXR, AR Foundation',

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


  SKILLS_PRODUCTION: 'C#, C++, TypeScript, Swift, React, Unity Engine, AR Foundation, OpenXR, ARCore, ARKit, Vue.js, Vite, Tailwind CSS, Github Actions, Directus CMS, Python, Rust, OpenGL, GLSL, FastAPI, PostgreSQL, Firebase App Distribution, Git, Jenkins, Blender',
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
