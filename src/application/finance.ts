import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { isRetryableConflict } from "@/infrastructure/retry";
import type { Prisma } from "@/generated/prisma/client";
import { financialDate, budgetMonth } from "@/domain/dates";
import { formatUSD, money, parseUSD } from "@/domain/money";
import {
  isCard,
  nextMonth,
  projectBudget,
  type BudgetInput,
} from "@/domain/budget";
import { STARTER_GROUPS } from "@/domain/starter";
import {
  evaluateTarget,
  planFunding,
  type DebtContext,
  type TargetType,
} from "@/domain/goals";
import { versionFor } from "@/domain/versions";
import { occurrences } from "@/domain/schedules";
import { timezone as validTimezone } from "@/domain/dates";
import { loadRulePreview } from "./rules";
const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const amount = z
  .string()
  .max(24)
  .refine((v) => {
    try {
      parseUSD(v);
      return true;
    } catch {
      return false;
    }
  }, "Enter a USD amount with at most two decimal places.");
const date = z.string().refine((v) => {
  try {
    financialDate(v);
    return v >= "1900-01-01" && v <= "2200-12-31";
  } catch {
    return false;
  }
}, "Invalid date");
const month = z.string().refine((v) => {
  try {
    budgetMonth(v);
    return v >= "1900-01" && v <= "2200-12";
  } catch {
    return false;
  }
}, "Invalid month");
const reason = z.string().trim().min(1).max(500);
/** Account types that can owe money and therefore carry contract terms. */
export const DEBT_TYPES = [
  "CREDIT_CARD",
  "LINE_OF_CREDIT",
  "LOAN",
  "OTHER_LIABILITY",
];
const accountTypes = [
  "CHECKING",
  "SAVINGS",
  "CASH",
  "CREDIT_CARD",
  "LINE_OF_CREDIT",
  "LOAN",
  "INVESTMENT",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
] as const;
const scheduleFields = {
  name,
  accountId: uuid,
  transferAccountId: uuid.optional(),
  kind: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount,
  payee: z.string().trim().max(120).default(""),
  memo: z.string().trim().max(500).default(""),
  startDate: date,
  endDate: date.optional(),
  timezone: z.string().max(64).optional(),
  cadence: z.enum(["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
  interval: z.number().int().min(1).max(1200).default(1),
  splits: z
    .array(z.object({ categoryId: uuid, amount }))
    .max(50)
    .default([]),
};
export const financeCommand = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("transaction.protect"),
    id: uuid,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    locked: z
      .array(
        z.enum(["payee", "categoryId", "memo", "tags", "transferAccountId"]),
      )
      .max(5),
  }),
  z.object({
    type: z.literal("rule.apply"),
    id: uuid,
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgeReconciled: z.boolean().default(false),
  }),

  z.object({
    type: z.literal("rule.save"),
    id: uuid.optional(),
    revision: z.number().int().positive().optional(),
    name,
    priority: z.number().int().min(0).max(100000).default(100),
    enabled: z.boolean().default(true),
    accountId: uuid.optional(),
    payeeMatch: name.optional(),
    matchMode: z.enum(["EXACT", "CONTAINS"]).default("CONTAINS"),
    descriptionContains: reason.optional(),
    minimum: amount.optional(),
    maximum: amount.optional(),
    renamePayee: name.optional(),
    categoryId: uuid.optional(),
    memo: reason.optional(),
    tags: z.string().trim().max(500).optional(),
    transferAccountId: uuid.optional(),
  }),

  z.object({ type: z.literal("schedule.create"), ...scheduleFields }),
  z.object({
    type: z.literal("schedule.replace"),
    id: uuid,
    revision: z.number().int().positive(),
    ...scheduleFields,
  }),
  z.object({
    type: z.literal("schedule.match"),
    id: uuid,
    date,
    transactionId: uuid,
  }),
  z.object({
    type: z.literal("schedule.archive"),
    id: uuid,
    archived: z.boolean(),
  }),
  z.object({ type: z.literal("schedule.approve"), id: uuid, date }),
  z.object({ type: z.literal("schedule.skip"), id: uuid, date }),
  z.object({
    type: z.enum(["recurring.dismiss", "recurring.restore"]),
    key: z.string().min(1).max(500),
  }),

  z.object({
    type: z.literal("account.create"),
    name,
    accountType: z.enum(accountTypes),
    participation: z.enum(["BUDGET", "TRACKING"]),
    opening: amount,
    date,
  }),
  z.object({
    type: z.literal("account.update"),
    id: uuid,
    name,
    closed: z.boolean(),
    version: z.number().int().positive(),
  }),
  z.object({ type: z.literal("group.create"), name }),
  z.object({ type: z.literal("starter.apply") }),
  z.object({
    type: z.literal("target.set"),
    categoryId: uuid,
    targetType: z.enum([
      "BALANCE",
      "BALANCE_BY_DATE",
      "MONTHLY",
      "WEEKLY",
      "SPENDING_LIMIT",
      "PERIODIC",
      "MAINTAIN",
      "DEBT_PAYOFF",
      "DEBT_PAYOFF_BY_DATE",
    ]),
    // A payoff-by-date target carries no amount: what is owed comes from the
    // ledger, so the field is genuinely absent rather than zero.
    amount: amount.optional(),
    dueMonth: month.optional(),
    cadenceMonths: z.number().int().min(1).max(120).optional(),
    refill: z.boolean().default(false),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    // The month this version takes effect. Earlier months keep what they had.
    effectiveFrom: month.optional(),
  }),
  z.object({ type: z.literal("target.clear"), categoryId: uuid }),
  z.object({
    type: z.literal("debt.terms.set"),
    accountId: uuid,
    apr: z.string().max(8),
    minimumPayment: amount,
    dueDay: z.number().int().min(1).max(31).optional(),
    creditLimit: amount.optional(),
    // A promotional rate ending is a later version of the same terms.
    effectiveFrom: month.optional(),
  }),
  z.object({
    type: z.literal("debt.terms.clear"),
    accountId: uuid,
    // One version, or every version when absent.
    effectiveFrom: month.optional(),
  }),
  z.object({ type: z.literal("target.fund"), month }),
  z.object({ type: z.literal("group.rename"), id: uuid, name }),
  z.object({ type: z.literal("category.create"), name, groupId: uuid }),
  z.object({
    type: z.literal("category.update"),
    id: uuid,
    name,
    groupId: uuid,
    archived: z.boolean(),
  }),
  z.object({ type: z.literal("assign"), categoryId: uuid, month, amount }),
  z.object({ type: z.literal("move"), from: uuid, to: uuid, month, amount }),
  z.object({
    type: z.literal("transaction.create"),
    accountId: uuid,
    transferAccountId: uuid.optional(),
    kind: z.enum([
      "INCOME",
      "EXPENSE",
      "REFUND",
      "CREDIT",
      "ADJUSTMENT",
      "TRANSFER",
    ]),
    date,
    amount,
    payee: z.string().trim().max(120).default(""),
    memo: z.string().trim().max(500).default(""),
    cleared: z.boolean().default(false),
    splits: z
      .array(z.object({ categoryId: uuid, amount }))
      .max(50)
      .default([]),
    replacesId: uuid.optional(),
    refundOfId: uuid.optional(),
    reason: reason.optional(),
    acknowledgeReconciled: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("transaction.void"),
    id: uuid,
    reason,
    acknowledgeReconciled: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("transaction.clear"),
    id: uuid,
    accountId: uuid,
    cleared: z.boolean(),
    acknowledgeReconciled: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("reconcile"),
    accountId: uuid,
    date,
    observed: amount,
    adjustmentReason: reason.optional(),
  }),
]);
export type FinanceCommand = z.input<typeof financeCommand>;
export class FinanceError extends Error {}
export type Tx = Prisma.TransactionClient;
export function fail(message: string): never {
  throw new FinanceError(message);
}
export function today(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export async function authorize(tx: Tx, userId: string, budgetId: string) {
  const member = await tx.budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId } },
  });
  if (!member) fail("Budget unavailable.");
  return tx.budget.findUniqueOrThrow({ where: { id: budgetId } });
}
/**
 * The target version in force for a month, as the domain sees it. Stored rows
 * are versions; a month reads the latest one effective on or before it.
 */
