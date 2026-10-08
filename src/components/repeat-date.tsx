"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FinanceForm } from "@/components/finance-form";
import { formatDate } from "@/domain/dates";
import { REPEAT_OPTIONS, repeatChoice } from "@/domain/repeat";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function iso(y: number, m: number, d: number) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function shiftMonth(y: number, m: number, delta: number) {
  const index = y * 12 + (m - 1) + delta;
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

export function RepeatDate({
  budgetId,
  date,
  dateFormat,
  accountId,
  transferAccountId,
  kind,
  amount,
  payee,
  memo,
  timezone,
  splits,
  compact = false,
}: {
  budgetId: string;
  date: string;
  dateFormat: string;
  accountId: string;
  transferAccountId?: string | null;
  kind: "EXPENSE" | "INCOME" | "TRANSFER";
  amount: string;
  payee: string;
  memo: string;
  timezone: string;
  splits: { categoryId: string; amount: string }[];
  /** Date text in a register column. Does not also open the row. */
  compact?: boolean;
}) {
  const initial = parts(date);
  const [cursor, setCursor] = useState({ y: initial.y, m: initial.m });
  const [start, setStart] = useState(date);
  const [repeat, setRepeat] = useState("MONTHLY");
  const choice = repeatChoice(repeat);
  const days = new Date(Date.UTC(cursor.y, cursor.m, 0)).getUTCDate();
  const lead = new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).getUTCDay();
  const label = new Date(Date.UTC(cursor.y, cursor.m - 1, 1)).toLocaleString(
    "en-US",
    { month: "short", year: "numeric", timeZone: "UTC" },
  );
  return (
    <details
      className="popover"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <summary
        className={
          compact
            ? "cursor-pointer text-num text-ink-2 hover:text-accent-text hover:underline"
            : "btn btn-secondary btn-sm"
        }
        aria-label="Date, make recurring"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const details = event.currentTarget.parentElement;
          if (details instanceof HTMLDetailsElement) details.open = !details.open;
        }}
      >
        <span className="text-num">
          {formatDate(new Date(`${date}T00:00:00Z`), dateFormat)}
        </span>
        {!compact && " · Make recurring"}
      </summary>
      <div className="popover-panel">
        <FinanceForm
          budgetId={budgetId}
          command={{
            type: "schedule.create",
            splits,
          }}
          label="Make recurring"
          buttonClassName="btn-sm"
          submitDisabled={!choice?.cadence}
          closeDetailsOnSave
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Previous month"
              onClick={() => setCursor(shiftMonth(cursor.y, cursor.m, -1))}
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <span className="text-label text-ink">{label}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Next month"
              onClick={() => setCursor(shiftMonth(cursor.y, cursor.m, 1))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-meta text-ink-3">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
            {Array.from({ length: lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = iso(cursor.y, cursor.m, i + 1);
              return (
                <button
                  key={day}
                  type="button"
                  className={day === start ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                  aria-pressed={day === start}
                  onClick={() => setStart(day)}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <label className="mt-3 block">
            Repeat
            <select
              aria-label="Repeat"
              value={repeat}
              onChange={(event) => setRepeat(event.target.value)}
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <input type="hidden" name="name" value={payee.trim() || "Recurring"} />
          <input type="hidden" name="accountId" value={accountId} />
          {transferAccountId && (
            <input type="hidden" name="transferAccountId" value={transferAccountId} />
          )}
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="amount" value={amount} />
          <input type="hidden" name="payee" value={payee} />
          <input type="hidden" name="memo" value={memo} />
          <input type="hidden" name="startDate" value={start} />
          <input type="hidden" name="timezone" value={timezone} />
          <input type="hidden" name="cadence" value={choice?.cadence ?? ""} />
          <input type="hidden" name="interval" value={choice?.interval || ""} />
        </FinanceForm>
      </div>
    </details>
  );
}
