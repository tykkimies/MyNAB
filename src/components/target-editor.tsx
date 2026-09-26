"use client";
import { useState } from "react";
import { FinanceForm } from "@/components/finance-form";

const KINDS = [
  ["MONTHLY", "Needed every month"],
  ["WEEKLY", "Needed every week"],
  ["PERIODIC", "A bill every few months or yearly"],
  ["BALANCE_BY_DATE", "Save up by a date"],
  ["BALANCE", "Build up to an amount"],
  ["SPENDING_LIMIT", "Stay under an amount"],
  ["MAINTAIN", "Keep this much on hand"],
] as const;
const CARD_KINDS = [
  ["DEBT_PAYOFF", "Pay this much off every month"],
  ["DEBT_PAYOFF_BY_DATE", "Clear the balance by a month"],
] as const;
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface CurrentTarget {
  type: string;
  amount: string;
  dueMonth?: string;
  cadenceMonths?: number;
  refill: boolean;
  dayOfWeek?: number;
  dueDay?: number;
  snoozed: boolean;
}

/**
 * Create or change a category's target where the category is, as YNAB does.
 * Only the fields the chosen kind uses are shown and sent. A change applies
 * from the month being viewed; earlier months keep what they had.
 */
export function TargetEditor({
  budgetId,
  categoryId,
  categoryName,
  month,
  currentMonth,
  card,
  current,
}: {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  month: string;
  currentMonth: string;
  card: boolean;
  current: CurrentTarget | null;
}) {
  const kinds = card ? CARD_KINDS : KINDS;
  const [kind, setKind] = useState<string>(
    current?.type ?? (card ? "DEBT_PAYOFF" : "MONTHLY"),
  );
  const [editing, setEditing] = useState(!current);
  const field =
    "flex flex-col gap-1 font-body-sm text-body-sm text-text-secondary";
  if (current && !editing)
    return (
      <div className="target-editor mt-space-xs flex flex-wrap gap-space-xs">
        <button
          type="button"
          className="secondary-button"
          onClick={() => setEditing(true)}
        >
          Edit target
        </button>
        {month === currentMonth && (
          <FinanceForm
            budgetId={budgetId}
            command={{
              type: "target.snooze",
              categoryId,
              snoozed: !current.snoozed,
            }}
            label={current.snoozed ? "Resume target" : "Snooze this month"}
            inline
          />
        )}
        <FinanceForm
          budgetId={budgetId}
          command={{ type: "target.clear", categoryId }}
          label="Remove target"
          inline
        />
      </div>
    );
  return (
    <div className="target-editor mt-space-xs">
      <FinanceForm
        budgetId={budgetId}
        command={{ type: "target.set", categoryId, effectiveFrom: month }}
        label={current ? "Save target" : "Create target"}
        onSaved={() => setEditing(false)}
      >
        <div className="grid gap-space-sm">
          <label className={field}>
            Kind
            <select
              name="targetType"
              aria-label={`Target kind for ${categoryName}`}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {kinds.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {kind !== "DEBT_PAYOFF_BY_DATE" && (
            <label className={field}>
              Amount (USD)
              <input
                name="amount"
                required
                inputMode="decimal"
                defaultValue={current?.amount ?? ""}
                aria-label={`Target amount for ${categoryName}`}
              />
            </label>
          )}
          {kind === "WEEKLY" && (
            <label className={field}>
              Every
              <select name="dayOfWeek" defaultValue={current?.dayOfWeek ?? 5}>
                {WEEKDAYS.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {kind === "PERIODIC" && (
            <label className={field}>
              Repeats every
              <select
                name="cadenceMonths"
                defaultValue={current?.cadenceMonths ?? 12}
              >
                {[2, 3, 4, 6, 12, 24].map((n) => (
                  <option key={n} value={n}>
                    {n === 12 ? "Year" : n === 24 ? "2 years" : `${n} months`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(kind === "PERIODIC" ||
            kind === "BALANCE_BY_DATE" ||
            kind === "DEBT_PAYOFF_BY_DATE") && (
            <label className={field}>
              {kind === "PERIODIC" ? "Next due" : "By"}
              <input
                name="dueMonth"
                type="month"
                required
                defaultValue={current?.dueMonth ?? ""}
              />
            </label>
          )}
          {(kind === "MONTHLY" ||
            kind === "PERIODIC" ||
            kind === "DEBT_PAYOFF") && (
            <label className={field}>
              Due on day (optional)
              <input
                name="targetDueDay"
                inputMode="numeric"
                maxLength={2}
                placeholder="15"
                defaultValue={current?.dueDay ?? ""}
              />
            </label>
          )}
          {(kind === "MONTHLY" || kind === "WEEKLY") && (
            <label className="check-field">
              <input
                type="checkbox"
                name="refill"
                defaultChecked={current?.refill ?? false}
              />
              Refill up to the amount (counts what is already there)
            </label>
          )}
        </div>
      </FinanceForm>
      {current && (
        <button
          type="button"
          className="mt-space-xs font-body-sm text-body-sm text-secondary underline underline-offset-2"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
