import type { ReactNode } from "react";
import { Amount } from "@/components/amount";
import { formatUSD, money } from "@/domain/money";

export type PillTone = "positive" | "negative" | "warning" | "accent" | "neutral";

/** A small status capsule; the only round shape in the system. */
export function Pill({
  tone = "neutral",
  children,
  className = "",
  title,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`pill ${className}`}
      data-tone={tone === "neutral" ? undefined : tone}
      title={title}
    >
      {children}
    </span>
  );
}

/**
 * A money figure whose tone follows its sign: funded, empty, or overspent.
 * `underfunded` turns a non-negative figure yellow, as YNAB does while the
 * category's target still needs money this month; overspending stays red.
 */
export function AmountPill({
  amount,
  underfunded = false,
}: {
  amount: bigint;
  underfunded?: boolean;
}) {
  return (
    <Pill
      tone={
        amount < 0n
          ? "negative"
          : underfunded
            ? "warning"
            : amount === 0n
              ? "neutral"
              : "positive"
      }
    >
      <Amount>{formatUSD(money(amount))}</Amount>
    </Pill>
  );
}
