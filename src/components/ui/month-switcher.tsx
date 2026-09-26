import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { nextMonth } from "@/domain/budget";

const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

/**
 * Previous / month / next / today as one segmented control, shared by every
 * month-scoped page. The links keep their spoken names ("← Previous",
 * "Next →") behind chevron icons.
 */
export function MonthSwitcher({
  month,
  today,
  path,
  query = "",
  label,
}: {
  month: string;
  /** Today's date; browsing is capped two years ahead of it. */
  today: string;
  path: string;
  /** Extra query to keep while switching, e.g. `&view=…` (leading `&`). */
  query?: string;
  label: string;
}) {
  const link =
    "icon-button h-8 w-8 rounded-none border-0 hover:bg-surface-sunken";
  return (
    <nav
      className="flex h-8 items-stretch overflow-hidden rounded-md border border-hairline-strong bg-surface"
      aria-label={label}
    >
      {month > "1900-01" ? (
        <Link
          className={link}
          href={`${path}?month=${nextMonth(month, -1)}${query}`}
          scroll={false}
        >
          <ChevronLeft size={16} aria-hidden />
          <span className="sr-only">← Previous</span>
        </Link>
      ) : (
        <span className="w-8" aria-hidden />
      )}
      <h2 className="flex min-w-36 items-center justify-center border-x border-hairline px-3 text-label text-ink">
        {monthName(month)}
      </h2>
      {month < nextMonth(today.slice(0, 7), 24) ? (
        <Link
          className={link}
          href={`${path}?month=${nextMonth(month)}${query}`}
          scroll={false}
        >
          <ChevronRight size={16} aria-hidden />
          <span className="sr-only">Next →</span>
        </Link>
      ) : (
        <span className="w-8" aria-hidden />
      )}
      <Link
        className="flex items-center border-l border-hairline px-2.5 text-label text-ink-2 hover:bg-surface-sunken hover:text-ink"
        href={`${path}${query ? `?${query.slice(1)}` : ""}`}
        scroll={false}
      >
        Today
      </Link>
    </nav>
  );
}
