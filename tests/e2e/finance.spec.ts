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
/**
 * Clicks a control, tapping it by coordinates on the phone profile, where
 * Playwright's hit test can misjudge nested disclosures.
 */
async function activate(page: Page, control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  if (!box) throw new Error("Control is not visible");
  if ((page.viewportSize()?.width ?? 1000) < 500)
    await page.touchscreen.tap(box.x + 20, box.y + box.height / 2);
  else await control.click();
}
async function addGroup(page: Page, name: string) {
  const ledger = page.getByRole("region", { name: "Category ledger" });
  await ledger.locator("details.add-group > summary").click();
  await ledger.getByLabel("New group name", { exact: true }).fill(name);
  await ledger
    .getByRole("button", { name: "Create group", exact: true })
    .click();
  await expect(
    ledger.getByRole("heading", { name, exact: true, level: 3 }),
  ).toBeVisible();
}
async function addCategory(page: Page, group: string, name: string) {
  const ledger = page.getByRole("region", { name: "Category ledger" });
  const add = ledger.locator("details.add-category").filter({
    has: page.getByLabel(`New category in ${group}`, { exact: true }),
  });
  await add.locator("> summary").click();
  await add.getByLabel(`New category in ${group}`, { exact: true }).fill(name);
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(ledger.getByRole("link", { name, exact: true })).toBeVisible();
  // Adding opens the new category's inspector; on a phone that sheet covers
  // the ledger, so close it before the caller works in the list.
  await page.getByRole("link", { name: "Close", exact: true }).click();
  await expect(page).not.toHaveURL(/inspect=/);
}
async function openBudgetCategory(page: Page, name: string, month?: string) {
  await page.goto(route(`/budget${month ? `?month=${month}` : ""}`));
  await page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("link", { name, exact: true })
    .click();
  return panel(page, name);
}
async function setBudgetTarget(
  page: Page,
  category: string,
  kind: string,
  amount: string,
  dueMonth?: string,
  month?: string,
  existing = false,
) {
  const inspector = await openBudgetCategory(page, category, month);
  const editor = inspector.locator(".target-editor");
  const edit = editor.getByRole("button", { name: "Edit target" });
  if (existing) await edit.click();
  else await editor.getByRole("button", { name: "Create target" }).waitFor();
  await editor.getByLabel(`Target kind for ${category}`).selectOption(kind);
  if (kind !== "DEBT_PAYOFF_BY_DATE")
    await editor.getByLabel(`Target amount for ${category}`).fill(amount);
  if (dueMonth) await editor.locator('input[name="dueMonth"]').fill(dueMonth);
  await editor.getByRole("button", { name: /^(Create|Save) target$/ }).click();
  await expect(
    editor.getByRole("button", { name: "Edit target" }),
  ).toBeVisible();
  return inspector;
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
    page.getByRole("row").filter({ hasText: "Checking" }).first(),
  ).toContainText("$1,000.00");

  await page.goto(route("/budget"));
  // Groups and categories are added right in the list, as in YNAB.
  await addGroup(page, "Everyday");
  await addCategory(page, "Everyday", "Food");

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
  const ledger = page.getByRole("region", { name: "Category ledger" });
  await ledger.getByRole("link", { name: "Food", exact: true }).click();
  const inspector = panel(page, "Food");
  await activate(
    page,
    inspector.locator("details.category-settings > summary"),
  );
  await activate(
    page,
    inspector.getByRole("button", { name: "Hide category" }),
  );
  await expect(
    page.getByText(/1 hidden category.*\$300\.00 available/),
  ).toBeVisible();
  await expect(ledger.getByRole("row").filter({ hasText: "Food" })).toHaveCount(
    0,
  );
  await expect(ready).toContainText("$600.00");
  // The inspector drawer overlays the page; close it to reach the list below.
  await inspector.getByRole("link", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/inspect=/);
  // Hidden things come back from one place at the bottom of the page.
  const tucked = page.locator("details[aria-label='Hidden and archived']");
  await activate(page, tucked.locator("> summary"));
  await activate(
    page,
    tucked
      .locator(".hidden-item")
      .filter({ hasText: "Food" })
      .getByRole("button", { name: "Unhide category" }),
  );
  await expect(
    ledger.getByRole("row").filter({ hasText: "Food" }),
  ).toContainText("$300.00");
  await expect(ready).toContainText("$600.00");
});

