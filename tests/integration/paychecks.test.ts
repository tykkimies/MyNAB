import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { getDb } from "@/infrastructure/db";
import { createOwner } from "@/application/auth";
import { executeFinance, type FinanceCommand } from "@/application/finance";
import { getPaychecks } from "@/application/paychecks";

const db = getDb();
let userId: string, budgetId: string;
const run = (command: FinanceCommand) =>
  executeFinance(userId, budgetId, randomUUID(), command);
async function clear() {
  await db.$executeRawUnsafe(
    'TRUNCATE "Budget", "User", "Installation", "LoginThrottle" CASCADE',
  );
}
beforeEach(async () => {
  await clear();
  const owner = await createOwner("owner", "synthetic-paycheck-passphrase");
  userId = owner.userId;
  budgetId = (await db.budget.findFirstOrThrow()).id;
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await clear();
  await db.$disconnect();
});

it("places each bill in the paycheck that covers it, and spending in its period", async () => {
  const cash = (
    await run({ type: "account.create", name: "Checking", accountType: "CHECKING", participation: "BUDGET", opening: "5000", date: "2026-08-01" })
  ).id;
  const card = (
    await run({ type: "account.create", name: "Card", accountType: "CREDIT_CARD", participation: "BUDGET", opening: "0", date: "2026-08-01" })
  ).id;
  const groupId = (await run({ type: "group.create", name: "Bills" })).id;
  const category = async (name: string) =>
    (await run({ type: "category.create", name, groupId })).id;
  const internet = await category("Internet");
  const prime = await category("Prime");
  const car = await category("Car");
  const food = await category("Food");
  await run({ type: "target.set", categoryId: internet, targetType: "MONTHLY", amount: "69.99", targetDueDay: 14, effectiveFrom: "2026-08" });
  await run({ type: "target.set", categoryId: prime, targetType: "PERIODIC", amount: "147.34", dueMonth: "2026-11", cadenceMonths: 12, targetDueDay: 28, effectiveFrom: "2026-08" });
  // The car is scheduled: counted once, from the schedule, not its target.
  await run({ type: "target.set", categoryId: car, targetType: "MONTHLY", amount: "561.22", targetDueDay: 10, effectiveFrom: "2026-08" });
  await run({ type: "schedule.create", name: "Car payment", accountId: cash, kind: "EXPENSE", amount: "-562", startDate: "2026-10-10", cadence: "MONTHLY", splits: [{ categoryId: car, amount: "" }] });
  await run({ type: "debt.terms.set", accountId: card, apr: "20", minimumPayment: "40", dueDay: 13 });
  await run({ type: "schedule.create", name: "Paycheck", accountId: cash, kind: "INCOME", amount: "3069.55", startDate: "2026-09-15", cadence: "TWICE_MONTHLY" });
  await run({ type: "transaction.create", accountId: cash, kind: "INCOME", date: "2026-09-30", amount: "3069.55", payee: "Employer" });
  await run({ type: "transaction.create", accountId: cash, kind: "EXPENSE", date: "2026-09-20", amount: "-25", payee: "Grocer", splits: [{ categoryId: food, amount: "-25" }] });

  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-05T16:00:00Z"));
  const report = await getPaychecks(userId, budgetId, { from: "2026-09", through: "2026-10" });
  if (report.noPaycheck) throw new Error("expected a paycheck");
  expect(report.pay).toMatchObject({ name: "Paycheck", amount: 306955n });
  const first = report.bills[0];
  expect([first.start, first.end, first.income, first.expected]).toEqual(["2026-09-30", "2026-10-14", 306955n, false]);
  expect(first.bills.map((b) => [b.date, b.name, b.amount, b.source])).toEqual([
    ["2026-10-10", "Car payment", 56200n, "schedule"],
    ["2026-10-13", "Card", 4000n, "card"],
    ["2026-10-14", "Internet", 6999n, "target"],
  ]);
  expect(first.due).toBe(67199n);
  // A yearly bill appears only in the period it falls due.
  const withPrime = report.bills.filter((p) => p.bills.some((b) => b.name === "Prime"));
  expect(withPrime.map((p) => p.start)).toEqual(["2026-11-15"]);
  expect(report.bills.find((p) => p.start === "2026-10-15")).toMatchObject({ expected: true, income: 306955n });

  const spent = report.spending.find((p) => p.start === "2026-09-15")!;
  expect(spent).toMatchObject({ end: "2026-09-29", spent: 2500n, income: 0n, partial: false });
  expect(spent.top.map((c) => c.name)).toEqual(["Food"]);
  expect(report.spending[0]).toMatchObject({ start: "2026-09-30", partial: true, income: 306955n });
});

it("says so when no paycheck is scheduled", async () => {
  expect(
    await getPaychecks(userId, budgetId, { from: "2026-09", through: "2026-10" }),
  ).toEqual({ noPaycheck: true });
});
