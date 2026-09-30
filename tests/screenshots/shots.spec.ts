import "../database-env";
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
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
/**
 * On desktop the workspace scrolls inside the shell, so a full-page
 * photograph would stop at the first screen. Let the shell grow to its
 * content before each page is photographed (CSSOM, which the CSP allows).
 */
async function unrollShell(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      for (const el of document.querySelectorAll<HTMLElement>(
        "[data-shell], #workspace",
      )) {
        el.style.height = "auto";
        el.style.overflow = "visible";
      }
    });
  });
}
async function signIn(page: Page) {
  await unrollShell(page);
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
  // Choose only the categories this sample actually uses. Other suggestions
  // stay virtual and do not make empty rows in the budget photograph.
  for (const category of [
    "Rent / Mortgage",
    "Groceries",
    "Electric",
    "Dining Out",
    "Emergency Fund",
  ]) {
    await page.locator("details.add-group > summary").click();
    await page.getByRole("button", { name: `Add ${category}` }).click();
    await page.goto(route("/budget"));
  }
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

  for (const [category, amount] of [
    ["Emergency Fund", "5000.00"],
    ["Groceries", "600.00"],
  ] as const) {
    await page.goto(route("/budget"));
    await page
      .getByRole("region", { name: "Category ledger" })
      .getByRole("link", { name: category, exact: true })
      .click();
    const editor = panel(page, category).locator(".target-editor");
    await editor
      .getByLabel(`Target kind for ${category}`)
      .selectOption("MONTHLY");
    await editor.getByLabel(`Target amount for ${category}`).fill(amount);
    await editor.getByRole("button", { name: "Create target" }).click();
    await expect(
      editor.getByRole("button", { name: "Edit target" }),
    ).toBeVisible();
  }

  // Each debt's terms open in its drawer on the Debt page.
  for (const [account, apr, minimum] of [
    ["Everyday Card", "19.99", "35.00"],
    ["Car Loan", "6.49", "285.00"],
  ] as const) {
    await page.goto(route("/debt"));
    await page
      .getByRole("link", { name: `Edit ${account} terms`, exact: true })
      .click();
    const terms = page.locator("section.drawer");
    await terms.getByLabel("APR", { exact: true }).fill(apr);
    await terms
      .getByLabel("Fixed minimum (USD)", { exact: true })
      .fill(minimum);
    await save(terms, "Save terms");
  }
  await page.screenshot({
    path: info.outputPath("debt-terms-drawer.png"),
    fullPage: true,
  });
  await page.goto(route("/debt?view=schedule"));
  // Photograph the drawer once it has finished sliding in, at window size: a
  // full-page shot stitches the fixed drawer in faded.
  await page
    .locator("section.drawer")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: info.outputPath("debt-schedule-drawer.png") });
  await page.goto(route("/debt?view=plan&extra=100"));
  await page
    .locator("section.drawer")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({ path: info.outputPath("debt-plan-drawer.png") });

  // Six months of ordinary income and spending, so the report charts have
  // something to draw: a joint account opened seven months ago.
  {
    const db = getDb();
    const owner = await db.user.findFirstOrThrow({ where: { username: "owner" } });
    const { budgetId } = await db.budgetMember.findFirstOrThrow({
      where: { userId: owner.id },
    });
    const { executeFinance } = await import("../../src/application/finance");
    const { randomUUID } = await import("node:crypto");
    const run = (command: Record<string, unknown>) =>
      executeFinance(owner.id, budgetId, randomUUID(), command as never);
    const day = (monthsAgo: number, date: number) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - monthsAgo);
      d.setUTCDate(date);
      return d.toISOString().slice(0, 10);
    };
    const joint = await run({
      type: "account.create",
      name: "Joint Checking",
      accountType: "CHECKING",
      participation: "BUDGET",
      opening: "3000",
      date: day(7, 1),
    });
    const category = async (name: string) =>
      (await db.category.findFirstOrThrow({ where: { budgetId, name } })).id;
    const spend = {
      "Rent / Mortgage": [1450, 1450, 1450, 1450, 1450, 1450],
      Groceries: [512.4, 468.12, 531.9, 489.33, 544.8, 502.17],
      Electric: [88.2, 94.1, 121.45, 132.8, 101.3, 86.9],
      "Dining Out": [142.5, 96.3, 178.25, 121.6, 88.4, 154.75],
    };
    for (let ago = 6; ago >= 1; ago--) {
      await run({
        type: "transaction.create",
        accountId: joint.id,
        kind: "INCOME",
        date: day(ago, 1),
        amount: ago === 3 ? "4650.00" : "4200.00",
        payee: "Employer",
      });
      for (const [name, amounts] of Object.entries(spend)) {
        const value = amounts[6 - ago].toFixed(2);
        await run({
          type: "transaction.create",
          accountId: joint.id,
          kind: "EXPENSE",
          date: day(ago, name === "Rent / Mortgage" ? 2 : 14),
          amount: `-${value}`,
          payee: name === "Groceries" ? "Market Basket" : name === "Dining Out" ? "Corner Bistro" : name === "Electric" ? "City Power" : "Landlord",
          splits: [{ categoryId: await category(name), amount: `-${value}` }],
        });
      }
    }
  }

  for (const [path, name] of [
    ["/budget", "budget"],
    ["/accounts", "accounts"],
    ["/targets", "targets"],
    ["/debt", "debt"],
    ["/reports?tab=breakdown", "report-breakdown"],
    ["/reports?tab=trends", "report-trends"],
    ["/reports?tab=worth", "report-worth"],
    ["/reports?tab=income", "report-income"],
    ["/reports?tab=age", "report-age"],
    ["/reports?tab=cashflow", "report-cashflow"],
    ["/reports?tab=budget", "report-budget"],
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
    [route("/accounts/rules"), "rules"],
    [route("/reports"), "reports"],
    [route("/accounts/import"), "import"],
    [route("/accounts/export"), "export"],
    [route("/reports/forecast?months=6"), "forecast"],
    [route("/accounts/register"), "all-accounts"],
    [route("/accounts/payees"), "payees"],
    [route("/add"), "add"],
    [route("/plans"), "plans"],
    [route("/household"), "household"],
    [route("/guide"), "guide"],
  ] as const) {
    await page.goto(path);
    await page.screenshot({
      path: info.outputPath(`${name}-light.png`),
      fullPage: true,
    });
  }

  await page.goto(route("/budget"));
  // The category panel is where categories and targets are now edited.
  await page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("row")
    .filter({ has: page.getByRole("link") })
    .first()
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/inspect=/);
  const manager = page
    .locator("section")
    .filter({ has: page.locator("#inspector-heading") })
    .first();
  await manager.screenshot({ path: info.outputPath("management-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await manager.screenshot({ path: info.outputPath("management-mobile.png") });
  await page.screenshot({
    path: info.outputPath("budget-mobile.png"),
    fullPage: true,
  });
  // Every other route at phone width: nothing may scroll sideways.
  for (const [path, name] of [
    ["/accounts", "accounts"],
    [register!, "register"],
    ["/targets", "targets"],
    ["/debt", "debt"],
    ["/reports", "reports"],
    ["/reports?tab=trends", "report-trends"],
    ["/reports?tab=worth", "report-worth"],
    ["/reports?tab=income", "report-income"],
    ["/reports?tab=age", "report-age"],
    ["/reports?tab=cashflow", "report-cashflow"],
    ["/reports?tab=budget", "report-budget"],
    ["/reports/forecast?months=6", "forecast"],
    ["/accounts/schedules", "schedules"],
    ["/accounts/connections", "connections"],
    ["/add", "add"],
    ["/plans", "plans"],
    ["/household", "household"],
    ["/guide", "guide"],
  ] as const) {
    await page.goto(path === register ? path : route(path));
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width, `${name} scrolls sideways at 390px`).toBeLessThanOrEqual(390);
    await page.screenshot({
      path: info.outputPath(`${name}-mobile.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Native-resolution crop of the ledger, where column fit is easiest to misjudge.
  await page.goto(route("/budget"));
  await page
    .getByRole("region", { name: "Category ledger" })
    .screenshot({ path: info.outputPath("ledger-crop.png") });

  await page.getByRole("combobox", { name: "Theme" }).selectOption("dark");
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

/**
 * The phone app (owner decision 2026-09-28): a phone's own context, so the
 * server detects it, over the ledger seeded above. Each page and sheet in
 * both themes; nothing may scroll sideways.
 */
test("photographs the phone app", async ({ browser }, info) => {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Passphrase", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(page.locator("html")).toHaveAttribute("data-view", "phone");
  const { origin } = new URL(page.url());
  const db = getDb();
  const category = await db.category.findFirst({
    where: { system: false, archived: false },
  });
  const account = await db.financialAccount.findFirst({
    where: { deletedAt: null, closed: false },
  });
  for (const theme of ["light", "dark"]) {
    await context.addCookies([{ name: "mynab-theme", value: theme, url: origin }]);
    for (const [path, name] of [
      ["/budget", "budget"],
      ["/budget?sheet=rta", "budget-rta"],
      ...(category ? [[`/budget?inspect=${category.id}`, "budget-category"]] : []),
      ["/accounts", "accounts"],
      ...(account ? [[`/accounts/${account.id}`, "account"]] : []),
      ["/accounts/register", "register"],
      ["/add", "add"],
      ["/reports", "reports"],
      ["/reports?tab=trends", "report-trends"],
      ["/reports?tab=worth", "report-worth"],
      ["/reports?tab=income", "report-income"],
      ["/debt", "debt"],
      ["/accounts/rules", "desktop-only"],
    ] as [string, string][]) {
      await page.goto(route(path));
      await page.waitForTimeout(400);
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width, `phone ${name} scrolls sideways`).toBeLessThanOrEqual(390);
      await page.screenshot({
        path: info.outputPath(`phone-${name}-${theme}.png`),
        fullPage: true,
      });
    }
  }
  await context.close();
});
