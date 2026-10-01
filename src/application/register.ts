import { createHash } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { executeFinance, FinanceError, type FinanceCommand } from "./finance";

const uuid = z.string().uuid();
export const categorizeCommand = z.object({
  type: z.literal("transaction.categorize"),
  ids: z.array(uuid).min(1).max(200),
  categoryId: uuid,
});

const dollars = (v: bigint) => {
  const a = v < 0n ? -v : v;
  return `${v < 0n ? "-" : ""}${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
};
/** A stable per-row key, so retrying the same bulk request never edits twice. */
function derivedKey(key: string, id: string) {
  const h = createHash("sha256").update(`${key}:${id}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * YNAB's bulk "Categorize": each selected single-category expense or refund
 * is edited through the ordinary edit path, so it is journaled and can be
 * undone like any other edit. Transfers, splits, income and reconciled rows
 * are left alone and reported.
 */
export async function categorizeTransactions(
  userId: string,
  budgetId: string,
  key: string,
  raw: unknown,
) {
  const parsed = categorizeCommand.safeParse(raw);
  if (!parsed.success || !uuid.safeParse(key).success)
    throw new FinanceError("Choose transactions and a category.");
  const { ids, categoryId } = parsed.data;
  const db = getDb();
  const member = uuid.safeParse(budgetId).success
    ? await db.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
      include: { budget: { select: { archivedAt: true } } },
    })
    : null;
  if (!member || member.budget.archivedAt)
    throw new FinanceError("Budget unavailable.");
  const [rows, splits, states, accounts] = await Promise.all([
    db.financialTransaction.findMany({
      where: { budgetId, id: { in: ids }, voidedAt: null },
    }),
    db.financialSplit.findMany({
      where: { budgetId, transactionId: { in: ids } },
    }),
    db.transactionState.findMany({
      where: { budgetId, transactionId: { in: ids } },
    }),
    db.financialAccount.findMany({ where: { budgetId } }),
  ]);
  const unique = [...new Set(ids)];
  const done = new Set(
    (
      await db.financeRequest.findMany({
        where: { budgetId, key: { in: unique.map((id) => derivedKey(key, id)) } },
        select: { key: true },
      })
    ).map((r) => r.key),
  );
  let changed = 0;
  let skipped = 0;
  for (const id of unique) {
    // Already edited by an earlier attempt of this same request.
    if (done.has(derivedKey(key, id))) {
      changed++;
      continue;
    }
    const t = rows.find((row) => row.id === id);
    const own = splits.filter((s) => s.transactionId === id);
    const state = states.find(
      (s) => s.transactionId === id && s.accountId === t?.accountId,
    );
    const account = accounts.find((a) => a.id === t?.accountId);
    if (
      !t ||
      !["EXPENSE", "REFUND"].includes(t.kind) ||
      t.transferAccountId ||
      own.length > 1 ||
      account?.participation !== "BUDGET" ||
      state?.reconciliationId ||
      own[0]?.categoryId === categoryId
    ) {
      skipped++;
      continue;
    }
    const command: FinanceCommand = {
      type: "transaction.create",
      accountId: t.accountId,
      kind: t.kind as "EXPENSE" | "REFUND",
      date: t.date.toISOString().slice(0, 10),
      amount: dollars(t.amount),
      payee: t.payee,
      memo: t.memo,
      cleared: state?.cleared ?? false,
      splits: [{ categoryId, amount: dollars(t.amount) }],
      replacesId: t.id,
      refundOfId: t.refundOfId ?? undefined,
      reason: "Categorized",
    };
    try {
      await executeFinance(userId, budgetId, derivedKey(key, id), command);
      changed++;
    } catch (error) {
      if (!(error instanceof FinanceError)) throw error;
      if (changed === 0 && skipped === 0 && ids.length === 1) throw error;
      skipped++;
    }
  }
  if (!changed)
    throw new FinanceError(
      "None of these can be categorized here. Transfers, splits, income and reconciled entries are edited one at a time.",
    );
  return {
    id: ids[0],
    message: `Categorized ${changed} transaction${changed === 1 ? "" : "s"}${skipped ? `; ${skipped} left unchanged` : ""}.`,
  };
}

