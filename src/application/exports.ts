import { getDb } from "@/infrastructure/db";
import { csvTable, dollars, type Cell } from "@/domain/export";
import { authorize, fail } from "./finance";

/**
 * Portable export, per PROJECT_SPEC section 10: everything needed to
 * understand or rebuild this budget elsewhere, from one consistent snapshot.
 *
 * Deliberately absent: provider access tokens and sync cursors (reusable
 * secrets), users, password hashes, sessions, audit logs and idempotency keys.
 * This is not an operational backup: restore uses the encrypted database
 * backup, and bank connections must be relinked after moving elsewhere.
 */
export const EXPORT_FORMAT = "mynab.export";
export const EXPORT_VERSION = 1;
export const CSV_TABLES = [
  "transactions",
  "accounts",
  "categories",
  "assignments",
  "targets",
  "schedules",
  "rules",
] as const;
export type CsvTable = (typeof CSV_TABLES)[number];

async function snapshot(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const where = { budgetId };
      const [
        accounts,
        groups,
        categories,
        transactions,
        splits,
        states,
        assignments,
        reconciliations,
        reconciliationItems,
        targets,
        debtTerms,
        schedules,
        scheduleSplits,
        occurrences,
        rules,
        preferences,
        connections,
        providerAccounts,
        importBatches,
      ] = await Promise.all([
        tx.financialAccount.findMany({ where, orderBy: { name: "asc" } }),
        tx.categoryGroup.findMany({ where, orderBy: { name: "asc" } }),
        tx.category.findMany({ where, orderBy: { name: "asc" } }),
        tx.financialTransaction.findMany({
          where,
          orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        }),
        tx.financialSplit.findMany({
          where,
          orderBy: [{ transactionId: "asc" }, { position: "asc" }],
        }),
        tx.transactionState.findMany({ where }),
        tx.budgetAssignment.findMany({
          where,
          orderBy: [{ month: "asc" }, { id: "asc" }],
        }),
        tx.reconciliation.findMany({ where, orderBy: { createdAt: "asc" } }),
        tx.reconciliationItem.findMany({ where }),
        tx.categoryTarget.findMany({ where }),
        tx.debtTerms.findMany({ where }),
        tx.schedule.findMany({ where, orderBy: { createdAt: "asc" } }),
        tx.scheduleSplit.findMany({ where }),
        tx.scheduleOccurrence.findMany({ where, orderBy: { date: "asc" } }),
        tx.automationRule.findMany({
          where,
          orderBy: [{ priority: "asc" }, { id: "asc" }],
        }),
        tx.transactionPreference.findMany({ where }),
        tx.providerConnection.findMany({
          where,
          // Never the access token, cursor or sync lease.
          select: {
            id: true,
            provider: true,
            institutionId: true,
            institutionName: true,
            status: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        }),
        tx.providerAccount.findMany({ where }),
        tx.importBatch.findMany({ where, orderBy: { createdAt: "asc" } }),
      ]);
      return {
        budget,
        accounts,
        groups,
        categories,
        transactions,
        splits,
        states,
        assignments,
        reconciliations,
        reconciliationItems,
        targets,
        debtTerms,
        schedules,
        scheduleSplits,
        occurrences,
        rules,
        preferences,
        connections,
        providerAccounts,
        importBatches,
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 30000 },
  );
}

