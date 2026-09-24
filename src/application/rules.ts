import { getDb } from "@/infrastructure/db";
import { authorize, fail } from "./finance";
import { previewRules, type AutomationRule } from "@/domain/rules";
import { z } from "zod";
export async function getRules(
  userId: string,
  budgetId: string,
  transactionId?: string,
) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
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
      if (transactionId && !transaction)
        fail("Preview transaction unavailable.");
      const splits = transaction
        ? await tx.financialSplit.findMany({
            where: { transactionId: transaction.id, budgetId },
          })
        : [];
      const definitions: AutomationRule[] = rules.map((r) => ({
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
      const preview = transaction
        ? previewRules(
            {
              accountId: transaction.accountId,
              amount: transaction.amount,
              description: transaction.memo,
              payee: transaction.payee,
              memo: transaction.memo,
              tags: [],
              categoryId:
                splits.length === 1 ? splits[0].categoryId : undefined,
              locked: splits.length > 1 ? ["categoryId"] : [],
            },
            definitions,
          )
        : null;
      return { rules, transactions, transaction, preview };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
