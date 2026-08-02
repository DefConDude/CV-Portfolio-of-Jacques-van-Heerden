/****************************************************************/
/* Jacques van Heerden (35317906) - Playwright Configuration    */
/****************************************************************/
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  // Generous: the intro animation runs for ~3.5s and the icon/webfont CDNs are
  // fetched on every page load.
  timeout: 90_000,
  expect: {
    timeout: 10_000,
    // A little tolerance so font hinting / antialiasing noise doesn't fail a run.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/html' }]],
  outputDir: 'test-results/artifacts',
  use: {
    ...devices['Desktop Chrome'],
    deviceScaleFactor: 1,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
