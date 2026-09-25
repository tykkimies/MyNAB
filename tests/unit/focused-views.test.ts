import { describe, expect, it } from "vitest";
import { focusedCategoryIds, type FocusedCategory } from "../../src/domain/focused-views";

const row = (id: string, values: Partial<FocusedCategory> = {}): FocusedCategory => ({
  id, hidden: false, archived: false, available: 0n, cashDeficit: 0n,
  creditDeficit: 0n, targetNeed: 0n, overfunded: 0n, snoozed: false,
  ...values,
});
describe("focused category views", () => {
  const rows = [
    row("need", { targetNeed: 1n }),
    row("overspent", { cashDeficit: 2n, available: -2n }),
    row("credit", { creditDeficit: 3n }),
    row("extra", { overfunded: 4n, available: 4n }),
    row("snoozed", { snoozed: true }),
    row("hidden", { hidden: true, targetNeed: 9n, available: 9n }),
    row("archived", { archived: true, available: 9n }),
  ];
  it("filters preset conditions without exposing hidden or archived categories", () => {
    expect(focusedCategoryIds(rows, "ALL")).toEqual(["need", "overspent", "credit", "extra", "snoozed"]);
    expect(focusedCategoryIds(rows, "UNDERFUNDED")).toEqual(["need", "overspent", "credit"]);
    expect(focusedCategoryIds(rows, "OVERFUNDED")).toEqual(["extra"]);
    expect(focusedCategoryIds(rows, "SNOOZED")).toEqual(["snoozed"]);
    expect(focusedCategoryIds(rows, "OVERSPENT")).toEqual(["overspent", "credit"]);
    expect(focusedCategoryIds(rows, "MONEY_AVAILABLE")).toEqual(["extra"]);
  });
  it("uses stable IDs for custom views and still hides unavailable rows", () => {
    expect(focusedCategoryIds(rows, { categoryIds: ["hidden", "extra", "need", "deleted"] })).toEqual(["need", "extra"]);
  });
});
