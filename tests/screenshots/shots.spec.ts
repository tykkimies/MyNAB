import "../database-env";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { getDb } from "../../src/infrastructure/db";
const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;
const password = "synthetic-e2e-passphrase-123";
test.describe.configure({ mode: "serial" });
test.afterAll(async () => {
  await getDb().$disconnect();
});
function panel(page: Page, heading: string) {
  return page
    .locator("section,details")
    .filter({ has: page.getByRole("heading", { name: heading, exact: true }) })
    .first();
}
async function save(scope: Locator, button: string) {
  await scope.getByRole("button", { name: button, exact: true }).click();
  await expect(scope.getByText("Saved.", { exact: true })).toBeVisible();
}
async function signIn(page: Page) {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Passphrase", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
}
async function addAccount(
  page: Page,
  name: string,
  type: string,
  opening: string,
  participation = "Budget",
) {
  await page.goto(route("/accounts"));
  const form = panel(page, "Add an account");
  await form.getByLabel("Account name", { exact: true }).fill(name);
  await form
    .getByLabel("Account type", { exact: true })
    .selectOption({ label: type });
  await form
    .getByLabel("Participation", { exact: true })
    .selectOption({ label: participation });
  await form.getByLabel("Opening balance (USD)", { exact: true }).fill(opening);
  await save(form, "Create account");
}
test("photographs every redesigned route with a plausible ledger", async ({
  page,
}, info) => {
  await signIn(page);
  // The starter panel only shows while no category exists, and opening a credit
  // card creates its payment category, so seed the plan before the accounts.
  const starter = panel(page, "Your first spending plan");
  await starter.getByRole("button", { name: "Use these categories" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Groceries" }).first(),
  ).toBeVisible();

  await addAccount(page, "Everyday Checking", "Checking", "2540.18");
  await addAccount(page, "Ally Savings", "Savings", "8200.00");
  await addAccount(page, "Everyday Card", "Credit card", "-482.65");
  await addAccount(
    page,
    "Car Loan",
    "Installment loan",
    "-11400.00",
    "Tracking",
  );
  await addAccount(page, "Brokerage", "Investment", "18250.00", "Tracking");

  await page.goto(route("/budget"));

  for (const [category, amount] of [
    ["Rent / Mortgage", "1450"],
    ["Groceries", "520"],
    ["Electric", "95"],
    ["Dining Out", "120"],
    ["Emergency Fund", "300"],
  ] as const) {
    const row = page.getByRole("row").filter({ hasText: category }).first();
    await row.getByLabel(`Change ${category} assignment`).fill(amount);
    await row.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(row.getByText("Saved.", { exact: true })).toBeVisible();
  }

  await page.goto(route("/goals"));
  for (const [category, amount] of [
    ["Emergency Fund", "5000.00"],
    ["Groceries", "600.00"],
  ] as const) {
    const targets = panel(page, "Set a target");
    await targets
      .getByLabel("Target category", { exact: true })
      .selectOption({ label: category });
    await targets
      .getByLabel("Target kind", { exact: true })
      .selectOption({ value: "MONTHLY" });
    await targets.getByLabel("Amount (USD)", { exact: true }).fill(amount);
    await save(targets, "Save target");
  }

  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Everyday Card" });
  await terms.getByLabel("APR", { exact: true }).fill("19.99");
  await terms
    .getByLabel("Minimum payment (USD)", { exact: true })
    .fill("35.00");
  await save(terms, "Save terms");

  for (const [path, name] of [
    ["/budget", "budget"],
    ["/accounts", "accounts"],
    ["/goals", "goals"],
    ["/debt", "debt"],
  ] as const) {
    await page.goto(route(path));
    await page.screenshot({
      path: info.outputPath(`${name}-light.png`),
      fullPage: true,
    });
  }
  // The routes outside the four Stitch screens, restyled to the same system.
  await page.goto(route("/accounts"));
  const register = await page
    .getByRole("link", { name: /Everyday Checking/ })
    .first()
    .getAttribute("href");
  // `register` already carries the base path, the other two do not.
  for (const [path, name] of [
    [register!, "register"],
    [route("/accounts/connections"), "connections"],
    [route("/accounts/schedules"), "schedules"],
  ] as const) {
    await page.goto(path);
    await page.screenshot({
      path: info.outputPath(`${name}-light.png`),
      fullPage: true,
    });
  }

  // Native-resolution crop of the ledger, where column fit is easiest to misjudge.
  await page.goto(route("/budget"));
  await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Envelopes" }) })
    .first()
    .screenshot({ path: info.outputPath("ledger-crop.png") });

  await page.getByRole("button", { name: "Dark theme" }).click();
  await page.goto(route("/budget"));
  await page.screenshot({
    path: info.outputPath("budget-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.screenshot({
    path: info.outputPath("login-dark.png"),
    fullPage: true,
  });
});
