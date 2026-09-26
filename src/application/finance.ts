import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { isRetryableConflict } from "@/infrastructure/retry";
import type { Prisma } from "@/generated/prisma/client";
import { financialDate, budgetMonth } from "@/domain/dates";
import { ageOfMoney } from "@/domain/age-of-money";
import { moneyMoves } from "@/domain/money-moves";
import { FLAG_COLORS } from "@/domain/flags";
import { PRESET_VIEWS, focusedCategoryIds, type FocusedCategory } from "@/domain/focused-views";
import {
  AUTO_ASSIGN_MODES,
  planAutoAssign,
  type AutoAssignMode,
} from "@/domain/auto-assign";
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
import { nextDueDate, occurrences } from "@/domain/schedules";
import { minimumDue, monthlyInterest } from "@/domain/debt";
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
  cadence: z.enum([
    "ONCE",
    "DAILY",
    "WEEKLY",
    "TWICE_MONTHLY",
    "MONTHLY",
    "YEARLY",
  ]),
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
  // Entered automatically on its date by the worker, awaiting approval (YNAB A3).
  z.object({ type: z.literal("schedule.enter"), id: uuid, date }),
  z.object({
    type: z.enum(["schedule.confirm", "schedule.reject"]),
    id: uuid,
    date,
    acknowledgeReconciled: z.boolean().default(false),
  }),
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
    // Closing with money left confirms an adjustment that zeroes it, as YNAB does.
    zeroBalance: z.boolean().default(false),
  }),
  // YNAB's Delete Account: only with no history beyond the starting balance.
  z.object({ type: z.literal("account.delete"), id: uuid }),
  // YNAB's Unlink: stop syncing an account; what was imported stays.
  z.object({ type: z.literal("account.unlink"), id: uuid }),
  // A starting balance for an account with nothing recorded yet, such as one
  // just linked to a bank, whose current balance it takes.
  z.object({
    type: z.literal("account.opening"),
    accountId: uuid,
    amount,
    date,
  }),
  z.object({ type: z.literal("group.create"), name }),
  z.object({ type: z.literal("starter.apply") }),
  z.object({ type: z.literal("starter.group.add"), groupName: name }),
  z.object({
    type: z.literal("starter.add"),
    groupName: name,
    categoryName: name,
  }),
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
    // Day of the month a monthly or repeating target is needed by.
    targetDueDay: z.number().int().min(1).max(31).optional(),
    // The month this version takes effect. Earlier months keep what they had.
    effectiveFrom: month.optional(),
  }),
  z.object({ type: z.literal("target.clear"), categoryId: uuid }),
  z.object({
    type: z.literal("target.snooze"),
    categoryId: uuid,
    snoozed: z.boolean(),
  }),
  z.object({
    type: z.literal("debt.terms.set"),
    accountId: uuid,
    apr: z.string().max(8),
    // A fixed minimum, or the floor under a percentage rule. Either this or
    // minimumPercent is required; with both, the minimum is the larger.
    minimumPayment: amount.optional(),
    // Percent of the balance, such as 1 or 2.5; the minimum is the larger.
    minimumPercent: z.string().max(6).optional(),
    minimumIncludesInterest: z.boolean().default(false),
    dueDay: z.number().int().min(1).max(31).optional(),
    creditLimit: amount.optional(),
    statementBalance: amount.optional(),
    statementDate: date.optional(),
    // A promotional rate ending is a later version of the same terms.
    effectiveFrom: month.optional(),
    // With a due day, these set up the card's payment: a monthly target on its
    // payment category and a transfer schedule from this account. The payment
    // defaults to what the minimum rule demands at today's balance.
    payFromAccountId: uuid.optional(),
    monthlyPayment: amount.optional(),
  }),
  z.object({
    type: z.literal("debt.terms.clear"),
    accountId: uuid,
    // One version, or every version when absent.
    effectiveFrom: month.optional(),
  }),
  z.object({ type: z.literal("target.fund"), month, view: z.union([z.enum(PRESET_VIEWS), uuid]).optional() }),
  z.object({
    type: z.literal("auto.assign"),
    month,
    mode: z.enum(AUTO_ASSIGN_MODES),
    categoryId: uuid.optional(),
    expected: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ type: z.literal("group.rename"), id: uuid, name }),
  z.object({ type: z.literal("view.save"), id: uuid.optional(), name: z.string().trim().min(1).max(80), categoryIds: z.array(uuid).min(1).max(500) }),
  z.object({ type: z.literal("view.delete"), id: uuid }),
  z.object({ type: z.literal("view.reorder"), id: uuid, direction: z.enum(["UP", "DOWN"]) }),
  z.object({ type: z.literal("group.hide"), id: uuid, hidden: z.boolean() }),
  z.object({
    type: z.literal("group.reorder"),
    id: uuid,
    direction: z.enum(["UP", "DOWN"]),
  }),
  z.object({ type: z.literal("category.create"), name, groupId: uuid }),
  z.object({
    type: z.literal("category.update"),
    id: uuid,
    name,
    groupId: uuid,
    archived: z.boolean(),
    note: z.string().max(1000).optional(),
    // Sent by the notes editor, so an emptied note clears rather than keeps.
    noteSet: z.literal("1").optional(),
  }),
  z.object({ type: z.literal("category.hide"), id: uuid, hidden: z.boolean() }),
  z.object({
    type: z.literal("category.reorder"),
    id: uuid,
    direction: z.enum(["UP", "DOWN"]),
  }),
  z.object({ type: z.literal("assign"), categoryId: uuid, month, amount }),
  z.object({ type: z.literal("move"), from: uuid, to: uuid, month, amount }),
  // Reverses one Money Move (its move id, or the row id of a single assignment).
  z.object({ type: z.literal("move.undo"), id: uuid }),
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
      "OPENING",
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
    type: z.literal("transaction.undo"),
    id: uuid,
    acknowledgeReconciled: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("transaction.flag"),
    ids: z.array(uuid).min(1).max(200),
    // Absent or empty clears the flag.
    flag: z.enum(FLAG_COLORS).optional(),
  }),
  z.object({
    type: z.literal("flag.rename"),
    color: z.enum(FLAG_COLORS),
    // Empty goes back to the colour's own name.
    name: z.string().trim().max(40).default(""),
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
  dueDay?: number | null;
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
    dueDay: version.dueDay ?? undefined,
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
    flagged,
    flagNames,
    reconciliations,
  ] = await Promise.all([
    // A deleted account left every view; its rows remain only for history.
    tx.financialAccount.findMany({
      where: { budgetId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.categoryGroup.findMany({
      where: { budgetId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    tx.category.findMany({
      where: { budgetId },
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
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
    tx.transactionPreference.findMany({
      where: { budgetId, flag: { not: null } },
      select: { transactionId: true, flag: true },
    }),
    tx.flagName.findMany({ where: { budgetId } }),
    tx.reconciliation.findMany({
      where: { budgetId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const groupRank = new Map(groups.map((item, index) => [item.id, index]));
  categories.sort(
    (left, right) =>
      (groupRank.get(left.groupId) ?? 0) -
        (groupRank.get(right.groupId) ?? 0) ||
      left.sortOrder - right.sortOrder ||
      left.id.localeCompare(right.id),
  );
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
    flags: new Map(flagged.map((p) => [p.transactionId, p.flag!])),
    flagNames,
    reconciliations,
    input,
  };
}
async function autoAssignPlan(
  tx: Tx,
  data: Awaited<ReturnType<typeof load>>,
  budgetId: string,
  selected: string,
  mode: AutoAssignMode,
  categoryId?: string,
) {
  const eligible = data.categories.filter(
    (cat) =>
      !cat.archived &&
      !cat.hidden &&
      !data.groups.find((group) => group.id === cat.groupId)?.hidden &&
      (!cat.system || cat.paymentAccountId),
  );
  if (categoryId && !eligible.some((cat) => cat.id === categoryId))
    fail("Category unavailable for Auto-Assign.");
  const ids = categoryId ? [categoryId] : eligible.map((cat) => cat.id);
  const targets =
    mode === "REDUCE_OVERFUNDING"
      ? await tx.categoryTarget.findMany({ where: { budgetId } })
      : [];
  const snoozed =
    mode === "REDUCE_OVERFUNDING"
      ? new Set(
          (
            await tx.targetSnooze.findMany({
              where: { budgetId, month: selected },
              select: { categoryId: true },
            })
          ).map((row) => row.categoryId),
        )
      : new Set<string>();
  const projection = projectBudget(data.input, selected);
  const needs = new Map<string, bigint>();
  for (const cat of eligible) {
    if (!ids.includes(cat.id)) continue;
    if (snoozed.has(cat.id)) {
      needs.set(cat.id, 0n);
      continue;
    }
    const definition = targetInForce(targets, cat.id, selected);
    const row = projection.categories.find((item) => item.id === cat.id);
    if (!definition || !row) continue;
    // Re-evaluate the target with this month's manual assignment removed. That
    // is the amount the category needed before it was funded this month.
    const baseline = {
      available: row.available - row.assigned,
      assigned: 0n,
      activity: row.activity,
    };
    needs.set(
      cat.id,
      evaluateTarget(
        definition,
        baseline,
        selected,
        owedByCard(cat, projection.accounts),
      ).contribution,
    );
  }
  const plan = planAutoAssign(data.input, selected, mode, ids, needs);
  const expected = createHash("sha256")
    .update(
      JSON.stringify({
        mode,
        selected,
        ids,
        changes: plan.changes.map((change) => [
          change.categoryId,
          change.previousAssigned.toString(),
          change.previousAvailable.toString(),
          change.amount.toString(),
        ]),
        readyBefore: plan.readyBefore.toString(),
      }),
    )
    .digest("hex");
  return { ...plan, expected };
}

export async function getAutoAssignPreview(
  userId: string,
  budgetId: string,
  selected: string,
  mode: AutoAssignMode,
  categoryId?: string,
) {
  if (
    !uuid.safeParse(budgetId).success ||
    !month.safeParse(selected).success ||
    !AUTO_ASSIGN_MODES.includes(mode)
  )
    fail("Invalid Auto-Assign preview.");
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      if (selected > nextMonth(today(budget.timezone).slice(0, 7), 24))
        fail("Plan no more than 24 months ahead.");
      return autoAssignPlan(
        tx,
        await load(tx, budgetId),
        budgetId,
        selected,
        mode,
        categoryId,
      );
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
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
      const monthEnd = new Date(
        Date.UTC(Number(selected.slice(0, 4)), Number(selected.slice(5)), 0),
      )
        .toISOString()
        .slice(0, 10);
      const age = ageOfMoney(
        data.input,
        monthEnd < currentDate ? monthEnd : currentDate,
      );
      const stored = await tx.categoryTarget.findMany({ where: { budgetId } });
      const snoozed = new Set(
        (
          await tx.targetSnooze.findMany({
            where: { budgetId, month: selected },
            select: { categoryId: true },
          })
        ).map((row) => row.categoryId),
      );
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
            snoozed: snoozed.has(cat.id),
            hidden:
              cat.hidden ||
              Boolean(
                data.groups.find((group) => group.id === cat.groupId)?.hidden,
              ),
            progress: evaluateTarget(
              definition,
              row,
              selected,
              owedByCard(cat, projection.accounts),
            ),
          },
        ];
      });
      const [storedViews, memberships] = await Promise.all([
        tx.focusedView.findMany({ where: { budgetId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
        tx.focusedViewCategory.findMany({ where: { budgetId } }),
      ]);
      const views = storedViews.map((view) => ({
        ...view,
        categoryIds: memberships.filter((item) => item.viewId === view.id).map((item) => item.categoryId),
      }));
      const focusedRows: FocusedCategory[] = data.categories.map((cat) => {
        const row = projection.categories.find((item) => item.id === cat.id)!;
        const target = targets.find((item) => item.categoryId === cat.id);
        const baselineNeed = target && !target.snoozed
          ? evaluateTarget(target, { ...row, available: row.available - row.assigned, assigned: 0n }, selected, owedByCard(cat, projection.accounts)).contribution
          : 0n;
        return {
          id: cat.id,
          hidden: cat.hidden || Boolean(data.groups.find((group) => group.id === cat.groupId)?.hidden),
          archived: cat.archived,
          available: row.available,
          cashDeficit: row.cashDeficit,
          creditDeficit: row.creditDeficit,
          targetNeed: target && !target.snoozed ? target.progress.contribution : 0n,
          overfunded: target && !target.snoozed && row.assigned > baselineNeed ? row.assigned - baselineNeed : 0n,
          snoozed: Boolean(target?.snoozed),
        };
      });
      const moves = moneyMoves(data.assignments, { month: selected });
      const actorIds = [
        ...new Set(moves.flatMap((move) => (move.actorId ? [move.actorId] : []))),
      ];
      const actors = new Map(
        (
          await tx.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, username: true },
          })
        ).map((user) => [user.id, user.username]),
      );
      return {
        ...data,
        budget,
        moves: moves.map((move) => ({
          ...move,
          actor: move.actorId ? (actors.get(move.actorId) ?? null) : null,
        })),
        today: currentDate,
        month: selected,
        projection,
        ageOfMoney: age,
        targets,
        views,
        focusedRows,
        underfunded: targets.reduce(
          (sum, t) =>
            sum + (t.snoozed || t.hidden ? 0n : t.progress.contribution),
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
          let restoreVoided = false;
          if (c.type === "transaction.undo") {
            const current = await tx.financialTransaction.findFirst({
              where: { id: c.id, budgetId },
            });
            if (!current) fail("Transaction unavailable.");
            if (
              await tx.financialTransaction.count({
                where: { budgetId, replacesId: current.id },
              })
            )
              fail("This is not the latest version of the transaction.");
            const deleted = Boolean(current.voidedAt);
            if (!deleted && !current.replacesId)
              fail("This transaction has no edit to undo.");
            const previous = deleted
              ? current
              : await tx.financialTransaction.findFirst({
                  where: { id: current.replacesId!, budgetId },
                });
            if (!previous) fail("Previous version unavailable.");
            const splits = await tx.financialSplit.findMany({
              where: { budgetId, transactionId: previous.id },
              orderBy: { position: "asc" },
            });
            const state = await tx.transactionState.findFirst({
              where: {
                budgetId,
                transactionId: previous.id,
                accountId: previous.accountId,
              },
            });
            if (state?.reconciliationId && !c.acknowledgeReconciled)
              fail("Confirm that this reconciled statement may need review.");
            const dollars = (v: bigint) =>
              `${v < 0n ? "-" : ""}${(v < 0n ? -v : v) / 100n}.${((v < 0n ? -v : v) % 100n).toString().padStart(2, "0")}`;
            c = financeCommand.parse({
              type: "transaction.create",
              accountId: previous.accountId,
              transferAccountId: previous.transferAccountId ?? undefined,
              kind: previous.kind,
              date: previous.date.toISOString().slice(0, 10),
              amount: dollars(previous.amount),
              payee: previous.payee,
              memo: previous.memo,
              splits: splits.map((s) => ({
                categoryId: s.categoryId,
                amount: dollars(s.amount),
              })),
              refundOfId: previous.refundOfId ?? undefined,
              cleared: state?.cleared ?? false,
              replacesId: current.id,
              reason: deleted ? "Undo delete" : "Undo edit",
              acknowledgeReconciled: c.acknowledgeReconciled,
            });
            restoreVoided = deleted;
          }
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
          if (c.type === "schedule.confirm" || c.type === "schedule.reject") {
            const entered = await tx.scheduleOccurrence.findFirst({
              where: {
                budgetId,
                scheduleId: c.id,
                date: new Date(c.date),
                status: "ENTERED",
              },
            });
            if (!entered?.transactionId)
              fail("That scheduled transaction is not awaiting approval.");
            if (c.type === "schedule.confirm") {
              await tx.scheduleOccurrence.update({
                where: {
                  scheduleId_date: {
                    scheduleId: entered.scheduleId,
                    date: entered.date,
                  },
                },
                data: { status: "APPROVED" },
              });
            } else {
              // Rejecting removes it, as YNAB does; history keeps the reversal.
              await tx.scheduleOccurrence.update({
                where: {
                  scheduleId_date: {
                    scheduleId: entered.scheduleId,
                    date: entered.date,
                  },
                },
                data: { status: "SKIPPED", transactionId: null },
              });
              await voidTransaction(
                tx,
                budgetId,
                entered.transactionId,
                "Scheduled transaction rejected",
                c.acknowledgeReconciled,
              );
            }
            const result = {
              id: entered.transactionId,
              message: c.type === "schedule.confirm" ? "Approved." : "Removed.",
            };
            await tx.auditEvent.create({
              data: {
                budgetId,
                actorId: userId,
                action: "FINANCE_COMMAND",
                entityId: entered.transactionId,
                details: JSON.parse(JSON.stringify(original)),
              },
            });
            await tx.budget.update({
              where: { id: budgetId },
              data: { financeRevision: { increment: 1 } },
            });
            await tx.financeRequest.create({
              data: { budgetId, key, payloadHash: hash, result },
            });
            return result;
          }
          if (
            c.type === "schedule.approve" ||
            c.type === "schedule.enter" ||
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
            if (c.type === "schedule.approve" || c.type === "schedule.enter") {
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
                    sortOrder:
                      Math.max(
                        0,
                        ...data.groups.map((item) => item.sortOrder),
                      ) + 1,
                  },
                });
              await tx.category.create({
                data: {
                  budgetId,
                  groupId: g.id,
                  name: a.name,
                  paymentAccountId: a.id,
                  sortOrder:
                    Math.max(
                      0,
                      ...data.categories
                        .filter((item) => item.groupId === g.id)
                        .map((item) => item.sortOrder),
                    ) + 1,
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
              // Like YNAB: an account can be closed at any time. Money left in
              // it is zeroed by an adjustment the owner has confirmed, which
              // may take money out of the plan; nothing needs reconciling.
              const balance = data.input.transactions
                .filter(
                  (t) => t.accountId === id || t.transferAccountId === id,
                )
                .reduce(
                  (n, t) => n + (t.accountId === id ? t.amount : -t.amount),
                  0n,
                );
              if (balance !== 0n && !c.zeroBalance)
                fail(
                  `This account still holds ${formatUSD(money(balance))}. Confirm the adjustment that brings it to zero, then close it.`,
                );
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
            if (c.closed && !a.closed && c.zeroBalance) {
              const balance = data.input.transactions
                .filter(
                  (t) => t.accountId === id || t.transferAccountId === id,
                )
                .reduce(
                  (n, t) => n + (t.accountId === id ? t.amount : -t.amount),
                  0n,
                );
              if (balance !== 0n) {
                const journalId = await journal(
                  tx,
                  budgetId,
                  currentDate,
                  id,
                  -balance,
                  "ADJUSTMENT",
                );
                const t = await tx.financialTransaction.create({
                  data: {
                    budgetId,
                    journalId,
                    accountId: id,
                    kind: "ADJUSTMENT",
                    date: new Date(currentDate),
                    amount: -balance,
                    payee: "Closing adjustment",
                    memo: "Balance brought to zero when the account was closed",
                  },
                });
                await tx.transactionState.create({
                  data: {
                    budgetId,
                    transactionId: t.id,
                    accountId: id,
                    cleared: true,
                  },
                });
                message = `Account closed. An adjustment of ${formatUSD(money(-balance))} brought it to zero.`;
              }
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
            // The payment its terms scheduled ends with the card. Reopening
            // does not revive it; saving the terms again does.
            if (c.closed)
              await tx.schedule.updateMany({
                where: { budgetId, paymentForAccountId: id, archived: false },
                data: { archived: true, revision: { increment: 1 } },
              });
          } else if (c.type === "account.opening") {
            validDate(c.date);
            const a = activeAccount(c.accountId);
            id = a.id;
            // Allowed only before anything else on the account: a starting
            // balance is where its history begins.
            const touching = data.input.transactions.filter(
              (t) => t.accountId === id || t.transferAccountId === id,
            );
            if (touching.some((t) => t.kind === "OPENING"))
              fail("This account already has a starting balance.");
            if (
              touching.some(
                (t) => t.date <= c.date,
              )
            )
              fail("A starting balance must come before the account's first transaction.");
            const opening = parseUSD(c.amount);
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
            message = `Starting balance set to ${formatUSD(money(opening))}.`;
          } else if (c.type === "account.unlink") {
            const a = account(c.id);
            id = a.id;
            const link = await tx.providerAccount.findFirst({
              where: { budgetId, accountId: id },
            });
            if (!link) fail("This account is not linked.");
            await tx.providerAccount.update({
              where: { id: link!.id },
              data: { accountId: null, linkedFrom: null },
            });
            message = "Unlinked. Transactions already imported are kept; nothing new will sync.";
          } else if (c.type === "account.delete") {
            const a = account(c.id);
            id = a.id;
            const touching = data.input.transactions.filter(
              (t) => t.accountId === id || t.transferAccountId === id,
            );
            if (touching.some((t) => t.kind !== "OPENING"))
              fail(
                "This account has transaction history, so close it instead. Closing keeps its history in your reports.",
              );
            // A file import's link is bookkeeping, not a bank connection, so it
            // is simply detached; its imported history stays with the link.
            const links = await tx.providerAccount.findMany({
              where: { budgetId, accountId: id },
              select: { connectionId: true },
            });
            const banks = await tx.providerConnection.count({
              where: {
                budgetId,
                id: { in: links.map((l) => l.connectionId) },
                provider: { not: "FILE" },
              },
            });
            if (banks)
              fail(
                "This account is linked to your bank. Unlink it in Account settings first.",
              );
            await tx.providerAccount.updateMany({
              where: { budgetId, accountId: id },
              data: { accountId: null },
            });
            // The payment its own terms scheduled goes with it; anything the
            // owner scheduled must be dealt with first.
            await tx.schedule.updateMany({
              where: { budgetId, paymentForAccountId: id, archived: false },
              data: { archived: true, revision: { increment: 1 } },
            });
            if (
              await tx.schedule.count({
                where: {
                  budgetId,
                  archived: false,
                  replacedById: null,
                  OR: [{ accountId: id }, { transferAccountId: id }],
                },
              })
            )
              fail("Remove this account's schedules before deleting it.");
            if (
              await tx.automationRule.count({
                where: {
                  budgetId,
                  OR: [{ accountId: id }, { transferAccountId: id }],
                },
              })
            )
              fail("Remove rules that use this account before deleting it.");
            const payment = data.categories.find(
              (cat) => cat.paymentAccountId === id,
            );
            if (
              payment &&
              data.assignments.some(
                (x) => x.categoryId === payment.id && x.month > currentMonth,
              )
            )
              fail("Remove future payment assignments before deleting.");
            // The starting balance is reversed on the append-only journal;
            // the account row stays for history and simply leaves every view.
            for (const t of touching)
              await voidTransaction(tx, budgetId, t.id, "Account deleted", true);
            await tx.financialAccount.update({
              where: { id },
              data: {
                closed: true,
                deletedAt: new Date(),
                version: { increment: 1 },
              },
            });
            await tx.category.updateMany({
              where: { budgetId, paymentAccountId: id },
              data: { archived: true },
            });
            message = "Account deleted.";
          } else if (c.type === "transaction.flag") {
            const ids = [...new Set(c.ids)];
            const live = await tx.financialTransaction.findMany({
              where: { budgetId, id: { in: ids }, voidedAt: null },
              select: { id: true },
            });
            if (live.length !== ids.length)
              fail("A transaction changed. Refresh and try again.");
            for (const transactionId of ids)
              await tx.transactionPreference.upsert({
                where: { transactionId },
                create: { transactionId, budgetId, flag: c.flag ?? null },
                update: { flag: c.flag ?? null },
              });
            id = ids[0];
            message = c.flag
              ? `Flagged ${ids.length} transaction${ids.length === 1 ? "" : "s"}.`
              : `Cleared the flag on ${ids.length} transaction${ids.length === 1 ? "" : "s"}.`;
          } else if (c.type === "flag.rename") {
            if (c.name)
              await tx.flagName.upsert({
                where: { budgetId_color: { budgetId, color: c.color } },
                create: { budgetId, color: c.color, name: c.name },
                update: { name: c.name },
              });
            else
              await tx.flagName.deleteMany({
                where: { budgetId, color: c.color },
              });
            id = budgetId;
            message = "Flag name saved.";
          } else if (c.type === "view.save") {
            const categoryIds = [...new Set(c.categoryIds)];
            if (categoryIds.length !== c.categoryIds.length)
              fail("Choose each category once.");
            for (const categoryId of categoryIds) {
              const item = data.categories.find((cat) => cat.id === categoryId);
              if (!item || item.archived || (item.system && !item.paymentAccountId))
                fail("A view contains an unavailable category.");
            }
            const existing = c.id
              ? await tx.focusedView.findFirst({ where: { id: c.id, budgetId } })
              : null;
            if (c.id && !existing) fail("View unavailable.");
            if (!existing && await tx.focusedView.count({ where: { budgetId } }) >= 12)
              fail("A plan can have up to 12 custom views.");
            id = existing?.id ?? randomUUID();
            if (existing) {
              await tx.focusedView.update({ where: { id }, data: { name: c.name } });
              await tx.focusedViewCategory.deleteMany({ where: { viewId: id, budgetId } });
            } else {
              const last = await tx.focusedView.aggregate({ where: { budgetId }, _max: { sortOrder: true } });
              await tx.focusedView.create({ data: { id, budgetId, name: c.name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
            }
            await tx.focusedViewCategory.createMany({ data: categoryIds.map((categoryId) => ({ viewId: id, budgetId, categoryId })) });
            message = existing ? "View updated." : "View created.";
          } else if (c.type === "view.delete") {
            const existing = await tx.focusedView.findFirst({ where: { id: c.id, budgetId } });
            if (!existing) fail("View unavailable.");
            id = existing.id;
            await tx.focusedView.delete({ where: { id } });
            message = "View deleted.";
          } else if (c.type === "view.reorder") {
            const views = await tx.focusedView.findMany({ where: { budgetId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
            const index = views.findIndex((item) => item.id === c.id);
            if (index < 0) fail("View unavailable.");
            const other = views[index + (c.direction === "UP" ? -1 : 1)];
            if (!other) fail("View is already at the edge.");
            id = c.id;
            await tx.focusedView.update({ where: { id }, data: { sortOrder: other.sortOrder } });
            await tx.focusedView.update({ where: { id: other.id }, data: { sortOrder: views[index].sortOrder } });
            message = "View moved.";
          } else if (c.type === "group.create") {
            id = (
              await tx.categoryGroup.create({
                data: {
                  budgetId,
                  name: c.name,
                  sortOrder:
                    Math.max(0, ...data.groups.map((item) => item.sortOrder)) +
                    1,
                },
              })
            ).id;
          } else if (c.type === "group.rename") {
            group(c.id);
            id = c.id;
            await tx.categoryGroup.update({
              where: { id },
              data: { name: c.name },
            });
          } else if (c.type === "group.hide") {
            const selected = group(c.id);
            if (selected.system) fail("The card payment group stays visible.");
            id = selected.id;
            await tx.categoryGroup.update({
              where: { id },
              data: { hidden: c.hidden },
            });
          } else if (c.type === "group.reorder") {
            const selected = group(c.id);
            if (selected.system)
              fail("The card payment group cannot be moved.");
            id = selected.id;
            const siblings = data.groups.filter((item) => !item.system);
            const index = siblings.findIndex((item) => item.id === id);
            const other = siblings[index + (c.direction === "UP" ? -1 : 1)];
            if (!other) fail("Group is already at the edge.");
            await tx.categoryGroup.update({
              where: { id },
              data: { sortOrder: other.sortOrder },
            });
            await tx.categoryGroup.update({
              where: { id: other.id },
              data: { sortOrder: selected.sortOrder },
            });
          } else if (c.type === "starter.add") {
            const suggestion = STARTER_GROUPS.find(
              (item) => item.name === c.groupName,
            );
            if (!suggestion?.categories.includes(c.categoryName))
              fail("Suggested category unavailable.");
            let selectedGroup = data.groups.find(
              (item) =>
                !item.system &&
                item.name.toLocaleLowerCase() ===
                  c.groupName.toLocaleLowerCase(),
            );
            if (!selectedGroup) {
              selectedGroup = await tx.categoryGroup.create({
                data: {
                  budgetId,
                  name: c.groupName,
                  sortOrder:
                    Math.max(0, ...data.groups.map((item) => item.sortOrder)) +
                    1,
                },
              });
            } else if (selectedGroup.hidden) {
              await tx.categoryGroup.update({
                where: { id: selectedGroup.id },
                data: { hidden: false },
              });
            }
            const existing = data.categories.find(
              (item) =>
                item.groupId === selectedGroup.id &&
                item.name.toLocaleLowerCase() ===
                  c.categoryName.toLocaleLowerCase(),
            );
            if (existing) {
              id = existing.id;
              if (existing.hidden || existing.archived)
                await tx.category.update({
                  where: { id },
                  data: { hidden: false, archived: false },
                });
              message = `${c.categoryName} is ready to use. Set its target in the category panel.`;
            } else {
              id = (
                await tx.category.create({
                  data: {
                    budgetId,
                    groupId: selectedGroup.id,
                    name: c.categoryName,
                    sortOrder:
                      Math.max(
                        0,
                        ...data.categories
                          .filter((item) => item.groupId === selectedGroup.id)
                          .map((item) => item.sortOrder),
                      ) + 1,
                  },
                })
              ).id;
              message = `${c.categoryName} added. Assign money or set a target when you are ready.`;
            }
          } else if (c.type === "starter.group.add") {
            const suggestion = STARTER_GROUPS.find(
              (item) => item.name === c.groupName,
            );
            if (!suggestion) fail("Suggested group unavailable.");
            let selectedGroup = data.groups.find(
              (item) =>
                !item.system &&
                item.name.toLocaleLowerCase() ===
                  c.groupName.toLocaleLowerCase(),
            );
            if (!selectedGroup) {
              selectedGroup = await tx.categoryGroup.create({
                data: {
                  budgetId,
                  name: suggestion.name,
                  sortOrder:
                    Math.max(0, ...data.groups.map((item) => item.sortOrder)) +
                    1,
                },
              });
            } else if (selectedGroup.hidden) {
              await tx.categoryGroup.update({
                where: { id: selectedGroup.id },
                data: { hidden: false },
              });
            }
            for (const [position, categoryName] of
              suggestion.categories.entries()) {
              const existing = data.categories.find(
                (item) =>
                  item.groupId === selectedGroup.id &&
                  item.name.toLocaleLowerCase() ===
                    categoryName.toLocaleLowerCase(),
              );
              if (existing) {
                if (existing.archived || existing.hidden)
                  await tx.category.update({
                    where: { id: existing.id },
                    data: { archived: false, hidden: false },
                  });
              } else {
                await tx.category.create({
                  data: {
                    budgetId,
                    groupId: selectedGroup.id,
                    name: categoryName,
                    sortOrder:
                      Math.max(
                        0,
                        ...data.categories
                          .filter((item) => item.groupId === selectedGroup.id)
                          .map((item) => item.sortOrder),
                      ) +
                      position +
                      1,
                  },
                });
              }
            }
            id = selectedGroup.id;
            message = `${suggestion.name} is ready with its stock categories. Open a category to set its target.`;
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
            for (const [index, starter] of STARTER_GROUPS.entries()) {
              const created = await tx.categoryGroup.create({
                data: {
                  budgetId,
                  name: starter.name,
                  sortOrder:
                    Math.max(0, ...data.groups.map((item) => item.sortOrder)) +
                    index +
                    1,
                },
              });
              await tx.category.createMany({
                data: starter.categories.map((categoryName, position) => ({
                  budgetId,
                  groupId: created.id,
                  name: categoryName,
                  sortOrder: position + 1,
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
              c.targetDueDay !== undefined &&
              c.targetType !== "MONTHLY" &&
              c.targetType !== "PERIODIC" &&
              c.targetType !== "DEBT_PAYOFF"
            )
              fail("Only a monthly or repeating target has a due day.");
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
              dueDay: c.targetDueDay ?? null,
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
            if (!c.minimumPayment && !c.minimumPercent)
              fail("Enter a fixed minimum, a percentage, or both.");
            const minimum = c.minimumPayment ? parseUSD(c.minimumPayment) : 0n;
            if (minimum < 0n) fail("A minimum payment cannot be negative.");
            if (
              c.minimumPercent &&
              !/^\d{1,3}(\.\d{1,2})?$/.test(c.minimumPercent)
            )
              fail("Enter a minimum percentage such as 1 or 2.5.");
            const percentBasisPoints = c.minimumPercent
              ? Number((Number(c.minimumPercent) * 100).toFixed(0))
              : 0;
            if (percentBasisPoints > 10000)
              fail("A minimum percentage cannot exceed 100%.");
            const statement = c.statementBalance
              ? parseUSD(c.statementBalance)
              : null;
            if (statement !== null && statement < 0n)
              fail("Enter the statement balance owed as a positive amount.");
            if ((statement === null) !== !c.statementDate)
              fail("Give a statement balance and its date together.");
            if (c.statementDate) validDate(c.statementDate);
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
              minimumPercentBasisPoints: percentBasisPoints,
              minimumIncludesInterest:
                percentBasisPoints > 0 && c.minimumIncludesInterest,
              dueDay: c.dueDay ?? null,
              creditLimit: limit,
              statementBalance: statement,
              statementDate: c.statementDate ? new Date(c.statementDate) : null,
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
            if (c.monthlyPayment && !c.payFromAccountId)
              fail("Choose the account the payment comes from.");
            if (c.payFromAccountId) {
              if (!c.dueDay)
                fail("Enter the due day so the payment can be scheduled.");
              if (effectiveFrom > currentMonth)
                fail(
                  "Set up the payment with the terms in force now, not a later version.",
                );
              const payment = data.categories.find(
                (cat) => cat.paymentAccountId === a.id,
              );
              if (!payment || a.closed)
                fail("Automatic payment setup is for open, on-budget cards.");
              const from = activeAccount(c.payFromAccountId);
              if (DEBT_TYPES.includes(from.type) || from.participation !== "BUDGET")
                fail("Pay from an on-budget cash account such as checking.");
              const owed = (() => {
                const balance =
                  projectBudget(data.input, currentMonth).accounts.find(
                    (item) => item.id === a.id,
                  )?.balance ?? 0n;
                return balance < 0n ? -balance : 0n;
              })();
              // A computed minimum never asks for more than is owed.
              const minimumNow = (due: bigint) => (due < owed ? due : owed);
              const amountDue = c.monthlyPayment
                ? parseUSD(c.monthlyPayment)
                : minimumNow(minimumDue(
                    {
                      minimumPayment: minimum,
                      percentBasisPoints: percentBasisPoints,
                      includeInterest: fields.minimumIncludesInterest,
                    },
                    owed,
                    monthlyInterest(owed, basisPoints),
                  ));
              if (amountDue <= 0n)
                fail(
                  owed
                    ? "Enter a monthly payment greater than zero."
                    : "This card owes nothing yet. Enter the monthly payment to plan for.",
                );
              await tx.categoryTarget.upsert({
                where: {
                  categoryId_effectiveFrom: {
                    categoryId: payment.id,
                    effectiveFrom: currentMonth,
                  },
                },
                create: {
                  categoryId: payment.id,
                  budgetId,
                  effectiveFrom: currentMonth,
                  type: "DEBT_PAYOFF",
                  amount: amountDue,
                  dueDay: c.dueDay,
                },
                update: {
                  type: "DEBT_PAYOFF",
                  amount: amountDue,
                  dueMonth: null,
                  cadenceMonths: null,
                  refill: false,
                  dayOfWeek: null,
                  dueDay: c.dueDay,
                },
              });
              const previous = await tx.schedule.findFirst({
                where: {
                  budgetId,
                  paymentForAccountId: a.id,
                  archived: false,
                  replacedById: null,
                },
              });
              const handled = previous
                ? await tx.scheduleOccurrence.findFirst({
                    where: { scheduleId: previous.id },
                    orderBy: { date: "desc" },
                  })
                : null;
              const after = [
                currentDate,
                handled
                  ? new Date(handled.date.getTime() + 86400000)
                      .toISOString()
                      .slice(0, 10)
                  : "",
              ].sort()[1];
              const startDate = nextDueDate(after, c.dueDay);
              const unchanged =
                previous &&
                previous.accountId === from.id &&
                previous.amount === -amountDue &&
                previous.startDate.getUTCDate() === c.dueDay &&
                !previous.endDate;
              if (!unchanged) {
                const scheduleId = randomUUID();
                await tx.schedule.create({
                  data: {
                    id: scheduleId,
                    budgetId,
                    accountId: from.id,
                    transferAccountId: a.id,
                    paymentForAccountId: a.id,
                    name: `${a.name} payment`,
                    kind: "TRANSFER",
                    amount: -amountDue,
                    payee: "",
                    memo: "",
                    startDate: new Date(startDate),
                    timezone: budget.timezone,
                    cadence: "MONTHLY",
                    interval: 1,
                  },
                });
                if (previous) {
                  const cutoff = new Date(startDate);
                  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
                  await tx.schedule.update({
                    where: { id: previous.id },
                    data: {
                      replacedById: scheduleId,
                      revision: { increment: 1 },
                      ...(cutoff < previous.startDate
                        ? { archived: true }
                        : { endDate: cutoff }),
                    },
                  });
                }
              }
              message = `Terms saved. The ${a.name} payment envelope now targets ${formatUSD(money(amountDue))} a month, due on day ${c.dueDay}, and a ${formatUSD(money(amountDue))} transfer from ${from.name} is scheduled from ${startDate}.`;
            }
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
            await tx.targetSnooze.deleteMany({
              where: { budgetId, categoryId: id },
            });
          } else if (c.type === "target.snooze") {
            const cat = category(c.categoryId);
            if (cat.paymentAccountId)
              fail("Credit card payment targets cannot be snoozed.");
            if (
              !targetInForce(
                await tx.categoryTarget.findMany({
                  where: { budgetId, categoryId: cat.id },
                }),
                cat.id,
                currentMonth,
              )
            )
              fail("Set a target before snoozing it.");
            id = cat.id;
            if (c.snoozed) {
              await tx.targetSnooze.upsert({
                where: {
                  budgetId_categoryId_month: {
                    budgetId,
                    categoryId: id,
                    month: currentMonth,
                  },
                },
                create: { budgetId, categoryId: id, month: currentMonth },
                update: {},
              });
            } else {
              await tx.targetSnooze.deleteMany({
                where: { budgetId, categoryId: id, month: currentMonth },
              });
            }
            message = c.snoozed
              ? "Target snoozed for this month. Its progress remains visible."
              : "Target resumed for this month.";
          } else if (c.type === "auto.assign") {
            if (c.month > nextMonth(currentMonth, 24))
              fail("Plan no more than 24 months ahead.");
            const plan = await autoAssignPlan(
              tx,
              data,
              budgetId,
              c.month,
              c.mode,
              c.categoryId,
            );
            if (plan.expected !== c.expected)
              fail("The budget changed since this preview. Preview it again.");
            if (!plan.changes.length)
              fail("This Auto-Assign option would not change any categories.");
            if (c.month > currentMonth) {
              for (const change of plan.changes)
                if (change.nextAssigned < 0n)
                  fail(
                    "Future assignments cannot borrow from expected rollover.",
                  );
            }
            const moveId = randomUUID();
            for (const change of plan.changes) {
              const created = await tx.budgetAssignment.create({
                data: {
                  budgetId,
                  categoryId: change.categoryId,
                  month: c.month,
                  amount: change.amount,
                  moveId,
                  origin: `AUTO_ASSIGN:${c.mode}`,
                  actorId: userId,
                },
              });
              id = created.id;
            }
            message = `Auto-Assign changed ${plan.changes.length} categor${plan.changes.length === 1 ? "y" : "ies"}. Ready to Assign is ${formatUSD(money(plan.readyAfter))}.`;
          } else if (c.type === "target.fund") {
            if (c.month > nextMonth(currentMonth, 24))
              fail("Plan no more than 24 months ahead.");
            const projection = projectBudget(data.input, c.month);
            const targets = await tx.categoryTarget.findMany({
              where: { budgetId },
            });
            const snoozed = new Set(
              (
                await tx.targetSnooze.findMany({
                  where: { budgetId, month: c.month },
                  select: { categoryId: true },
                })
              ).map((row) => row.categoryId),
            );
            // Fund in the order categories are presented, so a partly funded
            // month matches what the owner sees rather than an arbitrary order.
            let needs = data.categories
              // A payment category is normally the application's business, but
              // a payoff target on one is the owner's own instruction.
              .filter(
                (cat) =>
                  !cat.archived &&
                  !cat.hidden &&
                  !data.groups.find((group) => group.id === cat.groupId)
                    ?.hidden &&
                  (!cat.system || cat.paymentAccountId),
              )
              .flatMap((cat) => {
                if (snoozed.has(cat.id)) return [];
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
            // A Focused View only narrows this command's eligible categories.
            // The full budget projection and Ready to Assign remain unchanged.
            if (c.view) {
              const custom = PRESET_VIEWS.includes(c.view as (typeof PRESET_VIEWS)[number])
                ? null
                : await tx.focusedView.findFirst({ where: { id: c.view, budgetId } });
              if (!custom && !PRESET_VIEWS.includes(c.view as (typeof PRESET_VIEWS)[number]))
                fail("View unavailable.");
              const customIds = custom ? (await tx.focusedViewCategory.findMany({ where: { viewId: custom.id, budgetId } })).map((item) => item.categoryId) : [];
              const rows: FocusedCategory[] = data.categories.map((cat) => {
                const row = projection.categories.find((item) => item.id === cat.id)!;
                const definition = targetInForce(targets, cat.id, c.month);
                const progress = definition ? evaluateTarget(definition, row, c.month, owedByCard(cat, projection.accounts)) : null;
                const baseline = definition ? evaluateTarget(definition, { ...row, available: row.available - row.assigned, assigned: 0n }, c.month, owedByCard(cat, projection.accounts)).contribution : 0n;
                return {
                  id: cat.id, archived: cat.archived,
                  hidden: cat.hidden || Boolean(data.groups.find((group) => group.id === cat.groupId)?.hidden),
                  available: row.available, cashDeficit: row.cashDeficit, creditDeficit: row.creditDeficit,
                  targetNeed: snoozed.has(cat.id) ? 0n : (progress?.contribution ?? 0n),
                  overfunded: snoozed.has(cat.id) || !definition || row.assigned <= baseline ? 0n : row.assigned - baseline,
                  snoozed: snoozed.has(cat.id),
                };
              });
              const selectedIds = new Set(focusedCategoryIds(rows, custom ? { categoryIds: customIds } : c.view as (typeof PRESET_VIEWS)[number]));
              needs = needs.filter((item) => selectedIds.has(item.categoryId));
            }
            // Fills targets even when that goes past Ready to Assign, matching
            // YNAB. The overshoot is reported, never hidden.
            const plan = planFunding(needs, projection.readyToAssign, "full");
            if (!plan.assignments.length)
              fail("Every target for this month is already funded.");
            const moveId = randomUUID();
            for (const assignment of plan.assignments) {
              const created = await tx.budgetAssignment.create({
                data: {
                  budgetId,
                  categoryId: assignment.categoryId,
                  month: c.month,
                  amount: assignment.amount,
                  moveId,
                  origin: "TARGET_FUND",
                  actorId: userId,
                },
              });
              id = created.id;
            }
            message = `Assigned ${formatUSD(money(plan.total))} to ${plan.assignments.length} categor${plan.assignments.length === 1 ? "y" : "ies"}.${plan.overAssigned > 0n ? ` That is ${formatUSD(money(plan.overAssigned))} more than you have; cover it before the month ends.` : ""}`;
          } else if (c.type === "category.create") {
            group(c.groupId);
            id = (
              await tx.category.create({
                data: {
                  budgetId,
                  name: c.name,
                  groupId: c.groupId,
                  sortOrder:
                    Math.max(
                      0,
                      ...data.categories
                        .filter((item) => item.groupId === c.groupId)
                        .map((item) => item.sortOrder),
                    ) + 1,
                },
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
              data: {
                name: c.name,
                groupId: c.groupId,
                archived: c.archived,
                ...(c.note !== undefined
                  ? { note: c.note }
                  : c.noteSet
                    ? { note: "" }
                    : {}),
                ...(cat.groupId !== c.groupId
                  ? {
                      sortOrder:
                        Math.max(
                          0,
                          ...data.categories
                            .filter((item) => item.groupId === c.groupId)
                            .map((item) => item.sortOrder),
                        ) + 1,
                    }
                  : {}),
              },
            });
          } else if (c.type === "category.hide") {
            const selected = category(c.id);
            if (selected.system && !selected.paymentAccountId)
              fail("This system category stays visible.");
            id = selected.id;
            await tx.category.update({
              where: { id },
              data: { hidden: c.hidden },
            });
          } else if (c.type === "category.reorder") {
            const selected = category(c.id);
            if (selected.system && !selected.paymentAccountId)
              fail("This system category cannot be moved.");
            id = selected.id;
            const siblings = data.categories.filter(
              (item) => item.groupId === selected.groupId && !item.archived,
            );
            const index = siblings.findIndex((item) => item.id === id);
            const other = siblings[index + (c.direction === "UP" ? -1 : 1)];
            if (!other) fail("Category is already at the edge.");
            await tx.category.update({
              where: { id },
              data: { sortOrder: other.sortOrder },
            });
            await tx.category.update({
              where: { id: other.id },
              data: { sortOrder: selected.sortOrder },
            });
          } else if (
            c.type === "assign" ||
            c.type === "move" ||
            c.type === "move.undo"
          ) {
            let entries: { categoryId: string; amount: bigint }[];
            let targetMonth: string;
            if (c.type === "move.undo") {
              const rows = data.assignments.filter(
                (a) => a.moveId === c.id || (!a.moveId && a.id === c.id),
              );
              if (!rows.length || rows.some((a) => a.origin === "UNDO"))
                fail("That move is unavailable.");
              if (data.assignments.some((a) => a.undoOf === c.id))
                fail("That move has already been undone.");
              targetMonth = rows[0].month;
              entries = rows.map((a) => ({
                categoryId: a.categoryId,
                amount: -a.amount,
              }));
            } else {
              if (c.month > nextMonth(currentMonth, 24))
                fail("Plan no more than 24 months ahead.");
              const value = parseUSD(c.amount);
              if (value === 0n) fail("Enter a nonzero amount.");
              if (c.type === "move" && (value < 0n || c.from === c.to))
                fail("Choose different categories and a positive amount.");
              targetMonth = c.month;
              entries =
                c.type === "assign"
                  ? [{ categoryId: c.categoryId, amount: value }]
                  : [
                      { categoryId: c.from, amount: -value },
                      { categoryId: c.to, amount: value },
                    ];
            }
            for (const e of entries) category(e.categoryId);
            const proposed = {
              ...data.input,
              assignments: [
                ...data.input.assignments,
                ...entries.map((e) => ({
                  ...e,
                  id: randomUUID(),
                  month: targetMonth,
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
              let m = targetMonth < currentMonth ? targetMonth : currentMonth;
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
            const moveId = c.type === "assign" ? undefined : randomUUID();
            for (const e of entries) {
              const a = await tx.budgetAssignment.create({
                data: {
                  budgetId,
                  ...e,
                  month: targetMonth,
                  moveId,
                  origin:
                    c.type === "move"
                      ? "MOVE"
                      : c.type === "move.undo"
                        ? "UNDO"
                        : "ASSIGN",
                  undoOf: c.type === "move.undo" ? c.id : undefined,
                  actorId: userId,
                },
              });
              id = a.id;
            }
            if (c.type === "move.undo") message = "Move undone.";
          } else if (c.type === "transaction.create") {
            validDate(c.date);
            const a = activeAccount(c.accountId);
            const b = c.transferAccountId
              ? activeAccount(c.transferAccountId)
              : undefined;
            const value = parseUSD(c.amount);
            if (value === 0n) fail("Enter a nonzero amount.");
            if (c.kind === "OPENING") {
              const prior = c.replacesId
                ? data.transactions.find((t) => t.id === c.replacesId)
                : null;
              const openingLineage =
                prior?.kind === "OPENING" ||
                (original.type === "transaction.undo" &&
                  data.transactions.some(
                    (t) => t.id === prior?.replacesId && t.kind === "OPENING",
                  ));
              if (!openingLineage || prior?.accountId !== a.id)
                fail("Edit an existing opening balance on the same account.");
            }
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
              if (!restoreVoided)
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
                flag: previousPreference?.flag ?? null,
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
                data: { transactionId: id, approved: true, removed: false },
              });
            if (c.replacesId)
              await tx.scheduleOccurrence.updateMany({
                where: { budgetId, transactionId: c.replacesId },
                data: { transactionId: id },
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
                  original.type === "schedule.skip"
                    ? "SKIPPED"
                    : original.type === "schedule.enter"
                      ? "ENTERED"
                      : "APPROVED",
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
