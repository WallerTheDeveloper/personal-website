import { existsSync, readdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

// Widths that ACCEPTANCE.md group A pins the visual comparison to.
//
// 375 is the narrowest the site supports — iPhone SE and 13 mini, and most small
// Androids. It was added after two layouts were found clipping there *and* at
// 390: the text-edition grid and the About panel's contact rows. Both were
// invisible to this sweep because it measured the column rather than the grid,
// which `mobile.spec.ts` now covers directly.
export const WIDTHS = [1440, 1024, 768, 390, 375] as const;

/**
 * Where Playwright keeps the browsers it downloads.
 */
function browsersRoot(): string {
  const override = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (override !== undefined && override !== '') return override;
  switch (platform()) {
    case 'win32':
      return join(process.env['LOCALAPPDATA'] ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright');
    case 'darwin':
      return join(homedir(), 'Library', 'Caches', 'ms-playwright');
    default:
      return join(homedir(), '.cache', 'ms-playwright');
  }
}

/**
 * The newest downloaded Chromium, or `undefined` to let Playwright resolve one
 * itself.
 *
 * Playwright pins an exact build per release and refuses to start if that exact
 * directory is absent — which is the state of this machine, where the installed
 * build is older than the one `@playwright/test` asks for. Rather than pass a
 * hard-coded path (it would break on every other machine, and it cost an hour
 * to rediscover once already), take the highest revision that is actually
 * present. Where the expected build *is* installed this picks the same one
 * Playwright would have, so it is a no-op there — including on CI.
 *
 * `PLAYWRIGHT_CHROMIUM_PATH` overrides everything, for a system browser.
 */
function chromiumExecutable(): string | undefined {
  const explicit = process.env['PLAYWRIGHT_CHROMIUM_PATH'];
  if (explicit !== undefined && explicit !== '') return explicit;

  const root = browsersRoot();
  if (!existsSync(root)) return undefined;

  const revisions = readdirSync(root)
    .map((name) => /^chromium-(\d+)$/.exec(name))
    .flatMap((m) => (m === null ? [] : [{ dir: m[0], rev: Number(m[1]) }]))
    .sort((a, b) => b.rev - a.rev);

  for (const { dir } of revisions) {
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const exe = join(root, dir, rel);
      if (existsSync(exe)) return exe;
    }
  }
  return undefined;
}

/**
 * Headless Chromium has no GPU, so the hub would never boot and every router
 * test would fall through to the text edition. SwiftShader is the software
 * rasteriser that makes `hasWebGL()` true; `--enable-unsafe-swiftshader` is
 * required since Chromium 121 removed the implicit fallback.
 *
 * It renders at roughly 22 fps, so anything that samples an eased value needs a
 * generous settle — see `tests/e2e/helpers.ts`.
 */
const CHROMIUM = chromiumExecutable();

const WEBGL_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'blob' : 'list',
  // Software WebGL is slow; a jump alone is ~2.5 s of animation.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    launchOptions: {
      args: WEBGL_ARGS,
      // Spread rather than assigned: under `exactOptionalPropertyTypes` an
      // explicit `undefined` is not the same as an absent key, and absent is
      // what makes Playwright resolve a browser itself.
      ...(CHROMIUM === undefined ? {} : { executablePath: CHROMIUM }),
    },
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
