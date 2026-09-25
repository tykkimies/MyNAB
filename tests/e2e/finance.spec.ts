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
  "FocusedViewCategory",
  "FocusedView",
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
test("hides a funded category without losing its money", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const ready = page.locator("article").filter({ hasText: "Ready to Assign" });
  const manage = page
    .locator("details")
    .filter({
      has: page.getByText("Manage categories and groups", { exact: true }),
    })
    .first();
  await page.evaluate(() => document.fonts.ready);
  await manage.locator("> summary").scrollIntoViewIfNeeded();
  const activate = async (control: Locator) => {
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    if (!box) throw new Error("Category control is not visible");
    if ((page.viewportSize()?.width ?? 1000) < 500) {
      await page.touchscreen.tap(box.x + 20, box.y + box.height / 2);
    } else {
      await control.click();
    }
  };
  await activate(manage.locator("> summary"));
  const food = manage
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: /^Food(?: · Hidden)?$/ }) })
    .first();
  await activate(food.locator("> summary"));
  await activate(food.getByRole("button", { name: "Hide category" }));
  await expect(
    page.getByText(/1 hidden category.*\$300\.00 available/),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Food" })).toHaveCount(
    0,
  );
  await expect(ready).toContainText("$600.00");
  await page.goto(route("/budget"));
  await activate(manage.locator("> summary"));
  await activate(food.locator("> summary"));
  await activate(food.getByRole("button", { name: "Unhide category" }));
  await expect(page.getByRole("row").filter({ hasText: "Food" })).toContainText(
    "$300.00",
  );
  await expect(ready).toContainText("$600.00");
});
test("saves a focused view that filters the plan but not the money", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const ready = page.locator("article").filter({ hasText: "Ready to Assign" });
  const before = await ready.innerText();
  const manage = page
    .locator("details")
    .filter({ has: page.getByText("Manage focused views", { exact: true }) })
    .first();
  await page.evaluate(() => document.fonts.ready);
  const summary = manage.locator("> summary");
  await summary.scrollIntoViewIfNeeded();
  const box = await summary.boundingBox();
  if (!box) throw new Error("Focused view manager is not visible");
  if ((page.viewportSize()?.width ?? 1000) < 500)
    await page.touchscreen.tap(box.x + 20, box.y + box.height / 2);
  else await summary.click();
  const form = manage.locator("form").first();
  await form.getByLabel("Name", { exact: true }).fill("Just food");
  await form.getByLabel("Food", { exact: true }).check();
  await form.getByRole("button", { name: "Create view", exact: true }).click();
  await expect(form.getByText("View created.", { exact: true })).toBeVisible();
  const views = page.getByRole("navigation", { name: "Focused budget views" });
  await views.getByRole("link", { name: "Just food", exact: true }).click();
  await expect(page).toHaveURL(/view=/);
  await expect(page.getByText(/Showing 1 of \d+ visible categories/)).toBeVisible();
  const ledger = page.getByRole("region", { name: "Category ledger" });
  await expect(ledger.getByRole("row").filter({ hasText: "Food" })).toHaveCount(1);
  await expect(ledger).toContainText("1 categories");
  expect(await ready.innerText()).toBe(before);
  // The chosen view is remembered in this browser.
  await page.goto(route("/budget"));
  await expect(page).toHaveURL(/view=/);
  await views.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByText(/Showing \d+ of/)).toHaveCount(0);
});
test("lists money moves and narrows them to one category", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const moves = page.getByRole("region", { name: "Money moves" });
  await expect(moves.locator(".money-move").first()).toBeVisible();
  await expect(moves).toContainText("From Ready to Assign to Food");
  await moves.getByRole("combobox", { name: "Category" }).selectOption({ label: "Food" });
  await moves.getByRole("button", { name: "Show moves", exact: true }).click();
  await expect(page).toHaveURL(/moves=/);
  for (const item of await moves.locator(".money-move").all())
    await expect(item).toContainText("Food");
});
test("hides amounts on this device until shown again", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const toggle = page.getByRole("button", { name: "Hide amounts" });
  const ready = page.locator("article").filter({ hasText: "Ready to Assign" });
  const figure = ready.locator(".amount").first();
  await expect(figure).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(figure).toHaveCSS("filter", /blur/);
  // The figure is masked, not removed: assistive technology still reads it.
  await expect(figure).toContainText("$");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-hide-amounts", "");
  await page.goto(route("/accounts"));
  await expect(page.locator(".amount").first()).toHaveCSS("filter", /blur/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Hide amounts" }).click();
  await expect(page.locator(".amount").first()).toHaveCSS("filter", "none");
});
test("previews Auto-Assign and applies a selected category reset", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const auto = panel(page, "Auto-Assign");
  await auto.getByLabel("Method").selectOption("RESET_ASSIGNED");
  await auto.getByLabel("Categories").selectOption({ label: "Food" });
  await auto.getByRole("button", { name: "Preview" }).click();
  await expect(auto).toContainText("1 category change");
  await expect(auto).toContainText("-$400.00");
  await auto.getByRole("button", { name: "Apply preview" }).click();
  await expect(auto).toContainText("Auto-Assign changed 1 category");
  const food = page.getByRole("row").filter({ hasText: "Food" });
  await expect(food).toContainText("$0.00");
  // Restore the shared synthetic budget before later serial tests.
  const assign = page.locator(".finance-form").filter({
    has: page.getByLabel("Change Food assignment"),
  });
  await assign.getByLabel("Change Food assignment").fill("400.00");
  await assign.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(food).toContainText("$400.00");
});
test("shows Age of Money consistently on Budget and Reports", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  await expect(
    page.getByText(/Age of Money: not enough history/),
  ).toBeVisible();
  await page.goto(route("/reports"));
  const age = panel(page, "Age of Money");
  await expect(age.getByText("Not enough history")).toBeVisible();
  await expect(age).toContainText("cash outflows");
});
test("edits and undoes the starting balance without making a second one", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page
    .getByRole("link", { name: /Checking/ })
    .first()
    .click();
  const opening = page
    .locator(".register-row")
    .filter({ hasText: "Opening balance" });
  await opening.locator("> summary").click();
  await opening.getByText("Edit transaction", { exact: true }).click();
  await opening.getByLabel("Amount (USD)", { exact: true }).fill("1200.00");
  await opening.getByRole("button", { name: "Save changes" }).click();
  const changed = page
    .locator(".register-row")
    .filter({ hasText: "Opening balance" });
  await expect(changed).toContainText("$1,200.00");
  await changed.locator("> summary").click();
  await changed.getByRole("button", { name: "Undo last edit" }).click();
  await expect(
    page.locator(".register-row").filter({ hasText: "Opening balance" }),
  ).toContainText("$1,000.00");
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
test("deletes a register entry while retaining an undo action", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page.getByRole("link", { name: /Card/ }).first().click();
  const row = page.locator(".register-row").filter({ hasText: "Grocer" });
  await row.locator("> summary").click();
  const voidBox = row
    .locator("details")
    .filter({ hasText: "Delete transaction" });
  await voidBox.locator("summary").click();
  await voidBox
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
  // The purchase leaves the visible register and can be restored.
  await expect(page.getByRole("button", { name: "Undo delete" })).toBeVisible();
  await page.getByRole("button", { name: "Undo delete" }).click();
  const restored = page.locator(".register-row").filter({ hasText: "Grocer" });
  await expect(restored).toHaveCount(1);
  await restored.locator("> summary").click();
  await restored.getByText("Edit transaction", { exact: true }).click();
  await restored.getByLabel("Payee", { exact: true }).fill("Grocer updated");
  await restored.getByRole("button", { name: "Save changes" }).click();
  const updated = page
    .locator(".register-row")
    .filter({ hasText: "Grocer updated" });
  await expect(updated).toHaveCount(1);
  await updated.locator("> summary").click();
  await updated.getByRole("button", { name: "Undo last edit" }).click();
  await expect(
    page.locator(".register-row").filter({ hasText: "Grocer updated" }),
  ).toHaveCount(0);
  await restored.locator("> summary").click();
  const deleteAgain = restored
    .locator("details")
    .filter({ hasText: "Delete transaction" });
  await deleteAgain.locator("summary").click();
  await deleteAgain
    .getByRole("button", { name: "Delete transaction", exact: true })
    .click();
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
  await foodRow.getByRole("button", { name: "Snooze this month" }).click();
  await expect(foodRow).toContainText("Snoozed");
  await expect(
    page.getByRole("heading", { name: "Fund every target" }),
  ).toHaveCount(0);
  await page.goto(route("/budget"));
  await expect(page.getByRole("row").filter({ hasText: "Food" })).toContainText(
    "Snoozed this month",
  );
  await page.goto(route("/goals"));
  await foodRow.getByRole("button", { name: "Resume target" }).click();
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

test("records a percentage minimum and a statement balance", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Card" });
  await terms.getByLabel("APR", { exact: true }).fill("21.00");
  await terms
    .getByLabel("Minimum payment (USD)", { exact: true })
    .fill("25.00");
  await terms
    .getByLabel("Minimum percent of balance", { exact: true })
    .fill("1");
  await terms.getByLabel(/adds the month/).check();
  await terms
    .getByLabel("Statement balance (USD)", { exact: true })
    .fill("412.00");
  await terms.getByLabel("Statement date", { exact: true }).fill("2026-01-20");
  await terms.getByLabel("Takes effect from", { exact: true }).fill("2030-01");
  await save(terms, "Save terms");
  const row = panel(page, "Recorded terms")
    .getByRole("row")
    .filter({ hasText: "21.00%" });
  await expect(row).toContainText("or 1.00% + interest");
  await expect(row).toContainText("$412.00 · 2026-01-20");
  const remove = page
    .locator("details")
    .filter({ hasText: "Remove a version" });
  await remove.locator("> summary").click();
  await remove
    .getByLabel("Account to change", { exact: true })
    .selectOption({ label: "Card" });
  await remove.getByLabel("Version month", { exact: true }).fill("2030-01");
  await save(remove, "Remove version");
  await expect(row).toHaveCount(0);
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

test("reviews worker-entered schedule transactions in the browser", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts/schedules"));
  const form = panel(page, "Create a schedule");
  await form.getByLabel("Name", { exact: true }).fill("Worker entered income");
  await form
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "Checking" });
  await form.getByLabel("Type", { exact: true }).selectOption("INCOME");
  await form.getByLabel("Amount (USD)", { exact: true }).fill("15");
  await form.getByLabel("Repeat", { exact: true }).selectOption("ONCE");
  await form.getByRole("button", { name: "Create schedule" }).click();
  await expect(
    form.getByText("Schedule saved. No money has been posted."),
  ).toBeVisible();
  const db = getDb();
  const budget = await db.budget.findFirstOrThrow();
  const owner = await db.user.findFirstOrThrow();
  const { enterDueSchedules } = await import("../../src/application/schedules");
  expect(await enterDueSchedules(owner.id, budget.id)).toEqual({
    entered: 1,
    failed: 0,
  });
  await page.reload();
  const occurrence = page
    .locator("article")
    .filter({ hasText: "Worker entered income" });
  await expect(
    occurrence.getByText("Entered in the register · awaiting approval"),
  ).toBeVisible();
  await occurrence.getByRole("button", { name: "Approve transaction" }).click();
  await expect(occurrence.getByText("Approved into ledger")).toBeVisible();
});

