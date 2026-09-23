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
test("refuses to assign money the budget does not have", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const assign = page
    .locator(".finance-form")
    .filter({ has: page.getByLabel("Change Food assignment") });
  await assign.getByLabel("Change Food assignment").fill("100000.00");
  await assign.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(assign.getByRole("alert")).toContainText("not enough backed");
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
