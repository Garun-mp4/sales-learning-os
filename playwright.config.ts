import { defineConfig, devices } from "@playwright/test";
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:4321",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  ...(!externalBaseURL && {
    webServer: {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:4321",
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
    },
  }),
});
