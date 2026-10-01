import { randomUUID } from "node:crypto";
import { getDb } from "@/infrastructure/db";
import { balancesAt, type ReportInput } from "@/domain/reports";
import {
  executeFinance,
  FinanceError,
  today,
  type FinanceCommand,
} from "./finance";
import { loadReportInput } from "./reports";
import { createPlan } from "./plans";

const dollars = (v: bigint) => {
  const a = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};
// 1999 -> "19.99", 250 -> "2.5", 0 -> "0".
const percent = (basisPoints: number) => String(basisPoints / 100);
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Versions still in force this month, plus any that start later. */
function currentAndFuture<T extends { effectiveFrom: string }>(
  versions: T[],
  month: string,
) {
  const sorted = [...versions].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  const inForce = sorted.filter((v) => v.effectiveFrom <= month).at(-1);
  return [
    ...(inForce ? [{ ...inForce, effectiveFrom: month }] : []),
    ...sorted.filter((v) => v.effectiveFrom > month),
  ];
}

/**
 * YNAB's Fresh Start: a new plan with the same accounts at today's balances,
 * the same categories, targets and schedules, and no history. Everything is
 * rebuilt through ordinary finance commands, so the new ledger is journaled
 * exactly as if it had been entered by hand. The old plan is not changed
 * until the very end, when it is renamed as archived; if anything fails
 * first, the original plan is exactly as it was.
 */
