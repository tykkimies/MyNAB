/** Display-only filters. They never alter a projection or an assignment. */
export const PRESET_VIEWS = [
  "UNDERFUNDED",
  "OVERFUNDED",
  "SNOOZED",
  "OVERSPENT",
  "MONEY_AVAILABLE",
] as const;
export type PresetView = (typeof PRESET_VIEWS)[number];
export interface FocusedCategory {
  id: string;
  hidden: boolean;
  archived: boolean;
  available: bigint;
  cashDeficit: bigint;
  creditDeficit: bigint;
  targetNeed: bigint;
  overfunded: bigint;
  snoozed: boolean;
}
export function focusedCategoryIds(
  rows: FocusedCategory[],
  selection: "ALL" | PresetView | { categoryIds: readonly string[] },
): string[] {
  const included =
    typeof selection === "object" ? new Set(selection.categoryIds) : null;
  return rows
    .filter((row) => !row.hidden && !row.archived)
    .filter((row) => {
      if (included) return included.has(row.id);
      switch (selection) {
        case "ALL":
          return true;
        case "UNDERFUNDED":
          return row.targetNeed > 0n || row.cashDeficit > 0n || row.creditDeficit > 0n;
        case "OVERFUNDED":
          return row.overfunded > 0n;
        case "SNOOZED":
          return row.snoozed;
        case "OVERSPENT":
          return row.cashDeficit > 0n || row.creditDeficit > 0n;
        case "MONEY_AVAILABLE":
          return row.available > 0n;
      }
    })
    .map((row) => row.id);
}
