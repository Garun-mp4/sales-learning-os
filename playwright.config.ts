import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',
  timeout:45000,
  use:{baseURL:'http://127.0.0.1:4321',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'npm run dev -- --host 127.0.0.1',url:'http://127.0.0.1:4321',reuseExistingServer:!process.env.CI,timeout:180000}
});
