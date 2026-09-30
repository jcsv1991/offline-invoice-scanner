import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Use a locally installed Chromium if the standard Playwright download isn't available (CI downloads its own).
const localChromium = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);

// BASE_PATH mirrors the build: "/" locally, "/<repo>/" when testing the GitHub Pages configuration.
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:4173${basePath}`,
    viewport: { width: 390, height: 844 }, // a phone: this is a frontline-staff app
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    launchOptions: localChromium ? { executablePath: localChromium } : {},
  },
  // Tests run against the PRODUCTION build (service worker + precache only exist there).
  webServer: {
    command: 'npm run preview',
    url: `http://localhost:4173${basePath}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
