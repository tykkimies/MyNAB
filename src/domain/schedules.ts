import { financialDate, timezone } from "./dates";

/** Calendar plans only. An occurrence is never a ledger transaction. */
export interface Recurrence {
  id: string;
  startDate: string;
  endDate?: string;
  timezone: string;
  cadence: "ONCE" | "DAILY" | "WEEKLY" | "TWICE_MONTHLY" | "MONTHLY" | "YEARLY";
  interval?: number;
}

function utc(date: string): Date {
  const value = new Date(`${date}T00:00:00.000Z`);
  return value;
}

/** Expand an inclusive date window, without a server-local timezone or DST shift.
 * Month/year dates always use the original anchor, so Jan 31 -> Feb 28 -> Mar 31.
 * The caller supplies calendar dates in the schedule's configured timezone.
 * A revision must retain the schedule ID; a consumed ID/date is never posted twice.
 */
export function occurrences(
  schedule: Recurrence,
  from: string,
  through: string,
) {
  financialDate(schedule.startDate);
  financialDate(from);
  financialDate(through);
  timezone(schedule.timezone);
  if (!schedule.id) throw new Error("A schedule needs an identity");
  if (from > through) throw new Error("Invalid occurrence window");
  if (schedule.endDate) {
    financialDate(schedule.endDate);
    if (schedule.endDate < schedule.startDate)
      throw new Error("End date precedes the start date");
  }
  const interval = schedule.interval ?? 1;
  if (!Number.isSafeInteger(interval) || interval < 1 || interval > 1200)
    throw new Error("Invalid recurrence interval");
  const end =
    schedule.endDate && schedule.endDate < through ? schedule.endDate : through;
  const anchor = utc(schedule.startDate);
  const result: { key: string; date: string }[] = [];
  // Bound computation, including catch-up from an old start. Never silently truncate.
  for (let index = 0; index < 100000; index++) {
    const date = new Date(anchor);
    if (schedule.cadence === "DAILY" || schedule.cadence === "WEEKLY") {
      date.setUTCDate(
        anchor.getUTCDate() +
          index * interval * (schedule.cadence === "WEEKLY" ? 7 : 1),
      );
    } else if (
      schedule.cadence === "MONTHLY" ||
      schedule.cadence === "YEARLY"
    ) {
      date.setUTCDate(1);
      date.setUTCMonth(
        anchor.getUTCMonth() +
          index * interval * (schedule.cadence === "YEARLY" ? 12 : 1),
      );
      const last = new Date(date);
      last.setUTCMonth(last.getUTCMonth() + 1, 0);
      date.setUTCDate(Math.min(anchor.getUTCDate(), last.getUTCDate()));
    } else if (schedule.cadence === "TWICE_MONTHLY") {
      // YNAB's twice a month: the anchor day and fifteen days later, each
      // month, the second capped at the month's last day.
      date.setUTCDate(1);
      date.setUTCMonth(anchor.getUTCMonth() + Math.floor(index / 2) * interval);
      const last = new Date(date);
      last.setUTCMonth(last.getUTCMonth() + 1, 0);
      const day = anchor.getUTCDate() + (index % 2 ? 15 : 0);
      date.setUTCDate(Math.min(day, last.getUTCDate()));
    } else if (schedule.cadence !== "ONCE") {
      throw new Error("Invalid cadence");
    }
    if (date.getUTCFullYear() > 9999) return result;
    const value = date.toISOString().slice(0, 10);
    if (value > end) return result;
    if (value >= from) {
      if (result.length === 1000)
        throw new Error("Occurrence window is too large");
      result.push({ key: JSON.stringify([schedule.id, value]), date: value });
    }
    if (schedule.cadence === "ONCE") return result;
  }
  throw new Error("Recurrence catch-up limit exceeded");
}
