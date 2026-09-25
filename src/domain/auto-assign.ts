import {
  nextMonth,
  positive,
  projectBudget,
  type BudgetInput,
} from "./budget";
import { budgetMonth } from "./dates";

export const AUTO_ASSIGN_MODES = [
  "LAST_ASSIGNED",
  "LAST_SPENT",
  "AVERAGE_ASSIGNED",
  "AVERAGE_SPENT",
  "REDUCE_OVERFUNDING",
  "RESET_ASSIGNED",
  "RESET_AVAILABLE",
] as const;
export type AutoAssignMode = (typeof AUTO_ASSIGN_MODES)[number];

export interface AutoAssignChange {
  categoryId: string;
  previousAssigned: bigint;
  previousAvailable: bigint;
  amount: bigint;
  nextAssigned: bigint;
  nextAvailable: bigint;
}

export interface AutoAssignPlan {
  mode: AutoAssignMode;
  month: string;
  changes: AutoAssignChange[];
  total: bigint;
  readyBefore: bigint;
  readyAfter: bigint;
}

const roundedAverage = (total: bigint, count: number) =>
  (total + BigInt(count) / 2n) / BigInt(count);

/**
 * Plans Auto-Assign from the exact projected ledger state. History is limited to
 * the preceding twelve months and begins with the first month with relevant
 * activity; empty months after that month count as zero. The plan is a preview,
 * not a mutation. Callers apply its deltas through the authorized command.
 */
export function planAutoAssign(
  input: BudgetInput,
  month: string,
  mode: AutoAssignMode,
  eligibleIds: readonly string[],
  targetNeededWithoutAssignments: ReadonlyMap<string, bigint> = new Map(),
): AutoAssignPlan {
  budgetMonth(month);
  const before = projectBudget(input, month);
  const prior = nextMonth(month, -1);
  const historical =
    mode === "LAST_ASSIGNED" || mode === "LAST_SPENT"
      ? [prior]
      : mode === "AVERAGE_ASSIGNED" || mode === "AVERAGE_SPENT"
        ? Array.from({ length: 12 }, (_, index) => nextMonth(month, index - 12))
            .filter((candidate) => candidate >= "1900-01")
        : [];
  const snapshots = historical.map((m) => projectBudget(input, m));
  const currentById = new Map(before.categories.map((row) => [row.id, row]));
  const historyById = new Map(
    snapshots.flatMap((snapshot) =>
      snapshot.categories.map((row) => [
        `${snapshot.month}/${row.id}`,
        row,
      ] as const),
    ),
  );
  const seen = new Set<string>();
  const changes: AutoAssignChange[] = [];
  for (const categoryId of eligibleIds) {
    if (seen.has(categoryId)) continue;
    seen.add(categoryId);
    const current = currentById.get(categoryId);
    if (!current) throw new Error("Unknown Auto-Assign category");
    let desired: bigint;
    if (mode === "RESET_ASSIGNED") desired = 0n;
    else if (mode === "RESET_AVAILABLE")
      desired = current.assigned - current.available;
    else if (mode === "REDUCE_OVERFUNDING") {
      const needed = targetNeededWithoutAssignments.get(categoryId);
      if (needed === undefined) continue;
      desired = current.assigned < 0n
        ? current.assigned
        : current.assigned < needed
          ? current.assigned
          : needed;
    } else {
      const values = historical.map((m) => {
        const row = historyById.get(`${m}/${categoryId}`);
        if (!row) throw new Error("Missing Auto-Assign history");
        return mode === "LAST_ASSIGNED" || mode === "AVERAGE_ASSIGNED"
          ? positive(row.assigned)
          : positive(-row.activity);
      });
      if (mode === "LAST_ASSIGNED" || mode === "LAST_SPENT")
        desired = values[0];
      else {
        const first = values.findIndex((value) => value > 0n);
        desired =
          first < 0
            ? 0n
            : roundedAverage(
                values.slice(first).reduce((sum, value) => sum + value, 0n),
                values.length - first,
              );
      }
    }
    const amount = desired - current.assigned;
    if (amount === 0n) continue;
    changes.push({
      categoryId,
      previousAssigned: current.assigned,
      previousAvailable: current.available,
      amount,
      nextAssigned: desired,
      nextAvailable: 0n,
    });
  }
  const proposed: BudgetInput = {
    ...input,
    assignments: [
      ...input.assignments,
      ...changes.map((change, index) => ({
        id: `auto-preview-${index}`,
        month,
        categoryId: change.categoryId,
        amount: change.amount,
      })),
    ],
  };
  const after = projectBudget(proposed, month);
  const afterById = new Map(after.categories.map((row) => [row.id, row]));
  for (const change of changes)
    change.nextAvailable = afterById.get(change.categoryId)!.available;
  const total = changes.reduce((sum, change) => sum + change.amount, 0n);
  // Payment reserves are capped by card debt. An excess card assignment can be
  // released back to Ready to Assign, so its delta is not always -total.
  // Show the actual projection rather than pretending that identity holds.
  return {
    mode,
    month,
    changes,
    total,
    readyBefore: before.readyToAssign,
    readyAfter: after.readyToAssign,
  };
}
