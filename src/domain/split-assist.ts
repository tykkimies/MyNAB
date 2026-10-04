import { parseUSD, type Money } from "./money";

export type SplitAssist =
  | { status: "empty" }
  | { status: "whole" }
  | { status: "match" }
  | { status: "left"; gap: Money }
  | { status: "over"; gap: Money }
  | { status: "sign" };

function parsed(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return parseUSD(trimmed);
  } catch {
    return undefined;
  }
}

/** What a split form should say about the amount still to assign. */
export function splitAssist(
  total: string,
  rows: { categoryId: string; amount: string }[],
): SplitAssist {
  const target = parsed(total);
  if (target == null) return { status: "empty" };
  const chosen = rows.filter((row) => row.categoryId);
  if (chosen.length === 1 && !chosen[0].amount.trim()) return { status: "whole" };
  let sum = 0n;
  for (const row of chosen) {
    const amount = parsed(row.amount);
    if (amount === undefined) return { status: "empty" };
    if (amount != null && amount > 0n !== target > 0n) return { status: "sign" };
    sum += amount ?? 0n;
  }
  const gap = target - sum;
  if (gap === 0n) return { status: "match" };
  const absolute = (gap < 0n ? -gap : gap) as Money;
  return gap > 0n === target > 0n
    ? { status: "left", gap: absolute }
    : { status: "over", gap: absolute };
}