/** Versioned JSON. Money is integer cents written as strings, never floats. */
export async function exportJson(userId: string, budgetId: string) {
  const s = await snapshot(userId, budgetId);
  const document = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    notes:
      "Amounts are integer cents as strings. Dates are calendar dates. Voided transactions are kept with voidedAt; their replacements reference them with replacesId. Provider credentials are omitted.",
    budget: {
      id: s.budget.id,
      name: s.budget.name,
      currency: s.budget.currency,
      timezone: s.budget.timezone,
    },
    accounts: s.accounts,
    categoryGroups: s.groups,
    categories: s.categories,
    transactions: s.transactions,
    splits: s.splits,
    transactionStates: s.states,
    transactionPreferences: s.preferences,
    assignments: s.assignments,
    reconciliations: s.reconciliations,
    reconciliationItems: s.reconciliationItems,
    targets: s.targets,
    debtTerms: s.debtTerms,
    schedules: s.schedules,
    scheduleSplits: s.scheduleSplits,
    scheduleOccurrences: s.occurrences,
    rules: s.rules,
    connections: s.connections,
    providerAccounts: s.providerAccounts,
    importBatches: s.importBatches,
  };
  return JSON.stringify(
    document,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

const day = (d: Date | null | undefined) =>
  d ? d.toISOString().slice(0, 10) : null;

/** One convenient table, formula-safe for spreadsheets. */
export async function exportCsv(
  userId: string,
  budgetId: string,
  table: string,
) {
  if (!CSV_TABLES.includes(table as CsvTable)) fail("Unknown export table.");
  const s = await snapshot(userId, budgetId);
  const account = new Map(s.accounts.map((a) => [a.id, a.name]));
  const category = new Map(s.categories.map((c) => [c.id, c.name]));
  const group = new Map(s.groups.map((g) => [g.id, g.name]));
  switch (table as CsvTable) {
    case "transactions": {
      const cleared = new Map(
        s.states.map((st) => [`${st.transactionId}/${st.accountId}`, st]),
      );
      const bySplit = new Map<string, typeof s.splits>();
      for (const sp of s.splits)
        bySplit.set(sp.transactionId, [
          ...(bySplit.get(sp.transactionId) ?? []),
          sp,
        ]);
      const rows: Cell[][] = [];
      for (const t of s.transactions) {
        const state = cleared.get(`${t.id}/${t.accountId}`);
        const base = (categoryName: string | null, amount: bigint) => [
          day(t.date),
          account.get(t.accountId) ?? "",
          t.kind,
          t.payee,
          categoryName,
          dollars(amount),
          t.transferAccountId ? (account.get(t.transferAccountId) ?? "") : "",
          t.memo,
          Boolean(state?.cleared),
          Boolean(state?.reconciliationId),
          t.voidedAt ? day(t.voidedAt) : "",
          t.voidReason ?? "",
          t.id,
          t.replacesId ?? "",
        ];
        const parts = bySplit.get(t.id);
        if (parts?.length)
          for (const p of parts)
            rows.push(base(category.get(p.categoryId) ?? "", p.amount));
        else rows.push(base(null, t.amount));
      }
      return csvTable(
        [
          "Date",
          "Account",
          "Kind",
          "Payee",
          "Category",
          "Amount",
          "Transfer account",
          "Memo",
          "Cleared",
          "Reconciled",
          "Voided on",
          "Void reason",
          "Transaction ID",
          "Replaces ID",
        ],
        rows,
      );
    }
    case "accounts":
      return csvTable(
        ["Name", "Type", "Participation", "Closed", "Account ID"],
        s.accounts.map((a) => [
          a.name,
          a.type,
          a.participation,
          a.closed,
          a.id,
        ]),
      );
    case "categories":
      return csvTable(
        ["Group", "Category", "Archived", "System", "Category ID"],
        s.categories.map((c) => [
          group.get(c.groupId) ?? "",
          c.name,
          c.archived,
          c.system,
          c.id,
        ]),
      );
    case "assignments":
      return csvTable(
        ["Month", "Category", "Amount"],
        s.assignments.map((a) => [
          a.month,
          category.get(a.categoryId) ?? "",
          dollars(a.amount),
        ]),
      );
    case "targets":
      return csvTable(
        ["Category", "Type", "Amount", "Due month", "Effective from"],
        s.targets.map((t) => [
          category.get(t.categoryId) ?? "",
          t.type,
          dollars(t.amount),
          t.dueMonth ?? "",
          t.effectiveFrom,
        ]),
      );
    case "schedules":
      return csvTable(
        [
          "Name",
          "Account",
          "Kind",
          "Amount",
          "Payee",
          "Cadence",
          "Every",
          "Start",
          "End",
          "Timezone",
          "Archived",
        ],
        s.schedules.map((sc) => [
          sc.name,
          account.get(sc.accountId) ?? "",
          sc.kind,
          dollars(sc.amount),
          sc.payee,
          sc.cadence,
          sc.interval,
          day(sc.startDate),
          day(sc.endDate),
          sc.timezone,
          sc.archived,
        ]),
      );
    case "rules":
      return csvTable(
        [
          "Name",
          "Priority",
          "Enabled",
          "Payee match",
          "Match mode",
          "Set payee",
          "Set category",
          "Set memo",
          "Tags",
        ],
        s.rules.map((r) => [
          r.name,
          r.priority,
          r.enabled,
          r.payeeMatch ?? "",
          r.matchMode,
          r.renamePayee ?? "",
          r.categoryId ? (category.get(r.categoryId) ?? "") : "",
          r.memo ?? "",
          r.tags.join("; "),
        ]),
      );
  }
}
