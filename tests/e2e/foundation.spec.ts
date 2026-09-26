import "../database-env";
import { expect, test, type Page } from "@playwright/test";
import { getDb } from "../../src/infrastructure/db";
const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;
const origin = "https://127.0.0.1:3443";
const password = "synthetic-e2e-passphrase-123";
async function signIn(page: Page) {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Passphrase", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
}
test.beforeEach(async () => {
  await getDb().loginThrottle.deleteMany();
});
test.afterAll(async () => {
  await getDb().$disconnect();
});
test("redirects anonymous users and sets safe response headers", async ({
  page,
  request,
}) => {
  await page.goto(route("/accounts"));
  await expect(page).toHaveURL(/\/login$/);
  const response = await request.get(route("/login"));
  expect(response.headers()["content-security-policy"]).toContain("'nonce-");
  expect(response.headers()["content-security-policy"]).not.toContain(
    "unsafe-eval",
  );
  expect(response.headers()["strict-transport-security"]).toContain("31536000");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect((await request.get(route("/api/health/ready"))).status()).toBe(200);
});
test("rejects cross-origin login/logout and oversized input", async ({
  request,
}) => {
  const form = { username: "owner", password };
  const forgedHeaders: Record<string, string>[] = [
    { origin: "https://evil.example" },
    { "x-forwarded-host": "127.0.0.1:3443" },
  ];
  for (const headers of forgedHeaders) {
    expect(
      (
        await request.post(route("/api/auth/login"), { form, headers })
      ).status(),
    ).toBe(403);
    expect(
      (await request.post(route("/api/auth/logout"), { headers })).status(),
    ).toBe(403);
  }
  expect(
    (
      await request.post(route("/api/auth/login"), {
        form: { ...form, password: "x".repeat(5000) },
        headers: { origin },
      })
    ).status(),
  ).toBe(400);
});
test("signs in, navigates all pillars, persists theme, and signs out", async ({
  page,
  context,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "__Host-mynab-session")).toMatchObject({
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
  // Every pillar is now a real page; no placeholder copy should survive.
  for (const [name, heading, live] of [
    ["Accounts", "See the whole picture.", true],
    ["Targets", "Make space for what’s ahead.", true],
    ["Debt", "Find your way forward.", true],
    ["Reports", "See where it went.", true],
    ["Budget", "Budget", true],
  ] as const) {
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Coming in a future release")).toBeVisible({
      visible: !live,
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("budget-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: info.outputPath("budget-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(route("/budget"));
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});
test("supports keyboard sign-in and skip navigation", async ({
  page,
}, info) => {
  await page.goto(route("/login"));
  await page.screenshot({ path: info.outputPath("login.png"), fullPage: true });
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Username", { exact: true })).toBeFocused();
  await page.keyboard.type("owner");
  await page.keyboard.press("Tab");
  await page.keyboard.type(password);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/budget$/);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
test("shows a generic bad-password message", async ({ page }) => {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("incorrect-passphrase-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "wasn’t recognized" }),
  ).toBeVisible();
});

test("can be installed to a home screen", async ({ page, request }) => {
  await page.goto(route("/login"));
  const href = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: "MyNAB", display: "standalone" });
  expect(manifest.start_url).toBe(route("/budget"));
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});
