const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: '.', testMatch: '*.spec.cjs', workers: 1, retries: 0,
  timeout: 30000, reporter: 'list', outputDir: './test-results',
  use: { baseURL: process.env.BROWSER_BASE_URL || 'http://host.docker.internal:3192',
    timezoneId: 'UTC', viewport: { width: 1280, height: 800 }, trace: 'retain-on-failure' },
});
