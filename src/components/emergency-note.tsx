import { formatUSD, money } from "@/domain/money";
import { monthsCovered } from "@/domain/emergency";

const usd = (v: bigint) => formatUSD(money(v));

/**
 * What an emergency fund target says beside its progress: how many months it
 * covers, the spending behind the goal, how full it is, and how the goal last
 * changed. Nothing for any other target.
 */
export function EmergencyNote({
  target,
  available,
  monthlySpending,
}: {
  target: { coverMonths?: number; coverBasis?: bigint; amount: bigint; previousAmount?: bigint };
  available: bigint;
  monthlySpending: bigint;
}) {
  if (!target.coverMonths) return null;
  const basis = target.coverBasis ?? monthlySpending;
  return (
    <span className="mt-1 block">
      Emergency fund: {target.coverMonths} months of spending at about{" "}
      {usd(basis)} a month, so a goal of {usd(target.amount)}. It holds{" "}
      {monthsCovered(available, basis)} months now.
      {target.previousAmount !== undefined && target.previousAmount !== target.amount
        ? ` The goal moved from ${usd(target.previousAmount)} as your spending changed.`
        : ""}{" "}
      It follows your spending each month and never asks for money.
    </span>
  );
}