export const renamePayeesCommand = z.object({
  type: z.literal("payee.rename"),
  from: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  to: z.string().trim().min(1).max(120),
  rule: z.boolean().default(false),
});
const payeeKey = (payee: string) => payee.trim().toLowerCase();

/**
 * YNAB's rename and combine payees: every live transaction whose payee is one
 * of `from` is edited to `to` through the ordinary edit path, so the change is
 * journaled and each row can be undone. Reconciled, closed-account and
 * refund-linked rows are left alone and counted. Optionally, a rule renames
 * the same payees on future imports.
 */
export async function renamePayees(
  userId: string,
  budgetId: string,
  key: string,
  raw: unknown,
) {
  const parsed = renamePayeesCommand.safeParse(raw);
  if (!parsed.success || !uuid.safeParse(key).success)
    throw new FinanceError("Choose payees and a new name.");
  const { from, to, rule } = parsed.data;
  const db = getDb();
  const member = uuid.safeParse(budgetId).success
    ? await db.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
      include: { budget: { select: { archivedAt: true } } },
    })
    : null;
  if (!member || member.budget.archivedAt)
    throw new FinanceError("Budget unavailable.");
  const keys = new Set(from.map(payeeKey));
  const rows = (
    await db.financialTransaction.findMany({
      where: { budgetId, voidedAt: null, kind: { not: "OPENING" } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    })
  ).filter((t) => keys.has(payeeKey(t.payee)));
  const ids = rows.map((t) => t.id);
  const [splits, states] = await Promise.all([
    db.financialSplit.findMany({
      where: { budgetId, transactionId: { in: ids } },
      orderBy: { position: "asc" },
    }),
    db.transactionState.findMany({
      where: { budgetId, transactionId: { in: ids } },
    }),
  ]);
  let changed = 0;
  let skipped = 0;
  for (const t of rows) {
    if (t.payee === to) continue;
    const state = states.find(
      (s) => s.transactionId === t.id && s.accountId === t.accountId,
    );
    if (state?.reconciliationId) {
      skipped++;
      continue;
    }
    try {
      await executeFinance(userId, budgetId, derivedKey(key, t.id), {
        type: "transaction.create",
        accountId: t.accountId,
        transferAccountId: t.transferAccountId ?? undefined,
        kind: t.kind as never,
        date: t.date.toISOString().slice(0, 10),
        amount: dollars(t.amount),
        payee: to,
        memo: t.memo,
        cleared: state?.cleared ?? false,
        splits: splits
          .filter((s) => s.transactionId === t.id)
          .map((s) => ({ categoryId: s.categoryId, amount: dollars(s.amount) })),
        replacesId: t.id,
        refundOfId: t.refundOfId ?? undefined,
        reason: "Payee renamed",
      });
      changed++;
    } catch (error) {
      if (!(error instanceof FinanceError)) throw error;
      skipped++;
    }
  }
  if (rule)
    for (const name of new Set(from.map((f) => f.trim())))
      if (payeeKey(name) !== payeeKey(to))
        await executeFinance(userId, budgetId, derivedKey(key, `rule:${payeeKey(name)}`), {
          type: "rule.save",
          name: `Rename ${name}`.slice(0, 120),
          payeeMatch: name,
          matchMode: "EXACT",
          renamePayee: to,
        });
  return {
    id: budgetId,
    message: `Renamed ${changed} transaction${changed === 1 ? "" : "s"} to ${to}${skipped ? `; ${skipped} left unchanged (reconciled or linked)` : ""}${rule ? ". Future imports will use the new name." : "."}`,
  };
}
