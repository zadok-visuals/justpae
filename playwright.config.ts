import { defineConfig, devices } from "@playwright/test";

/**
 * The end-to-end suite.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * AGAINST A PRODUCTION BUILD, NOT THE DEV SERVER
 *
 * `npm run build && npm run start`, deliberately. Half the things worth
 * testing here only exist in a production build: the real proxy, real route
 * caching, the real streaming boundaries, the real bundle. A dev-server suite
 * passes and tells you nothing about what ships.
 *
 * THE PROVIDERS ARE MOCKED, THE DATABASE IS NOT. E2E_MOCK_PROVIDERS=1 swaps
 * every payment provider for the in-process mock in src/lib/e2e/mockProviders.ts,
 * so no test can move real money even with live keys present. Supabase stays
 * real: the invariants worth testing (balance holds, the PIN gate, suspension,
 * the service-role boundary) live in the database, and mocking it would test
 * the mock. See src/lib/e2e/guard.ts for why that flag cannot reach a
 * deployment.
 *
 * TWO PROJECTS, SPLIT BY WHAT THEY NEED:
 *   public  — no credentials. Landing, legal, auth screens, 404s. Always runs.
 *   authed  — needs E2E_SUPABASE_URL + E2E_SUPABASE_SERVICE_ROLE_KEY to create
 *             its fixture users. SKIPS with a clear reason when they are
 *             absent rather than failing, so a contributor without production
 *             credentials still gets a meaningful run; set E2E_REQUIRE_AUTHED=1
 *             in CI to turn that skip into a failure.
 */

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // One worker. The fixture users are shared, and a wallet balance asserted by
  // two tests at once is a flake nobody can reproduce.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalTeardown: "./e2e/globalTeardown.ts",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      // Chromium dropped the old headless mode this project's pinned
      // Playwright build still asks for by default; --headless=new is the
      // supported replacement and is harmless on older builds too, so it is
      // always added rather than only when the override below is used.
      args: ["--headless=new"],
      // Opt-in only: set when the environment's own Chromium build doesn't
      // match what this Playwright version would otherwise download (e.g. a
      // container that pre-installs its own browser). Unset, this is
      // `undefined` and Playwright resolves its usual managed browser.
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    },
  },

  projects: [
    {
      name: "public",
      testMatch: /.*\.public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authed",
      testMatch: /.*\.authed\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    /**
     * The responsive sweep Group 3 asks for. Same specs, four viewports — a
     * layout that only breaks at 375px is exactly the kind of thing a single
     * desktop-sized run never sees.
     */
    {
      name: "mobile-375",
      testMatch: /.*\.responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "tablet-768",
      testMatch: /.*\.responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    /**
     * GROUP 6a names four widths to check — 1024, 1280, 1440 and 1920 — and
     * two of them were missing. 1024 is the breakpoint the whole two-column
     * layout turns on at, so it is the one width where a split can be
     * half-applied and look broken; 1920 is where a capped container can
     * leave the "oversized empty areas" the brief asks about.
     */
    {
      name: "desktop-1024",
      testMatch: /.*\.responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 900 } },
    },
    {
      name: "desktop-1280",
      testMatch: /.*\.responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "desktop-1440",
      testMatch: /.*\.responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-1920",
      testMatch: /.*\.responsive\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],

  webServer: {
    // `next start`, not `next dev`. See the note above.
    command: `npx next start --port ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    // Reuse a server the developer already has up, but never in CI, where a
    // stale server is a green run that tested the previous commit.
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      E2E_MOCK_PROVIDERS: "1",
      // Loopback, so src/lib/e2e/guard.ts allows the mocks. Anything else and
      // the server refuses to start, which is the point.
      APP_URL: BASE_URL,
      PERF_TIMING: process.env.PERF_TIMING ?? "",
      // Passed through rather than inherited implicitly: reuseExistingServer
      // means this value can otherwise be whatever an EARLIER invocation
      // started the server with, not this one's — which is exactly how a
      // stale server without proxy credentials kept serving authed runs
      // behind this session's agent proxy, every protected route redirect
      // looping (the Next server's own Supabase calls failing silently).
      NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY ?? "",
    },
  },
});
