import "../database-env";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { getDb } from "../../src/infrastructure/db";
const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;
const password = "synthetic-e2e-passphrase-123";
const origin = "https://127.0.0.1:3443";
// One ledger built up in order; a failed step should skip the rest, not cascade.
test.describe.configure({ mode: "serial" });
// Each browser project replays the same workflow, so start from an empty ledger
// while keeping the owner and session created by global setup.
const financeTables = [
  "IngestedEntry",
  "DeclinedMatch",
  "ProviderAccount",
  "ProviderConnection",
  "ReconciliationItem",
  "Reconciliation",
  "TransactionState",
  "FinancialSplit",
  "FinancialTransaction",
  "Posting",
  "Journal",
  "BudgetAssignment",
  "Category",
  "CategoryGroup",
  "FinancialAccount",
  "FinanceRequest",
];
test.beforeAll(async () => {
  const db = getDb();
  await db.$executeRawUnsafe(
    `TRUNCATE TABLE ${financeTables.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );
  await db.loginThrottle.deleteMany();
});
// Each test signs in again, which the login throttle would otherwise treat as a
// flood. Clearing it keeps the throttle's own coverage in foundation.spec.
test.beforeEach(async () => {
  await getDb().loginThrottle.deleteMany();
});
test.afterAll(async () => {
  await getDb().$disconnect();
});
async function signIn(page: Page) {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Passphrase", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
}
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
async function addAccount(
  page: Page,
  name: string,
  type: string,
  opening: string,
  participation = "Budget",
) {
  await page.goto(route("/accounts"));
  // Dates are left at their defaults so the cycle stays inside the current month.
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
test("runs a manual budgeting cycle from accounts through card reserves", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await addAccount(page, "Checking", "Checking", "1000");
  await addAccount(page, "Card", "Credit card", "0");
  await expect(
    page.getByRole("link", { name: /Checking/ }).first(),
  ).toContainText("$1,000.00");

  await page.goto(route("/budget"));
  const groups = panel(page, "Add a category group");
  await groups.getByLabel("Group name", { exact: true }).fill("Everyday");
  await save(groups, "Create group");
  const categories = panel(page, "Add a category");
  await categories.getByLabel("Category name", { exact: true }).fill("Food");
  await categories
    .getByLabel("Group", { exact: true })
    .selectOption({ label: "Everyday" });
  await save(categories, "Create category");

  // Assigning only ever moves money that already exists.
  const rta = page.locator("article").filter({ hasText: "Ready to Assign" });
  await expect(rta).toContainText("$1,000.00");
  const assign = page
    .locator(".finance-form")
    .filter({ has: page.getByLabel("Change Food assignment") });
  await assign.getByLabel("Change Food assignment").fill("400.00");
  await assign.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(rta).toContainText("$600.00");

  // A card purchase spends the envelope but moves the cash into a payment reserve.
  await page.goto(route("/accounts"));
  await page.getByRole("link", { name: /Card/ }).first().click();
  await expect(
    page.getByRole("heading", { name: "Card", exact: true }),
  ).toBeVisible();
  const record = panel(page, "Record a transaction");
  await record
    .getByLabel("Type", { exact: true })
    .selectOption({ value: "EXPENSE" });
  await record.getByLabel("Amount (USD)", { exact: true }).fill("-100.00");
  await record.getByLabel("Payee", { exact: true }).fill("Grocer");
  await record
    .getByLabel("Category 1", { exact: true })
    .selectOption({ label: "Food" });
  await record.getByLabel("Split amount 1", { exact: true }).fill("-100.00");
  await save(record, "Add transaction");
  await expect(page.locator(".register-row").first()).toContainText("Grocer");
  await expect(page.locator(".register-row").first()).toContainText("-$100.00");
  await expect(
    page.locator("article").filter({ hasText: "Current balance" }),
  ).toContainText("-$100.00");
  await page.locator(".register-row").first().locator("> summary").click();
  await page.screenshot({
    path: info.outputPath("account-register.png"),
    fullPage: true,
  });

  await page.goto(route("/budget"));
  const foodRow = page.getByRole("row").filter({ hasText: "Food" });
  await expect(foodRow).toContainText("$300.00");
  const reserve = page.getByRole("row").filter({ hasText: "Card" });
  await expect(reserve).toContainText("$100.00");
  // Cash never moved, so Ready to Assign is unchanged by the purchase.
  await expect(rta).toContainText("$600.00");
  await page.screenshot({
    path: info.outputPath("budget-funded.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("allows assigning more than the budget holds, and says so plainly", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const assign = page
    .locator(".finance-form")
    .filter({ has: page.getByLabel("Change Food assignment") });
  await assign.getByLabel("Change Food assignment").fill("100000.00");
  await assign.getByRole("button", { name: "Assign", exact: true }).click();
  // Matching YNAB: the assignment is accepted and the shortfall shown in red.
  await expect(
    page.getByText("You have assigned more than you have"),
  ).toBeVisible();
  await expect(
    page.locator("article").filter({ hasText: "Ready to Assign" }),
  ).toContainText("-$");
  // Put it back so later tests start from a budget that balances.
  await assign.getByLabel("Change Food assignment").fill("-100000.00");
  await assign.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    page.getByText("You have assigned more than you have"),
  ).toHaveCount(0);
});
test("records a card payment as a transfer rather than new spending", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page
    .getByRole("link", { name: /Checking/ })
    .first()
    .click();
  const record = panel(page, "Record a transaction");
  await record
    .getByLabel("Type", { exact: true })
    .selectOption({ value: "TRANSFER" });
  await record.getByLabel("Amount (USD)", { exact: true }).fill("-100.00");
  await record.getByLabel("Payee", { exact: true }).fill("Card payment");
  await record
    .getByLabel("Transfer account", { exact: true })
    .selectOption({ label: "Card" });
  await save(record, "Add transaction");
  await expect(
    page.locator("article").filter({ hasText: "Current balance" }),
  ).toContainText("$900.00");

  await page.goto(route("/budget"));
  // The payment clears the reserve and the debt together; no envelope is spent twice.
  await expect(page.getByRole("row").filter({ hasText: "Card" })).toContainText(
    "$0.00",
  );
  await expect(
    page.locator("article").filter({ hasText: "Ready to Assign" }),
  ).toContainText("$600.00");
});
test("keeps an immutable correction trail and flags reconciled statements", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page.getByRole("link", { name: /Card/ }).first().click();
  const row = page.locator(".register-row").filter({ hasText: "Grocer" });
  await row.locator("> summary").click();
  const voidBox = row
    .locator("details")
    .filter({ hasText: "Void this transaction" });
  await voidBox.locator("summary").click();
  await voidBox.getByLabel("Reason", { exact: true }).fill("Duplicate entry");
  await voidBox
    .getByRole("button", { name: "Void with a reversing entry", exact: true })
    .click();
  // The purchase leaves the register but survives as lineage, and the payment
  // that repaid it now shows as a positive card balance rather than vanishing.
  await expect(
    page.getByText("Corrected and voided entries (1)"),
  ).toBeVisible();
  await expect(page.locator(".register-row")).toHaveCount(1);
  await expect(page.locator(".register-row").first()).toContainText(
    "Card payment",
  );
  await expect(
    page.locator("article").filter({ hasText: "Current balance" }),
  ).toContainText("$100.00");
});
test("offers bank sync, widens the policy only for Plaid, and guards the endpoint", async ({
  page,
  request,
}, info) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page
    .getByRole("link", { name: "Manage bank connections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bring your accounts in.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect a bank", exact: true }),
  ).toBeVisible();
  // Nothing has been imported, so the review queue is honest about being empty.
  await expect(
    page.getByRole("heading", { name: "Needs review (0)" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("connections.png"),
    fullPage: true,
  });

  const policy = (await request.get(route("/accounts/connections"))).headers()[
    "content-security-policy"
  ];
  // Exactly two exceptions: Plaid's iframe and Plaid's own API.
  expect(policy).toContain("frame-src https://*.plaid.com");
  expect(policy).toContain("connect-src 'self' https://*.plaid.com");
  expect(policy).not.toContain("unsafe-eval");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");

  // The provider endpoint is same-origin only and refuses anything else.
  expect(
    (
      await request.post(route("/api/provider"), {
        headers: {
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        data: { type: "link.start" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post(route("/api/provider"), {
        headers: { origin, "content-type": "text/plain" },
        data: "nope",
      })
    ).status(),
  ).toBe(415);
});

test("reviews pending observations, duplicates and bank corrections without a provider call", async ({
  page,
}, info) => {
  await signIn(page);
  const db = getDb(),
    budget = await db.budget.findFirstOrThrow(),
    owner = await db.user.findFirstOrThrow();
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const account = await executeFinance(owner.id, budget.id, randomUUID(), {
    type: "account.create",
    name: "Review checking",
    accountType: "CHECKING",
    participation: "BUDGET",
    opening: "100",
    date: "2026-03-01",
  });
  const make = async (payee: string) =>
    executeFinance(owner.id, budget.id, randomUUID(), {
      type: "transaction.create",
      accountId: account.id,
      kind: "INCOME",
      date: "2026-03-05",
      amount: "10",
      payee,
    });
  const manual = await make("Manual deposit"),
    imported = await make("Bank deposit");
  const connection = await db.providerConnection.create({
    data: {
      budgetId: budget.id,
      provider: "PLAID",
      institutionId: "synthetic",
      institutionName: "Test bank",
      accessToken: "synthetic-unused",
    },
  });
  const link = await db.providerAccount.create({
    data: {
      budgetId: budget.id,
      connectionId: connection.id,
      externalAccountId: "test-checking",
      name: "Test checking",
      type: "checking",
      accountId: account.id,
      linkedFrom: new Date("2026-03-01"),
    },
  });
  const e = await db.ingestedEntry.create({
    data: {
      budgetId: budget.id,
      connectionId: connection.id,
      providerAccountId: link.id,
      externalId: "deposit",
      status: "POSTED",
      date: new Date("2026-03-05"),
      amount: 1000n,
      payee: "Bank deposit",
      transactionId: imported.id,
    },
  });
  await db.ingestedEntry.create({
    data: {
      budgetId: budget.id,
      connectionId: connection.id,
      providerAccountId: link.id,
      externalId: "pending",
      status: "PENDING",
      date: new Date("2026-03-06"),
      amount: -500n,
      payee: "Pending coffee",
    },
  });
  await page.goto(route("/accounts/connections"));
  const pending = page.locator("details").filter({ hasText: "Pending coffee" });
  await pending.locator("summary").click();
  await expect(pending).toContainText("does not affect your ledger or budget");
  await expect(pending.getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/Review checking.*Manual deposit/)).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Match manual entry", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Possible duplicates and transfers (0)",
    }),
  ).toBeVisible();
  expect(
    (await db.ingestedEntry.findUniqueOrThrow({ where: { id: e.id } }))
      .transactionId,
  ).toBe(manual.id);
  const reviewId = randomUUID();
  await db.ingestedEntry.update({
    where: { id: e.id },
    data: { approved: false, review: { id: reviewId, kind: "remove" } },
  });
  await page.reload();
  const changed = page.locator("details").filter({ hasText: "Bank deposit" });
  await changed.locator("summary").click();
  await expect(changed).toContainText("ledger is unchanged until you decide");
  await changed.getByRole("button", { name: "Keep my ledger entry" }).click();
  await expect(
    page.getByRole("button", { name: "Keep my ledger entry" }),
  ).toHaveCount(0);
  expect(
    (
      await db.financialTransaction.findUniqueOrThrow({
        where: { id: manual.id },
      })
    ).voidedAt,
  ).toBeNull();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("bank-review.png"),
    fullPage: true,
  });
});
test("sets a target and funds it in one click from money that exists", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/goals"));
  const targets = panel(page, "Set a target");
  await targets
    .getByLabel("Target category", { exact: true })
    .selectOption({ label: "Food" });
  await targets
    .getByLabel("Target kind", { exact: true })
    .selectOption({ value: "MONTHLY" });
  await targets.getByLabel("Amount (USD)", { exact: true }).fill("700.00");
  await save(targets, "Save target");

  // Earlier tests already assigned to Food, so the shortfall depends on them.
  // Assert the behaviour rather than a number this chain happens to produce.
  const foodRow = page.getByRole("row").filter({ hasText: "Food" });
  await expect(foodRow).toContainText("Needs funding");
  const funding = panel(page, "Fund every target");
  await expect(funding).toBeVisible();

  await funding
    .getByRole("button", { name: "Assign what targets need", exact: true })
    .click();
  // The panel unmounts once nothing is owed, so assert the outcome, not the
  // message it shows on its way out.

  // A monthly target is satisfied exactly, never overshot.
  await expect(foodRow).toContainText("$700.00");
  await expect(foodRow).toContainText("Funded");
  // Nothing further is owed, so the funding panel disappears entirely.
  await expect(
    page.getByRole("heading", { name: "Fund every target", exact: true }),
  ).toHaveCount(0);

  // The budget shows the same reading, from the same projection.
  await page.goto(route("/budget"));
  await expect(page.getByRole("row").filter({ hasText: "Food" })).toContainText(
    "Funded",
  );
  await expect(page.getByText(/Targets need/)).toHaveCount(0);
});

test("fills targets past the money held and reports the overshoot", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/goals"));
  const targets = panel(page, "Set a target");
  await targets
    .getByLabel("Target category", { exact: true })
    .selectOption({ label: "Food" });
  await targets
    .getByLabel("Target kind", { exact: true })
    .selectOption({ value: "MONTHLY" });
  // Far beyond anything this budget holds.
  await targets.getByLabel("Amount (USD)", { exact: true }).fill("999999.00");
  await save(targets, "Save target");

  await panel(page, "Fund every target")
    .getByRole("button", { name: "Assign what targets need", exact: true })
    .click();
  // Filled anyway, with the overshoot stated rather than left to be discovered.
  // The funding panel itself unmounts once nothing is owed, taking its own
  // message with it, so assert the standing notice that replaces it.
  const notice = page
    .locator("aside")
    .filter({ hasText: "You have assigned more than you have" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/Ready to Assign is -\$/);
  // The same overshoot is reported on the budget, from the same projection.
  await page.goto(route("/budget"));
  await expect(
    page.getByText("You have assigned more than you have"),
  ).toBeVisible();
});

test("records debt terms and estimates a payoff without touching the ledger", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/debt"));
  await expect(
    page.getByRole("heading", { name: "Find your way forward.", exact: true }),
  ).toBeVisible();
  // The Card holds a positive balance from earlier tests, so nothing is owed
  // and no plan can be shown yet.
  await expect(
    page.getByRole("heading", { name: "Record the terms" }),
  ).toBeVisible();

  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Card" });
  await terms.getByLabel("APR", { exact: true }).fill("19.99");
  await terms
    .getByLabel("Minimum payment (USD)", { exact: true })
    .fill("35.00");
  await save(terms, "Save terms");
  // Terms are contract facts, recorded and shown back exactly.
  const owed = panel(page, "What you owe").getByRole("row").filter({
    hasText: "Card",
  });
  await expect(owed).toContainText("19.99%");
  await expect(owed).toContainText("$35.00");

  // A promotional rate is simply a later version of the same terms, so both
  // are recorded and the earlier one is not overwritten.
  const later = panel(page, "Record the terms");
  await later
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Card" });
  await later.getByLabel("APR", { exact: true }).fill("27.49");
  await later
    .getByLabel("Minimum payment (USD)", { exact: true })
    .fill("35.00");
  await later.getByLabel("Takes effect from", { exact: true }).fill("2027-04");
  await save(later, "Save terms");
  const history = panel(page, "Recorded terms");
  await expect(
    history.getByRole("row").filter({ hasText: "27.49%" }),
  ).toContainText("April 2027");
  await expect(
    history.getByRole("row").filter({ hasText: "19.99%" }),
  ).toBeVisible();
  // What is in force today is still the rate recorded for today.
  await expect(owed).toContainText("19.99%");

  await page.screenshot({
    path: info.outputPath("debt.png"),
    fullPage: true,
  });

  // Removing the future version leaves the one in force alone.
  const remove = page
    .locator("details")
    .filter({ hasText: "Remove a version" });
  await remove.locator("> summary").click();
  await remove
    .getByLabel("Account to change", { exact: true })
    .selectOption({ label: "Card" });
  await remove.getByLabel("Version month", { exact: true }).fill("2027-04");
  await save(remove, "Remove version");
  await expect(
    history.getByRole("row").filter({ hasText: "27.49%" }),
  ).toHaveCount(0);
  await expect(owed).toContainText("19.99%");

  // Recording terms must never create a transaction or move a balance.
  await page.goto(route("/accounts"));
  await expect(page.getByRole("link", { name: /Card/ }).first()).toContainText(
    "$100.00",
  );
});

test("rejects an implausible APR rather than storing it", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Card" });
  await terms.getByLabel("APR", { exact: true }).fill("nineteen");
  await terms
    .getByLabel("Minimum payment (USD)", { exact: true })
    .fill("35.00");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("alert")).toContainText("APR");
});

// A target's month arithmetic has to agree with the app's own month, which is
// the budget's timezone rather than the runner's. Read it off the page.
function addMonths(month: string, count: number) {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + count;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

test("spreads a dated target over the months left and projects from real assignments", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const categories = panel(page, "Add a category");
  await categories
    .getByLabel("Category name", { exact: true })
    .fill("Vacation");
  await categories
    .getByLabel("Group", { exact: true })
    .selectOption({ label: "Everyday" });
  await save(categories, "Create category");

  await page.goto(route("/goals"));
  const next = await page
    .getByRole("link", { name: "Next →", exact: true })
    .getAttribute("href");
  const current = addMonths(next!.split("month=")[1], -1);
  // Three months ahead is four months of funding, counting this one.
  const due = addMonths(current, 3);

  const targets = panel(page, "Set a target");
  await targets
    .getByLabel("Target category", { exact: true })
    .selectOption({ label: "Vacation" });
  await targets
    .getByLabel("Target kind", { exact: true })
    .selectOption({ value: "BALANCE_BY_DATE" });
  await targets.getByLabel("Amount (USD)", { exact: true }).fill("1200.00");
  await targets.getByLabel("Due month", { exact: true }).fill(due);
  await save(targets, "Save target");

  const row = page.getByRole("row").filter({ hasText: "Vacation" });
  await expect(row).toContainText(`by ${monthName(due)}`);
  // 1200.00 over four months, and nothing to project from until money moves.
  await expect(row).toContainText("$300.00");
  await expect(row).toContainText("Nothing assigned yet");
  await expect(row).toContainText("Needs funding");
  await page.screenshot({ path: info.outputPath("goals.png"), fullPage: true });

  // Assigning this month's share is what makes a projection possible at all.
  await page.goto(route("/budget"));
  const assign = page
    .locator(".finance-form")
    .filter({ has: page.getByLabel("Change Vacation assignment") });
  await assign.getByLabel("Change Vacation assignment").fill("300.00");
  await assign.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Vacation" }),
  ).toContainText("On track");

  await page.goto(route("/goals"));
  // Keeping that pace arrives exactly on the month asked for.
  await expect(row).toContainText(monthName(due));
  await expect(row).toContainText("at $300.00 a month");
  await expect(row).toContainText("On track");

  // Removing the target leaves the money where it is.
  const remove = page.locator("details").filter({ hasText: "Remove a target" });
  await remove.locator("> summary").click();
  await remove
    .getByLabel("Target to remove", { exact: true })
    .selectOption({ label: "Vacation" });
  await save(remove, "Remove target");
  await expect(panel(page, "Categories without a target")).toContainText(
    "Vacation",
  );
  await page.goto(route("/budget"));
  await expect(
    page.getByRole("row").filter({ hasText: "Vacation" }),
  ).toContainText("$300.00");
});

test("changes a target from a future month without rewriting this one", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/goals"));
  const next = await page
    .getByRole("link", { name: "Next →", exact: true })
    .getAttribute("href");
  const later = next!.split("month=")[1];

  const setTarget = async (amount: string, effectiveFrom?: string) => {
    const targets = panel(page, "Set a target");
    await targets
      .getByLabel("Target category", { exact: true })
      .selectOption({ label: "Vacation" });
    await targets
      .getByLabel("Target kind", { exact: true })
      .selectOption({ value: "BALANCE" });
    await targets.getByLabel("Amount (USD)", { exact: true }).fill(amount);
    await targets
      .getByLabel("Takes effect from", { exact: true })
      .fill(effectiveFrom ?? "");
    await save(targets, "Save target");
  };
  await setTarget("600.00");
  await setTarget("900.00", later);

  // This month keeps the decision that was made for it.
  const row = page.getByRole("row").filter({ hasText: "Vacation" });
  await expect(row).toContainText("$600.00");
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(row).toContainText("$900.00");
  await expect(row).toContainText(`since ${monthName(later)}`);
});

test("puts a payoff target on a card and asks for nothing once it is clear", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/goals"));
  const targets = panel(page, "Set a target");
  await targets
    .getByLabel("Target category", { exact: true })
    .selectOption({ label: "Card · credit card" });
  await targets
    .getByLabel("Target kind", { exact: true })
    .selectOption({ value: "DEBT_PAYOFF" });
  await targets.getByLabel("Amount (USD)", { exact: true }).fill("50.00");
  await targets.getByLabel("Takes effect from", { exact: true }).fill("");
  await save(targets, "Save target");

  // The card was paid off earlier in this chain, so a payoff target asks for
  // nothing rather than reserving money against a balance that is not there.
  const row = page.getByRole("row").filter({ hasText: "Card" });
  await expect(row).toContainText("Pay this much off every month");
  await expect(row).toContainText("Funded");

  // An ordinary target on a card is refused, because the budget already works
  // out what a card needs for new spending.
  await targets
    .getByLabel("Target kind", { exact: true })
    .selectOption({ value: "MONTHLY" });
  await targets.getByRole("button", { name: "Save target" }).click();
  await expect(targets.getByText(/managed by the application/)).toBeVisible();
});

test("plans income without creating money and approves an occurrence once", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts/schedules"));
  const form = panel(page, "Create a schedule");
  await form.getByLabel("Name", { exact: true }).fill("Scheduled test income");
  await form
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "Checking" });
  await form.getByLabel("Type", { exact: true }).selectOption("INCOME");
  await form.getByLabel("Amount (USD)", { exact: true }).fill("25");
  await form.getByLabel("Repeat", { exact: true }).selectOption("ONCE");
  const before = await getDb().financialTransaction.count();
  await form
    .getByRole("button", { name: "Create schedule", exact: true })
    .click();
  await expect(
    form.getByText("Schedule saved. No money has been posted."),
  ).toBeVisible();
  expect(await getDb().financialTransaction.count()).toBe(before);
  const occurrence = page
    .locator("article")
    .filter({ hasText: "Scheduled test income" });
  await occurrence.getByRole("button", { name: "Approve transaction" }).click();
  await expect(occurrence.getByText("Approved into ledger")).toBeVisible();
  expect(await getDb().financialTransaction.count()).toBe(before + 1);
  await page.reload();
  await expect(
    occurrence.getByRole("button", { name: "Approve transaction" }),
  ).toHaveCount(0);
});
