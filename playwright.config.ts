import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build on the wiped test database (see scripts/e2e-server.mjs).
 * Stop any `next dev` in this checkout first: the build uses the standard .next directory.
 *
 * PLAYWRIGHT_CHROMIUM_PATH lets environments with a pre-installed Chromium (e.g. CI images) skip `playwright install`.
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

const desktopChrome = {
  ...devices["Desktop Chrome"],
  launchOptions: { executablePath },
};

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-CA",
    timezoneId: "America/Toronto",
  },
  projects: [
    {
      name: "journey",
      testMatch: /journey\.spec\.ts/,
      use: { ...desktopChrome, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "security",
      testMatch: /security\.spec\.ts/,
      dependencies: ["journey"],
      use: { ...desktopChrome, viewport: { width: 1440, height: 900 } },
    },
    {
      name: "visual-390",
      testMatch: /visual\.spec\.ts/,
      dependencies: ["journey"],
      use: { ...desktopChrome, viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: true },
    },
    {
      name: "visual-768",
      testMatch: /visual\.spec\.ts/,
      dependencies: ["journey"],
      use: { ...desktopChrome, viewport: { width: 768, height: 1024 } },
    },
    {
      name: "visual-1440",
      testMatch: /visual\.spec\.ts/,
      dependencies: ["journey"],
      use: { ...desktopChrome, viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