test("matches a posted transaction and changes only future schedule occurrences", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts/schedules"));
  const form = panel(page, "Create a schedule");
  const date = await form
    .getByLabel("First occurrence", { exact: true })
    .inputValue();
  const db = getDb();
  const account = await db.financialAccount.findFirstOrThrow({
    where: { name: "Checking" },
  });
  const owner = await db.user.findFirstOrThrow();
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  await executeFinance(owner.id, account.budgetId, randomUUID(), {
    type: "transaction.create",
    accountId: account.id,
    kind: "INCOME",
    date,
    amount: "31.50",
    payee: "Existing income",
  });
  const count = await db.financialTransaction.count();
  await form.getByLabel("Name", { exact: true }).fill("Match income");
  await form
    .getByLabel("Account", { exact: true })
    .selectOption({ label: "Checking" });
  await form.getByLabel("Type", { exact: true }).selectOption("INCOME");
  await form.getByLabel("Amount (USD)", { exact: true }).fill("31.50");
  await form
    .getByRole("button", { name: "Create schedule", exact: true })
    .click();
  await expect(
    form.getByText("Schedule saved. No money has been posted."),
  ).toBeVisible();
  const occurrence = page.locator("article").filter({
    has: page.getByRole("heading", {
      name: `Match income · ${date}`,
      exact: true,
    }),
  });
  await occurrence
    .getByRole("button", { name: "Match existing transaction" })
    .click();
  await expect(
    occurrence.getByText("Matched to existing transaction", { exact: true }),
  ).toBeVisible();
  expect(await db.financialTransaction.count()).toBe(count);
  const manage = panel(page, "Manage schedules")
    .locator("div.finance-panel")
    .filter({
      has: page.getByRole("heading", { name: "Match income", exact: true }),
    });
  await manage.getByText("Change future occurrences", { exact: true }).click();
  const edit = manage.locator("details");
  const tomorrow = new Date(`${date}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await edit
    .getByLabel("First occurrence", { exact: true })
    .fill(tomorrow.toISOString().slice(0, 10));
  await edit.getByLabel("Name", { exact: true }).fill("Revised income");
  await edit.getByLabel("Amount (USD)", { exact: true }).fill("32.00");
  await edit.getByRole("button", { name: "Save future schedule" }).click();
  await expect(
    page.getByRole("heading", { name: "Revised income", exact: true }),
  ).toBeVisible();
  await expect(
    occurrence.getByText("Matched to existing transaction", { exact: true }),
  ).toBeVisible();
  expect(await db.financialTransaction.count()).toBe(count);
});

test("shows recurring evidence and creates a schedule only after review", async ({
  page,
}) => {
  await signIn(page);
  const db = getDb();
  const account = await db.financialAccount.findFirstOrThrow({
    where: { name: "Checking" },
  });
  const owner = await db.user.findFirstOrThrow();
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  for (const offset of [3, 2, 1]) {
    const date = new Date();
    date.setUTCDate(15);
    date.setUTCMonth(date.getUTCMonth() - offset);
    await executeFinance(owner.id, account.budgetId, randomUUID(), {
      type: "transaction.create",
      accountId: account.id,
      kind: "INCOME",
      date: date.toISOString().slice(0, 10),
      amount: "7.00",
      payee: "Recurring demo income",
    });
  }
  const count = await db.financialTransaction.count();
  await page.goto(route("/accounts/schedules"));
  const suggestions = panel(page, "Possible recurring transactions");
  const item = suggestions
    .locator("details")
    .filter({ hasText: "Recurring demo income" });
  await item.locator("summary").click();
  await expect(item.getByText(/3 supporting transactions/)).toBeVisible();
  expect(await db.financialTransaction.count()).toBe(count);
  await item.getByRole("button", { name: "Create reviewed schedule" }).click();
  await expect(
    panel(page, "Manage schedules").getByRole("heading", {
      name: "Recurring demo income",
      exact: true,
    }),
  ).toBeVisible();
  expect(await db.financialTransaction.count()).toBe(count);
  await expect(item).toHaveCount(0);
});

test("dismisses a recurring suggestion and restores it", async ({ page }) => {
  await signIn(page);
  const db = getDb();
  const account = await db.financialAccount.findFirstOrThrow({
    where: { name: "Checking" },
  });
  const owner = await db.user.findFirstOrThrow();
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const payee = `Dismiss demo ${test.info().project.name}`;
  for (const offset of [3, 2, 1]) {
    const date = new Date();
    date.setUTCDate(10);
    date.setUTCMonth(date.getUTCMonth() - offset);
    await executeFinance(owner.id, account.budgetId, randomUUID(), {
      type: "transaction.create",
      accountId: account.id,
      kind: "INCOME",
      date: date.toISOString().slice(0, 10),
      amount: "3.00",
      payee,
    });
  }
  const count = await db.financialTransaction.count();
  await page.goto(route("/accounts/schedules"));
  const suggestions = panel(page, "Possible recurring transactions");
  const item = suggestions
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: payee }) });
  await item.locator("summary").click();
  await item.getByRole("button", { name: "Not recurring" }).click();
  await expect(item).toHaveCount(0);
  const dismissed = suggestions
    .locator("details")
    .filter({ hasText: /Dismissed patterns/ });
  await dismissed.locator("summary").click();
  await dismissed
    .locator("div")
    .filter({ hasText: payee })
    .getByRole("button", { name: "Restore" })
    .click();
  await expect(
    suggestions.locator("details > summary").filter({ hasText: payee }),
  ).toBeVisible();
  expect(await db.financialTransaction.count()).toBe(count);
});

test("saves a rule and previews its proposed payee without rewriting the ledger", async ({
  page,
}) => {
  await signIn(page);
  const db = getDb();
  const account = await db.financialAccount.findFirstOrThrow({
    where: { name: "Checking" },
  });
  const owner = await db.user.findFirstOrThrow();
  const { executeFinance, today } =
    await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const transaction = await executeFinance(
    owner.id,
    account.budgetId,
    randomUUID(),
    {
      type: "transaction.create",
      accountId: account.id,
      kind: "INCOME",
      date: today("America/New_York"),
      amount: "17",
      payee: "RULE SAMPLE",
    },
  );
  await page.goto(route("/accounts/rules"));
  await expect(
    page.getByRole("link", { name: "Accounts", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const create = panel(page, "Create a rule");
  await create.getByLabel("Rule name", { exact: true }).fill("Clean sample");
  await create.getByLabel("Payee text", { exact: true }).fill("RULE SAMPLE");
  await create
    .getByLabel("Rename payee", { exact: true })
    .fill("Reviewed sample");
  await create.getByRole("button", { name: "Save rule", exact: true }).click();
  await expect(create.getByText(/Rule saved/)).toBeVisible();
  const preview = panel(page, "Preview proposed changes");
  await preview
    .getByLabel("Sample transaction", { exact: true })
    .selectOption(transaction.id);
  await preview
    .getByRole("button", { name: "Preview rules", exact: true })
    .click();
  await preview.getByLabel("Payee", { exact: true }).uncheck();
  await preview.getByRole("button", { name: "Save field protection" }).click();
  await expect(
    preview.getByText("Reviewed sample", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await db.financialTransaction.findUniqueOrThrow({
        where: { id: transaction.id },
      })
    ).payee,
  ).toBe("RULE SAMPLE");
});

test("applies an explicitly unlocked rule preview and keeps original history", async ({
  page,
}) => {
  await signIn(page);
  const db = getDb();
  const original = await db.financialTransaction.findFirstOrThrow({
    where: { payee: "RULE SAMPLE", voidedAt: null },
  });
  await page.goto(route(`/accounts/rules?transactionId=${original.id}`));
  await page
    .getByRole("button", { name: "Apply reviewed changes", exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(original.id));
  await expect(
    page.getByText("Reviewed sample", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await db.financialTransaction.findUniqueOrThrow({
        where: { id: original.id },
      })
    ).voidedAt,
  ).not.toBeNull();
  const replacement = await db.financialTransaction.findFirstOrThrow({
    where: { replacesId: original.id },
  });
  expect(replacement.amount).toBe(original.amount);
});

test("creates a rule only when the owner accepts a suggestion", async ({
  page,
}) => {
  await signIn(page);
  const db = getDb();
  const account = await db.financialAccount.findFirstOrThrow({
    where: { name: "Checking" },
  });
  const category = await db.category.findFirstOrThrow({
    where: {
      budgetId: account.budgetId,
      archived: false,
      system: false,
      paymentAccountId: null,
    },
  });
  const owner = await db.user.findFirstOrThrow();
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const payee = `Suggest demo ${test.info().project.name}`;
  for (const offset of [3, 2, 1]) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    await executeFinance(owner.id, account.budgetId, randomUUID(), {
      type: "transaction.create",
      accountId: account.id,
      kind: "EXPENSE",
      date: date.toISOString().slice(0, 10),
      amount: "-2.00",
      payee,
      splits: [{ categoryId: category.id, amount: "-2.00" }],
    });
  }
  const rules = await db.automationRule.count();
  await page.goto(route("/accounts/rules"));
  const suggested = panel(page, "Suggested from your choices")
    .locator("li")
    .filter({ hasText: payee });
  await expect(suggested).toContainText(category.name);
  expect(await db.automationRule.count()).toBe(rules);
  await suggested.getByRole("button", { name: "Create this rule" }).click();
  await expect(suggested).toHaveCount(0);
  const rule = await db.automationRule.findFirstOrThrow({
    where: { payeeMatch: payee },
  });
  expect(rule.matchMode).toBe("EXACT");
  expect(rule.categoryId).toBe(category.id);
});

test("the OAuth return page needs a session and explains a missing Link session", async ({
  page,
}) => {
  await page.goto(route("/accounts/connections/oauth?oauth_state_id=x"));
  await expect(page).toHaveURL(/\/login/);
  await signIn(page);
  await page.goto(route("/accounts/connections/oauth?oauth_state_id=x"));
  await expect(
    page.getByText(/could not be resumed in this tab/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to bank sync" }),
  ).toBeVisible();
});

test("reports spending and drills into the transactions behind it", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/reports?from=2026-01"));
  await expect(
    page.getByRole("heading", { name: "See where it went.", exact: true }),
  ).toBeVisible();
  const categories = panel(page, "Spending by category");
  const first = categories.getByRole("link").first();
  const name = await first.textContent();
  await first.click();
  const drill = panel(page, "Behind this figure");
  await expect(drill.getByRole("row").nth(1)).toBeVisible();
  await expect(
    drill.getByRole("heading", { name: `${name} by month` }),
  ).toBeVisible();
  await expect(page).toHaveURL(/line=/);
  expect(name).toBeTruthy();
  await drill.getByRole("link", { name: "Close" }).click();
  await expect(
    page.getByRole("heading", { name: "Behind this figure" }),
  ).toHaveCount(0);
  // The cash-flow lines add up to their total.
  await expect(
    panel(page, "Cash flow").getByText("Change in budget accounts"),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("reports.png"),
    fullPage: true,
  });
});

test("imports a CSV after a dry run and undoes the whole batch", async ({
  page,
}) => {
  await signIn(page);
  const db = getDb();
  const owner = await db.user.findFirstOrThrow();
  const budget = await db.budgetMember.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const name = `Import target ${test.info().project.name}`;
  const opened = new Date();
  opened.setUTCDate(opened.getUTCDate() - 10);
  const openDate = opened.toISOString().slice(0, 10);
  const account = await executeFinance(
    owner.id,
    budget.budgetId,
    randomUUID(),
    {
      type: "account.create",
      name,
      accountType: "CHECKING",
      participation: "BUDGET",
      opening: "100",
      date: openDate,
    },
  );
  const day = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const csv = `Date,Description,Amount\n${day(3)},File grocer,-12.34\n${day(2)},File refund,5.00\n${day(20)},Too early,-1.00\n`;
  await page.goto(route("/accounts/import"));
  const form = panel(page, "Import");
  await form.getByLabel("Import into").selectOption({ label: name });
  await form.getByLabel("Bank file (CSV, OFX or QFX)").setInputFiles({
    name: "statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(form.getByText("Match the columns")).toBeVisible();
  await form.getByLabel("Date layout").selectOption("YYYY-MM-DD");
  await form.getByRole("button", { name: "Preview import" }).click();
  await expect(
    form.getByText(/2 new · 0 already imported · 1 on or before/),
  ).toBeVisible();
  expect(
    await db.financialTransaction.count({
      where: { accountId: account.id, kind: { not: "OPENING" } },
    }),
  ).toBe(0);
  await form.getByRole("button", { name: "Import 2 new rows" }).click();
  await expect(form.getByText(/Imported 2\./)).toBeVisible();
  expect(
    await db.financialTransaction.count({
      where: {
        accountId: account.id,
        kind: { not: "OPENING" },
        voidedAt: null,
      },
    }),
  ).toBe(2);

  page.once("dialog", (dialog) => dialog.accept());
  const past = panel(page, "Past imports")
    .locator("li")
    .filter({ hasText: name });
  await past.getByRole("button", { name: "Undo import" }).click();
  await expect(past).toContainText("undone");
  expect(
    await db.financialTransaction.count({
      where: {
        accountId: account.id,
        kind: { not: "OPENING" },
        voidedAt: null,
      },
    }),
  ).toBe(0);
});

test("downloads a complete export and a formula-safe CSV table", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts/export"));
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download everything (JSON)" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^mynab-export-.*\.json$/);
  const doc = JSON.parse(
    await (
      await import("node:fs/promises")
    ).readFile(await file.path(), "utf8"),
  );
  expect(doc.format).toBe("mynab.export");
  expect(doc.transactions.length).toBeGreaterThan(0);
  const csv = await page.request.get(
    route("/api/export?format=csv&table=transactions"),
  );
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).startsWith("Date,Account,Kind")).toBe(true);
  // Without a session, nothing is exported.
  const anonymous = await page
    .context()
    .browser()!
    .newContext({ ignoreHTTPSErrors: true });
  const denied = await anonymous.request.get(route("/api/export?format=json"));
  expect(denied.status()).not.toBe(200);
  await anonymous.close();
});

test("forecasts a chosen horizon without touching the budget", async ({
  page,
}) => {
  await signIn(page);
  const db = getDb();
  const journals = await db.journal.count();
  await page.goto(route("/reports"));
  await page.getByRole("link", { name: "Look ahead with a forecast" }).click();
  await expect(
    page.getByRole("heading", { name: "Look ahead.", exact: true }),
  ).toBeVisible();
  await page.getByLabel("How far ahead").selectOption("12");
  await page.getByRole("button", { name: "Update forecast" }).click();
  await expect(page).toHaveURL(/months=12/);
  const table = page.getByRole("table", { name: "Forecast by month" });
  // This month's remainder plus twelve full months.
  await expect(table.locator("tbody tr")).toHaveCount(13);
  await expect(page.getByText("What this assumes")).toBeVisible();
  expect(await db.journal.count()).toBe(journals);
});

test("pages and searches a long account register", async ({ page }) => {
  await signIn(page);
  const db = getDb();
  const owner = await db.user.findFirstOrThrow();
  const { budgetId } = await db.budgetMember.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const { executeFinance } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const opened = new Date();
  opened.setUTCDate(opened.getUTCDate() - 90);
  const account = await executeFinance(owner.id, budgetId, randomUUID(), {
    type: "account.create",
    name: `Long register ${test.info().project.name}`,
    accountType: "CASH",
    participation: "TRACKING",
    opening: "1000",
    date: opened.toISOString().slice(0, 10),
  });
  for (let i = 0; i < 60; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 80 + i);
    await executeFinance(owner.id, budgetId, randomUUID(), {
      type: "transaction.create",
      accountId: account.id,
      kind: "EXPENSE",
      date: d.toISOString().slice(0, 10),
      amount: "-1.00",
      payee: i === 3 ? "Needle payee" : `Row ${i}`,
    });
  }
  await page.goto(route(`/accounts/${account.id}`));
  const balance = panel(page, "Balance over time");
  await expect(
    balance.getByRole("img", { name: /balance from/ }),
  ).toBeVisible();
  const register = panel(page, "Transactions");
  await expect(register.locator("details.register-row")).toHaveCount(50);
  await expect(
    register.getByText(/Page 1 of 2 · 61 transactions/),
  ).toBeVisible();
  await register.getByRole("link", { name: "Older" }).click();
  await expect(register.locator("details.register-row")).toHaveCount(11);
  await register.getByLabel("Search payee or memo").fill("needle");
  await register.getByRole("button", { name: "Search" }).click();
  await expect(register.locator("details.register-row")).toHaveCount(1);
  await expect(register.getByText("Needle payee")).toBeVisible();
});

test("approves every ready import at once", async ({ page }) => {
  await signIn(page);
  const db = getDb();
  const owner = await db.user.findFirstOrThrow();
  const { budgetId } = await db.budgetMember.findFirstOrThrow({
    where: { userId: owner.id },
  });
  const { executeFinance } = await import("../../src/application/finance");
  const { commitImport } = await import("../../src/application/imports");
  const { randomUUID } = await import("node:crypto");
  const opened = new Date();
  opened.setUTCDate(opened.getUTCDate() - 10);
  const account = await executeFinance(owner.id, budgetId, randomUUID(), {
    type: "account.create",
    name: `Bulk ${test.info().project.name}`,
    accountType: "CHECKING",
    participation: "BUDGET",
    opening: "100",
    date: opened.toISOString().slice(0, 10),
  });
  const day = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  await commitImport(owner.id, budgetId, {
    accountId: account.id,
    content: `${day(3)},Bulk one,-1.00\n${day(2)},Bulk two,-2.00\n`,
    mapping: {
      header: false,
      date: 0,
      dateFormat: "YYYY-MM-DD",
      payee: 1,
      amount: 2,
    },
  });
  await page.goto(route("/accounts/connections"));
  await page.getByRole("button", { name: /Approve all \d+/ }).click();
  await expect(page.getByText(/Approved \d+\./)).toBeVisible();
  expect(
    await db.ingestedEntry.count({
      where: { budgetId, approved: false, status: "POSTED" },
    }),
  ).toBe(0);
});

test("solves a monthly debt payment from a chosen payoff month", async ({
  page,
}) => {
  await signIn(page);
  await addAccount(
    page,
    "Solver Loan",
    "Installment loan",
    "-1200",
    "Tracking",
  );
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Solver Loan" });
  await terms.getByLabel("APR", { exact: true }).fill("0");
  await terms.getByLabel("Minimum payment (USD)", { exact: true }).fill("10");
  await save(terms, "Save terms");
  const now = new Date();
  const payoffBy = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 11, 1),
  )
    .toISOString()
    .slice(0, 7);
  const scenario = panel(page, "Try a payoff plan");
  await scenario.getByLabel("Or pay off by month").fill(payoffBy);
  await scenario.getByRole("button", { name: "Show the plan" }).click();
  await expect(page.getByText(/plan about \$100\.00 each month/)).toBeVisible();
  await expect(page.getByText(/does not assign money/)).toBeVisible();
});
