import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:3100' },
  webServer: {
    command: 'node dist/server.js',
    url: 'http://127.0.0.1:3100/health',
    env: { PORT: '3100', HOST: '127.0.0.1', LOG_LEVEL: 'silent' },
    reuseExistingServer: false,
  },
});
