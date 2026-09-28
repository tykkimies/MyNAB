import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", quiet: true });
process.env.APP_ORIGIN = "https://127.0.0.1:3443";
/** The "Desktop site / Phone site" switch's cookie, as the app sets it. */
function viewCookie(value: "phone" | "desktop") {
  return {
    name: "mynab-view",
    value,
    domain: "127.0.0.1",
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: true,
    sameSite: "Lax" as const,
  };
}
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "https://127.0.0.1:3443",
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /phone\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      // A phone that chose "Use desktop site": the responsive desktop pages.
      name: "mobile",
      testIgnore: /phone\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        storageState: { cookies: [viewCookie("desktop")], origins: [] },
      },
    },
    {
      // The phone app itself; runs last, over the ledger the others built.
      name: "phone",
      testMatch: /phone\.spec\.ts/,
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    url: `https://127.0.0.1:3443${process.env.APP_BASE_PATH ?? ""}/api/health/ready`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 90000,
  },
});
