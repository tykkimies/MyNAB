export const REPEAT_OPTIONS = [
  { id: "NEVER", label: "Never", cadence: null, interval: 0 },
  { id: "DAILY", label: "Daily", cadence: "DAILY", interval: 1 },
  { id: "WEEKLY", label: "Weekly", cadence: "WEEKLY", interval: 1 },
  { id: "BIWEEKLY", label: "Every other week", cadence: "WEEKLY", interval: 2 },
  { id: "TWICE_MONTHLY", label: "Twice a month", cadence: "TWICE_MONTHLY", interval: 1 },
  { id: "MONTHLY", label: "Monthly", cadence: "MONTHLY", interval: 1 },
  { id: "BIMONTHLY", label: "Every other month", cadence: "MONTHLY", interval: 2 },
  { id: "QUARTERLY", label: "Every 3 months", cadence: "MONTHLY", interval: 3 },
  { id: "EVERY_4_MONTHS", label: "Every 4 months", cadence: "MONTHLY", interval: 4 },
  { id: "YEARLY", label: "Yearly", cadence: "YEARLY", interval: 1 },
] as const;

export type RepeatId = (typeof REPEAT_OPTIONS)[number]["id"];

export function repeatChoice(id: string) {
  return REPEAT_OPTIONS.find((option) => option.id === id) ?? null;
}
