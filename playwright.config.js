import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.TEST_PORT) || 4174;

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  timeout: 60000,
  fullyParallel: false,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}/`, acceptDownloads: true },
  webServer: {
    command: `node tests/server.mjs`,
    env: { PORT: String(PORT) },
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
  },
  projects: [
    { name: 'iPhone 13', use: { ...devices['iPhone 13'] }, grepInvert: /@layout/ },
    { name: 'Pixel 7', use: { ...devices['Pixel 7'] }, grepInvert: /@layout/ },
    // Smallest phone aimed at: iPhone SE (2nd/3rd gen), 375 pt wide, 548 pt visible under Safari's bars.
    // Runs the layout checks and the screenshots only.
    { name: 'iPhone SE', use: { ...devices['iPhone SE (3rd gen)'], viewport: { width: 375, height: 548 } }, grep: /@layout|@shots/ },
  ],
});
