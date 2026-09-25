import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { authorize, fail, today } from "./finance";
import {
  balancesAt,
  comparisonPeriod,
  flows,
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
      const [accounts, categories, transactions, splits] = await Promise.all([
        tx.financialAccount.findMany({
          where: { budgetId },
          orderBy: { name: "asc" },
        }),
        tx.category.findMany({ where: { budgetId } }),
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
        transactions: transactions.map((t) => ({
          ...t,
          date: t.date.toISOString().slice(0, 10),
          splits: byTransaction.get(t.id) ?? [],
        })),
      };
      const period: Period = { from: `${from}-01`, through: monthEnd(through) };
      const compared =
        query.compare === "none"
          ? null
          : comparisonPeriod(period, query.compare);
      const main = flows(input, period);
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
        period,
        compared,
        flows: { ...main, lines: undefined },
        previous: compared ? flows(input, compared) : null,
        months: monthlyFlows(input, from, through),
        worth: netWorthSeries(input, from, through),
        balances: accounts.map((a) => ({
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
        accountNames: new Map(accounts.map((a) => [a.id, a.name])),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
