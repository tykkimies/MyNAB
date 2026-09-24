import { getDb } from "@/infrastructure/db";
import { authorize, fail } from "./finance";
import { previewRules, type AutomationRule } from "@/domain/rules";
import { createHash } from "node:crypto";
import type { Tx } from "./finance";
import type { RuleField } from "@/domain/rules";
import { z } from "zod";
export async function getRules(
  userId: string,
  budgetId: string,
  transactionId?: string,
) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      return loadRulePreview(tx, budgetId, transactionId);
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export async function loadRulePreview(
  tx: Tx,
  budgetId: string,
  transactionId?: string,
) {
  const rules = await tx.automationRule.findMany({
    where: { budgetId },
    orderBy: [{ priority: "asc" }, { id: "asc" }],
  });
  const transactions = await tx.financialTransaction.findMany({
    where: {
      budgetId,
      voidedAt: null,
      kind: { in: ["INCOME", "EXPENSE"] },
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
    take: 100,
  });
  if (transactionId && !z.string().uuid().safeParse(transactionId).success)
    fail("Invalid preview transaction.");
  const transaction = transactionId
    ? await tx.financialTransaction.findFirst({
        where: {
          id: transactionId,
          budgetId,
          voidedAt: null,
          kind: { in: ["INCOME", "EXPENSE"] },
        },
      })
    : null;
  if (transactionId && !transaction) fail("Preview transaction unavailable.");
  const splits = transaction
    ? await tx.financialSplit.findMany({
        where: { transactionId: transaction.id, budgetId },
      })
    : [];
  const definitions = ruleDefinitions(rules);
  const preference = transaction
    ? await tx.transactionPreference.findUnique({
        where: { transactionId: transaction.id },
      })
    : null;
  const provisional = transaction
    ? await tx.ingestedEntry.findFirst({
        where: { budgetId, transactionId: transaction.id, approved: false },
      })
    : null;
  const locked: RuleField[] = (preference?.locked ??
    (provisional
      ? []
      : [
          "payee",
          "categoryId",
          "memo",
          "tags",
          "transferAccountId",
        ])) as RuleField[];
  const preview = transaction
    ? previewRules(
        {
          accountId: transaction.accountId,
          amount: transaction.amount,
          description: transaction.memo,
          payee: transaction.payee,
          memo: transaction.memo,
          tags: preference?.tags ?? [],
          categoryId: splits.length === 1 ? splits[0].categoryId : undefined,
          locked: [
            ...new Set([
              ...locked,
              ...(splits.length !== 1 ? ["categoryId" as const] : []),
            ]),
          ],
        },
        definitions,
      )
    : null;
  const states = transaction
    ? await tx.transactionState.findMany({
        where: { budgetId, transactionId: transaction.id },
      })
    : [];
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        { rules, transaction, splits, preference, locked, states },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
    )
    .digest("hex");
  return {
    rules,
    transactions,
    transaction,
    preview,
    preference,
    locked,
    fingerprint,
    splits,
  };
}

type RuleRow = Awaited<ReturnType<Tx["automationRule"]["findMany"]>>[number];
/** Stored rule rows in the shape the pure preview engine expects. */
export function ruleDefinitions(rows: RuleRow[]): AutomationRule[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    enabled: r.enabled,
    match: {
      accountId: r.accountId ?? undefined,
      payee: r.payeeMatch
        ? { mode: r.matchMode as "EXACT" | "CONTAINS", value: r.payeeMatch }
        : undefined,
      description: r.descriptionContains ?? undefined,
      minimum: r.minimum ?? undefined,
      maximum: r.maximum ?? undefined,
    },
    actions: {
      payee: r.renamePayee ?? undefined,
      categoryId: r.categoryId ?? undefined,
      memo: r.memo ?? undefined,
      tags: r.tags.length ? r.tags : undefined,
      transferAccountId: r.transferAccountId ?? undefined,
    },
  }));
}
