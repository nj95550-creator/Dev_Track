/**
 * Desktop/mobile Chromium test configuration. A fresh loopback-only test
 * server owns disposable data; serial execution and retained failure traces
 * make timing-sensitive authentication regressions easier to diagnose.
 */
import { defineConfig } from '@playwright/test';
const port = Number(process.env.UI_TEST_PORT || 4189);
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  use: {
    baseURL: `http://localhost:${port}`,
    browserName: 'chromium',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: process.env.PLAYWRIGHT_CHROMIUM_ARGS?.split(' ') || [],
        }
      : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'node scripts/ui-test-server.mjs',
    url: `http://localhost:${port}/api/health`,
    timeout: 60_000,
    reuseExistingServer: false,
    env: { UI_TEST_PORT: String(port) },
  },
});
