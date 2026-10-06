import "../database-env";
import { expect, test } from "@playwright/test";
import { getDb } from "../../src/infrastructure/db";

const route = (path: string) => `${process.env.APP_BASE_PATH ?? ""}${path}`;

test("hides reconciled rows until View shows them", async ({ page }) => {
  await page.goto(route("/login"));
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page.getByLabel("Passphrase", { exact: true }).fill("synthetic-e2e-passphrase-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/budget$/);

  const db = getDb();
  const owner = await db.user.findFirstOrThrow({ where: { username: "owner" } });
  const { activeBudget } = await import("../../src/application/plans");
  const budget = await activeBudget(owner.id);
  if (!budget) throw new Error("No open budget");
  const { executeFinance, today } = await import("../../src/application/finance");
  const { randomUUID } = await import("node:crypto");
  const date = today(budget.timezone);
  const account = await executeFinance(owner.id, budget.id, randomUUID(), {
    type: "account.create",
    name: "View options checking",
    accountType: "CHECKING",
    participation: "BUDGET",
    opening: "25",
    date,
  });
  await executeFinance(owner.id, budget.id, randomUUID(), {
    type: "reconcile",
    accountId: account.id,
    date,
    observed: "25",
  });

  await page.goto(route(`/accounts/${account.id}`));
  await expect(page.getByText("This view is hiding every transaction.")).toBeVisible();
  await expect(page.locator(".register-row", { hasText: "Opening balance" })).toHaveCount(0);

  await page.locator("summary", { hasText: "View" }).click();
  await page.getByRole("checkbox", { name: "Show reconciled transactions" }).check();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  const opening = page.locator(".register-row", { hasText: "Opening balance" });
  await expect(opening).toBeVisible();
  // The cleared/reconciled column is hidden below the sm breakpoint.
  const narrow = (page.viewportSize()?.width ?? 1280) < 640;
  const locked = page.getByRole("img", { name: "Reconciled" });
  if (!narrow) await expect(locked).toBeVisible();

  await page.reload();
  await expect(opening).toBeVisible();
  if (!narrow) await expect(locked).toBeVisible();
});
