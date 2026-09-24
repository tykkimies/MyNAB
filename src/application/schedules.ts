import { getDb } from "@/infrastructure/db";
import { authorize, today } from "./finance";
import { occurrences, type Recurrence } from "@/domain/schedules";
import { financialDate } from "@/domain/dates";

export async function getSchedules(
  userId: string,
  budgetId: string,
  from?: string,
  through?: string,
) {
  return getDb().$transaction(
    async (tx) => {
      const budget = await authorize(tx, userId, budgetId);
      const start = from ?? today(budget.timezone);
      const last = new Date(`${start}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() + 90);
      const end = through ?? last.toISOString().slice(0, 10);
      financialDate(start);
      financialDate(end);
      const schedules = await tx.schedule.findMany({
        where: { budgetId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const handled = await tx.scheduleOccurrence.findMany({
        where: { budgetId, date: { gte: new Date(start), lte: new Date(end) } },
      });
      const upcoming = schedules
        .filter((s) => !s.archived)
        .flatMap((s) =>
          occurrences(
            {
              id: s.id,
              startDate: s.startDate.toISOString().slice(0, 10),
              endDate: s.endDate?.toISOString().slice(0, 10),
              timezone: s.timezone,
              cadence: s.cadence as Recurrence["cadence"],
              interval: s.interval,
            },
            start,
            end,
          ).map((o) => ({
            ...o,
            schedule: s,
            handled: handled.find(
              (h) =>
                h.scheduleId === s.id &&
                h.date.toISOString().slice(0, 10) === o.date,
            ),
          })),
        )
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.schedule.id.localeCompare(b.schedule.id),
        );
      return { schedules, upcoming, start, end, today: today(budget.timezone) };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