export async function freshStart(userId: string, budgetId: string) {
  const db = getDb();
  const member = await db.budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
  });
  if (!member) throw new FinanceError("Plan unavailable.");
  if (member.role !== "owner")
    throw new FinanceError("Only an owner can start fresh.");
  const source = await db.budget.findFirst({
    where: { id: budgetId, archivedAt: null },
  });
  if (!source) throw new FinanceError("Plan unavailable.");
  const date = today(source.timezone);
  const month = date.slice(0, 7);

  const [groups, categories, targets, terms, schedules, occurrences, views] =
    await Promise.all([
      db.categoryGroup.findMany({
        where: { budgetId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.category.findMany({
        where: { budgetId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      db.categoryTarget.findMany({ where: { budgetId } }),
      db.debtTerms.findMany({ where: { budgetId } }),
      db.schedule.findMany({
        where: { budgetId, archived: false, replacedById: null },
        orderBy: { createdAt: "asc" },
      }),
      db.scheduleOccurrence.findMany({
        where: { budgetId, date: { gte: new Date(date) } },
      }),
      db.focusedView.findMany({
        where: { budgetId },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      }),
    ]);
  const [splits, memberships, report] = await Promise.all([
    db.scheduleSplit.findMany({
      where: { budgetId },
      orderBy: { position: "asc" },
    }),
    db.focusedViewCategory.findMany({ where: { budgetId } }),
    getDb().$transaction((tx) => loadReportInput(tx, budgetId)),
  ]);
  const input: ReportInput = report.input;
  const balances = balancesAt(input, date);

  const plan = await createPlan(
    userId,
    `${source.name} (Fresh Start in progress)`.slice(0, 120),
    budgetId,
  );
  const run = (command: FinanceCommand) =>
    executeFinance(userId, plan.id, randomUUID(), command);
  const warnings: string[] = [];
  const attempt = async (what: string, command: FinanceCommand) => {
    try {
      return await run(command);
    } catch (error) {
      if (!(error instanceof FinanceError)) throw error;
      warnings.push(`${what}: ${error.message}`);
      return null;
    }
  };

  // Accounts first: a budget card account creates its own payment category.
  const accountMap = new Map<string, string>();
  for (const account of report.accounts) {
    if (account.closed) continue;
    const created = await run({
      type: "account.create",
      name: account.name,
      accountType: account.type as never,
      participation: account.participation as "BUDGET" | "TRACKING",
      opening: dollars(balances.get(account.id) ?? 0n),
      date,
    });
    accountMap.set(account.id, created.id);
  }
  const categoryMap = new Map<string, string>();
  const created = await db.category.findMany({
    where: { budgetId: plan.id, paymentAccountId: { not: null } },
  });
  for (const category of categories)
    if (category.paymentAccountId) {
      const account = accountMap.get(category.paymentAccountId);
      const match = created.find((c) => c.paymentAccountId === account);
      if (match) categoryMap.set(category.id, match.id);
    }

  for (const group of groups) {
    if (group.system) continue;
    const members = categories.filter(
      (c) => c.groupId === group.id && !c.archived && !c.system,
    );
    const groupId = (await run({ type: "group.create", name: group.name })).id;
    for (const category of members) {
      const id = (
        await run({ type: "category.create", name: category.name, groupId })
      ).id;
      categoryMap.set(category.id, id);
      if (category.note)
        await run({
          type: "category.update",
          id,
          name: category.name,
          groupId,
          archived: false,
          note: category.note,
        });
      if (category.hidden)
        await run({ type: "category.hide", id, hidden: true });
    }
    if (group.hidden)
      await run({ type: "group.hide", id: groupId, hidden: true });
  }

  const names = new Map(categories.map((c) => [c.id, c.name]));
  for (const [oldId, newId] of categoryMap) {
    const versions = targets.filter((t) => t.categoryId === oldId);
    for (const t of currentAndFuture(versions, month))
      await attempt(`Target for ${names.get(oldId)}`, {
        type: "target.set",
        categoryId: newId,
        targetType: t.type as never,
        amount:
          t.type === "DEBT_PAYOFF_BY_DATE" ? undefined : dollars(t.amount),
        dueMonth: t.dueMonth ?? undefined,
        cadenceMonths: t.cadenceMonths ?? undefined,
        refill: t.refill,
        dayOfWeek: t.dayOfWeek ?? undefined,
        targetDueDay: t.dueDay ?? undefined,
        effectiveFrom: t.effectiveFrom,
      });
  }

  const accountNames = new Map(report.accounts.map((a) => [a.id, a.name]));
  for (const [oldId, newId] of accountMap)
    for (const t of currentAndFuture(
      terms.filter((item) => item.accountId === oldId),
      month,
    ))
      await attempt(`Debt terms for ${accountNames.get(oldId)}`, {
        type: "debt.terms.set",
        accountId: newId,
        apr: percent(t.aprBasisPoints),
        minimumPayment: dollars(t.minimumPayment),
        minimumPercent: t.minimumPercentBasisPoints
          ? percent(t.minimumPercentBasisPoints)
          : undefined,
        minimumIncludesInterest: t.minimumIncludesInterest,
        dueDay: t.dueDay ?? undefined,
        creditLimit: t.creditLimit ? dollars(t.creditLimit) : undefined,
        statementBalance:
          t.statementBalance !== null && t.statementDate
            ? dollars(t.statementBalance < 0n ? -t.statementBalance : t.statementBalance)
            : undefined,
        statementDate:
          t.statementBalance !== null && t.statementDate
            ? day(t.statementDate)
            : undefined,
        effectiveFrom: t.effectiveFrom,
      });

  for (const schedule of schedules) {
    const accountId = accountMap.get(schedule.accountId);
    const transferAccountId = schedule.transferAccountId
      ? accountMap.get(schedule.transferAccountId)
      : undefined;
    const own = splits.filter((s) => s.scheduleId === schedule.id);
    if (
      !accountId ||
      (schedule.transferAccountId && !transferAccountId) ||
      own.some((s) => !categoryMap.has(s.categoryId))
    ) {
      warnings.push(
        `Schedule ${schedule.name}: it uses a closed account or archived category.`,
      );
      continue;
    }
    const made = await attempt(`Schedule ${schedule.name}`, {
      type: "schedule.create",
      name: schedule.name,
      accountId,
      transferAccountId,
      kind: schedule.kind as "INCOME" | "EXPENSE" | "TRANSFER",
      amount: dollars(schedule.amount),
      payee: schedule.payee,
      memo: schedule.memo,
      startDate: day(schedule.startDate),
      endDate: schedule.endDate ? day(schedule.endDate) : undefined,
      timezone: schedule.timezone,
      cadence: schedule.cadence as never,
      interval: schedule.interval,
      splits: own.map((s) => ({
        categoryId: categoryMap.get(s.categoryId)!,
        amount: dollars(s.amount),
      })),
    });
    // Anything already entered or skipped from today on stays handled, so
    // today's entry is not posted a second time into the new plan.
    if (made)
      for (const o of occurrences.filter((o) => o.scheduleId === schedule.id))
        await attempt(`Schedule ${schedule.name}`, {
          type: "schedule.skip",
          id: made.id,
          date: day(o.date),
        });
  }

  for (const view of views) {
    const ids = memberships
      .filter((m) => m.viewId === view.id)
      .map((m) => categoryMap.get(m.categoryId))
      .filter((id): id is string => Boolean(id));
    if (ids.length)
      await attempt(`View ${view.name}`, {
        type: "view.save",
        name: view.name,
        categoryIds: ids,
      });
  }

  const archivedName = `${source.name} (Archived ${date})`.slice(0, 120);
  await db.$transaction([
    db.budget.update({ where: { id: budgetId }, data: { name: archivedName } }),
    db.budget.update({ where: { id: plan.id }, data: { name: source.name } }),
    db.auditEvent.create({
      data: {
        actorId: userId,
        budgetId: plan.id,
        action: "FINANCE_COMMAND",
        entityId: plan.id,
        details: {
          type: "plan.fresh-start",
          from: budgetId,
          warnings,
        },
      },
    }),
  ]);
  return { id: plan.id, warnings };
}
