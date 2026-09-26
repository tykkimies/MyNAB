/**
 * Wording for targets, shared by the Budget and Targets pages so the two cannot
 * describe the same target differently.
 */
import type { TargetType } from "@/domain/goals";

export const TARGET_STATE: Record<string, string> = {
  MET: "Funded",
  ON_TRACK: "On track",
  BEHIND: "Needs funding",
  OVERDUE: "Overdue",
  EXCEEDED: "Over limit",
};

export const TARGET_KIND: Record<TargetType, string> = {
  MONTHLY: "Every month",
  WEEKLY: "Every week",
  BALANCE: "Build to an amount",
  BALANCE_BY_DATE: "Build to an amount by a month",
  PERIODIC: "A bill that repeats",
  SPENDING_LIMIT: "Stay under an amount",
  MAINTAIN: "Keep this much on hand",
  DEBT_PAYOFF: "Pay this much off every month",
  DEBT_PAYOFF_BY_DATE: "Clear the balance by a month",
};

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
