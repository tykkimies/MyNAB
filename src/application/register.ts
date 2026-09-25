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
  if (
    !uuid.safeParse(budgetId).success ||
    !(await db.budgetMember.findUnique({
      where: { budgetId_userId: { budgetId, userId } },
    }))
  )
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
