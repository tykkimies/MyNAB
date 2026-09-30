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
  await expect(page.getByRole("combobox", { name: "Theme" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Hide amounts" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(1);
  // The menu is a sheet on screen, not clipped inside the top bar.
  await expect(
    page.getByRole("button", { name: "Use desktop site" }),
  ).toBeInViewport();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeInViewport();
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
  // Move part of it back to Ready to Assign, from the sheet's Move page.
  await sheet.getByRole("link", { name: /^Move money/ }).click();
  await expect(
    sheet.getByRole("heading", { name: "Move money", exact: true }),
  ).toBeVisible();
  await sheet.getByLabel(`Amount to move from ${name}`).fill("15");
  await sheet
    .getByLabel(`Move from ${name} to`)
    .selectOption({ label: "Ready to Assign" });
  await sheet.getByRole("button", { name: "Move", exact: true }).click();
  await expect(row.getByText("$25.00")).toBeVisible();
  // Back to the sheet, then its target page: the form is open at once.
  await sheet.getByRole("link", { name, exact: true }).click();
  await sheet.getByRole("link", { name: /^Target/ }).click();
  await expect(
    sheet.getByRole("heading", { name: "Add a target", exact: true }),
  ).toBeVisible();
  await sheet.getByLabel(`Target amount for ${name}`).fill("100");
  await sheet.getByRole("button", { name: "Create target" }).click();
  await expect(sheet.getByRole("button", { name: "Save target" })).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Remove target" }),
  ).toBeInViewport();
  await sheet.getByRole("link", { name, exact: true }).click();
  await expect(
    sheet.getByRole("link", { name: /^Target.*\$100\.00/ }),
  ).toBeVisible();
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
  // Only categories that still need money this month.
  await expect(
    page.locator(".phone-category").filter({ hasNotText: /more needed|Overspent/ }),
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
  // Edit is a page of the sheet, one tap away.
  await sheet.getByRole("link", { name: "Edit transaction" }).click();
  await expect(
    sheet.getByRole("heading", { name: "Edit transaction", exact: true }),
  ).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Save changes" })).toBeVisible();
  await sheet.getByRole("link", { name: "Back" }).click();
  await sheet.getByRole("link", { name: "Close" }).click();
  // ...and the rest at once.
  await page.getByRole("button", { name: /Approve all/ }).click();
  await expect(page.locator(".phone-row[data-unapproved]")).toHaveCount(0);
  // Search narrows the register.
  await page.getByLabel("Search transactions").fill("two");
  await page.getByLabel("Search transactions").press("Enter");
  await expect(page.locator(".phone-row")).toHaveCount(1);
});

test("selects several uncategorized expenses and shows available money", async ({ page }) => {
  await signIn(page);
  const db = getDb();
  const { budgetId } = await openPlan();
  const suffix = crypto.randomUUID().slice(0, 6);
  const date = new Date().toISOString().slice(0, 10);
  const group = await db.categoryGroup.create({ data: { budgetId, name: `Phone bulk ${suffix}` } });
  const needed = await db.category.create({ data: { budgetId, groupId: group.id, name: `Uncategorized ${suffix}`, system: true } });
  const category = await db.category.create({ data: { budgetId, groupId: group.id, name: `Groceries ${suffix}` } });
  const accountName = `Phone bulk account ${suffix}`;
  await command(page, { type: "account.create", name: accountName, accountType: "CHECKING", participation: "BUDGET", opening: "100", date });
  const account = await db.financialAccount.findFirstOrThrow({ where: { budgetId, name: accountName } });
  await command(page, { type: "assign", categoryId: category.id, month: date.slice(0, 7), amount: "25" });
  for (const [payee, amount] of [[`Apples ${suffix}`, "-4"], [`Bread ${suffix}`, "-6"]])
    await command(page, { type: "transaction.create", accountId: account.id, kind: "EXPENSE", date,
      amount, payee, splits: [{ categoryId: needed.id, amount }] });
  await page.goto(route(`/accounts/${account.id}`));
  await page.getByRole("link", { name: "2 need categories · Select transactions" }).click();
  await expect(page).toHaveURL(/review=needs-category/);
  await expect(page.locator(".phone-row")).toHaveCount(2);
  await page.getByRole("link", { name: "Select transactions" }).click();
  await page.getByRole("checkbox", { name: `Select Apples ${suffix} -$4.00` }).check();
  await page.getByRole("checkbox", { name: `Select Bread ${suffix} -$6.00` }).check();
  await page.locator("details.category-availability-popover > summary").click();
  await expect(page.getByRole("button", { name: new RegExp(`Groceries ${suffix}.*\\$25\\.00`) })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath("category-picker-phone.png") });
  await page.getByRole("button", { name: new RegExp(`Groceries ${suffix}.*\\$25\\.00`) }).click();
  await page.getByRole("button", { name: "Categorize 2" }).click();
  await expect(page.getByText("No categorisable transactions on this page.")).toBeVisible();
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

test("switches plans from the top bar", async ({ page }) => {
  await signIn(page);
  const { owner } = await openPlan();
  const { createPlan } = await import("../../src/application/plans");
  const name = `Phone Plan ${Math.random().toString(36).slice(2, 7)}`;
  await createPlan(owner.id, name);
  await page.reload();
  const switcher = page.locator("details.phone-plan");
  const current = (await switcher.locator("summary").innerText()).trim();
  await switcher.locator("summary").click();
  await expect(
    switcher.getByRole("heading", { name: "Switch plan" }),
  ).toBeVisible();
  await switcher
    .getByRole("button", { name: `Open ${name}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(switcher.locator("summary")).toHaveText(name);
  // And back, so the plan shown matches the one the other tests use.
  await switcher.locator("summary").click();
  await switcher
    .getByRole("button", { name: `Open ${current}`, exact: true })
    .click();
  await expect(switcher.locator("summary")).toHaveText(current);
});

test("offers Sync now for each bank connection", async ({ page }) => {
  await signIn(page);
  const { budgetId } = await openPlan();
  const name = `Phone Bank ${Math.random().toString(36).slice(2, 7)}`;
  await getDb().providerConnection.create({
    data: {
      budgetId,
      provider: "SIMPLEFIN",
      institutionId: "phone-test",
      institutionName: name,
      accessToken: "not-a-real-token",
      lastSyncedAt: new Date(Date.now() - 12 * 60_000),
    },
  });
  await page.goto(route("/accounts"));
  const sync = page.getByRole("region", { name: "Bank sync" });
  const row = sync.locator("li[data-connection]", { hasText: name });
  await expect(
    row.getByText(/Last synced .+, \d{1,2}:\d{2} [AP]M \(12 min ago\)/),
  ).toBeVisible();
  await expect(row.getByRole("button", { name: "Sync now" })).toBeVisible();
});

test("phone pages pass automated WCAG 2.1 AA checks", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);
  const { origin } = new URL(page.url());
  const problems: string[] = [];
  for (const theme of ["light", "dark", "parchment", "forest", "ocean", "plum"]) {
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

test("Budget review card opens only imports awaiting approval", async ({ page }) => {
  await signIn(page);
  await importedAccount();
  await page.reload();
  await expect(page.locator(".review-notice")).toContainText("new transactions to review");
  await page.locator(".review-notice").click();
  await expect(page).toHaveURL(/review=unapproved/);
  const initial = await page.locator(".phone-row").count();
  expect(initial).toBeGreaterThanOrEqual(2);
  await expect(page.locator(".phone-row:not([data-unapproved])")).toHaveCount(0);
  await page.locator(".phone-row").first().click();
  await page.locator(".drawer footer").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".phone-row")).toHaveCount(initial - 1);
  await expect(page.locator(".drawer")).toHaveCount(0);
  await page.getByRole("button", { name: /Approve all/ }).click();
  await expect(page.getByText("You’re all caught up")).toBeVisible();
  await tabBar(page).getByRole("link", { name: "Budget", exact: true }).click();
  await expect(page.locator(".review-notice")).toHaveCount(0);
});

test("phone sheets isolate touches, scroll and dismiss by dragging", async ({ page }, info) => {
  await signIn(page);
  const name = await phoneCategory(page);
  await page.reload();
  const opener = page.locator(".phone-category", { hasText: name });
  await opener.click();
  const sheet = page.locator(".drawer");
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(page.locator(".phone-sheet-backdrop")).toHaveCount(1);
  await expect.poll(async () => (await sheet.boundingBox())?.height).toBeGreaterThan(page.viewportSize()!.height * 0.85);
  await expect(tabBar(page)).toHaveAttribute("inert", "");
  await page.screenshot({ animations: "disabled", path: info.outputPath("tall-sheet-light.png") });
  const cdp = await page.context().newCDPSession(page);
  const box = (await sheet.locator(".phone-sheet-handle").boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 110 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".phone-sheet-backdrop")).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".phone-sheet-backdrop")).toHaveCount(0);
  await page.getByLabel("Account and settings").click();
  const menu = page.locator(".phone-account .popover-panel");
  await expect(menu).toHaveAttribute("aria-modal", "true");
  await menu.getByRole("combobox", { name: "Theme" }).selectOption("forest");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "forest");
  await page.screenshot({ animations: "disabled", path: info.outputPath("menu-forest.png") });
  await menu.getByRole("combobox", { name: "Theme" }).selectOption("dark");
  await page.screenshot({ animations: "disabled", path: info.outputPath("menu-dark.png") });
  await menu.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".phone-account")).not.toHaveAttribute("open", "");
  await expect(page.locator(".phone-sheet-backdrop")).toHaveCount(0);
  await page.getByLabel("Account and settings").click();
  await expect(menu).toHaveAttribute("aria-modal", "true");
  await page.screenshot({ animations: "disabled", path: info.outputPath("menu-dark.png") });
  const menuHandle = (await menu.locator(".phone-sheet-handle").boundingBox())!;
  const mx = menuHandle.x + 40, my = menuHandle.y + 14;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mx, y: my }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mx, y: my + 110 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".phone-sheet-backdrop")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await opener.click();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await page.screenshot({ animations: "disabled", path: info.outputPath("tall-sheet-dark.png") });
  await sheet.getByRole("link", { name: "Close", exact: true }).click();
  await expect(sheet).toHaveCount(0);
});

test("review eligibility, pagination and search share the approval set", async ({ page }) => {
  await signIn(page);
  const account = await importedAccount();
  const { owner, budgetId } = await openPlan();
  const { commitImport } = await import("../../src/application/imports");
  const { executeFinance } = await import("../../src/application/finance");
  const date = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await commitImport(owner.id, budgetId, {
    accountId: account.id,
    content: Array.from({ length: 55 }, (_, i) => `${date},Queue ${i},3.00`).join("\n"),
    mapping: { header: false, date: 0, dateFormat: "YYYY-MM-DD", payee: 1, amount: 2 },
  });
  const db = getDb();
  const entries = await db.ingestedEntry.findMany({ where: { budgetId, payee: { startsWith: "Queue " } }, orderBy: { payee: "asc" } });
  expect(entries).toHaveLength(55);
  await db.ingestedEntry.update({ where: { id: entries[0].id }, data: { removed: true } });
  await db.ingestedEntry.update({ where: { id: entries[1].id }, data: { approved: true } });
  await db.ingestedEntry.update({ where: { id: entries[2].id }, data: { status: "PENDING" } });
  await db.ingestedEntry.update({ where: { id: entries[3].id }, data: { review: { kind: "remove", id: crypto.randomUUID() } } });
  await executeFinance(owner.id, budgetId, crypto.randomUUID(), { type: "transaction.void", id: entries[4].transactionId!, reason: "Review test", acknowledgeReconciled: true });
  await page.goto(route("/budget"));
  await expect(page.locator(".review-notice")).toContainText("52 new transactions");
  // Another plan cannot see this queue.
  const { createPlan } = await import("../../src/application/plans");
  const other = await createPlan(owner.id, "Empty review plan");
  const response = await page.request.post(route("/api/plans"), {
    headers: { Origin: new URL(page.url()).origin, Accept: "application/json" },
    form: { intent: "select", budgetId: other.id },
  });
  expect(response.ok()).toBe(true);
  await page.reload();
  await expect(page.locator(".review-notice")).toHaveCount(0);
  await page.request.post(route("/api/plans"), {
    headers: { Origin: new URL(page.url()).origin, Accept: "application/json" },
    form: { intent: "select", budgetId },
  });
  await page.goto(route(`/accounts/register?review=unapproved&account=${account.id}`));
  await expect(page.locator(".phone-row")).toHaveCount(50);
  await page.getByRole("link", { name: "Show older transactions" }).click();
  await expect(page.locator(".phone-row")).toHaveCount(52);
  for (const excluded of entries.slice(0, 5))
    await expect(page.locator(".phone-row").filter({ has: page.getByText(excluded.payee, { exact: true }) })).toHaveCount(0);
  await page.getByLabel("Search transactions").fill("Phone one");
  await page.getByLabel("Search transactions").press("Enter");
  await expect(page.locator(".phone-row")).toHaveCount(1);
  await page.getByRole("button", { name: /Approve all/ }).click();
  await expect(page.locator(".phone-row")).toHaveCount(0);
  await page.goto(route("/budget"));
  await expect(page.locator(".review-notice")).toContainText("51 new transactions");
});

test("small sheets keep scrolling separate from dismissal and block backdrop taps", async ({ page }, info) => {
  await signIn(page);
  await page.setViewportSize({ width: 320, height: 568 });
  const category = await phoneCategory(page);
  await importedAccount();
  await page.goto(route("/budget"));
  await page.screenshot({ animations: "disabled", path: info.outputPath("review-card-small.png") });
  await page.locator(".review-notice").click();
  await page.getByLabel("Search transactions").fill("Phone one");
  await page.getByLabel("Search transactions").press("Enter");
  await page.locator(".phone-row").filter({ hasText: "Phone one" }).first().click();
  const sheet = page.locator(".drawer");
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(sheet.getByText("Category needed", { exact: true })).toBeVisible();
  await expect(sheet.locator("footer button")).toBeInViewport();
  await page.screenshot({ animations: "disabled", path: info.outputPath("transaction-small.png") });
  const a11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(a11y.violations).toEqual([]);
  const cdp = await page.context().newCDPSession(page);
  async function drag(x: number, y: number, dx: number, dy: number, cancel = false) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx, y: y + dy }] });
    await cdp.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  }
  const handle = (await sheet.locator(".phone-sheet-handle").boundingBox())!;
  const x = handle.x + 100, y = handle.y + 14;
  await drag(x, y, 0, 12);
  await expect.poll(() => sheet.evaluate(e => getComputedStyle(e).transform)).toBe("none");
  await drag(x, y, 0, 110, true);
  await expect.poll(() => sheet.evaluate(e => getComputedStyle(e).transform)).toBe("none");
  await drag(x, y, 90, 10);
  await expect(sheet).toBeVisible();
  // Scroll inside the sheet; a gesture begun away from the top must not dismiss it.
  const body = sheet.locator(":scope > div");
  await body.evaluate(e => { e.scrollTop = 50; });
  await expect.poll(() => body.evaluate(e => e.scrollTop)).toBeGreaterThan(0);
  const bounds = (await body.boundingBox())!;
  await drag(bounds.x + 6, bounds.y + 35, 0, 100);
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("footer button")).toBeInViewport();
  // A tap aimed at the page header dismisses only the sheet, never opening its menu.
  await page.touchscreen.tap(290, 20);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("details.popover[open]")).toHaveCount(0);
  await page.setViewportSize({ width: 430, height: 932 });
  await page.locator(".phone-row").filter({ hasText: "Phone one" }).first().click();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await page.screenshot({ animations: "disabled", path: info.outputPath("transaction-large.png") });
  // Keyboard-sized viewport keeps the primary action accessible.
  await page.setViewportSize({ width: 430, height: 420 });
  await expect(sheet.locator("footer button")).toBeInViewport();
  await sheet.getByRole("link", { name: "Change category" }).click();
  await expect(sheet.getByRole("heading", { name: "Edit transaction", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/review=unapproved/);
  await sheet.getByRole("link", { name: "Back", exact: true }).click();
  await expect(sheet.getByRole("heading", { name: "Phone one", exact: true })).toBeVisible();
  await sheet.getByRole("link", { name: "Change category" }).click();
  await sheet.getByLabel("Category 1", { exact: true }).selectOption({ label: category });
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(/review=unapproved/);
});
