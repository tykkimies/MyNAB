"use client";
import { useState } from "react";
import { FinanceForm } from "@/components/finance-form";
import { coverGoal } from "@/domain/emergency";
import { formatUSD, money } from "@/domain/money";

const KINDS = [
  ["MONTHLY", "Needed every month"],
  ["WEEKLY", "Needed every week"],
  ["PERIODIC", "A bill every few months or yearly"],
  ["BALANCE_BY_DATE", "Save up by a date"],
  ["BALANCE", "Build up to an amount"],
  ["EMERGENCY", "Emergency fund: months of spending"],
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
  /** An emergency fund sized to this many months of spending. */
  coverMonths?: number;
  snoozed: boolean;
}

/**
 * Create or change a category's target where the category is, as YNAB does.
 * Only the fields the chosen kind uses are shown and sent. A change applies
 * from the month being viewed; earlier months keep what they had.
 *
 * `panel` is the phone's target page: the form is open from the start, and
 * Snooze and Remove sit under it instead of behind an "Edit target" step.
 */
export function TargetEditor({
  budgetId,
  categoryId,
  categoryName,
  month,
  currentMonth,
  card,
  current,
  monthlySpending,
  panel = false,
}: {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  month: string;
  currentMonth: string;
  card: boolean;
  current: CurrentTarget | null;
  /** Ordinary monthly spending in cents, for an emergency fund's preview. */
  monthlySpending?: string;
  panel?: boolean;
}) {
  const kinds = card ? CARD_KINDS : KINDS;
  const [kind, setKind] = useState<string>(
    current?.coverMonths
      ? "EMERGENCY"
      : (current?.type ?? (card ? "DEBT_PAYOFF" : "MONTHLY")),
  );
  const [cover, setCover] = useState<number>(current?.coverMonths ?? 3);
  const monthly = BigInt(monthlySpending ?? "0");
  const [editing, setEditing] = useState(panel || !current);
  const field = "flex flex-col gap-1 text-label text-ink-2";
  if (current && !editing)
    return (
      <div className="target-editor flex flex-wrap gap-1">
        <button
          type="button"
          className="btn btn-secondary"
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
    <div className="target-editor">
      <FinanceForm
        budgetId={budgetId}
        command={{ type: "target.set", categoryId, effectiveFrom: month }}
        label={current ? "Save target" : "Create target"}
        onSaved={() => setEditing(panel)}
      >
        <div className="field-grid" data-cols="2">
          {/* An emergency fund is a build-up target the server sizes. */}
          <input
            type="hidden"
            name="targetType"
            value={kind === "EMERGENCY" ? "BALANCE" : kind}
          />
          <label className={`${field} col-span-full`}>
            Kind
            <select
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
          {kind === "EMERGENCY" && (
            <>
              <label className={field}>
                Cover
                <select
                  name="coverMonths"
                  value={cover}
                  onChange={(e) => setCover(Number(e.target.value))}
                >
                  <option value={3}>3 months of spending</option>
                  <option value={6}>6 months of spending</option>
                </select>
              </label>
              <p className="col-span-full text-meta text-ink-3">
                {monthly > 0n ? (
                  <>
                    You spend about {formatUSD(money(monthly))} a month, so the
                    goal is {formatUSD(money(coverGoal(monthly, cover)))}. It
                    follows your spending each month, changing when that moves
                    more than 5%, and never asks for money in a month.
                  </>
                ) : (
                  <>
                    There is no spending history yet to size this from. Add
                    some transactions first, or build up to an amount instead.
                  </>
                )}
              </p>
            </>
          )}
          {kind !== "DEBT_PAYOFF_BY_DATE" && kind !== "EMERGENCY" && (
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
          {kind === "BALANCE" && (
            <p className="text-meta text-ink-3">
              Tracks how far along you are and never asks for money in a month.
              To be prompted, choose &ldquo;Save up by a date&rdquo; or
              &ldquo;Needed every month&rdquo;.
            </p>
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
      {current && !panel && (
        <button
          type="button"
          className="link mt-2 text-meta"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      )}
      {current && panel && (
        <div className="target-editor-more">
          {month === currentMonth && (
            <FinanceForm
              budgetId={budgetId}
              command={{
                type: "target.snooze",
                categoryId,
                snoozed: !current.snoozed,
              }}
              label={current.snoozed ? "Resume target" : "Snooze this month"}
              buttonClassName="w-full"
              inline
            />
          )}
          <FinanceForm
            budgetId={budgetId}
            command={{ type: "target.clear", categoryId }}
            label="Remove target"
            buttonClassName="btn-danger w-full"
            inline
          />
        </div>
      )}
    </div>
  );
}
