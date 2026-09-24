/**
 * Throwaway harness for the Stitch redesign: signs in, seeds a little shape,
 * and photographs each route so the styling can be eyeballed. It is not part
 * of `npm run test:e2e` — that suite still runs from playwright.config.ts —
 * and it can be deleted once the redesign lands.
 */
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
config({ path: ".env.test", quiet: true });
process.env.APP_ORIGIN = "https://127.0.0.1:3443";
export default defineConfig({
  testDir: ".",
  globalSetup: "../e2e/setup.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "https://127.0.0.1:3443",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: "node --import tsx scripts/e2e-server.ts",
    cwd: "../..",
    url: `https://127.0.0.1:3443${process.env.APP_BASE_PATH ?? ""}/api/health/ready`,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 90000,
  },
});
