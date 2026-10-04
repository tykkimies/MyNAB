"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_REGISTER_VIEW,
  presetRange,
  REGISTER_PRESET_LABEL,
  REGISTER_PRESETS,
  REGISTER_VIEW_COOKIE,
  type RegisterPreset,
  type RegisterView,
} from "@/domain/register-view";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function writeView(view: RegisterView) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${REGISTER_VIEW_COOKIE}=${encodeURIComponent(JSON.stringify(view))}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function ShowReconciled({
  view,
  returnTo,
}: {
  view: RegisterView;
  returnTo: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => {
        writeView({ ...view, showReconciled: true });
        router.replace(returnTo, { scroll: false });
        router.refresh();
      }}
    >
      Show reconciled
    </button>
  );
}

export function RegisterViewOptions({
  view,
  today,
  returnTo,
  runningBalance = true,
}: {
  view: RegisterView;
  today: string;
  returnTo: string;
  /** All accounts has no running-balance column. */
  runningBalance?: boolean;
}) {
  const router = useRouter();
  const initial = view.preset ? presetRange(view.preset, today) : null;
  const [preset, setPreset] = useState<RegisterPreset | null>(view.preset);
  const [from, setFrom] = useState(view.from ?? initial?.from ?? today.slice(0, 7));
  const [to, setTo] = useState(view.to ?? initial?.to ?? today.slice(0, 7));
  const [showReconciled, setShowReconciled] = useState(view.showReconciled);
  const [showRunningBalance, setShowRunningBalance] = useState(
    view.showRunningBalance,
  );
  const [showFlags, setShowFlags] = useState(view.showFlags);
  const inverted = preset === null && from > to;
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 31 }, (_, i) => thisYear - 15 + i);
  const choose = (next: RegisterPreset) => {
    const range = presetRange(next, today);
    setPreset(next);
    if (range) {
      setFrom(range.from);
      setTo(range.to);
    }
  };
  const editBound = (which: "from" | "to", month: string) => {
    setPreset(null);
    if (which === "from") setFrom(month);
    else setTo(month);
  };
  return (
    <details className="popover" data-align="right">
      <summary className="btn btn-secondary btn-sm">View</summary>
      <div className="popover-panel view-options">
        <h2>View Options</h2>
        <div className="view-presets" role="group" aria-label="Time frame">
          {REGISTER_PRESETS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={preset === id}
              onClick={() => choose(id)}
            >
              {REGISTER_PRESET_LABEL[id]}
            </button>
          ))}
        </div>
        <div className="view-range">
          <Bound
            label="From"
            value={from}
            years={years}
            onChange={(month) => editBound("from", month)}
          />
          <Bound
            label="To"
            value={to}
            years={years}
            onChange={(month) => editBound("to", month)}
          />
        </div>
        {inverted && (
          <p className="mt-2 text-meta text-negative">From is after To.</p>
        )}
        <div className="mt-3 grid gap-1">
          <Check
            label="Show reconciled transactions"
            checked={showReconciled}
            onChange={setShowReconciled}
          />
          {runningBalance && (
            <Check
              label="Show running balance"
              checked={showRunningBalance}
              onChange={setShowRunningBalance}
            />
          )}
          <Check label="Show flags" checked={showFlags} onChange={setShowFlags} />
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={(event) =>
              event.currentTarget.closest("details")?.removeAttribute("open")
            }
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={inverted}
            onClick={(event) => {
              const next: RegisterView = {
                ...DEFAULT_REGISTER_VIEW,
                preset,
                from: preset ? null : from,
                to: preset ? null : to,
                showReconciled,
                showRunningBalance,
                showFlags,
              };
              writeView(next);
              event.currentTarget.closest("details")?.removeAttribute("open");
              router.replace(returnTo, { scroll: false });
              router.refresh();
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </details>
  );
}

function Bound({
  label,
  value,
  years,
  onChange,
}: {
  label: string;
  value: string;
  years: number[];
  onChange: (month: string) => void;
}) {
  const [year, month] = value.split("-");
  const listed = years.includes(Number(year)) ? years : [Number(year), ...years];
  return (
    <div className="view-bound">
      <span>{label}</span>
      <div className="flex gap-1">
        <select
          aria-label={`${label} month`}
          value={month}
          onChange={(event) => onChange(`${year}-${event.target.value}`)}
        >
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          value={year}
          onChange={(event) => onChange(`${event.target.value}-${month}`)}
        >
          {listed.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="check-field">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