test("scrolls the last category above the open drawer sheet", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "mobile", "The drawer is a sheet on phones");
  await signIn(page);
  await page.goto(route("/budget"));
  const rows = page.locator(".ledger > tbody > tr");
  await rows.last().getByRole("link").first().click();
  await expect(page).toHaveURL(/inspect=/);
  const sheet = page.locator("section.drawer");
  await expect(sheet).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(async () => {
      const row = (await rows.last().boundingBox())!;
      const top = (await sheet.boundingBox())!.y;
      return row.y + row.height <= top + 1;
    })
    .toBe(true);
  await sheet.getByRole("link", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/inspect=/);
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
  await activate(page, form.getByLabel("Food", { exact: true }));
  await expect(form.getByLabel("Food", { exact: true })).toBeChecked();
  await activate(
    page,
    form.getByRole("button", { name: "Create view", exact: true }),
  );
  await expect(form.getByText("View created.", { exact: true })).toBeVisible();
  const views = page.getByRole("navigation", { name: "Focused budget views" });
  await views.getByRole("link", { name: "Just food", exact: true }).click();
  await expect(page).toHaveURL(/view=/);
  await expect(
    page.getByText(/Showing 1 of \d+ visible categories/),
  ).toBeVisible();
  const ledger = page.getByRole("region", { name: "Category ledger" });
  await expect(ledger.getByRole("row").filter({ hasText: "Food" })).toHaveCount(
    1,
  );
  await expect(ledger).toContainText("1 categories");
  expect(await ready.innerText()).toBe(before);
  // The chosen view is remembered in this browser.
  await page.goto(route("/budget"));
  await expect(page).toHaveURL(/view=/);
  await views.getByRole("link", { name: "All", exact: true }).click();
  await expect(page.getByText(/Showing \d+ of/)).toHaveCount(0);
});
test("lists money moves and narrows them to one category", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const moves = page.getByRole("region", { name: "Money moves" });
  await activate(page, moves.locator("> summary"));
  await expect(moves.locator(".money-move").first()).toBeVisible();
  await expect(moves).toContainText("From Ready to Assign to Food");
  await moves
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Food" });
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
test("creates a second plan, opens it, and switches back", async ({
  page,
}, info) => {
  await signIn(page);
  const name = `Side plan ${info.project.name}`;
  await page.goto(route("/plans"));
  const current = page.locator(".plan-row").filter({ hasText: "Open now" });
  const original = (await current.locator("span").first().innerText())
    .replace("Open now", "")
    .trim();
  await page.getByLabel("New plan name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  // A new plan is empty; the original plan's categories are not shown, though
  // the list itself is there so the first group can be added.
  await expect(
    page.getByRole("region", { name: "Category ledger" }).getByRole("row"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Switch plan/ }).first(),
  ).toBeVisible();
  await page.goto(route("/plans"));
  await expect(
    page.locator(".plan-row").filter({ hasText: "Open now" }),
  ).toContainText(name);
  await page
    .getByRole("button", { name: `Open ${original}`, exact: true })
    .click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(
    page.getByRole("region", { name: "Category ledger" }),
  ).toBeVisible();
});
test("starts a plan fresh and keeps the old one archived", async ({
  page,
}, info) => {
  await signIn(page);
  const name = `Fresh ${info.project.name} ${Date.now()}`;
  await page.goto(route("/plans"));
  await page.getByLabel("New plan name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await page.goto(route("/plans"));
  const fresh = panel(page, "Fresh Start");
  await fresh.getByRole("checkbox").check();
  await fresh.getByRole("button", { name: "Start fresh", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Fresh Start complete" }),
  ).toBeVisible();
  await expect(
    page.locator(".plan-row").filter({ hasText: "Open now" }),
  ).toContainText(name);
  await expect(
    page.locator(".plan-row").filter({ hasText: `${name} (Archived` }),
  ).toHaveCount(1);
});
test("adds one stock category without filling the envelope list", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/plans"));
  await page
    .getByLabel("New plan name", { exact: true })
    .fill(`Starter ${info.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  await page.locator("details.add-group > summary").click();
  await page
    .locator(".suggested-categories li")
    .filter({ hasText: "Electric" })
    .getByRole("button", { name: "Add Electric", exact: true })
    .click();
  await expect(page).toHaveURL(/inspect=/);
  await expect(panel(page, "Electric")).toContainText("No target yet");
  const inspector = panel(page, "Electric");
  const targetEditor = inspector.locator(".target-editor");
  await targetEditor.getByLabel("Target amount for Electric").fill("125");
  await targetEditor.getByRole("button", { name: "Create target" }).click();
  await expect(
    targetEditor.getByRole("button", { name: "Edit target" }),
  ).toBeVisible();
  const ledger = page.getByRole("region", { name: "Category ledger" });
  await expect(
    ledger.getByRole("link", { name: "Electric", exact: true }),
  ).toBeVisible();
  await expect(
    ledger.getByRole("link", { name: "Internet", exact: true }),
  ).toHaveCount(0);
  // The inspector drawer overlays the right of the ledger; close it first.
  await inspector.getByRole("link", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/inspect=/);
  // Working in the drawer closed the Add group popover (an outside click);
  // open it again: the stock group's note is shown with what it still offers.
  await page.locator("details.add-group > summary").click();
  await expect(
    page.getByText("Due on a schedule, roughly the same every month.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add missing Bills categories" })
    .click();
  await expect(
    ledger.getByRole("link", { name: "Rent / Mortgage", exact: true }),
  ).toBeVisible();
  // A complete stock group is in the plan, so it is no longer offered (the
  // ledger's own "Collapse Bills" toggle is not an offer).
  await expect(
    page.getByRole("button", { name: /^(Add (missing )?|Restore )?Bills/ }),
  ).toHaveCount(0);
  // The group's own Add category offers stock names too.
  const addToBills = ledger.locator("details.add-category").filter({
    has: page.getByLabel("New category in Bills", { exact: true }),
  });
  await expect(addToBills.locator(".stock-chips")).toHaveCount(0);
  await ledger.getByRole("link", { name: "Electric", exact: true }).click();
  await expect(
    panel(page, "Electric").getByRole("button", { name: "Edit target" }),
  ).toBeVisible();
});
test("flags transactions in the all-accounts register and filters by flag", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts/register"));
  const rows = page.locator("tr.register-row");
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole("checkbox").check();
  const bulk = page.getByRole("group", { name: "Bulk actions" });
  await expect(bulk).toContainText("1 selected");
  const flagForm = bulk
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Flag selected" }) });
  await flagForm.getByRole("combobox", { name: "Flag" }).selectOption("PURPLE");
  await flagForm.getByRole("button", { name: "Flag selected" }).click();
  await expect(bulk.getByText("Flagged 1 transaction.")).toBeVisible();
  await expect(rows.first()).toContainText("Purple");
  await page.goto(route("/accounts/register?flag=PURPLE"));
  await expect(rows).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: "Select every transaction on this page" })
    .check();
  const again = page
    .getByRole("group", { name: "Bulk actions" })
    .locator("form")
    .first();
  await again.getByRole("combobox", { name: "Flag" }).selectOption("");
  await again.getByRole("button", { name: "Flag selected" }).click();
  await expect(
    page.getByText("No transactions match these filters."),
  ).toBeVisible();
});
test("adds a household member and shares the plan with them", async ({
  page,
}, info) => {
  await signIn(page);
  const person = `partner-${info.project.name}`;
  await page.goto(route("/household"));
  await page.getByLabel("New person's username", { exact: true }).fill(person);
  await page
    .getByLabel("Their first passphrase", { exact: true })
    .fill("partner-e2e-passphrase-1");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await expect(
    page.getByText("Person added, with a plan of their own."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Share with ${person}`, exact: true })
    .click();
  await expect(page.getByText("Plan shared.")).toBeVisible();
  const row = page.locator(".household-person").filter({ hasText: person });
  await expect(row).toContainText("Shares this plan");
  await row
    .getByRole("button", { name: `Stop sharing with ${person}` })
    .click();
  await expect(
    page.getByText("Plan no longer shared with that person."),
  ).toBeVisible();
  await expect(row).toContainText("Not shared");
});
test("guides a new plan through setup and explains Ready to Assign", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/plans"));
  await page
    .getByLabel("New plan name", { exact: true })
    .fill(`Setup ${info.project.name} ${Date.now()}`);
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);
  const setup = page.getByRole("region", { name: /Getting started/ });
  await expect(setup).toContainText("0 of 5 done");
  await page.getByRole("link", { name: "What is Ready to Assign?" }).click();
  await expect(page).toHaveURL(/\/guide#ready-to-assign$/);
  await expect(
    page.getByRole("heading", { name: "Ready to Assign", level: 2 }),
  ).toBeVisible();
  await page.goto(route("/budget"));
  await setup.getByRole("button", { name: "Hide checklist" }).click();
  await expect(
    page.getByRole("region", { name: /Getting started/ }),
  ).toHaveCount(0);
  // Hiding is never permanent: the Budget page and the guide both bring it back.
  await page
    .getByRole("button", { name: "Show getting-started checklist" })
    .click();
  await expect(
    page.getByRole("region", { name: /Getting started/ }),
  ).toBeVisible();
  await setup.getByRole("button", { name: "Hide checklist" }).click();
  await page.goto(route("/guide"));
  await page
    .getByRole("button", { name: "Show getting-started checklist" })
    .click();
  await expect(page).toHaveURL(/\/budget$/);
  await expect(
    page.getByRole("region", { name: /Getting started/ }),
  ).toBeVisible();
});
test("previews Auto-Assign and applies a selected category reset", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const auto = panel(page, "Auto-Assign");
  // Auto-Assign lives in a popover in the page header; open it first.
  await activate(page, auto.locator("> summary"));
  await auto.getByLabel("Method").selectOption("RESET_ASSIGNED");
  await auto.getByLabel("Categories").selectOption({ label: "Food" });
  await auto.getByRole("button", { name: "Preview" }).click();
  await expect(auto).toContainText("1 category change");
  await expect(auto).toContainText("-$400.00");
  await auto.getByRole("button", { name: "Apply preview" }).click();
  await expect(auto).toContainText("Auto-Assign changed 1 category");
  const food = page.getByRole("row").filter({ hasText: "Food" });
  await expect(food).toContainText("$0.00");
  // Put the popover away (on a phone it sits over the ledger) before
  // restoring the shared synthetic budget for later serial tests.
  await activate(page, auto.locator("> summary"));
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
test("offers SimpleFIN bank sync, keeps the policy closed, and guards the endpoint", async ({
  page,
  request,
}, info) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page
    .getByRole("link", { name: "Manage bank connections", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Bank sync", exact: true }),
  ).toBeVisible();
  // SimpleFIN is linked by pasting a setup token; there is no bank widget.
  await expect(
    page.getByRole("button", { name: "Connect with SimpleFIN", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("SimpleFIN setup token")).toBeVisible();
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
  // Bank sync runs on the server: nothing third-party in the browser.
  expect(policy).toContain("frame-src 'none'");
  expect(policy).toContain("connect-src 'self';");
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
        data: { type: "link.complete.simplefin", setupToken: "x" },
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
    budget = await db.budget.findFirstOrThrow({
      orderBy: { createdAt: "asc" },
    }),
    owner = await db.user.findFirstOrThrow({ where: { username: "owner" } });
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
  // The register shows what is pending at the bank, outside its figures,
  // and lets the owner enter it now (YNAB's pending section).
  await page.goto(route(`/accounts/${account.id}`));
  await expect(
    page.getByRole("heading", { name: "Pending at the bank (1)" }),
  ).toBeVisible();
  const pendingRow = page
    .locator("details[name='pending-entry']")
    .filter({ hasText: "Pending coffee" });
  await pendingRow.locator("summary").click();
  await pendingRow.getByRole("button", { name: "Enter now" }).click();
  await expect(
    page.getByRole("heading", { name: /Pending at the bank/ }),
  ).toHaveCount(0);
  const entered = page
    .locator("details[name='register-row']")
    .filter({ hasText: "Pending coffee" });
  await expect(entered).toContainText("Uncleared");
  await page.goto(route("/accounts/connections"));
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
  const inspector = await setBudgetTarget(page, "Food", "MONTHLY", "700.00");

  // Earlier tests already assigned to Food, so the shortfall depends on them.
  // Assert the behaviour rather than a number this chain happens to produce.
  await page.goto(route("/targets"));
  const foodRow = page.getByRole("row").filter({ hasText: "Food" });
  await expect(foodRow).toContainText("Needs funding");
  await openBudgetCategory(page, "Food");
  await inspector.getByRole("button", { name: "Snooze this month" }).click();
  await expect(inspector).toContainText("Snoozed this month.");
  await page.goto(route("/targets"));
  await expect(foodRow).toContainText("Snoozed");
  await expect(
    page.getByRole("heading", { name: "Fund every target" }),
  ).toHaveCount(0);
  await page.goto(route("/budget"));
  await expect(page.getByRole("row").filter({ hasText: "Food" })).toContainText(
    "Snoozed this month",
  );
  await openBudgetCategory(page, "Food");
  await inspector.getByRole("button", { name: "Resume target" }).click();
  await expect(inspector).toContainText("Needs $300.00 more this month.");
  await page.goto(route("/targets"));
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
  // Far beyond anything this budget holds.
  await setBudgetTarget(
    page,
    "Food",
    "MONTHLY",
    "999999.00",
    undefined,
    undefined,
    true,
  );
  await page.goto(route("/targets"));

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
    page.getByRole("heading", { name: "Debt", exact: true }),
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
    .getByLabel("Fixed minimum (USD)", { exact: true })
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
    .getByLabel("Fixed minimum (USD)", { exact: true })
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
  await expect(
    page.getByRole("row").filter({ hasText: /Card/ }).first(),
  ).toContainText("$100.00");
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
    .getByLabel("Fixed minimum (USD)", { exact: true })
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

test("sets up and removes a loan payment from its terms", async ({ page }) => {
  await signIn(page);
  await addAccount(page, "Loan checking", "Checking", "1000");
  await page.goto(route("/budget"));
  await addGroup(page, "Loan payments");
  await addCategory(page, "Loan payments", "Auto loan payment");
  await addAccount(page, "Personal loan", "Installment loan", "-2000", "Tracking");
  await addAccount(page, "Auto loan", "Installment loan", "-5000", "Tracking");
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Personal loan" });
  await terms.getByLabel("APR", { exact: true }).fill("5.5");
  await terms.getByLabel("Fixed minimum (USD)", { exact: true }).fill("75");
  await terms.getByLabel("Takes effect from", { exact: true }).fill("2027-01");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toHaveText("Saved.");

  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Auto loan" });
  await expect(terms.getByLabel("Statement balance (USD)")).toHaveCount(0);
  await expect(terms.getByLabel("Credit limit (USD)")).toHaveCount(0);
  await terms.getByLabel("APR", { exact: true }).fill("6.5");
  await terms.getByLabel("Fixed minimum (USD)", { exact: true }).fill("100");
  await terms.getByLabel("Due day", { exact: true }).fill("15");
  await terms
    .getByLabel("Pay from", { exact: true })
    .selectOption({ label: "Loan checking" });
  await terms
    .getByLabel("Payment category", { exact: true })
    .selectOption({ label: "Auto loan payment" });
  await terms.getByLabel("Monthly payment (USD)", { exact: true }).fill("125");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toContainText(
    "transfer from Loan checking to Auto loan",
  );

  await terms.getByLabel("Pay from", { exact: true }).selectOption({
    label: "Don't schedule a payment",
  });
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toContainText(
    "Auto loan will no longer have a scheduled payment",
  );

  // Personal loan so far has only the future-dated version, so it has no
  // terms in force; give it today's terms too, or every later Debt test in
  // this serial chain sees a debt without terms and no payoff plan.
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Personal loan" });
  await terms.getByLabel("APR", { exact: true }).fill("5.5");
  await terms.getByLabel("Fixed minimum (USD)", { exact: true }).fill("75");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toHaveText("Saved.");

  // These two loans are this test's own; close them so later Debt tests see
  // the same set of debts they were written against.
  for (const name of ["Personal loan", "Auto loan"]) {
    await page.goto(route("/accounts"));
    await page.getByRole("link", { name, exact: true }).first().click();
    const settings = panel(page, "Account settings");
    await settings.getByLabel("Closed", { exact: true }).check();
    await settings.getByLabel(/When closing, add an adjustment/).check();
    await settings
      .getByRole("button", { name: "Save account", exact: true })
      .click();
    await expect(settings.getByRole("status")).toContainText("Account closed");
  }
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
    .getByLabel("Fixed minimum (USD)", { exact: true })
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
  await addCategory(page, "Everyday", "Vacation");

  await page.goto(route("/targets"));
  const next = await page
    .getByRole("link", { name: "Next →", exact: true })
    .getAttribute("href");
  const current = addMonths(next!.split("month=")[1], -1);
  // Three months ahead is four months of funding, counting this one.
  const due = addMonths(current, 3);

  await setBudgetTarget(page, "Vacation", "BALANCE_BY_DATE", "1200.00", due);
  // The Budget row says what is needed and by when, as YNAB's row does.
  const shortDue = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${due}-01T00:00:00Z`));
  await page.goto(route("/budget"));
  const budgetRow = page.getByRole("row").filter({ hasText: "Vacation" });
  await expect(budgetRow).toContainText("Needs $300.00");
  await expect(budgetRow).toContainText(`by ${shortDue}`);
  await expect(budgetRow.locator(".target-bar")).toHaveCount(1);
  await page.goto(route("/targets"));

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
  await expect(budgetRow).toContainText(`$900.00 to go by ${shortDue}`);
  // A click on the row's empty space opens the category, like its name.
  const box = (await budgetRow.boundingBox())!;
  await budgetRow.click({ position: { x: box.width - 8, y: 6 } });
  await expect(page).toHaveURL(/inspect=/);
  await expect(panel(page, "Vacation")).toBeVisible();

  await page.goto(route("/targets"));
  // Keeping that pace arrives exactly on the month asked for.
  await expect(row).toContainText(monthName(due));
  await expect(row).toContainText("at $300.00 a month");
  await expect(row).toContainText("On track");

  // Removing the target leaves the money where it is.
  const vacation = await openBudgetCategory(page, "Vacation");
  await vacation.getByRole("button", { name: "Remove target" }).click();
  await expect(vacation).toContainText("No target yet");
  await page.goto(route("/targets"));
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
  await page.goto(route("/targets"));
  const next = await page
    .getByRole("link", { name: "Next →", exact: true })
    .getAttribute("href");
  const later = next!.split("month=")[1];

  await setBudgetTarget(page, "Vacation", "BALANCE", "600.00");
  await setBudgetTarget(
    page,
    "Vacation",
    "BALANCE",
    "900.00",
    undefined,
    later,
    true,
  );
  await page.goto(route("/targets"));

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
  await page.goto(route("/targets"));
  await setBudgetTarget(page, "Card", "DEBT_PAYOFF", "50.00");
  await page.goto(route("/targets"));

  // The card was paid off earlier in this chain, so a payoff target asks for
  // nothing rather than reserving money against a balance that is not there.
  const row = page.getByRole("row").filter({ hasText: "Card" });
  await expect(row).toContainText("Pay this much off every month");
  await expect(row).toContainText("Funded");

  // The inline editor only offers payoff kinds for a card, because its new
  // spending already receives a payment reserve from the budget engine.
  const inspector = await openBudgetCategory(page, "Card");
  await inspector.getByRole("button", { name: "Edit target" }).click();
  await expect(
    inspector
      .getByLabel("Target kind for Card")
      .locator('option[value="MONTHLY"]'),
  ).toHaveCount(0);
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
  const budget = await db.budget.findFirstOrThrow({
    orderBy: { createdAt: "asc" },
  });
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
  // Each schedule opens in the drawer from the Manage schedules table.
  await panel(page, "Manage schedules")
    .getByRole("link", { name: "Match income", exact: true })
    .click();
  const manage = panel(page, "Match income");
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
    panel(page, "Manage schedules").getByRole("link", {
      name: "Revised income",
      exact: true,
    }),
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
    panel(page, "Manage schedules").getByRole("link", {
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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

test("reports spending and drills into the transactions behind it", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/reports?from=2026-01"));
  await expect(
    page.getByRole("heading", { name: "Reports", exact: true }),
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
  const table = page.locator("table.income-expense");
  await expect(
    table.getByRole("rowheader", { name: "Total expenses" }),
  ).toBeVisible();
  await expect(
    table.getByRole("rowheader", { name: "Net income" }),
  ).toBeVisible();
  // A group narrows every report to its categories, and the filter clears.
  await panel(page, "Spending by group").getByRole("link").first().click();
  await expect(page).toHaveURL(/categories=/);
  await expect(
    page.getByText("Filtered report.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Clear account and category filters" })
    .click();
  await expect(page).not.toHaveURL(/categories=/);
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
    page.getByRole("heading", { name: "Forecast", exact: true }),
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
  const owner = await db.user.findFirstOrThrow({
    where: { username: "owner" },
  });
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
  await terms.getByLabel("Fixed minimum (USD)", { exact: true }).fill("10");
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

test("quick-adds a purchase and remembers the payee's category", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Add transaction" }).click();
  await expect(page).toHaveURL(/\/add$/);
  const form = page.getByRole("region", { name: "New transaction" });
  await form.getByLabel("Amount (USD)").fill("4.50");
  await form.getByLabel("Payee").fill("Corner Cafe");
  await form
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: "Checking" });
  await form
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Food" });
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(form.getByText("Saved.")).toBeVisible();
  await expect(form.getByLabel("Amount (USD)")).toHaveValue("");
  // The next entry for the same payee starts in the same category.
  await page.reload();
  await form.getByLabel("Payee").fill("Corner Cafe");
  await expect(form.getByText("Remembered from this payee")).toBeVisible();
  await expect(form.getByRole("combobox", { name: "Category" })).toHaveValue(
    /.+/,
  );
});

test("undoes a money move and opens a category's activity", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const input = page.getByRole("textbox", { name: "Change Food assignment" });
  await input.fill("1.00");
  await input
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "Assign", exact: true })
    .click();
  const moves = page.getByRole("region", { name: "Money moves" });
  await activate(page, moves.locator("> summary"));
  const newest = moves.locator(".money-move").first();
  await expect(newest).toContainText("$1.00");
  await newest.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(moves.locator(".money-move").first()).toContainText(
    "Undid a move",
  );
  await expect(moves.locator(".money-move").nth(1)).toContainText("Undone");
  // Put the popover away first (on a phone it sits over the ledger).
  await page.keyboard.press("Escape");
  await expect(moves).not.toHaveJSProperty("open", true);
  await page.getByRole("link", { name: "Food activity this month" }).click();
  await expect(page).toHaveURL(/\/accounts\/register\?category=/);
  await expect(
    page.getByRole("heading", { name: "All accounts" }),
  ).toBeVisible();
});

test("renames a payee everywhere from the payee list", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/accounts/payees?q=corner"));
  const name = `Neighbourhood Cafe ${info.project.name}`;
  const row = page.locator(".payee-row").first();
  await row.getByRole("checkbox").check();
  await page.getByLabel("New payee name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Rename selected payees" }).click();
  await expect(
    page.getByText(new RegExp(`Renamed \\d+ transactions? to ${name}`)),
  ).toBeVisible();
  await page.goto(route(`/accounts/payees?q=${encodeURIComponent(name)}`));
  await expect(page.locator(".payee-row")).toHaveCount(1);
});

test("plans extra payments on one loan from its account page", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/accounts"));
  await page
    .getByRole("link", { name: /Solver Loan/ })
    .first()
    .click();
  const planner = panel(page, "Loan planner");
  // $1,200 at 0% and $10 a month takes ten years; $90 more takes one.
  await expect(planner).toContainText("Paying minimums only");
  await planner.getByLabel("Extra each month (USD)").fill("90");
  await planner.getByRole("button", { name: "Show the difference" }).click();
  await expect(page).toHaveURL(/extra=90/);
  await expect(panel(page, "Loan planner")).toContainText("108 months");
});

test("inspects one category's month in detail", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/budget"));
  await page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("link", { name: "Food", exact: true })
    .click();
  await expect(page).toHaveURL(/inspect=/);
  const inspector = panel(page, "Food");
  for (const label of [
    "Left over from last month",
    "Assigned this month",
    "Cash spending",
    "Credit spending",
    "Available",
  ])
    await expect(inspector.locator(".category-inspector")).toContainText(label);
  await expect(
    inspector.getByRole("button", {
      name: "Return available to Ready to Assign",
    }),
  ).toBeVisible();
  await expect(
    inspector.getByRole("link", { name: "All transactions" }),
  ).toBeVisible();
  await inspector.getByRole("link", { name: "Close" }).click();
  await expect(page).not.toHaveURL(/inspect=/);
});

test("shows dates in the plan's chosen format", async ({ page }) => {
  await signIn(page);
  const choose = async (label: string) => {
    await page.goto(route("/plans"));
    const settings = panel(page, "Plan settings");
    await settings
      .getByRole("combobox", { name: "Date format" })
      .selectOption({ label });
    await settings.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Plan settings saved.")).toBeVisible();
  };
  await choose("12/31/2026");
  await page.goto(route("/accounts/register"));
  await expect(page.locator("tr.register-row td").nth(1)).toHaveText(
    /^\d{2}\/\d{2}\/\d{4}$/,
  );
  await choose("2026-12-31");
  await page.goto(route("/accounts/register"));
  await expect(page.locator("tr.register-row td").nth(1)).toHaveText(
    /^\d{4}-\d{2}-\d{2}$/,
  );
});

test("keeps a quick entry on the device while offline and sends it later", async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.goto(route("/add"));
  const form = page.getByRole("region", { name: "New transaction" });
  await form.getByLabel("Amount (USD)").fill("2.25");
  await form.getByLabel("Payee").fill("Offline Kiosk");
  await form
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: "Checking" });
  await form
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Food" });
  await context.setOffline(true);
  await form.getByRole("button", { name: "Save transaction" }).click();
  await expect(form.getByText(/Saved on this device/)).toBeVisible();
  await expect(page.getByText(/1 entry saved on this device/)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText(/saved on this device, waiting/)).toHaveCount(0);
  await page.goto(route("/accounts/register?q=Offline%20Kiosk"));
  await expect(page.locator("tr.register-row")).toHaveCount(1);
});

test("deletes an account that only has a starting balance", async ({
  page,
}, info) => {
  await signIn(page);
  const name = `Spare ${info.project.name}`;
  await addAccount(page, name, "Savings", "0");
  await page
    .getByRole("link", { name: new RegExp(name) })
    .first()
    .click();
  const settings = panel(page, "Account settings");
  await settings.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(
    0,
  );
});

test("updates sections in place instead of reloading the page", async ({
  page,
}) => {
  await signIn(page);
  // A full page load would wipe this marker; an in-place update keeps it.
  const mark = () =>
    page.evaluate(() => ((window as unknown as { soft?: number }).soft = 1));
  const kept = async () =>
    expect(
      await page.evaluate(() => (window as unknown as { soft?: number }).soft),
    ).toBe(1);
  await page.goto(route("/budget"));
  await mark();
  await page
    .getByRole("navigation", { name: "Budget month" })
    .getByRole("link", { name: "← Previous" })
    .click();
  await expect(page).toHaveURL(/month=/);
  await kept();
  await page
    .getByRole("navigation", { name: "Focused budget views" })
    .getByRole("link", { name: "Underfunded" })
    .click();
  await expect(page).toHaveURL(/view=UNDERFUNDED/);
  await kept();
  const moves = page.getByRole("region", { name: "Money moves" });
  await activate(page, moves.locator("> summary"));
  await moves.getByRole("button", { name: "Show moves" }).click();
  await expect(page).toHaveURL(/moves=/);
  await kept();
  await page.goto(route("/reports"));
  await mark();
  await page.getByRole("button", { name: "Show report" }).click();
  await expect(page).toHaveURL(/from=/);
  await kept();
  await page.goto(route("/accounts/register"));
  await mark();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await expect(page).toHaveURL(/register\?/);
  await kept();
  await page.goto(route("/plans"));
  await mark();
  const settings = panel(page, "Plan settings");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Plan settings saved.")).toBeVisible();
  await kept();
});

test("sets up a bill and its target without leaving the budget", async ({
  page,
}, info) => {
  await signIn(page);
  await addAccount(
    page,
    `Bills checking ${info.project.name}`,
    "Checking",
    "0",
  );
  await page.goto(route("/budget"));
  const group = `Bills ${info.project.name}`;
  await addGroup(page, group);
  const groupSettings = page
    .getByRole("region", { name: "Category ledger" })
    .locator("details.group-settings")
    .filter({ has: page.getByRole("heading", { name: group, exact: true }) });
  await activate(page, groupSettings.locator("> summary"));
  await expect(
    groupSettings.getByLabel(`Group name for ${group}`),
  ).toBeVisible();
  await activate(page, groupSettings.locator("> summary"));
  await addCategory(page, group, `Car Insurance ${info.project.name}`);
  const name = `Car Insurance ${info.project.name}`;
  await page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("link", { name, exact: true })
    .click();
  const inspector = panel(page, name);
  await expect(inspector).toContainText("No target yet");
  await inspector.getByLabel(`Target kind for ${name}`).selectOption("MONTHLY");
  await inspector.getByLabel(`Target amount for ${name}`).fill("150");
  await inspector.getByLabel("Due on day (optional)").fill("15");
  await inspector.getByRole("button", { name: "Create target" }).click();
  await expect(inspector).toContainText("Needs $150.00 more this month.");
  await expect(inspector).toContainText("Due on day 15.");
  // Change it in place, then remove it.
  await inspector.getByRole("button", { name: "Edit target" }).click();
  await inspector.getByLabel(`Target amount for ${name}`).fill("160");
  await inspector.getByRole("button", { name: "Save target" }).click();
  await expect(inspector).toContainText("Needs $160.00 more this month.");
  // "Needs $X" on the row assigns exactly that, once. The open drawer
  // covers the row's right edge, so close it first.
  await page.goto(route("/budget"));
  const row = page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("row")
    .filter({ has: page.getByRole("link", { name, exact: true }) });
  const fund = row
    .getByRole("button", { name: `Assign $160.00 to ${name}`, exact: true })
    .filter({ visible: true });
  await fund.click();
  await expect(fund).toHaveCount(0);
  await row.getByRole("link", { name, exact: true }).click();
  await expect(inspector).toContainText("Funded for this month.");
  // Hand it back, so later tests see the same Ready to Assign.
  await inspector.getByLabel(`Assign to ${name}`, { exact: true }).fill("-160");
  await inspector.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(inspector).toContainText("Needs $160.00 more this month.");
  await inspector.getByRole("button", { name: "Remove target" }).click();
  await expect(inspector).toContainText("No target yet");
  await inspector.getByRole("link", { name: "Add recurring schedule" }).click();
  const schedule = panel(page, "Create a schedule");
  await expect(schedule.getByLabel("Name", { exact: true })).toHaveValue(name);
  await expect(schedule.getByLabel("Category 1", { exact: true })).toHaveValue(
    /.+/,
  );
});

test("sets a card's payment target from its terms, with no schedule", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms
    .getByLabel("Debt account", { exact: true })
    .selectOption({ label: "Card" });
  await terms.getByLabel("APR", { exact: true }).fill("24.00");
  await terms.getByLabel("Minimum percent of balance", { exact: true }).fill("1");
  await terms.getByLabel("Due day", { exact: true }).fill("15");
  // Cards are never scheduled; only loans offer a paying account.
  await expect(terms.getByLabel("Pay from", { exact: true })).toHaveCount(0);
  await terms.getByLabel("Set the payment target", { exact: true }).check();
  await terms.getByLabel("Monthly payment (USD)", { exact: true }).fill("40");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toContainText(
    "payment envelope now targets $40.00",
  );
  await page.goto(route("/budget"));
  await page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("link", { name: "Card", exact: true })
    .click();
  const inspector = panel(page, "Card");
  await expect(inspector.locator(".card-terms")).toContainText("due on day 15");
  // The target is there (its amount was reported on saving), with no schedule.
  await expect(inspector).toContainText("Due on day 15.");
  await expect(inspector.getByRole("button", { name: "Remove target" })).toBeVisible();
  await expect(inspector.locator(".category-schedules")).toHaveCount(0);
});

test("drags categories within and across groups, and groups among themselves", async ({
  page,
}, info) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const tag = info.project.name;
  const [first, second] = [`Drag A ${tag}`, `Drag B ${tag}`];
  const [one, two] = [`One ${tag}`, `Two ${tag}`];
  await addGroup(page, first);
  await addGroup(page, second);
  await addCategory(page, first, one);
  await addCategory(page, first, two);
  const ledger = page.getByRole("region", { name: "Category ledger" });
  const block = (name: string) =>
    ledger
      .locator(".ledger-block")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const names = (group: string) =>
    block(group).locator("tbody th[scope=row] > a").allTextContents();
  const drag = async (
    handle: string,
    onto: Locator,
    where: "top" | "bottom",
  ) => {
    // Mid-screen, clear of the edges where dragging scrolls the page.
    await onto.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const from = (await ledger
      .getByRole("button", { name: `Reorder ${handle}`, exact: true })
      .boundingBox())!;
    const to = (await onto.boundingBox())!;
    const x = from.x + from.width / 2;
    const y = from.y + from.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 8, { steps: 4 });
    await page.mouse.move(
      to.x + 40,
      to.y + (where === "top" ? to.height * 0.2 : to.height * 0.8),
      { steps: 20 },
    );
    await page.mouse.up();
  };
  const row = (name: string) =>
    ledger.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
  await expect.poll(() => names(first)).toEqual([one, two]);
  // Within a group: Two above One.
  await drag(two, row(one), "top");
  await expect.poll(() => names(first)).toEqual([two, one]);
  // Into another group: One onto the empty group's header.
  await drag(one, block(second).locator(".ledger-group"), "bottom");
  await expect.poll(() => names(second)).toEqual([one]);
  await expect.poll(() => names(first)).toEqual([two]);
  // Groups: the second above the first.
  await drag(second, block(first).locator(".ledger-group"), "top");
  const order = async () =>
    (await ledger.locator(".ledger-group h3").allTextContents()).filter((h) =>
      [first, second].includes(h),
    );
  await expect.poll(order).toEqual([second, first]);
  // The order is stored, not just shown.
  await page.reload();
  await expect.poll(order).toEqual([second, first]);
  await expect.poll(() => names(second)).toEqual([one]);
});

test("deletes an unused category and then its group", async ({ page }, info) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const group = `Temp ${info.project.name}`;
  const name = `Temp cat ${info.project.name}`;
  await addGroup(page, group);
  await addCategory(page, group, name);
  const ledger = page.getByRole("region", { name: "Category ledger" });
  await ledger.getByRole("link", { name, exact: true }).click();
  const inspector = panel(page, name);
  await inspector.locator("details.category-settings > summary").click();
  await inspector.locator("details.delete-category > summary").click();
  await inspector.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  await expect(ledger.getByRole("link", { name, exact: true })).toHaveCount(0);
  await page.goto(route("/budget"));
  await ledger.getByRole("button", { name: `Edit group ${group}` }).or(
    ledger.locator("summary", { hasText: group }),
  ).first().click();
  const settings = ledger.locator("details.group-settings").filter({ hasText: group });
  await settings.locator("details.delete-group > summary").click();
  await settings.getByRole("button", { name: `Delete ${group}`, exact: true }).click();
  await expect(ledger.getByRole("heading", { name: group, exact: true })).toHaveCount(0);
});

test("sets a removed card payment target up again from its terms", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/budget"));
  await page
    .getByRole("region", { name: "Category ledger" })
    .getByRole("link", { name: "Card", exact: true })
    .click();
  const inspector = panel(page, "Card");
  await inspector.getByRole("button", { name: "Remove target" }).click();
  await expect(inspector).toContainText("No target yet");
  await expect(inspector.getByLabel("Pay from", { exact: true })).toHaveCount(0);
  await inspector.getByLabel("Monthly payment (USD)", { exact: true }).fill("45");
  await inspector.getByRole("button", { name: "Set up payment", exact: true }).click();
  await expect(inspector).toContainText("$45.00");
  await expect(inspector.locator(".category-schedules")).toHaveCount(0);
});

test("edits a card's recorded terms with every field filled in", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms.getByLabel("Debt account", { exact: true }).selectOption({ label: "Card" });
  await expect(terms.locator(".terms-mode")).toContainText("Editing Card");
  await expect(terms.getByLabel("APR", { exact: true })).toHaveValue("24.00");
  await expect(terms.getByLabel("Due day", { exact: true })).toHaveValue("15");
  await expect(terms.getByLabel("Minimum percent of balance", { exact: true })).toHaveValue("1.00");
  await terms.getByLabel("Fixed minimum (USD)", { exact: true }).fill("40");
  await expect(terms.locator(".minimum-preview")).toContainText("the minimum is");
  const before = await panel(page, "Recorded terms").getByRole("row").count();
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toContainText("Terms saved");
  // A correction replaces the version in force rather than adding one.
  await expect(panel(page, "Recorded terms").getByRole("row")).toHaveCount(before);
  await expect(
    panel(page, "What you owe").getByRole("row").filter({ hasText: "Card" }),
  ).toContainText("at least $40.00");
});

test("plans debt payoff from the card payment targets unless told otherwise", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/debt"));
  const scenario = panel(page, "Try a payoff plan");
  await expect(scenario.locator(".planned-note")).toContainText(
    "Showing what you pay now",
  );
  // The default is shown, not typed in for the owner.
  await expect(
    scenario.getByLabel("Total monthly budget (USD)", { exact: true }),
  ).toHaveValue("");
  // The schedule is keyed by each payment's due date; a debt with no due day
  // recorded shows its month instead.
  const schedule = page.locator("details").filter({ hasText: "Month by month" });
  await activate(page, schedule.locator("> summary"));
  const region = schedule.getByRole("region", { name: "Estimated payment schedule" });
  await expect(region.getByRole("columnheader", { name: "Due", exact: true })).toBeVisible();
  await expect(region.locator("tbody th").first()).toHaveText(
    /^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|[A-Z][a-z]{2} \d{4})$/,
  );
  await page.goto(route("/debt?extra=10"));
  await expect(
    panel(page, "Try a payoff plan").locator(".planned-note"),
  ).not.toContainText("Showing what you pay now");
});

test("records a balance transfer card's intro rate in one save", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms.getByLabel("Debt account", { exact: true }).selectOption({ label: "Card" });
  await terms.getByLabel("APR", { exact: true }).fill("26.99");
  await terms.getByLabel("Intro APR", { exact: true }).fill("0");
  // The promotion's last day; the regular rate takes over the day after.
  await terms.getByLabel("Intro rate ends", { exact: true }).fill("2031-02-28");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toContainText("0% until 2031-02-28, then 26.99%");
  const history = panel(page, "Recorded terms");
  await expect(history.getByRole("row").filter({ hasText: "26.99%" })).toContainText("March 2031");
  // Choosing the card again shows the intro as entered.
  await page.goto(route("/debt"));
  const again = panel(page, "Record the terms");
  await again.getByLabel("Debt account", { exact: true }).selectOption({ label: "Card" });
  await expect(again.getByLabel("Intro APR", { exact: true })).toHaveValue("0.00");
  await expect(again.getByLabel("Intro rate ends", { exact: true })).toHaveValue("2031-02-28");
  await expect(again.getByLabel("APR", { exact: true })).toHaveValue("26.99");
});

test("plans a deferred-interest card to be cleared before its deadline", async ({ page }) => {
  await signIn(page);
  await addAccount(page, "Store Card", "Credit card", "-600");
  const now = new Date();
  // The last day of the month three months ahead.
  const ends = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 4, 0))
    .toISOString()
    .slice(0, 10);
  await page.goto(route("/debt"));
  const terms = panel(page, "Record the terms");
  await terms.getByLabel("Debt account", { exact: true }).selectOption({ label: "Store Card" });
  await terms.getByLabel("APR", { exact: true }).fill("29.99");
  await terms.getByLabel("Fixed minimum (USD)", { exact: true }).fill("25");
  await terms.getByLabel("Intro APR", { exact: true }).fill("0");
  await terms.getByLabel("Intro rate ends", { exact: true }).fill(ends);
  await terms.getByLabel(/Deferred interest \(/).check();
  await terms.getByLabel("Deferred interest so far (USD)", { exact: true }).fill("30");
  await terms.getByRole("button", { name: "Save terms", exact: true }).click();
  await expect(terms.getByRole("status")).toContainText("deferred interest until");
  // Minimums alone leave a balance at the deadline, so the interest lands.
  await page.goto(route("/debt?budget=35"));
  const outcome = page
    .getByRole("region", { name: "Estimated outcome per debt" })
    .getByRole("row")
    .filter({ hasText: "Store Card" });
  await expect(outcome.locator(".deferred-outcome")).toContainText("Still owed at the deadline");
  // With room above the minimums, it is cleared in time.
  await page.goto(route("/debt?extra=200"));
  await expect(outcome.locator(".deferred-outcome")).toContainText(
    "Paid off before the deferred-interest deadline",
  );
  // Custom order is offered for every debt.
  await expect(
    panel(page, "Try a payoff plan").getByLabel("Order for Store Card", { exact: true }),
  ).toBeVisible();
});

test("adopts a payoff plan, which sets this month's card payment and can be stopped", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(route("/debt?extra=100"));
  const scenario = panel(page, "Try a payoff plan");
  await scenario.getByRole("button", { name: "Adopt this plan", exact: true }).click();
  await expect(scenario.getByRole("status")).toContainText("Plan adopted. This month: Store Card");
  await page.goto(route("/debt"));
  const adopted = page.locator("section.adopted-plan");
  await expect(adopted).toContainText("minimums plus $100.00");
  await expect(adopted).toContainText("Store Card");
  // With no scenario chosen, the estimate shown is the adopted plan.
  await expect(adopted).toContainText("The estimate on this page is this plan.");
  await expect(adopted.locator(".plan-tracking")).toContainText("keeps itself up to date");
  // A payment the bank will take anyway can be fixed; the plan works around it.
  const row = adopted.locator('.plan-payments li[data-card="Store Card"]');
  await activate(page, row.locator("summary"));
  await row.getByLabel("Store Card pays (USD)").fill("60");
  await row.getByRole("button", { name: "Fix this payment", exact: true }).click();
  await expect(row.getByText("Fixed", { exact: true })).toBeVisible();
  await expect(row).toContainText("$60.00");
  await row.getByRole("button", { name: "Let the plan choose Store Card's payment" }).click();
  await expect(row.getByText("Fixed", { exact: true })).toHaveCount(0);
  // Applied this month, so the Budget page does not ask again.
  await page.goto(route("/budget"));
  await expect(page.locator("section.debt-plan-due")).toHaveCount(0);
  // Later months read the card's target from the plan rather than repeating
  // this month's stored amount.
  await page.goto(route("/targets"));
  await page.getByRole("link", { name: "Next →", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Store Card" }),
  ).toContainText("from your payoff plan");
  // The plan changed what the bank must pay: it is listed until marked done,
  // and the Budget page points at it.
  await page.goto(route("/budget"));
  await expect(page.getByText(/card payments? needs? a change at the bank/)).toBeVisible();
  await page.goto(route("/debt"));
  const todo = page.locator("section[data-bank-todo]");
  const change = todo.locator('li[data-reminder="PAYMENT_CHANGE"]').filter({ hasText: "Store Card" });
  await expect(change).toContainText("Store Card's payment at the bank");
  await expect(todo).toContainText("Set NTFY_TOPIC on the server");
  await change.getByRole("button", { name: "Done at the bank", exact: true }).click();
  // Done: recorded as what the bank pays, so it leaves the list.
  await expect(change).toHaveCount(0);
  await adopted.getByRole("button", { name: "Stop following", exact: true }).click();
  await expect(page.locator("section.adopted-plan")).toHaveCount(0);
});

test("moves category money back to Ready to Assign from Move money", async ({ page }) => {
  await signIn(page);
  await page.goto(route("/budget"));
  const move = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Move money" }) })
    .first();
  await activate(page, move.locator("> summary"));
  await move.getByLabel("Move money from category").selectOption({ label: "Food" });
  await move
    .getByLabel("Move money to category")
    .selectOption({ label: "Ready to Assign" });
  await move.getByLabel("Amount (USD)").fill("1");
  await move.getByRole("button", { name: "Move money", exact: true }).click();
  await expect(move.getByRole("status")).toBeVisible();
  const moves = page.getByRole("region", { name: "Money moves" });
  await activate(page, moves.locator("> summary"));
  await expect(moves).toContainText("From Food to Ready to Assign");
});
