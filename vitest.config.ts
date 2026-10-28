import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    },
    restoreMocks: true,
    clearMocks: true,
    // Bounded workers suit the documented four-core host. Crawl tests perform
    // many sequential SSR requests; their ceiling is not a page-speed assertion.
    maxWorkers: 2,
    testTimeout: 30_000,
  },
});
