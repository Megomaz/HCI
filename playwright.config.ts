import { defineConfig } from "@playwright/test";

/**
 * Tests run against their own dev server (port 5199), which is pointed at a
 * stand-in for OpenRouter (port 5198). No real API key is used and nothing is
 * sent to the real AI service.
 */
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 390, height: 844 },
    locale: "en-IE",
  },
  webServer: [
    {
      command: "node tests/mock-openrouter.mjs",
      url: "http://127.0.0.1:5198/health",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- --port 5199 --strictPort",
      url: "http://localhost:5199",
      reuseExistingServer: true,
      env: {
        OPENROUTER_API_KEY: "test-key-not-real",
        OPENROUTER_BASE_URL: "http://127.0.0.1:5198/api/v1",
        OPENROUTER_MODEL: "",
      },
    },
  ],
});
