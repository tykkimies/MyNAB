import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { authorize, fail, today, type Tx } from "./finance";
import { nextMonth } from "@/domain/budget";
import { ageOfMoney } from "@/domain/age-of-money";
import {
  balancesAt,
  comparisonPeriod,
  flows,
  incomeExpense,
  isLiability,
  monthEnd,
  monthlyFlows,
  netWorthSeries,
  type Period,
  type ReportInput,
} from "@/domain/reports";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const reportQuery = z.object({
  from: month.optional(),
  through: month.optional(),
  compare: z.enum(["none", "previous", "year"]).default("previous"),
  /** Drilldown: a category id, `account:<id>` for off-budget spending, or a flow. */
  line: z.string().max(80).optional(),
  payee: z.string().max(120).optional(),
  /** Reflect filters; absent means every account or category. */
  accounts: z.array(z.string().uuid()).max(200).optional(),
  categories: z.array(z.string().uuid()).max(500).optional(),
});
export type ReportQuery = z.input<typeof reportQuery>;

/**
 * Every report reads the same authorized snapshot and the same pure layer.
 * Nothing here writes. Voided transactions are left out: their replacement,
 * if any, is the live record.
 */
export async function getReports(
  userId: string,
  budgetId: string,
  raw: ReportQuery,
) {
  const parsed = reportQuery.safeParse(raw);
  if (!parsed.success) fail("Invalid report filters.");
  const query = parsed.data;
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const current = today(budget.timezone).slice(0, 7);
      const through = query.through ?? current;
      // Default: the six months up to and including this one.
      const [y, m] = through.split("-").map(Number);
      const start = new Date(Date.UTC(y, m - 6, 1)).toISOString().slice(0, 7);
      const from = query.from ?? start;
      if (from > through) fail("The start month must not be after the end.");
      if (
        (Number(through.slice(0, 4)) - Number(from.slice(0, 4))) * 12 +
          Number(through.slice(5)) -
          Number(from.slice(5)) >=
        60
      )
        fail("Choose at most five years at a time.");
      const { input, accounts, groups, categories } = await loadReportInput(
        tx,
        budgetId,
      );
      const age = ageOfMoney(input, today(budget.timezone));
      const accountIds = query.accounts?.length
        ? new Set(query.accounts)
        : undefined;
      const categoryIds = query.categories?.length
        ? new Set(query.categories)
        : undefined;
      const filter = { accountIds, categoryIds };
      const period: Period = { from: `${from}-01`, through: monthEnd(through) };
      const compared =
        query.compare === "none"
          ? null
          : comparisonPeriod(period, query.compare);
      const main = flows(input, period, filter);
      const balances = balancesAt(input, period.through);
      const drill = query.line
        ? main.lines.filter((l) =>
            ["income", "credits", "financing", "adjustments"].includes(
              query.line!,
            )
              ? l.flow === query.line
              : l.flow === "consumption" && l.key === query.line,
          )
        : query.payee !== undefined
          ? main.lines.filter(
              (l) =>
                l.flow === "consumption" &&
                (l.payee.trim().toLowerCase() || "(no payee)") ===
                  query.payee!.trim().toLowerCase(),
            )
          : null;
      return {
        from,
        through,
        compare: query.compare,
        ageOfMoney: age,
        period,
        compared,
        flows: { ...main, lines: undefined },
        previous: compared ? flows(input, compared, filter) : null,
        months: monthlyFlows(input, from, through, filter),
        worth: netWorthSeries(input, from, through, accountIds),
        incomeExpense: incomeExpense(input, from, through, filter),
        filters: {
          accounts: [...(accountIds ?? [])],
          categories: [...(categoryIds ?? [])],
        },
        options: {
          accounts: accounts.map((a) => ({ id: a.id, name: a.name, closed: a.closed })),
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            categories: categories
              .filter((c) => c.groupId === g.id && !c.archived)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((c) => ({ id: c.id, name: c.name })),
          })),
        },
        balances: accounts.filter((a) => !accountIds || accountIds.has(a.id)).map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          participation: a.participation,
          closed: a.closed,
          liability: isLiability(a),
          balance: balances.get(a.id) ?? 0n,
        })),
        drill,
        drillLabel: query.line ?? query.payee ?? null,
        // A category's month-by-month spending, from the same pure layer.
        trend:
          query.line &&
          !["income", "credits", "financing", "adjustments"].includes(
            query.line,
          )
            ? monthsBetween(from, through).map((month) => ({
                month,
                amount:
                  flows(
                    input,
                    { from: `${month}-01`, through: monthEnd(month) },
                    filter,
                  ).byCategory.find((c) => c.key === query.line)?.amount ?? 0n,
              }))
            : null,
        trendName:
          query.line && main.byCategory.find((c) => c.key === query.line)
            ? main.byCategory.find((c) => c.key === query.line)!.name
            : null,
        accountNames: new Map(accounts.map((a) => [a.id, a.name])),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

/** The unvoided ledger in the shape the pure report layer reads. */
export async function loadReportInput(tx: Tx, budgetId: string) {
  const [accounts, categories, groups, transactions, splits] = await Promise.all([
    tx.financialAccount.findMany({
      where: { budgetId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    tx.category.findMany({ where: { budgetId } }),
    tx.categoryGroup.findMany({
      where: { budgetId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    tx.financialTransaction.findMany({
      where: { budgetId, voidedAt: null },
      select: {
        id: true,
        date: true,
        kind: true,
        accountId: true,
        transferAccountId: true,
        amount: true,
        payee: true,
      },
    }),
    tx.financialSplit.findMany({
      where: { budgetId },
      select: { transactionId: true, categoryId: true, amount: true },
    }),
  ]);
  const byTransaction = new Map<
    string,
    { categoryId: string; amount: bigint }[]
  >();
  for (const s of splits)
    byTransaction.set(s.transactionId, [
      ...(byTransaction.get(s.transactionId) ?? []),
      { categoryId: s.categoryId, amount: s.amount },
    ]);
  const input: ReportInput = {
    accounts,
    categories,
    groups,
    transactions: transactions.map((t) => ({
      ...t,
      date: t.date.toISOString().slice(0, 10),
      splits: byTransaction.get(t.id) ?? [],
    })),
  };
  return { input, accounts, groups, categories };
}

function monthsBetween(from: string, through: string) {
  const months: string[] = [];
  for (let m = from; m <= through; m = nextMonth(m)) months.push(m);
  return months;
}
