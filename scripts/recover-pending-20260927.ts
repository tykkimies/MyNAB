/** One-time, idempotent recovery of the owner's September 27 PNC export. */
import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../src/infrastructure/db";
import { enterPending } from "../src/application/ingestion";
import { executeFinance } from "../src/application/finance";

const rows = [
  ["2026-09-27", "ANTHROPIC CARD9646", -1060],
  ["2026-09-27", "ANTHROPIC CARD9646", -2120],
  ["2026-09-26", "ANTHROPIC CARD9646", -2120],
  ["2026-09-26", "The Pokemon Company CARD9646", -3332],
  ["2026-09-26", "PIN POS ACME 3711 CARD9646", -1926],
  ["2026-09-26", "The Pokemon Company CARD9646", -476],
  ["2026-09-26", "ANTHROPIC CARD9646", -4770],
  ["2026-09-26", "ANTHROPIC CARD9646", -2120],
  ["2026-09-26", "PIN POS TARGET T-2 CARD9646", -12784],
  ["2026-09-26", "PIN POS ACME 3711 CARD9646", -1497],
  ["2026-09-26", "The Pokemon Company CARD9646", -2856],
  ["2026-09-25", "QDOBA 2292 OLO CARD9646", -3021],
] as const;
const prefix = "recovered-pending:";
const expected = -38082n;
const db = getDb();
const apply = process.argv[2] === "--apply";
if (process.argv.length > (apply ? 3 : 2) || (process.argv[2] && !apply))
  throw new Error("Usage: recover-pending-20260927.ts [--apply]");
if (rows.length !== 12 || rows.reduce((sum, row) => sum + BigInt(row[2]), 0n) !== expected)
  throw new Error("Recovery fixture does not match the 12-row, $380.82 export.");

try {
  const budgets = await db.budget.findMany({ where: { name: "My Budget" } });
  if (budgets.length !== 1) throw new Error("Expected exactly one My Budget.");
  const budgetId = budgets[0].id;
  const links = await db.providerAccount.findMany({
    where: { budgetId, mask: "9251", accountId: { not: null } },
  });
  if (links.length !== 1) throw new Error("Expected exactly one linked account ending 9251.");
  const link = links[0];
  const connection = await db.providerConnection.findUniqueOrThrow({ where: { id: link.connectionId } });
  const account = await db.financialAccount.findUniqueOrThrow({ where: { id: link.accountId! } });
  const owner = await db.installation.findUniqueOrThrow({ where: { id: 1 } });
  const membership = await db.budgetMember.findUnique({
    where: { budgetId_userId: { budgetId, userId: owner.ownerId } },
  });
  if (connection.budgetId !== budgetId || connection.provider !== "SIMPLEFIN" ||
      connection.status !== "ACTIVE" || account.budgetId !== budgetId ||
      account.participation !== "BUDGET" || account.closed || !membership)
    throw new Error("Budget, account, connection, or owner guard failed.");
  const existing = await db.ingestedEntry.findMany({ where: { providerAccountId: link.id } });
  if (existing.some((entry) => !entry.externalId.startsWith(prefix)))
    throw new Error("Bank has already supplied entries for this account; reconcile first.");
  const entries = rows.map(([date, payee, cents], index) => ({
    budgetId,
    connectionId: connection.id,
    providerAccountId: link.id,
    externalId: prefix + createHash("sha256")
      .update(`pnc-spend-20260927-export|${index}|${date}|${payee}|${cents}`)
      .digest("hex"),
    status: "PENDING",
    date: new Date(`${date}T00:00:00.000Z`),
    amount: BigInt(cents),
    payee,
  }));
  const ids = new Set(entries.map((entry) => entry.externalId));
  if (existing.some((entry) => !ids.has(entry.externalId) || entry.removed ||
      entry.amount !== entries.find((row) => row.externalId === entry.externalId)?.amount))
    throw new Error("Recovered entries differ from the expected export.");
  console.log(`${apply ? "Applying" : "Dry run"}: ${rows.length} charges, $380.82 outflow, PNC Spend •9251 in My Budget; ${existing.length} already staged.`);
  if (apply) {
    for (const entry of entries) {
      const staged = await db.ingestedEntry.upsert({
        where: { connectionId_externalId: { connectionId: connection.id, externalId: entry.externalId } },
        create: entry,
        update: {},
      });
      const transactionId = staged.transactionId ??
        (await enterPending(owner.ownerId, budgetId, staged.id, null)).transactionId;
      if (!transactionId) throw new Error("Pending entry did not create a transaction.");
      const state = await db.transactionState.findUniqueOrThrow({
        where: { transactionId_accountId: { transactionId, accountId: account.id } },
      });
      if (!state.cleared) await executeFinance(owner.ownerId, budgetId, randomUUID(), {
        type: "transaction.clear", id: transactionId, accountId: account.id, cleared: true,
      });
    }
  }
  const current = await db.ingestedEntry.findMany({
    where: { providerAccountId: link.id, externalId: { in: [...ids] } },
  });
  if (apply && (current.length !== 12 || current.some((entry) => !entry.transactionId) ||
      current.reduce((sum, entry) => sum + entry.amount, 0n) !== expected))
    throw new Error("Recovery verification failed.");
  const states = await db.transactionState.findMany({
    where: { budgetId, accountId: account.id,
      transactionId: { in: current.flatMap((entry) => entry.transactionId ? [entry.transactionId] : []) } },
  });
  if (apply && (states.length !== 12 || states.some((state) => !state.cleared)))
    throw new Error("Cleared-state verification failed.");
  console.log(`${current.length} recovered bank observations; ${current.filter((entry) => entry.transactionId).length} linked budget transactions; ${states.filter((state) => state.cleared).length} cleared.`);
} finally {
  await db.$disconnect();
}
