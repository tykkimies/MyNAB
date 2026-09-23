import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import type { Prisma } from "@/generated/prisma/client";
import { financialDate, budgetMonth } from "@/domain/dates";
import { parseUSD, money } from "@/domain/money";
import {
  isCard,
  nextMonth,
  positive,
  projectBudget,
  type BudgetInput,
} from "@/domain/budget";
import { STARTER_GROUPS } from "@/domain/starter";
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
export const financeCommand = z.discriminatedUnion("type", [
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
      return {
        ...data,
        budget,
        today: currentDate,
        month: selected,
        projection: projectBudget(data.input, selected),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
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
  const c = parsed.data;
  const hash = createHash("sha256").update(JSON.stringify(c)).digest("hex");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await getDb().$transaction(
        async (tx) => {
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
          if (c.type === "account.create") {
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
            // would bury the owner's own structure in suggestions.
            if (data.categories.some((cat) => !cat.system))
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
              if (
                positive(
                  after.funded + after.futureReservations - after.resources,
                ) >
                positive(
                  before.funded + before.futureReservations - before.resources,
                )
              )
                fail(
                  "There is not enough backed money for this assignment. Cover overspending or move money first.",
                );
              for (const e of entries.filter((e) => e.amount < 0n)) {
                const b = before.categories.find((r) => r.id === e.categoryId)!,
                  a = after.categories.find((r) => r.id === e.categoryId)!;
                if (a.available < 0n && a.available < b.available)
                  fail("Cannot remove more than the category has available.");
              }
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
          await tx.auditEvent.create({
            data: {
              budgetId,
              actorId: userId,
              action: "FINANCE_COMMAND",
              entityId: id,
              details: JSON.parse(JSON.stringify(c)),
            },
          });
          await tx.budget.update({
            where: { id: budgetId },
            data: { financeRevision: { increment: 1 } },
          });
          const result = { id, message: "Saved." };
          await tx.financeRequest.create({
            data: { budgetId, key, payloadHash: hash, result },
          });
          return result;
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2034" &&
        attempt < 3
      )
        continue;
      throw error;
    }
  }
  throw new FinanceError("Workspace is busy. Retry the same request.");
}
