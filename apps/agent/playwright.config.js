// @ts-check
const { defineConfig, devices } = require("@playwright/test");

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  retries: 3,
  workers: 1,
  timeout: 10 * 60 * 1000, // 10 minutes per test
  globalTimeout: process.env.CI ? 45 * 60 * 1000 : 0, // 45 minutes in CI, no limit locally
  expect: {
    timeout: 2 * 60 * 1000, // 2 minutes for expect operations
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Stop after first failure in CI */
  maxFailures: process.env.CI ? 5 : undefined,
  /* Opt out of parallel tests on CI. */
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: process.env.PLAYWRIGHT_HTML_REPORT || "playwright-report",
        open: "never",
      },
    ],
    [
      "junit",
      {
        outputFile:
          process.env.PLAYWRIGHT_JUNIT_OUTPUT_NAME || "DKG_Node_UI_Tests.xml",
      },
    ],
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:8081",
    browserName: "chromium",
    headless: true,
    actionTimeout: 2 * 60 * 1000, // 2 minutes for all actions
    launchOptions: {
      slowMo: 1500,
    },
    //args: ['--window-size=1920,1080'],
    //viewport: { width: 1920, height: 1080 },
    video: {
      // Record videos on failure for both GitHub Actions and Jenkins
      mode: "retain-on-failure",
      size: { width: 1920, height: 1080 }, // Specify the video size
    },
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        args: ["--window-size=1920,1080"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    /*
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    */
    // Test against mobile viewports.
    /*
    {
      name: 'Android Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'iPhone Safari',
      use: { ...devices['iPhone 12'] },
    },
    */
    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: "turbo dev",
    url: "http://localhost:8081",
    reuseExistingServer: false, // Always start fresh - prevents session persistence
    timeout: process.env.CI ? 300 * 1000 : 120 * 1000, // 5 minutes in CI, 2 minutes locally
    ignoreHTTPSErrors: true,
    stderr: "pipe",
    stdout: "pipe",
    gracefulShutdown: {
      timeout: 10000, // 10 seconds for complete cleanup
      signal: "SIGTERM", // Graceful termination signal
    },
  },
});
