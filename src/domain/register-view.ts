import { nextMonth } from "./budget";
import { budgetMonth } from "./dates";

export const REGISTER_VIEW_COOKIE = "mynab-register-view";

export const REGISTER_PRESETS = [
  "THIS_MONTH",
  "LAST_MONTH",
  "LATEST_3",
  "THIS_YEAR",
  "LAST_YEAR",
  "ALL",
] as const;

export type RegisterPreset = (typeof REGISTER_PRESETS)[number];

export const REGISTER_PRESET_LABEL: Record<RegisterPreset, string> = {
  THIS_MONTH: "This Month",
  LAST_MONTH: "Last Month",
  LATEST_3: "Latest 3 Months",
  THIS_YEAR: "This Year",
  LAST_YEAR: "Last Year",
  ALL: "All Dates",
};

export interface RegisterView {
  /** Null when From/To was chosen by hand. */
  preset: RegisterPreset | null;
  from: string | null;
  to: string | null;
  showReconciled: boolean;
  showRunningBalance: boolean;
  showFlags: boolean;
}

export const DEFAULT_REGISTER_VIEW: RegisterView = {
  preset: "ALL",
  from: null,
  to: null,
  showReconciled: false,
  showRunningBalance: true,
  showFlags: true,
};

function monthOfToday(today: string) {
  return budgetMonth(today.slice(0, 7));
}

function yearSpan(year: number) {
  const y = String(year).padStart(4, "0");
  return { from: `${y}-01`, to: `${y}-12` };
}

/** Inclusive months a preset covers. All Dates has no bound. */
export function presetRange(preset: RegisterPreset, today: string) {
  const month = monthOfToday(today);
  const year = Number(month.slice(0, 4));
  if (preset === "ALL") return null;
  if (preset === "THIS_MONTH") return { from: month, to: month };
  if (preset === "LAST_MONTH") {
    const previous = nextMonth(month, -1);
    return { from: previous, to: previous };
  }
  if (preset === "LATEST_3") return { from: nextMonth(month, -2), to: month };
  if (preset === "THIS_YEAR") return yearSpan(year);
  return yearSpan(year - 1);
}

/** Null when every month is shown. Invalid custom bounds are not a range. */
export function registerRange(view: RegisterView, today: string) {
  if (view.preset) return presetRange(view.preset, today);
  if (!view.from || !view.to) return null;
  try {
    budgetMonth(view.from);
    budgetMonth(view.to);
  } catch {
    return null;
  }
  if (view.from > view.to) return null;
  return { from: view.from, to: view.to };
}

export function registerRowShown(
  date: string,
  reconciled: boolean,
  view: RegisterView,
  today: string,
) {
  if (reconciled && !view.showReconciled) return false;
  const range = registerRange(view, today);
  if (!range) return true;
  const month = date.slice(0, 7);
  return month >= range.from && month <= range.to;
}

function flag(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseRegisterView(raw: string | undefined): RegisterView {
  if (!raw) return DEFAULT_REGISTER_VIEW;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const preset =
      data.preset === null
        ? null
        : REGISTER_PRESETS.find((id) => id === data.preset);
    if (data.preset !== null && !preset) return DEFAULT_REGISTER_VIEW;
    const view: RegisterView = {
      preset: preset ?? null,
      from: typeof data.from === "string" ? data.from : null,
      to: typeof data.to === "string" ? data.to : null,
      showReconciled: flag(data.showReconciled, false),
      showRunningBalance: flag(data.showRunningBalance, true),
      showFlags: flag(data.showFlags, true),
    };
    if (!view.preset && view.from && view.to && view.from > view.to)
      return DEFAULT_REGISTER_VIEW;
    if (!view.preset && view.from && view.to) {
      budgetMonth(view.from);
      budgetMonth(view.to);
    }
    return view;
  } catch {
    return DEFAULT_REGISTER_VIEW;
  }
}
