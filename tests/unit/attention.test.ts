import { describe, expect, it } from "vitest";
import { attentionItems, type AttentionCounts } from "@/domain/attention";

const none: AttentionCounts = {
  reauth: 0,
  connectionErrors: 0,
  workerDown: false,
  bankChanges: 0,
  unapproved: 0,
  overdue: 0,
  affectedReconciliations: 0,
};

describe("attention summary", () => {
  it("is empty when nothing needs the owner", () => {
    expect(attentionItems(none)).toEqual([]);
  });
  it("puts blocking problems first and words counts naturally", () => {
    const items = attentionItems({
      ...none,
      unapproved: 1,
      overdue: 3,
      reauth: 2,
      workerDown: true,
    });
    expect(items.map((i) => i.key)).toEqual([
      "reauth",
      "workerDown",
      "unapproved",
      "overdue",
    ]);
    expect(items[0].text).toContain("2 banks need");
    expect(items[2].text).toContain("1 imported transaction is");
    expect(items[3].text).toContain("3 scheduled items are");
  });
});
