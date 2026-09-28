import "../database-env";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getDb } from "../../src/infrastructure/db";

/**
 * The phone app (owner decision 2026-09-28): a phone gets its own frame and
 * pages, detected on the server, with a remembered switch to the desktop
 * site. Runs in the `phone` project only, after the other projects.
 */
const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await getDb().loginThrottle.deleteMany();
});
test.afterAll(async () => {
  await getDb().$disconnect();
});
async function signIn(page: Page) {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("synthetic-e2e-passphrase-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
}
/**
 * The owner and the plan the app has open for them. Other suites create more
 * plans, so "the first budget" is not necessarily the one on screen.
 */
async function openPlan() {
  const owner = await getDb().user.findFirstOrThrow({
    where: { username: "owner" },
  });
  const { activeBudget } = await import("../../src/application/plans");
  const budget = await activeBudget(owner.id);
  if (!budget) throw new Error("No open plan");
  return { owner, budgetId: budget.id };
}
/** Runs one finance command as the signed-in owner, as a form would. */
async function command(page: Page, cmd: Record<string, unknown>) {
  const { budgetId } = await openPlan();
  const budget = { id: budgetId };
  const { origin } = new URL(page.url());
  const response = await page.request.post(route("/api/finance"), {
    headers: { Origin: origin, "Content-Type": "application/json" },
    data: { budgetId: budget.id, key: crypto.randomUUID(), command: cmd },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
/** A new, empty category in the phone's own group, so reruns start clean. */
async function phoneCategory(page: Page) {
  const db = getDb();
  const { budgetId } = await openPlan();
  let group = await db.categoryGroup.findFirst({
    where: { name: "Phone", budgetId },
  });
  if (!group) {
    await command(page, { type: "group.create", name: "Phone" });
    group = await db.categoryGroup.findFirstOrThrow({
      where: { name: "Phone", budgetId },
    });
  }
  const name = `Rent ${Math.random().toString(36).slice(2, 7)}`;
  await command(page, { type: "category.create", name, groupId: group.id });
  return name;
}
const tabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Main navigation" });

test("a phone gets the phone app frame", async ({ page }) => {
  await signIn(page);
  await expect(page.locator("html")).toHaveAttribute("data-view", "phone");
  const tabs = tabBar(page);
  for (const name of ["Budget", "Accounts", "Debt", "Reports"])
    await expect(tabs.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(
    tabs.getByRole("link", { name: "Add transaction", exact: true }),
  ).toBeVisible();
  // No desktop rail or Manage links on the phone.
  await expect(page.getByRole("link", { name: "Rules" })).toHaveCount(0);
  await expect(page.locator(".phone-tabbar")).toBeInViewport();
  const width = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("settings live in the account menu", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("Account and settings").click();
  await expect(page.getByRole("button", { name: "Dark theme" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Hide amounts" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Use desktop site" }),
  ).toBeVisible();
});

test("desktop-only pages point to the desktop site", async ({ page }) => {
  await signIn(page);
  for (const path of ["/accounts/rules", "/targets", "/plans"]) {
    await page.goto(route(path));
    await expect(
      page.getByRole("heading", { name: "On the desktop site", exact: true }),
    ).toBeVisible();
  }
  // Client-side navigation back into a phone area shows the page again.
  await tabBar(page).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(
    page.getByRole("heading", { name: "On the desktop site" }),
  ).toHaveCount(0);
});

test("switches to the desktop site and back", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/accounts/rules"));
  await page
    .getByRole("main")
    .getByRole("button", { name: "Use desktop site" })
    .click();
  await expect(page.locator("html")).not.toHaveAttribute("data-view", "phone");
  await expect(page.getByRole("heading", { name: "Rules", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).not.toHaveAttribute("data-view", "phone");
  await page.getByRole("button", { name: "Phone site" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-view", "phone");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-view", "phone");
});

test("budgets a category from its sheet", async ({ page }) => {
  await signIn(page);
  const name = await phoneCategory(page);
  await page.reload();
  await expect(page.locator(".phone-rta")).toBeVisible();
  const row = page.locator(".phone-category", { hasText: name });
  await row.click();
  const sheet = page.locator("section.drawer");
  await expect(
    sheet.getByRole("heading", { name: name, exact: true }),
  ).toBeVisible();
  await sheet.getByLabel(`Assign to ${name}`).fill("40");
  await sheet.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(sheet.getByText("$40.00").first()).toBeVisible();
  await expect(row.getByText("$40.00")).toBeVisible();
  // Move part of it back to Ready to Assign.
  await sheet.getByLabel(`Amount to move from ${name}`).fill("15");
  await sheet
    .getByLabel(`Move from ${name} to`)
    .selectOption({ label: "Ready to Assign" });
  await sheet.getByRole("button", { name: "Move", exact: true }).click();
  await expect(row.getByText("$25.00")).toBeVisible();
  await sheet.getByRole("link", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
});

test("filters the budget and opens Ready to Assign", async ({ page }) => {
  await signIn(page);
  await page
    .getByRole("navigation", { name: "Show categories" })
    .getByRole("link", { name: "Underfunded" })
    .click();
  await expect(page).toHaveURL(/view=UNDERFUNDED/);
  await expect(
    page.locator(".phone-category", { hasText: /^Rent / }),
  ).toHaveCount(0);
  await page.locator(".phone-rta").click();
  const sheet = page.locator("section.drawer");
  await expect(
    sheet.getByRole("heading", { name: "Ready to Assign", exact: true }),
  ).toBeVisible();
  await expect(
    sheet.getByRole("heading", { name: "Assign to a category" }),
  ).toBeVisible();
});

/** A new budget account with two unapproved imports, as the bank sends them. */
async function importedAccount() {
  const { owner, budgetId } = await openPlan();
  const { executeFinance } = await import("../../src/application/finance");
  const { commitImport } = await import("../../src/application/imports");
  const day = (n: number) =>
    new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const name = `Phone Checking ${Math.random().toString(36).slice(2, 7)}`;
  const account = await executeFinance(owner.id, budgetId, crypto.randomUUID(), {
    type: "account.create",
    name,
    accountType: "CHECKING",
    participation: "BUDGET",
    opening: "500",
    date: day(10),
  });
  await commitImport(owner.id, budgetId, {
    accountId: account.id,
    content: `${day(3)},Phone one,-1.00\n${day(2)},Phone two,-2.00\n`,
    mapping: { header: false, date: 0, dateFormat: "YYYY-MM-DD", payee: 1, amount: 2 },
  });
  return { id: account.id as string, name };
}

test("lists accounts and approves imports in the register", async ({ page }) => {
  await signIn(page);
  const account = await importedAccount();
  await tabBar(page).getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page.getByText("Net worth", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(account.name) }).click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${account.id}$`));
  await expect(
    page.getByRole("heading", { name: account.name, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("2 new transactions to approve")).toBeVisible();
  await expect(page.locator(".phone-row[data-unapproved]")).toHaveCount(2);
  // One from its sheet...
  await page.locator(".phone-row", { hasText: "Phone one" }).click();
  const sheet = page.locator("section.drawer");
  await expect(
    sheet.getByRole("heading", { name: "Phone one", exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".phone-row[data-unapproved]")).toHaveCount(1);
  await sheet.getByRole("link", { name: "Close" }).click();
  // ...and the rest at once.
  await page.getByRole("button", { name: /Approve all/ }).click();
  await expect(page.locator(".phone-row[data-unapproved]")).toHaveCount(0);
  // Search narrows the register.
  await page.getByLabel("Search transactions").fill("two");
  await page.getByLabel("Search transactions").press("Enter");
  await expect(page.locator(".phone-row")).toHaveCount(1);
});

test("adds a transaction from the plus button and from a register", async ({
  page,
}) => {
  await signIn(page);
  const account = await importedAccount();
  const category = await phoneCategory(page);
  await tabBar(page)
    .getByRole("link", { name: "Add transaction", exact: true })
    .click();
  const form = page.getByRole("region", { name: "New transaction" });
  await form.getByLabel("Amount (USD)").fill("12.34");
  await form.getByLabel("Payee").fill("Phone Cafe");
  await form.getByLabel("Account").selectOption({ label: account.name });
  await form.getByLabel("Category").selectOption({ label: category });
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(form.getByText("Saved.")).toBeVisible();
  // From the register, Add starts on that account and comes back to it.
  await page.goto(route(`/accounts/${account.id}`));
  await expect(page.locator(".phone-row", { hasText: "Phone Cafe" })).toBeVisible();
  await page.getByRole("link", { name: "Add", exact: true }).click();
  await expect(form.getByLabel("Account")).toHaveValue(account.id);
  await form.getByLabel("Amount (USD)").fill("5");
  await form.getByText("Inflow (received)").click();
  await form.getByLabel("Payee").fill("Phone Refund");
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(page).toHaveURL(new RegExp(`/accounts/${account.id}$`));
  await expect(
    page.locator(".phone-row", { hasText: "Phone Refund" }),
  ).toBeVisible();
});

test("shows each report with its headline and chart", async ({ page }) => {
  await signIn(page);
  await tabBar(page).getByRole("link", { name: "Reports", exact: true }).click();
  const reports = page.getByRole("navigation", { name: "Reports" });
  const cases = [
    ["Spending", "Spent"],
    ["Trends", "Average a month"],
    ["Net worth", "Net worth"],
    ["Income v Expense", "Income minus spending"],
  ] as const;
  for (const [tab, headline] of cases) {
    await reports.getByRole("link", { name: tab, exact: true }).click();
    await expect(
      reports.getByRole("link", { name: tab, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.locator(".phone-hero").getByText(headline, { exact: true }),
    ).toBeVisible();
  }
  // A period preset keeps the tab.
  await page
    .getByRole("navigation", { name: "Report period" })
    .getByRole("link", { name: "12 months" })
    .click();
  await expect(page).toHaveURL(/tab=income/);
  await expect(page.locator("figure.report-chart, .report-chart").first()).toBeVisible();
  // A spending group opens its categories.
  await reports.getByRole("link", { name: "Spending", exact: true }).click();
  const group = page
    .getByRole("region", { name: "Spending by group" })
    .locator(".phone-row")
    .first();
  if (await group.count()) {
    await group.click();
    await expect(page.locator("section.drawer")).toBeVisible();
  }
});

test("reads the payoff plan and ticks off a bank reminder", async ({ page }) => {
  await signIn(page);
  const db = getDb();
  const { owner, budgetId } = await openPlan();
  const { executeFinance } = await import("../../src/application/finance");
  const name = `Phone Card ${Math.random().toString(36).slice(2, 7)}`;
  const card = await executeFinance(owner.id, budgetId, crypto.randomUUID(), {
    type: "account.create",
    name,
    accountType: "CREDIT_CARD",
    participation: "BUDGET",
    opening: "-900",
    date: new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10),
  });
  await executeFinance(owner.id, budgetId, crypto.randomUUID(), {
    type: "debt.terms.set",
    accountId: card.id,
    apr: "24",
    minimumPayment: "35",
    dueDay: 28,
  });
  const text = `Check the rate on ${name}`;
  await db.debtReminder.create({
    data: {
      budgetId,
      accountId: card.id,
      kind: "TERMS_CHECK",
      dedupeKey: `phone-${card.id}`,
      level: "review",
      text,
    },
  });
  await tabBar(page).getByRole("link", { name: "Debt", exact: true }).click();
  await expect(page.getByText("Total owed", { exact: true })).toBeVisible();
  const reminder = page.locator("li[data-reminder]", { hasText: text });
  await expect(reminder).toBeVisible();
  await reminder.getByRole("button", { name: "Rates unchanged" }).click();
  await expect(reminder).toHaveCount(0);
  await page.locator(".phone-row", { hasText: name }).click();
  const sheet = page.locator("section.drawer");
  await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(sheet.getByText("24.00%")).toBeVisible();
});

test("phone pages pass automated WCAG 2.1 AA checks", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { origin } = new URL(page.url());
  const problems: string[] = [];
  for (const theme of ["light", "dark"]) {
    await page
      .context()
      .addCookies([{ name: "mynab-theme", value: theme, url: origin }]);
    for (const path of [
      "/budget",
      "/accounts",
      "/accounts/register",
      "/add",
      "/debt",
      "/reports",
      "/reports?tab=trends",
      "/reports?tab=worth",
      "/reports?tab=income",
      "/targets",
    ]) {
      await page.goto(route(path));
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      for (const v of result.violations)
        problems.push(
          `${path} [${theme}] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
        );
    }
  }
  expect(problems).toEqual([]);
});