type StoredTarget = {
  categoryId: string;
  type: string;
  amount: bigint;
  dueMonth: string | null;
  cadenceMonths: number | null;
  refill: boolean;
  dayOfWeek: number | null;
  effectiveFrom: string;
};
function targetInForce(
  rows: StoredTarget[],
  categoryId: string,
  month: string,
) {
  const version = versionFor(
    rows.filter((r) => r.categoryId === categoryId),
    month,
  );
  if (!version) return null;
  return {
    type: version.type as TargetType,
    amount: version.amount,
    dueMonth: version.dueMonth ?? undefined,
    cadenceMonths: version.cadenceMonths ?? undefined,
    refill: version.refill,
    dayOfWeek: version.dayOfWeek ?? undefined,
    effectiveFrom: version.effectiveFrom,
  };
}
/**
 * What a card owes, for a payoff target on its payment category. Read from the
 * projection every time, so it can never disagree with the ledger.
 */
function owedByCard(
  category: { paymentAccountId: string | null },
  accounts: { id: string; balance: bigint }[],
): DebtContext | undefined {
  if (!category.paymentAccountId) return undefined;
  const account = accounts.find((a) => a.id === category.paymentAccountId);
  if (!account) return undefined;
  return { owed: account.balance < 0n ? -account.balance : 0n };
}
async function load(tx: Tx, budgetId: string) {
  const [
    accounts,
    groups,
    categories,
    transactions,
    splits,
    assignments,
    states,
    reconciliations,
  ] = await Promise.all([
    tx.financialAccount.findMany({
      where: { budgetId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.categoryGroup.findMany({
      where: { budgetId },
      orderBy: [{ system: "asc" }, { name: "asc" }, { id: "asc" }],
    }),
    tx.category.findMany({
      where: { budgetId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    tx.financialTransaction.findMany({
      where: { budgetId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
    }),
    tx.financialSplit.findMany({
      where: { budgetId },
      orderBy: { position: "asc" },
    }),
    tx.budgetAssignment.findMany({ where: { budgetId } }),
    tx.transactionState.findMany({ where: { budgetId } }),
    tx.reconciliation.findMany({
      where: { budgetId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const input: BudgetInput = {
    accounts,
    categories,
    transactions: transactions
      .filter((t) => !t.voidedAt)
      .map((t) => ({
        ...t,
        date: t.date.toISOString().slice(0, 10),
        splits: splits.filter((s) => s.transactionId === t.id),
      })),
    assignments,
  };
  return {
    accounts,
    groups,
    categories,
    transactions,
    splits,
    assignments,
    states,
    reconciliations,
    input,
  };
}
export async function getFinance(
  userId: string,
  budgetId: string,
  requestedMonth?: string,
) {
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const currentDate = today(budget.timezone);
      const selected = requestedMonth ?? currentDate.slice(0, 7);
      if (
        !month.safeParse(selected).success ||
        selected > nextMonth(currentDate.slice(0, 7), 24)
      )
        fail("Invalid budget month.");
      const data = await load(tx, budgetId);
      const projection = projectBudget(data.input, selected);
      const stored = await tx.categoryTarget.findMany({ where: { budgetId } });
      // Target progress is derived, never stored: it is only ever a reading of
      // the projection, so it cannot drift from what the budget actually holds.
      // Which target is read is the version in force for the month, so looking
      // at March shows what March was actually asked to do.
      const targets = data.categories.flatMap((cat) => {
        const definition = targetInForce(stored, cat.id, selected);
        const row = projection.categories.find((r) => r.id === cat.id);
        if (!definition || !row) return [];
        return [
          {
            ...definition,
            categoryId: cat.id,
            progress: evaluateTarget(
              definition,
              row,
              selected,
              owedByCard(cat, projection.accounts),
            ),
          },
        ];
      });
      return {
        ...data,
        budget,
        today: currentDate,
        month: selected,
        projection,
        targets,
        underfunded: targets.reduce(
          (sum, t) => sum + t.progress.contribution,
          0n,
        ),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}
/**
 * Which targets were met in earlier months, per PROJECT_SPEC section 7.
 *
 * Completion is derived, not stored: each month is projected and the target
 * version in force for that month is evaluated against it. A stored flag could
 * disagree with the ledger after a correction, and nothing would say which was
 * right. Bounded to a year, because the cost is one projection per month.
 */
export async function getTargetHistory(
  userId: string,
  budgetId: string,
  months = 12,
) {
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const current = today(budget.timezone).slice(0, 7);
      const data = await load(tx, budgetId);
      const stored = await tx.categoryTarget.findMany({ where: { budgetId } });
      const span = Math.min(Math.max(months, 1), 24);
      const history = [];
      for (let back = span; back >= 1; back--) {
        const month = nextMonth(current, -back);
        const projection = projectBudget(data.input, month);
        const entries = data.categories.flatMap((cat) => {
          const definition = targetInForce(stored, cat.id, month);
          const row = projection.categories.find((r) => r.id === cat.id);
          if (!definition || !row) return [];
          const progress = evaluateTarget(
            definition,
            row,
            month,
            owedByCard(cat, projection.accounts),
          );
          return [
            {
              categoryId: cat.id,
              name: cat.name,
              type: definition.type,
              met: progress.state === "MET",
              shortfall: progress.contribution,
            },
          ];
        });
        if (entries.length) history.push({ month, entries });
      }
      return history;
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}
export async function getDebtTerms(userId: string, budgetId: string) {
  return getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    return tx.debtTerms.findMany({ where: { budgetId } });
  });
}
export async function journal(
  tx: Tx,
  budgetId: string,
  date: string,
  accountId: string,
  amount: bigint,
  kind: string,
  transferAccountId?: string,
  reversesId?: string,
) {
  money(amount);
  money(-amount);
  const j = await tx.journal.create({
    data: { budgetId, date: new Date(`${date}T00:00:00Z`), reversesId },
  });
  await tx.posting.createMany({
    data: [
      { budgetId, journalId: j.id, accountId, amount },
      {
        budgetId,
        journalId: j.id,
        accountId: transferAccountId,
        systemAccount: transferAccountId ? undefined : kind,
        amount: -amount,
      },
    ],
  });
  return j.id;
}
async function markAffected(
  tx: Tx,
  budgetId: string,
  transactionId: string,
  acknowledge: boolean,
) {
  const items = await tx.reconciliationItem.findMany({
    where: { budgetId, transactionId },
  });
  if (items.length && !acknowledge)
    fail(
      "This transaction was reconciled. Acknowledge that the statement comparison will need review.",
    );
  if (items.length)
    await tx.reconciliation.updateMany({
      where: { budgetId, id: { in: items.map((i) => i.reconciliationId) } },
      data: { affectedAt: new Date() },
    });
}
export async function voidTransaction(
  tx: Tx,
  budgetId: string,
  id: string,
  why: string,
  ack: boolean,
) {
  const t = await tx.financialTransaction.findFirst({
    where: { budgetId, id, voidedAt: null },
  });
  if (!t) fail("Transaction unavailable or already corrected.");
  const closed = await tx.financialAccount.count({
    where: {
      budgetId,
      closed: true,
      id: {
        in: [
          t.accountId,
          ...(t.transferAccountId ? [t.transferAccountId] : []),
        ],
      },
    },
  });
  if (closed)
    fail("Reopen the affected accounts before correcting this transaction.");
  if (
    await tx.financialTransaction.count({
      where: { budgetId, refundOfId: id, voidedAt: null },
    })
  )
    fail("Correct linked refunds before correcting their purchase.");
  await markAffected(tx, budgetId, id, ack);
  await journal(
    tx,
    budgetId,
    t.date.toISOString().slice(0, 10),
    t.accountId,
    -t.amount,
    t.kind,
    t.transferAccountId ?? undefined,
    t.journalId,
  );
  await tx.financialTransaction.update({
    where: { id },
    data: { voidedAt: new Date(), voidReason: why },
  });
  return t;
}
export async function executeFinance(
  userId: string,
  budgetId: string,
  key: string,
  raw: unknown,
) {
  if (!uuid.safeParse(budgetId).success || !uuid.safeParse(key).success)
    fail("Invalid request identifier.");
  const parsed = financeCommand.safeParse(raw);
  if (!parsed.success)
    fail(parsed.error.issues[0]?.message ?? "Invalid command.");
  const original = parsed.data;
  const hash = createHash("sha256")
    .update(JSON.stringify(original))
    .digest("hex");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await getDb().$transaction(
        async (tx) => {
          let c = original;
          const budget = await authorize(tx, userId, budgetId);
          await tx.$queryRaw`SELECT id FROM "Budget" WHERE id=${budgetId}::uuid FOR UPDATE`;
          const existing = await tx.financeRequest.findUnique({
            where: { budgetId_key: { budgetId, key } },
          });
          if (existing) {
            if (existing.payloadHash !== hash)
              fail(
                "This request identifier has already been used for a different change.",
              );
            return existing.result as { id: string; message: string };
          }
          const currentDate = today(budget.timezone),
            currentMonth = currentDate.slice(0, 7);
          let ruleTags: string[] | undefined;
          let ruleLocks: string[] | undefined;
          if (c.type === "rule.apply") {
            const view = await loadRulePreview(tx, budgetId, c.id);
            if (
              view.fingerprint !== c.fingerprint ||
              !view.transaction ||
              !view.preview
            )
              fail("Preview changed. Refresh and review again.");
            const t = view.transaction,
              p = view.preview.output;
            if (p.transferAccountId)
              fail(
                "A transfer suggestion requires explicit matching of both sides. It cannot be applied as a rule.",
              );
            if (
              !view.preview.explanation.some((e) =>
                e.applied.some((f) => f !== "transferAccountId"),
              )
            )
              fail("No unlocked fields can be changed by these rules.");
            const state = await tx.transactionState.findFirst({
              where: { budgetId, transactionId: t.id, accountId: t.accountId },
            });
            ruleTags = p.tags;
            ruleLocks = view.locked;
            if (
              p.payee === t.payee &&
              p.memo === t.memo &&
              p.categoryId ===
                (view.splits.length === 1
                  ? view.splits[0].categoryId
                  : undefined) &&
              JSON.stringify(p.tags) ===
                JSON.stringify(view.preference?.tags ?? [])
            )
              fail("These rules make no effective change.");
            if (
              (
                await tx.ingestedEntry.findMany({
                  where: { budgetId, transactionId: t.id },
                  select: { review: true },
                })
              ).some((e) => e.review)
            )
              fail("Resolve the bank change review before applying rules.");
            const dollars = (v: bigint) =>
              `${v < 0n ? "-" : ""}${(v < 0n ? -v : v) / 100n}.${((v < 0n ? -v : v) % 100n).toString().padStart(2, "0")}`;
            const splits =
              p.categoryId && view.splits.length === 1
                ? [{ categoryId: p.categoryId, amount: dollars(t.amount) }]
                : view.splits.map((s) => ({
                    categoryId: s.categoryId,
                    amount: dollars(s.amount),
                  }));
            c = financeCommand.parse({
              type: "transaction.create",
              accountId: t.accountId,
              kind: t.kind,
              date: t.date.toISOString().slice(0, 10),
              amount: dollars(t.amount),
              payee: p.payee,
              memo: p.memo,
              splits,
              replacesId: t.id,
              reason: "Applied reviewed automation rules",
              cleared: state?.cleared ?? false,
              acknowledgeReconciled: c.acknowledgeReconciled,
            });
          }
          let occurrence: { scheduleId: string; date: Date } | undefined;
          if (
            c.type === "schedule.approve" ||
            c.type === "schedule.skip" ||
            c.type === "schedule.match"
          ) {
            const schedule = await tx.schedule.findFirst({
              where: { id: c.id, budgetId, archived: false },
            });
            if (!schedule) fail("Schedule unavailable.");
            const scheduledDate = new Date(c.date);
            const consumed = await tx.scheduleOccurrence.findUnique({
              where: {
                scheduleId_date: {
                  scheduleId: schedule.id,
                  date: scheduledDate,
                },
              },
            });
            if (consumed) {
              const result = {
                id: consumed.transactionId ?? schedule.id,
                message: "Occurrence already handled.",
              };
              await tx.financeRequest.create({
                data: { budgetId, key, payloadHash: hash, result },
              });
              return result;
            }
            const due = occurrences(
              {
                ...schedule,
                cadence: schedule.cadence as "MONTHLY",
                startDate: schedule.startDate.toISOString().slice(0, 10),
                endDate: schedule.endDate?.toISOString().slice(0, 10),
              },
              c.date,
              c.date,
            );
            if (!due.length)
              fail("That date is not an occurrence of this schedule.");
            occurrence = { scheduleId: schedule.id, date: scheduledDate };
            if (c.type === "schedule.approve") {
              // Due in the schedule's own zone, and never a future ledger date.
              if (c.date > currentDate || c.date > today(schedule.timezone))
                fail(
                  "Approve on or after the scheduled date; future income is not budget money.",
                );
              const splits = await tx.scheduleSplit.findMany({
                where: { scheduleId: schedule.id, budgetId },
                orderBy: { position: "asc" },
              });
              const dollars = (v: bigint) =>
                `${v < 0n ? "-" : ""}${(v < 0n ? -v : v) / 100n}.${((v < 0n ? -v : v) % 100n).toString().padStart(2, "0")}`;
              c = financeCommand.parse({
                type: "transaction.create",
                accountId: schedule.accountId,
                transferAccountId: schedule.transferAccountId ?? undefined,
                kind: schedule.kind,
                date: c.date,
                amount: dollars(schedule.amount),
                payee: schedule.payee,
                memo: schedule.memo,
                splits: splits.map((s) => ({
                  categoryId: s.categoryId,
                  amount: dollars(s.amount),
                })),
              });
            }
          }
          const data = await load(tx, budgetId);
          const account = (id: string) =>
            data.accounts.find((a) => a.id === id) ??
            fail("Account unavailable.");
          const category = (id: string) => {
            const cat =
              data.categories.find((a) => a.id === id) ??
              fail("Category unavailable.");
            if (cat.archived) fail("Restore this category first.");
            return cat;
          };
          const group = (id: string) =>
            data.groups.find((g) => g.id === id && !g.system) ??
            fail("Category group unavailable.");
          const activeAccount = (id: string) => {
            const a = account(id);
            if (a.closed) fail("Reopen this account first.");
            return a;
          };
          const validDate = (d: string) => {
            if (d > currentDate)
              fail(
                "Future transactions belong to schedules; enter a date through today.",
              );
          };
          let id = budgetId;
          let message = "Saved.";
          if (c.type === "transaction.protect") {
            const view = await loadRulePreview(tx, budgetId, c.id);
            if (view.fingerprint !== c.fingerprint || !view.transaction)
              fail("Preview changed. Refresh before saving protection.");
            await tx.transactionPreference.upsert({
              where: { transactionId: c.id },
              create: {
                transactionId: c.id,
                budgetId,
                locked: [...new Set(c.locked)],
                tags: [],
              },
              update: {
                locked: [...new Set(c.locked)],
                revision: { increment: 1 },
              },
            });
            id = c.id;
            message = "Field protection saved. Review the refreshed proposal.";
          } else if (c.type === "rule.save") {
            if (c.accountId) activeAccount(c.accountId);
            if (c.transferAccountId) activeAccount(c.transferAccountId);
            if (c.categoryId && category(c.categoryId).paymentAccountId)
              fail("Rules cannot assign payment categories.");
            const minimum =
                c.minimum === undefined ? null : parseUSD(c.minimum),
              maximum = c.maximum === undefined ? null : parseUSD(c.maximum);
            if (minimum !== null && maximum !== null && minimum > maximum)
              fail("Minimum must not exceed maximum.");
            const tags = [
              ...new Set(
                (c.tags ?? "")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              ),
            ];
            if (tags.length > 20 || tags.some((t) => t.length > 40))
              fail("Use at most 20 tags, each at most 40 characters.");
            if (
              !c.accountId &&
              !c.payeeMatch &&
              !c.descriptionContains &&
              minimum === null &&
              maximum === null
            )
              fail("Add at least one matching condition.");
            if (
              !c.renamePayee &&
              !c.categoryId &&
              !c.memo &&
              !tags.length &&
              !c.transferAccountId
            )
              fail("Choose at least one rule action.");
            const values = {
              name: c.name,
              priority: c.priority,
              enabled: c.enabled,
              accountId: c.accountId ?? null,
              payeeMatch: c.payeeMatch ?? null,
              matchMode: c.matchMode,
              descriptionContains: c.descriptionContains ?? null,
              minimum,
              maximum,
              renamePayee: c.renamePayee ?? null,
              categoryId: c.categoryId ?? null,
              memo: c.memo ?? null,
              tags,
              transferAccountId: c.transferAccountId ?? null,
            };
            if (c.id) {
              if (!c.revision) fail("Refresh the rule before editing.");
              if (
                !(
                  await tx.automationRule.updateMany({
                    where: { id: c.id, budgetId, revision: c.revision },
                    data: { ...values, revision: { increment: 1 } },
                  })
                ).count
              )
                fail(
                  "This rule changed or is unavailable. Refresh before saving.",
                );
              id = c.id;
            } else {
              id = randomUUID();
              await tx.automationRule.create({
                data: { id, budgetId, ...values },
              });
            }
            message =
              "Rule saved. Use preview to inspect its effect; existing transactions are unchanged.";
          } else if (
            c.type === "schedule.create" ||
            c.type === "schedule.replace"
          ) {
            id = randomUUID();
            const a = activeAccount(c.accountId);
            const b = c.transferAccountId
              ? activeAccount(c.transferAccountId)
              : undefined;
            const value = parseUSD(c.amount);
            if (
              !value ||
              (c.kind === "EXPENSE" && value >= 0n) ||
              (c.kind === "INCOME" && (value <= 0n || isCard(a)))
            )
              fail("Use negative expenses and positive cash income.");
            if (c.kind === "TRANSFER" ? !b || b.id === a.id : !!b)
              fail("Choose a different destination only for transfers.");
            const zone = c.timezone ?? budget.timezone;
            try {
              validTimezone(zone);
              occurrences(
                {
                  id,
                  startDate: c.startDate,
                  endDate: c.endDate,
                  timezone: zone,
                  cadence: c.cadence,
                  interval: c.interval,
                },
                c.startDate,
                c.startDate,
              );
            } catch {
              fail("Invalid schedule dates or timezone.");
            }
            const boundary = b && a.participation !== b.participation;
            const leg = a.participation === "BUDGET" ? value : -value;
            const needsSplits = boundary
              ? leg < 0n
              : a.participation === "BUDGET" && c.kind === "EXPENSE";
            if (c.splits.length && !(needsSplits || boundary))
              fail("This schedule does not use category splits.");
            const splits = c.splits.map((split, position) => {
              const cat = category(split.categoryId),
                amount = parseUSD(split.amount);
              if (cat.paymentAccountId || !amount || amount > 0n !== leg > 0n)
                fail("Invalid schedule category split.");
              return {
                scheduleId: id,
                budgetId,
                categoryId: cat.id,
                amount,
                position,
              };
            });
            if (
              (needsSplits || splits.length) &&
              splits.reduce((sum, s) => sum + s.amount, 0n) !== leg
            )
              fail("Schedule splits must equal its amount.");
            await tx.schedule.create({
              data: {
                id,
                budgetId,
                accountId: a.id,
                transferAccountId: b?.id,
                name: c.name,
                kind: c.kind,
                amount: value,
                payee: c.payee,
                memo: c.memo,
                startDate: new Date(c.startDate),
                endDate: c.endDate ? new Date(c.endDate) : null,
                timezone: zone,
                cadence: c.cadence,
                interval: c.interval,
              },
            });
            if (c.type === "schedule.replace") {
              const previous = await tx.schedule.findFirst({
                where: {
                  id: c.id,
                  budgetId,
                  archived: false,
                  replacedById: null,
                  revision: c.revision,
                },
              });
              if (!previous)
                fail("This schedule changed. Refresh before editing.");
              if (c.startDate < currentDate)
                fail("Schedule changes must start today or later.");
              if (
                await tx.scheduleOccurrence.count({
                  where: {
                    scheduleId: previous.id,
                    date: { gte: new Date(c.startDate) },
                  },
                })
              )
                fail(
                  "An occurrence on or after that date is already handled. Choose a later start.",
                );
              const cutoff = new Date(c.startDate);
              cutoff.setUTCDate(cutoff.getUTCDate() - 1);
              await tx.schedule.update({
                where: { id: previous.id },
                data: {
                  replacedById: id,
                  revision: { increment: 1 },
                  ...(cutoff < previous.startDate
                    ? { archived: true }
                    : {
                        endDate:
                          previous.endDate && previous.endDate < cutoff
                            ? previous.endDate
                            : cutoff,
                      }),
                },
              });
            }
            if (splits.length)
              await tx.scheduleSplit.createMany({ data: splits });
            message = "Schedule saved. No money has been posted.";
          } else if (c.type === "schedule.archive") {
            if (
              !c.archived &&
              (await tx.schedule.findFirst({
                where: { id: c.id, budgetId, replacedById: { not: null } },
              }))
            )
              fail(
                "Restore the latest version instead; this schedule was replaced.",
              );
            if (
              !(
                await tx.schedule.updateMany({
                  where: { id: c.id, budgetId },
                  data: { archived: c.archived, revision: { increment: 1 } },
                })
              ).count
            )
              fail("Schedule unavailable.");
            id = c.id;
          } else if (c.type === "schedule.match") {
            const schedule = await tx.schedule.findFirstOrThrow({
              where: { id: c.id, budgetId },
            });
            const candidate = await tx.financialTransaction.findFirst({
              where: { id: c.transactionId, budgetId, voidedAt: null },
            });
            if (
              !candidate ||
              candidate.accountId !== schedule.accountId ||
              candidate.transferAccountId !== schedule.transferAccountId ||
              candidate.kind !== schedule.kind ||
              candidate.amount !== schedule.amount ||
              Math.abs(candidate.date.getTime() - new Date(c.date).getTime()) >
                7 * 86400000
            )
              fail(
                "Choose an unvoided transaction with the same account, type and amount within seven days.",
              );
            if (
              await tx.scheduleOccurrence.findFirst({
                where: { transactionId: candidate.id },
              })
            )
              fail("That transaction already handles another occurrence.");
            id = candidate.id;
            message =
              "Matched to the existing transaction. No money was posted.";
          } else if (c.type === "schedule.skip") {
            id = c.id;
          } else if (c.type === "recurring.dismiss") {
            await tx.recurringDismissal.upsert({
              where: { budgetId_key: { budgetId, key: c.key } },
              create: { budgetId, key: c.key },
              update: {},
            });
            message = "Suggestion dismissed. Restore it below at any time.";
          } else if (c.type === "recurring.restore") {
            await tx.recurringDismissal.deleteMany({
              where: { budgetId, key: c.key },
            });
            message = "Suggestion restored.";
          } else if (c.type === "account.create") {
            validDate(c.date);
            if (
              c.participation === "BUDGET" &&
              ![
                "CHECKING",
                "SAVINGS",
                "CASH",
                "CREDIT_CARD",
                "LINE_OF_CREDIT",
              ].includes(c.accountType)
            )
              fail("Loans and investments must be tracking accounts.");
            const a = await tx.financialAccount.create({
              data: {
                budgetId,
                name: c.name,
                type: c.accountType,
                participation: c.participation,
              },
            });
            id = a.id;
            if (isCard(a) && a.participation === "BUDGET") {
              let g = data.groups.find((g) => g.system);
              if (!g)
                g = await tx.categoryGroup.create({
                  data: {
                    budgetId,
                    name: "Credit card payments",
                    system: true,
                  },
                });
              await tx.category.create({
                data: {
                  budgetId,
                  groupId: g.id,
                  name: a.name,
                  paymentAccountId: a.id,
                },
              });
            }
            const opening = parseUSD(c.opening);
            if (opening) {
              const journalId = await journal(
                tx,
                budgetId,
                c.date,
                id,
                opening,
                "OPENING",
              );
              const t = await tx.financialTransaction.create({
                data: {
                  budgetId,
                  journalId,
                  accountId: id,
                  kind: "OPENING",
                  date: new Date(c.date),
                  amount: opening,
                  payee: "Opening balance",
                },
              });
              await tx.transactionState.create({
                data: {
                  budgetId,
                  accountId: id,
                  transactionId: t.id,
                  cleared: true,
                },
              });
            }
          } else if (c.type === "account.update") {
            const a = account(c.id);
            id = a.id;
            if (a.version !== c.version)
              fail("Account changed. Refresh and try again.");
            if (c.closed && !a.closed) {
              const links = await tx.providerAccount.findMany({
                where: { budgetId, accountId: id },
              });
              if (
                await tx.ingestedEntry.count({
                  where: {
                    budgetId,
                    providerAccountId: { in: links.map((l) => l.id) },
                    removed: false,
                    OR: [{ status: "PENDING" }, { approved: false }],
                  },
                })
              )
                fail(
                  "Resolve pending and unreviewed bank entries before closing.",
                );
              const balance = projectBudget(
                data.input,
                currentMonth,
              ).accounts.find((a) => a.id === id)!.balance;
              if (
                balance !== 0n ||
                data.states.some(
                  (s) =>
                    s.accountId === id &&
                    !s.cleared &&
                    data.input.transactions.some(
                      (t) => t.id === s.transactionId,
                    ),
                )
              )
                fail(
                  "Close only after reaching a zero balance and clearing every transaction.",
                );
              const latest = data.reconciliations.find(
                (r) => r.accountId === id,
              );
              if (!latest || latest.affectedAt || latest.observed !== 0n)
                fail("Reconcile the zero balance before closing this account.");
              const payment = data.categories.find(
                (c) => c.paymentAccountId === id,
              );
              if (
                payment &&
                data.assignments.some(
                  (a) => a.categoryId === payment.id && a.month > currentMonth,
                )
              )
                fail("Remove future payment assignments before closing.");
            }
            await tx.financialAccount.update({
              where: { id },
              data: {
                name: c.name,
                closed: c.closed,
                version: { increment: 1 },
              },
            });
            await tx.category.updateMany({
              where: { budgetId, paymentAccountId: id },
              data: { name: c.name, archived: c.closed },
            });
          } else if (c.type === "group.create") {
            id = (
              await tx.categoryGroup.create({
                data: { budgetId, name: c.name },
              })
            ).id;
          } else if (c.type === "group.rename") {
            group(c.id);
            id = c.id;
            await tx.categoryGroup.update({
              where: { id },
              data: { name: c.name },
            });
          } else if (c.type === "starter.apply") {
            // Offered only to an empty budget: applying it to an established one
            // would bury the owner's own structure in suggestions. A card's
            // payment category is not the owner's structure, though: adding a
            // credit card first must not lock the starter set away forever.
            if (
              data.categories.some(
                (cat) => !cat.system && !cat.paymentAccountId,
              )
            )
              fail("This budget already has categories.");
            for (const starter of STARTER_GROUPS) {
              const created = await tx.categoryGroup.create({
                data: { budgetId, name: starter.name },
              });
              await tx.category.createMany({
                data: starter.categories.map((categoryName) => ({
                  budgetId,
                  groupId: created.id,
                  name: categoryName,
                })),
              });
              id = created.id;
            }
          } else if (c.type === "target.set") {
            const cat = category(c.categoryId);
            const payoff =
              c.targetType === "DEBT_PAYOFF" ||
              c.targetType === "DEBT_PAYOFF_BY_DATE";
            // A payoff target belongs on a card's payment category, which is
            // exactly the category every other target type is refused.
            if (payoff && !cat.paymentAccountId)
              fail("A payoff target belongs on a credit card.");
            if (!payoff && (cat.paymentAccountId || cat.system))
              fail("This category is managed by the application.");
            const dated =
              c.targetType === "BALANCE_BY_DATE" ||
              c.targetType === "PERIODIC" ||
              c.targetType === "DEBT_PAYOFF_BY_DATE";
            if (dated && !c.dueMonth) fail("Choose the month this is due.");
            if (!dated && c.dueMonth)
              fail("This target type has no due month.");
            if (c.cadenceMonths && c.targetType !== "PERIODIC")
              fail("Only a periodic target repeats.");
            const weekly = c.targetType === "WEEKLY";
            if (weekly && c.dayOfWeek === undefined)
              fail("Choose the weekday a weekly target recurs on.");
            if (!weekly && c.dayOfWeek !== undefined)
              fail("Only a weekly target has a weekday.");
            if (
              c.refill &&
              c.targetType !== "MONTHLY" &&
              c.targetType !== "WEEKLY"
            )
              fail("Only a recurring target can refill.");
            // What a card owes is the ledger's answer, so this target type
            // takes no amount rather than storing one that could disagree.
            if (c.targetType === "DEBT_PAYOFF_BY_DATE") {
              if (c.amount)
                fail("Paying a card off by a date takes no amount.");
            } else if (!c.amount) fail("Enter an amount.");
            const value =
              c.targetType === "DEBT_PAYOFF_BY_DATE" ? 0n : parseUSD(c.amount!);
            if (c.targetType !== "DEBT_PAYOFF_BY_DATE" && value <= 0n)
              fail("Enter an amount greater than zero.");
            // Changing a target is a new version, not an edit: what earlier
            // months were asked to do stays as it was.
            const effectiveFrom = c.effectiveFrom ?? currentMonth;
            if (effectiveFrom > nextMonth(currentMonth, 24))
              fail("Plan no more than 24 months ahead.");
            const fields = {
              type: c.targetType,
              amount: value,
              dueMonth: dated ? c.dueMonth : null,
              cadenceMonths:
                c.targetType === "PERIODIC" ? (c.cadenceMonths ?? 12) : null,
              refill: c.refill,
              dayOfWeek: weekly ? c.dayOfWeek : null,
            };
            id = cat.id;
            await tx.categoryTarget.upsert({
              where: {
                categoryId_effectiveFrom: { categoryId: id, effectiveFrom },
              },
              create: { categoryId: id, budgetId, effectiveFrom, ...fields },
              update: fields,
            });
          } else if (c.type === "debt.terms.set") {
            const a = account(c.accountId);
            if (!DEBT_TYPES.includes(a.type))
              fail("Only a credit or loan account carries debt terms.");
            // Percent in, basis points stored, so 19.99 survives as 1999
            // exactly rather than as a float.
            if (!/^\d{1,3}(\.\d{1,2})?$/.test(c.apr))
              fail("Enter an APR such as 19.99.");
            const basisPoints = Number((Number(c.apr) * 100).toFixed(0));
            if (basisPoints > 100000) fail("That APR is not plausible.");
            const minimum = parseUSD(c.minimumPayment);
            if (minimum < 0n) fail("A minimum payment cannot be negative.");
            const limit = c.creditLimit ? parseUSD(c.creditLimit) : null;
            if (limit !== null && limit <= 0n)
              fail("A credit limit must be greater than zero.");
            id = a.id;
            // A rate change, promotional or otherwise, is a version effective
            // from its own month rather than an edit that rewrites the past.
            const effectiveFrom = c.effectiveFrom ?? currentMonth;
            if (effectiveFrom > nextMonth(currentMonth, 600))
              fail("That is further ahead than any plan reaches.");
            const fields = {
              aprBasisPoints: basisPoints,
              minimumPayment: minimum,
              dueDay: c.dueDay ?? null,
              creditLimit: limit,
            };
            await tx.debtTerms.upsert({
              where: {
                accountId_budgetId_effectiveFrom: {
                  accountId: id,
                  budgetId,
                  effectiveFrom,
                },
              },
              create: { accountId: id, budgetId, effectiveFrom, ...fields },
              update: fields,
            });
          } else if (c.type === "debt.terms.clear") {
            id = c.accountId;
            await tx.debtTerms.deleteMany({
              where: {
                budgetId,
                accountId: id,
                ...(c.effectiveFrom ? { effectiveFrom: c.effectiveFrom } : {}),
              },
            });
          } else if (c.type === "target.clear") {
            id = c.categoryId;
            // Removing a target changes nothing already assigned. It only stops
            // this category asking for money.
            await tx.categoryTarget.deleteMany({
              where: { budgetId, categoryId: id },
            });
          } else if (c.type === "target.fund") {
            if (c.month > nextMonth(currentMonth, 24))
              fail("Plan no more than 24 months ahead.");
            const projection = projectBudget(data.input, c.month);
            const targets = await tx.categoryTarget.findMany({
              where: { budgetId },
            });
            // Fund in the order categories are presented, so a partly funded
            // month matches what the owner sees rather than an arbitrary order.
            const needs = data.categories
              // A payment category is normally the application's business, but
              // a payoff target on one is the owner's own instruction.
              .filter(
                (cat) => !cat.archived && (!cat.system || cat.paymentAccountId),
              )
              .flatMap((cat) => {
                const definition = targetInForce(targets, cat.id, c.month);
                const row = projection.categories.find((r) => r.id === cat.id);
                if (!definition || !row) return [];
                const progress = evaluateTarget(
                  definition,
                  row,
                  c.month,
                  owedByCard(cat, projection.accounts),
                );
                return [
                  { categoryId: cat.id, contribution: progress.contribution },
                ];
              });
            // Fills targets even when that goes past Ready to Assign, matching
            // YNAB. The overshoot is reported, never hidden.
            const plan = planFunding(needs, projection.readyToAssign, "full");
            if (!plan.assignments.length)
              fail("Every target for this month is already funded.");
            for (const assignment of plan.assignments) {
              const created = await tx.budgetAssignment.create({
                data: {
                  budgetId,
                  categoryId: assignment.categoryId,
                  month: c.month,
                  amount: assignment.amount,
                },
              });
              id = created.id;
            }
            message = `Assigned ${formatUSD(money(plan.total))} to ${plan.assignments.length} categor${plan.assignments.length === 1 ? "y" : "ies"}.${plan.overAssigned > 0n ? ` That is ${formatUSD(money(plan.overAssigned))} more than you have; cover it before the month ends.` : ""}`;
          } else if (c.type === "category.create") {
            group(c.groupId);
            id = (
              await tx.category.create({
                data: { budgetId, name: c.name, groupId: c.groupId },
              })
            ).id;
          } else if (c.type === "category.update") {
            const cat =
              data.categories.find((a) => a.id === c.id) ??
              fail("Category unavailable.");
            id = cat.id;
            if (cat.paymentAccountId)
              fail("Payment categories follow their card account.");
            if (cat.system)
              fail(
                "System import categories cannot be renamed, moved or archived.",
              );
            group(c.groupId);
            if (c.archived && !cat.archived) {
              if (
                projectBudget(data.input, currentMonth).categories.find(
                  (a) => a.id === id,
                )!.available !== 0n
              )
                fail("Move or cover the category balance before archiving.");
              const totals = new Map<string, bigint>();
              for (const a of data.assignments.filter(
                (a) => a.categoryId === id && a.month > currentMonth,
              ))
                totals.set(a.month, (totals.get(a.month) ?? 0n) + a.amount);
              if ([...totals.values()].some((n) => n !== 0n))
                fail("Remove future assignments before archiving.");
            }
            await tx.category.update({
              where: { id },
              data: { name: c.name, groupId: c.groupId, archived: c.archived },
            });
          } else if (c.type === "assign" || c.type === "move") {
            if (c.month > nextMonth(currentMonth, 24))
              fail("Plan no more than 24 months ahead.");
            const value = parseUSD(c.amount);
            if (value === 0n) fail("Enter a nonzero amount.");
            if (c.type === "move" && (value < 0n || c.from === c.to))
              fail("Choose different categories and a positive amount.");
            const entries =
              c.type === "assign"
                ? [{ categoryId: c.categoryId, amount: value }]
                : [
                    { categoryId: c.from, amount: -value },
                    { categoryId: c.to, amount: value },
                  ];
            for (const e of entries) category(e.categoryId);
            const proposed = {
              ...data.input,
              assignments: [
                ...data.input.assignments,
                ...entries.map((e) => ({
                  ...e,
                  id: randomUUID(),
                  month: c.month,
                })),
              ],
            };
            const future = new Map<string, bigint>();
            for (const a of proposed.assignments.filter(
              (a) => a.month > currentMonth,
            )) {
              const k = `${a.month}/${a.categoryId}`;
              future.set(k, (future.get(k) ?? 0n) + a.amount);
            }
            if ([...future.values()].some((n) => n < 0n))
              fail("Future assignments cannot borrow from expected rollover.");
            const last = [
              currentMonth,
              ...proposed.assignments.map((a) => a.month),
            ]
              .sort()
              .at(-1)!;
            for (
              let m = c.month < currentMonth ? c.month : currentMonth;
              m <= last;
              m = nextMonth(m)
            ) {
              const before = projectBudget(data.input, m),
                after = projectBudget(proposed, m);
              // Assigning more than the budget holds is allowed, matching YNAB:
              // Ready to Assign goes negative and is shown in red, and the owner
              // decides how to resolve it. The projection stays truthful either
              // way, so the red number is a real statement about real money.
              // This replaces an earlier rule that refused such assignments.
              if (after.readyToAssign < 0n && before.readyToAssign >= 0n)
                message = `Assigned. Ready to Assign is now ${formatUSD(money(after.readyToAssign))}; cover it before the month ends.`;
              // Future months are different: a negative net assignment there
              // would borrow rollover that does not exist yet, which is not
              // over-assignment but invention. That stays refused above.
            }
            const moveId = c.type === "move" ? randomUUID() : undefined;
            for (const e of entries) {
              const a = await tx.budgetAssignment.create({
                data: { budgetId, ...e, month: c.month, moveId },
              });
              id = a.id;
            }
          } else if (c.type === "transaction.create") {
            validDate(c.date);
            const a = activeAccount(c.accountId);
            const b = c.transferAccountId
              ? activeAccount(c.transferAccountId)
              : undefined;
            const value = parseUSD(c.amount);
            if (value === 0n) fail("Enter a nonzero amount.");
            if (c.kind === "TRANSFER" ? !b || b.id === a.id : !!b)
              fail("Choose a different transfer account only for transfers.");
            if (
              (c.kind === "EXPENSE" && value >= 0n) ||
              (["INCOME", "REFUND", "CREDIT"].includes(c.kind) && value <= 0n)
            )
              fail(
                "Expenses use negative amounts; income, refunds and credits use positive amounts.",
              );
            if (c.kind === "CREDIT" && !isCard(a))
              fail("Statement credits belong to credit accounts.");
            if (c.kind === "INCOME" && isCard(a))
              fail("Use a refund or statement credit for a card inflow.");
            if (c.kind === "ADJUSTMENT" && !c.memo)
              fail("Explain the adjustment in the memo.");
            const budgetLeg = a.participation === "BUDGET" ? value : -value;
            const boundary = b && a.participation !== b.participation;
            const needsSplits = boundary
              ? budgetLeg < 0n
              : a.participation === "BUDGET" &&
                ["EXPENSE", "REFUND"].includes(c.kind);
            const allowsSplits = needsSplits || boundary;
            const splits = c.splits.map((s, position) => {
              const cat = category(s.categoryId);
              if (cat.paymentAccountId)
                fail(
                  "Use a transfer to pay a card, not a payment category split.",
                );
              const amount = parseUSD(s.amount);
              if (!amount || amount > 0n !== budgetLeg > 0n)
                fail(
                  "Splits must have the same sign as the budget account movement.",
                );
              return { budgetId, categoryId: cat.id, amount, position };
            });
            if (
              (needsSplits && !splits.length) ||
              (splits.length &&
                (!allowsSplits ||
                  splits.reduce((n, s) => n + s.amount, 0n) !== budgetLeg))
            )
              fail(
                "Category splits must exactly match the budget account amount.",
              );
            if (c.refundOfId) {
              const original = data.transactions.find(
                (t) => t.id === c.refundOfId && !t.voidedAt,
              );
              if (
                c.kind !== "REFUND" ||
                !original ||
                original.kind !== "EXPENSE" ||
                original.accountId !== a.id ||
                original.date.toISOString().slice(0, 10) > c.date
              )
                fail("Link a refund to an earlier purchase on this account.");
              const refunded = data.transactions
                .filter(
                  (t) =>
                    t.refundOfId === original.id &&
                    !t.voidedAt &&
                    t.id !== c.replacesId,
                )
                .reduce((n, t) => n + t.amount, 0n);
              if (refunded + value > -original.amount)
                fail("Linked refunds exceed the purchase amount.");
            }
            if (c.replacesId) {
              const identities = await tx.ingestedEntry.findMany({
                where: { budgetId, transactionId: c.replacesId },
                select: { providerAccountId: true },
              });
              const linked = await tx.providerAccount.findMany({
                where: {
                  budgetId,
                  id: { in: identities.map((e) => e.providerAccountId) },
                },
              });
              if (
                linked.some(
                  (l) => l.accountId !== a.id && l.accountId !== b?.id,
                )
              )
                fail(
                  "A bank-linked transaction must retain its linked account legs. Correct the amount or category instead.",
                );
              if (!c.reason) fail("Explain the correction.");
              await voidTransaction(
                tx,
                budgetId,
                c.replacesId,
                c.reason,
                c.acknowledgeReconciled,
              );
            }
            const journalId = await journal(
              tx,
              budgetId,
              c.date,
              a.id,
              value,
              c.kind,
              b?.id,
            );
            const t = await tx.financialTransaction.create({
              data: {
                budgetId,
                journalId,
                accountId: a.id,
                transferAccountId: b?.id,
                kind: c.kind,
                date: new Date(c.date),
                amount: value,
                payee: c.payee,
                memo: c.memo,
                replacesId: c.replacesId,
                refundOfId: c.refundOfId,
              },
            });
            id = t.id;
            const previousPreference = c.replacesId
              ? await tx.transactionPreference.findUnique({
                  where: { transactionId: c.replacesId },
                })
              : null;
            await tx.transactionPreference.create({
              data: {
                transactionId: id,
                budgetId,
                tags: ruleTags ?? previousPreference?.tags ?? [],
                locked: ruleLocks ?? [
                  "payee",
                  "categoryId",
                  "memo",
                  "tags",
                  "transferAccountId",
                ],
              },
            });
            if (c.replacesId)
              await tx.ingestedEntry.updateMany({
                where: { budgetId, transactionId: c.replacesId },
                data: { transactionId: id, approved: true },
              });
            if (splits.length)
              await tx.financialSplit.createMany({
                data: splits.map((s) => ({ ...s, transactionId: id })),
              });
            await tx.transactionState.createMany({
              data: [a, ...(b ? [b] : [])].map((acc) => ({
                budgetId,
                transactionId: id,
                accountId: acc.id,
                cleared: acc.id === a.id && c.cleared,
              })),
            });
          } else if (c.type === "transaction.void") {
            id = c.id;
            await voidTransaction(
              tx,
              budgetId,
              id,
              c.reason,
              c.acknowledgeReconciled,
            );
            await tx.ingestedEntry.updateMany({
              where: { budgetId, transactionId: id },
              data: { removed: true, approved: true },
            });
          } else if (c.type === "transaction.clear") {
            activeAccount(c.accountId);
            id = c.id;
            if (!data.input.transactions.some((t) => t.id === id))
              fail("Transaction unavailable.");
            const state =
              data.states.find(
                (s) => s.transactionId === id && s.accountId === c.accountId,
              ) ?? fail("Account leg unavailable.");
            if (state.cleared !== c.cleared) {
              await markAffected(tx, budgetId, id, c.acknowledgeReconciled);
              await tx.transactionState.update({
                where: {
                  transactionId_accountId: {
                    transactionId: id,
                    accountId: c.accountId,
                  },
                },
                data: { cleared: c.cleared, reconciliationId: null },
              });
            }
          } else if (c.type === "reconcile") {
            activeAccount(c.accountId);
            validDate(c.date);
            const active = data.input.transactions.filter(
              (t) =>
                t.date <= c.date &&
                data.states.some(
                  (s) =>
                    s.transactionId === t.id &&
                    s.accountId === c.accountId &&
                    s.cleared,
                ),
            );
            let calculated = active.reduce(
              (n, t) =>
                n + (t.accountId === c.accountId ? t.amount : -t.amount),
              0n,
            );
            const observed = parseUSD(c.observed);
            const difference = observed - calculated;
            const ids = active.map((t) => t.id);
            if (difference) {
              if (!c.adjustmentReason)
                fail(
                  "Cleared balance differs from the statement. Correct or clear transactions, or explicitly provide an adjustment reason.",
                );
              const journalId = await journal(
                tx,
                budgetId,
                c.date,
                c.accountId,
                difference,
                "ADJUSTMENT",
              );
              const t = await tx.financialTransaction.create({
                data: {
                  budgetId,
                  journalId,
                  accountId: c.accountId,
                  kind: "ADJUSTMENT",
                  date: new Date(c.date),
                  amount: difference,
                  payee: "Reconciliation adjustment",
                  memo: c.adjustmentReason,
                },
              });
              ids.push(t.id);
              await tx.transactionState.create({
                data: {
                  budgetId,
                  transactionId: t.id,
                  accountId: c.accountId,
                  cleared: true,
                },
              });
              calculated = observed;
            }
            const r = await tx.reconciliation.create({
              data: {
                budgetId,
                accountId: c.accountId,
                date: new Date(c.date),
                observed,
                calculated,
              },
            });
            id = r.id;
            if (ids.length) {
              await tx.reconciliationItem.createMany({
                data: ids.map((transactionId) => ({
                  budgetId,
                  reconciliationId: id,
                  transactionId,
                  accountId: c.accountId,
                })),
              });
              await tx.transactionState.updateMany({
                where: {
                  budgetId,
                  accountId: c.accountId,
                  transactionId: { in: ids },
                },
                data: { reconciliationId: id },
              });
            }
          }
          // Backdated entries change prior statement comparisons, including newly cleared legs.
          if (c.type === "transaction.create" || c.type === "reconcile") {
            const affectedAccounts =
              c.type === "transaction.create"
                ? [
                    c.accountId,
                    ...(c.transferAccountId ? [c.transferAccountId] : []),
                  ]
                : [c.accountId];
            await tx.reconciliation.updateMany({
              where: {
                budgetId,
                id: { not: id },
                accountId: { in: affectedAccounts },
                date: { gte: new Date(c.date) },
              },
              data: { affectedAt: new Date() },
            });
          }
          if (occurrence)
            await tx.scheduleOccurrence.create({
              data: {
                ...occurrence,
                budgetId,
                matched: original.type === "schedule.match",
                status:
                  original.type === "schedule.skip" ? "SKIPPED" : "APPROVED",
                transactionId: original.type === "schedule.skip" ? null : id,
              },
            });
          await tx.auditEvent.create({
            data: {
              budgetId,
              actorId: userId,
              action: "FINANCE_COMMAND",
              entityId: id,
              details: JSON.parse(JSON.stringify(original)),
            },
          });
          await tx.budget.update({
            where: { id: budgetId },
            data: { financeRevision: { increment: 1 } },
          });
          const result = { id, message };
          await tx.financeRequest.create({
            data: { budgetId, key, payloadHash: hash, result },
          });
          return result;
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < 3) continue;
      throw error;
    }
  }
  throw new FinanceError("Workspace is busy. Retry the same request.");
}
