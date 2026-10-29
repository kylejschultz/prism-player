import process from 'node:process';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 30_000,
  reporter: 'line',
  outputDir: process.env.PRISM_TEST_OUTPUT || '/tmp/prism-browser-tests',
  use: {
    baseURL: 'http://127.0.0.1:1421',
    browserName: 'chromium',
    channel: process.platform === 'darwin' ? 'chrome' : undefined,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev -- --port 1421',
    url: 'http://127.0.0.1:1421',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
