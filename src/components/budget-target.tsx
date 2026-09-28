/** A category target as the Budget shows it, on the desktop and the phone. */
import { Amount } from "@/components/amount";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";

const usd = (n: bigint) => formatUSD(money(n));

/**
 * A target's "Needs $X" as a button: one click assigns exactly what the target
 * still asks for this month (the server works the amount out again).
 */
export function FundNeed({
  budgetId,
  month,
  categoryId,
  name,
  amount,
  due,
}: {
  budgetId: string;
  month: string;
  categoryId: string;
  name: string;
  amount: bigint;
  /** "by the 15th", "by Dec 2026": shown after the amount. */
  due?: string;
}) {
  return (
    <FinanceForm
      budgetId={budgetId}
      command={{ type: "target.fund", month, categoryId }}
      label={
        <span>
          Needs <Amount>{usd(amount)}</Amount>
          {due ? ` ${due}` : ""}
        </span>
      }
      buttonLabel={`Assign ${usd(amount)} to ${name}`}
      inline
      buttonClassName="fund-need"
    />
  );
}

export type RowTarget = {
  type: string;
  amount: bigint;
  dueDay?: number;
  snoozed: boolean;
  planned: boolean;
  progress: {
    contribution: bigint;
    needed: bigint;
    progress: number;
    state: string;
    dueMonth: string | null;
  };
};

const DUE_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

/** When a target's money is due, in YNAB's words: "by the 15th", "by Dec 2026". */
export function dueWhen(target: RowTarget, month: string) {
  const due = target.progress.dueMonth;
  if (due && due !== month)
    return `by ${DUE_MONTH.format(new Date(`${due}-01T00:00:00Z`))}`;
  if (target.dueDay) return `by the ${ordinal(target.dueDay)}`;
  return "this month";
}

/**
 * The row's one line about its target, like YNAB's expanded row: what it
 * still needs and by when, what is left to go, or what it is for.
 */
export function TargetDetail({
  target,
  budgetId,
  month,
  categoryId,
  name,
}: {
  target: RowTarget;
  budgetId: string;
  month: string;
  categoryId: string;
  name: string;
}) {
  const { progress } = target;
  if (target.snoozed) return <>Snoozed this month</>;
  if (progress.contribution > 0n)
    return (
      <FundNeed
        budgetId={budgetId}
        month={month}
        categoryId={categoryId}
        name={name}
        amount={progress.contribution}
        due={dueWhen(target, month)}
      />
    );
  if (target.type === "SPENDING_LIMIT")
    return (
      <>
        <Amount>{usd(progress.needed)}</Amount> left of{" "}
        <Amount>{usd(target.amount)}</Amount>
      </>
    );
  if (progress.needed > 0n)
    return (
      <>
        <Amount>{usd(progress.needed)}</Amount> to go
        {progress.dueMonth && progress.dueMonth !== month
          ? ` ${dueWhen(target, month)}`
          : ""}
      </>
    );
  return (
    <>
      <Amount>{usd(target.amount)}</Amount>{" "}
      {target.planned ? "planned" : "target"}
    </>
  );
}

/**
 * A thin bar under the category name: how much of the target is there. Yellow
 * while it still needs money this month, green once funded, red past a limit.
 */
export function TargetBar({ target }: { target: RowTarget }) {
  if (target.snoozed) return null;
  const { state, progress } = target.progress;
  const limit = target.type === "SPENDING_LIMIT";
  const tone =
    state === "EXCEEDED"
      ? "bg-negative"
      : limit || state === "BEHIND" || state === "OVERDUE"
        ? "bg-warning"
        : state === "MET" || state === "ON_TRACK"
          ? "bg-positive"
          : "bg-accent";
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <span className="target-bar" aria-hidden>
      <span className={tone} style={{ width: `${pct}%` }} />
    </span>
  );
}

