import { describe, expect, it } from "vitest";
import { splitAssist } from "@/domain/split-assist";

const row = (categoryId: string, amount: string) => ({ categoryId, amount });

describe("splitAssist", () => {
  it("treats one blank categorized split as the whole amount", () => {
    expect(splitAssist("-133.77", [row("food", ""), row("", "")])).toEqual({
      status: "whole",
    });
  });
  it("reports what is left, and what is too much", () => {
    expect(splitAssist("-133.77", [row("food", "-130.77"), row("gas", "")])).toEqual({
      status: "left",
      gap: 300n,
    });
    expect(splitAssist("-133.77", [row("food", "-140.00")])).toEqual({
      status: "over",
      gap: 623n,
    });
    expect(splitAssist("50.00", [row("pay", "40.00")])).toEqual({
      status: "left",
      gap: 1000n,
    });
  });
  it("is quiet when the splits match or the total is not a number", () => {
    expect(splitAssist("-10.00", [row("food", "-10.00")])).toEqual({
      status: "match",
    });
    expect(splitAssist("", [row("food", "-1.00")])).toEqual({ status: "empty" });
    expect(splitAssist("nope", [row("food", "-1.00")])).toEqual({ status: "empty" });
  });
  it("rejects a split with the opposite sign", () => {
    expect(splitAssist("-10.00", [row("food", "4.00")])).toEqual({ status: "sign" });
  });
});
