import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Target,
} from "lucide-react";
import { goalsPage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { TARGET_KIND, TARGET_STATE, WEEKDAYS } from "@/components/targets";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { budgetMonth } from "@/domain/dates";
import { Amount, MaybeAmount } from "@/components/amount";
import { Drawer } from "@/components/drawer";
import { TargetEditor } from "@/components/target-editor";

const usd = (n: bigint) => formatUSD(money(n));
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL_H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const TH =
  "px-space-xs py-space-sm text-left font-label-caps text-label-caps uppercase text-text-tertiary first:pl-space-lg last:pr-space-lg";
const TD = "px-space-xs py-space-sm align-middle font-body-sm text-body-sm";
const MONTH_BUTTON =
  "rounded-md px-3 py-1.5 font-label-sm text-label-sm text-text-secondary transition-colors hover:bg-surface-card hover:text-text-primary";
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

export default async function Targets({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; inspect?: string }>;
}) {
  const q = await searchParams;
  let selected = q.month;
  try {
    if (selected) budgetMonth(selected);
  } catch {
    selected = undefined;
  }
  const s = await goalsPage(selected);
  const overdue = s.targets.filter(
    (t) => !t.snoozed && !t.hidden && t.progress.state === "OVERDUE",
  );
  const months = s.history.filter((h) => h.entries.length > 0);
  // A category opened for editing shows its target in the drawer, here on the
  // Targets page, instead of sending the owner to the Budget inspector.
  const inspected =
    s.categories.find((c) => c.id === q.inspect && !c.archived && !c.system) ??
    s.categories.find(
      (c) => c.id === q.inspect && !c.archived && c.paymentAccountId,
    );
  const inspectTarget = inspected
    ? s.targets.find((t) => t.categoryId === inspected.id)
    : undefined;
  const inspectRow = inspected
    ? s.projection.categories.find((r) => r.id === inspected.id)
    : undefined;
  const here = `/targets?month=${s.month}`;

  return (
    <main
      id="main"
      className="mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg"
      tabIndex={-1}
    >
      <div className="flex flex-col justify-between gap-space-lg lg:flex-row lg:items-end">
        <div className="flex max-w-2xl flex-col">
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
            Targets
          </span>
          <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
            Make space for what’s ahead.
          </h1>
          <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
            A target says what a category needs and by when. It never assigns
            money on its own, and nothing here creates money you do not have.
            This page is an overview; the quickest way to add or change one is
            to select the category on the{" "}
            <Link
              className="font-semibold text-secondary underline underline-offset-2"
              href="/budget"
            >
              Budget
            </Link>
            .
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center gap-1.5 self-start rounded-lg bg-surface-container-low p-1.5 lg:self-end"
          aria-label="Targets month"
        >
          {s.month > "1900-01" && (
            <Link
              className={MONTH_BUTTON}
              href={`/targets?month=${nextMonth(s.month, -1)}`}
              scroll={false}
            >
              ← Previous
            </Link>
          )}
          <h2 className="flex items-center gap-2 rounded-md bg-surface-card px-3 py-1.5">
            <CalendarDays size={16} className="text-secondary" aria-hidden />
            <span className="font-headline-sm text-headline-sm text-text-primary">
              {monthName(s.month)}
            </span>
          </h2>
          {s.month < nextMonth(s.today.slice(0, 7), 24) && (
            <Link
              className={MONTH_BUTTON}
              href={`/targets?month=${nextMonth(s.month)}`}
              scroll={false}
            >
              Next →
            </Link>
          )}
          <Link
            className="rounded-md bg-surface-container-high px-2.5 py-1.5 font-label-sm text-label-sm text-text-primary transition-colors hover:bg-surface-container-highest"
            href="/targets"
            scroll={false}
          >
            Today
          </Link>
        </nav>
      </div>

      {s.summary.count > 0 && (
        <section
          className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-3"
          aria-label="Target totals"
        >
          <Metric
            label="Needed this month"
            value={usd(s.summary.neededThisMonth)}
            note="Assign this to stay on plan"
            Icon={Target}
            tone={s.summary.neededThisMonth > 0n ? "warning" : "ready"}
          />
          <Metric
            label="Still needed overall"
            value={usd(s.summary.stillNeeded)}
            note="Across every target, to completion"
            Icon={CalendarDays}
            tone="neutral"
          />
          <Metric
            label="Funded"
            value={`${s.summary.met} of ${s.summary.count}`}
            note="Targets fully met this month"
            Icon={CheckCircle2}
            tone={s.summary.met === s.summary.count ? "ready" : "neutral"}
          />
        </section>
      )}

      {s.projection.readyToAssign < 0n && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-negative-border bg-status-negative-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-negative-text">
            You have assigned more than you have
          </strong>
          <p className={MUTED}>
            Ready to Assign is{" "}
            <Amount>{usd(s.projection.readyToAssign)}</Amount>. Filling a target
            never creates money: categories are simply holding more than the
            budget contains. Resolve it on the{" "}
            <Link
              className="font-semibold text-secondary underline underline-offset-2"
              href="/budget"
            >
              budget
            </Link>{" "}
            by moving money out of a category or reducing an assignment.
          </p>
        </aside>
      )}

      {overdue.length > 0 && (
        <aside className="mt-space-md flex flex-col gap-space-xs rounded-lg border border-status-warning-border bg-status-warning-bg p-space-md">
          <strong className="font-headline-sm text-headline-sm text-status-warning-text">
            Past the date you set
          </strong>
          <p className={MUTED}>
            {overdue.map((t) => t.name).join(", ")} asked to be funded by a
            month that has passed, so the whole remainder is shown as needed now
            rather than spread over no months at all. Move the date or fund what
            is left.
          </p>
        </aside>
      )}

      <div className="mt-space-lg flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-lg">
          {s.summary.count === 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>No targets yet</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Give a category a target and it will tell you what to assign
                each month. A target is a plan, not a transfer: money only moves
                when you assign it on the{" "}
                <Link
                  className="font-semibold text-secondary underline underline-offset-2"
                  href="/budget"
                >
                  budget
                </Link>
                .
              </p>
            </section>
          )}

          {s.summary.neededThisMonth > 0n && (
            <section
              className={`finance-panel ${CARD} border-status-ready-border bg-status-ready-bg/40 p-space-lg`}
            >
              <h2 className={PANEL_H2}>Fund every target</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                Assigns <Amount>{usd(s.summary.neededThisMonth)}</Amount> across
                the targets below, in one step. If that is more than the budget
                holds it still fills them and tells you by how much, leaving
                Ready to Assign negative for you to resolve, as YNAB does.
              </p>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "target.fund", month: s.month }}
                label="Assign what targets need"
              />
            </section>
          )}

          {s.summary.count > 0 && (
            <section className={`finance-panel overflow-hidden ${CARD}`}>
              <div className="flex items-center justify-between gap-space-md border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>Every target</h2>
                <span className="font-body-sm text-body-sm text-text-tertiary">
                  {s.summary.count}{" "}
                  {s.summary.count === 1 ? "target" : "targets"}
                </span>
              </div>
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Every target"
              >
                <table className="w-full min-w-[46rem] border-collapse">
                  <caption className="sr-only">
                    Targets and their progress for {s.month}
                  </caption>
                  <thead>
                    <tr className="border-b border-border-warm bg-surface-container-low">
                      {[
                        "Category",
                        "Kind",
                        "Target",
                        "Funded",
                        "Needed",
                        "This month",
                        "Expected",
                        "State",
                      ].map((h) => (
                        <th className={TH} key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {s.targets.map((t) => {
                      const limit = t.type === "SPENDING_LIMIT";
                      return (
                        <tr
                          className="border-b border-border-warm transition-colors last:border-b-0 hover:bg-row-hover"
                          key={t.categoryId}
                        >
                          <th
                            className="py-space-sm pl-space-lg pr-space-sm text-left align-middle font-body-md text-body-md font-medium text-text-primary"
                            scope="row"
                          >
                            <Link
                              className="underline-offset-2 hover:underline"
                              href={`${here}&inspect=${t.categoryId}`}
                              scroll={false}
                              aria-current={
                                inspected?.id === t.categoryId
                                  ? "true"
                                  : undefined
                              }
                            >
                              {t.name}
                            </Link>
                            <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                              {t.group}
                            </small>
                            {t.effectiveFrom > "1900-01" && (
                              <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                                since {monthName(t.effectiveFrom)}
                              </small>
                            )}
                            <Pace
                              funded={t.progress.funded}
                              amount={t.amount}
                              limit={limit}
                            />
                          </th>
                          <td className={`${TD} text-text-primary`}>
                            {TARGET_KIND[t.type]}
                            {(t.type === "MONTHLY" || t.type === "WEEKLY") && (
                              <small className="block text-text-tertiary">
                                {t.refill ? "Refill" : "Set aside"}
                              </small>
                            )}
                            {t.type === "PERIODIC" && (
                              <small className="block text-text-tertiary">
                                Every {t.cadenceMonths ?? 12} months
                              </small>
                            )}
                            {t.dueDay !== undefined && (
                              <small className="block text-text-tertiary">
                                Due on day {t.dueDay}
                              </small>
                            )}
                            {t.type === "WEEKLY" &&
                              t.dayOfWeek !== undefined && (
                                <small className="block text-text-tertiary">
                                  {WEEKDAYS[t.dayOfWeek]}
                                </small>
                              )}
                          </td>
                          <td
                            className={`${TD} font-data-mono text-data-mono text-text-primary`}
                          >
                            <Amount>{usd(t.amount)}</Amount>
                            {t.progress.dueMonth && (
                              <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                                by {monthName(t.progress.dueMonth)}
                              </small>
                            )}
                          </td>
                          <td
                            className={`${TD} font-data-mono text-data-mono text-text-primary`}
                          >
                            <Amount>{usd(t.progress.funded)}</Amount>
                            {limit && (
                              <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                                spent
                              </small>
                            )}
                          </td>
                          <td
                            className={`${TD} font-data-mono text-data-mono text-text-secondary`}
                          >
                            <Amount>{usd(t.progress.needed)}</Amount>
                            {limit && (
                              <small className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                                left to spend
                              </small>
                            )}
                          </td>
                          <td
                            className={`${TD} font-data-mono text-data-mono ${t.progress.contribution > 0n ? "text-status-warning-text" : "text-text-secondary"}`}
                          >
                            {t.snoozed ? (
                              "Snoozed"
                            ) : (
                              <Amount>{usd(t.progress.contribution)}</Amount>
                            )}
                          </td>
                          <td className={`${TD} text-text-secondary`}>
                            {t.completion === null ? (
                              <span className="text-text-tertiary">
                                —
                                {(t.type === "BALANCE" ||
                                  t.type === "BALANCE_BY_DATE" ||
                                  t.type === "PERIODIC") && (
                                  <small className="block">
                                    {t.pace > 0n
                                      ? "Longer than this shows"
                                      : "Nothing assigned yet"}
                                  </small>
                                )}
                              </span>
                            ) : t.completion.months === 0 ? (
                              "Now"
                            ) : (
                              <>
                                {monthName(t.completion.month)}
                                <small className="block text-text-tertiary">
                                  at <Amount>{usd(t.pace)}</Amount> a month
                                </small>
                              </>
                            )}
                          </td>
                          <td className="py-space-sm pl-space-sm pr-space-lg align-middle">
                            {t.snoozed ? (
                              <span className="font-label-sm text-label-sm text-text-secondary">
                                Snoozed
                              </span>
                            ) : (
                              <StateChip state={t.progress.state} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p
                className={`border-t border-border-warm px-space-lg py-space-md ${MUTED}`}
              >
                “Expected” assumes you keep assigning what you assigned this
                month. It is an estimate from your own pace, not a promise, and
                a category you have not assigned to yet has no pace to project
                from.
              </p>
            </section>
          )}

          {months.length > 0 && (
            <section className={`finance-panel overflow-hidden ${CARD}`}>
              <div className="border-b border-border-warm px-space-lg py-space-md">
                <h2 className={PANEL_H2}>Earlier months</h2>
                <p className={`mt-space-sm ${MUTED}`}>
                  Whether each month’s targets were met, worked out from that
                  month’s budget and the target that was in force then. Nothing
                  is stored: changing a target today does not rewrite what an
                  earlier month was asked to do.
                </p>
              </div>
              <div
                className="overflow-x-auto"
                tabIndex={0}
                role="region"
                aria-label="Targets met in earlier months"
              >
                <table className="w-full min-w-[32rem] border-collapse">
                  <caption className="sr-only">
                    Targets met in earlier months
                  </caption>
                  <thead>
                    <tr className="border-b border-border-warm bg-surface-container-low">
                      {["Month", "Met", "Short"].map((h) => (
                        <th className={TH} key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((h) => {
                      const met = h.entries.filter((e) => e.met);
                      const short = h.entries.filter((e) => !e.met);
                      return (
                        <tr
                          className="border-b border-border-warm last:border-b-0"
                          key={h.month}
                        >
                          <th
                            className="py-space-sm pl-space-lg pr-space-sm text-left align-middle font-body-md text-body-md font-medium text-text-primary"
                            scope="row"
                          >
                            {monthName(h.month)}
                          </th>
                          <td className={`${TD} text-text-primary`}>
                            {met.length} of {h.entries.length}
                            {met.length > 0 && (
                              <small className="block text-text-tertiary">
                                {met.map((e) => e.name).join(", ")}
                              </small>
                            )}
                          </td>
                          <td
                            className={`py-space-sm pl-space-sm pr-space-lg align-middle font-body-sm text-body-sm ${short.length ? "text-status-negative-text" : "text-text-tertiary"}`}
                          >
                            {short.length === 0
                              ? "—"
                              : short.map((e) => e.name).join(", ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {s.withoutTarget.length > 0 && (
            <section className={`finance-panel ${CARD} p-space-lg`}>
              <h2 className={PANEL_H2}>Categories without a target</h2>
              <p className={`mt-space-sm ${MUTED}`}>
                These are budgeted by hand. That is a legitimate choice, not a
                problem to fix.
              </p>
              <ul className="mt-space-md flex flex-wrap gap-space-xs">
                {s.withoutTarget.map((c) => (
                  <li
                    className="rounded-full bg-surface-container-low px-2.5 py-1 font-label-sm text-label-sm text-text-secondary"
                    key={c.id}
                  >
                    <Link
                      className="underline-offset-2 hover:underline"
                      href={`${here}&inspect=${c.id}`}
                      scroll={false}
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside>
          <div className={`finance-panel ${CARD} p-space-lg`}>
            <h2 className={PANEL_H2}>Manage targets in your budget</h2>
            <p className={`mt-space-sm ${MUTED}`}>
              Select a category in the table to create, change, snooze or remove
              its target beside your envelopes. Monthly bills belong there too.
            </p>
            <Link
              className="secondary-button mt-space-md"
              href={`/budget?month=${s.month}`}
            >
              Open budget
            </Link>
          </div>
        </aside>
      </div>
      {inspected && (
        <Drawer
          key={inspected.id}
          className="finance-panel"
          headingId="target-drawer-heading"
          eyebrow={
            inspectTarget ? TARGET_KIND[inspectTarget.type] : "No target yet"
          }
          title={inspected.name}
          closeHref={here}
          footer={
            <Link
              className="secondary-button"
              href={`/budget?month=${s.month}&inspect=${inspected.id}`}
            >
              Open in Budget
            </Link>
          }
        >
          {inspectRow && (
            <dl className="space-y-space-xs font-body-sm text-body-sm">
              {[
                ["Assigned this month", inspectRow.assigned],
                ["Available", inspectRow.available],
                ...(inspectTarget
                  ? ([
                      [
                        "Needed this month",
                        inspectTarget.progress.contribution,
                      ],
                      ["Still needed overall", inspectTarget.progress.needed],
                    ] as const)
                  : []),
              ].map(([label, amount]) => (
                <div
                  key={label as string}
                  className="flex justify-between gap-space-sm text-text-secondary"
                >
                  <dt>{label as string}</dt>
                  <dd className="tabular-nums text-text-primary">
                    <Amount>{usd(amount as bigint)}</Amount>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className={`mt-space-md ${MUTED}`}>
            A <strong>target</strong> is how much this envelope needs. A{" "}
            <strong>schedule</strong> is the real transaction that will hit an
            account.
          </p>
          <TargetEditor
            key={`${inspected.id}-${inspectTarget?.type ?? "none"}-${inspectTarget?.amount ?? ""}`}
            budgetId={s.budget.id}
            categoryId={inspected.id}
            categoryName={inspected.name}
            month={s.month}
            currentMonth={s.today.slice(0, 7)}
            card={Boolean(inspected.paymentAccountId)}
            current={
              inspectTarget
                ? {
                    type: inspectTarget.type,
                    amount: `${inspectTarget.amount / 100n}.${String(inspectTarget.amount % 100n).padStart(2, "0")}`,
                    dueMonth: inspectTarget.dueMonth,
                    cadenceMonths: inspectTarget.cadenceMonths,
                    refill: inspectTarget.refill,
                    dayOfWeek: inspectTarget.dayOfWeek,
                    dueDay: inspectTarget.dueDay,
                    snoozed: inspectTarget.snoozed,
                  }
                : null
            }
          />
        </Drawer>
      )}
    </main>
  );
}
function Metric({
  label,
  value,
  note,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  Icon: typeof Target;
  tone: "ready" | "warning" | "neutral";
}) {
  const chip =
    tone === "ready"
      ? "bg-status-ready-bg text-status-ready-text"
      : tone === "warning"
        ? "bg-status-warning-bg text-status-warning-text"
        : "bg-surface-container-low text-text-secondary";
  return (
    <article className="flex flex-col justify-between rounded-lg border border-border-warm bg-surface-card p-space-lg">
      <div className="flex items-start justify-between gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${chip}`}
        >
          <Icon size={18} aria-hidden />
        </span>
      </div>
      <strong
        className="mt-space-md block font-data-lg text-data-lg text-text-primary"
        data-numeric
      >
        <MaybeAmount value={value} />
      </strong>
      <span className="mt-space-sm font-body-sm text-body-sm text-text-secondary">
        {note}
      </span>
    </article>
  );
}
/**
 * The 3px pacing meter the design system puts under a category name. Mint for a
 * savings target, crimson once a spending limit has been passed.
 */
function Pace({
  funded,
  amount,
  limit,
}: {
  funded: bigint;
  amount: bigint;
  limit: boolean;
}) {
  if (amount <= 0n) return null;
  const pct = Number((funded * 100n) / amount);
  const clamped = Math.max(0, Math.min(100, pct));
  const over = limit && pct > 100;
  return (
    <span
      className="mt-space-xs block h-[3px] w-full max-w-36 overflow-hidden rounded-full bg-surface-container-high"
      aria-hidden
    >
      <span
        className={`block h-full rounded-full ${over ? "bg-status-negative-text" : limit ? "bg-accent-eucalyptus" : "bg-accent-mint"}`}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
function StateChip({ state }: { state: string }) {
  const behind = ["BEHIND", "OVERDUE", "EXCEEDED"].includes(state);
  const met = ["MET", "ON_TRACK"].includes(state);
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold ${
        behind
          ? "bg-status-negative-bg text-status-negative-text"
          : met
            ? "bg-status-ready-bg text-status-ready-text"
            : "bg-surface-container-low text-text-secondary"
      }`}
    >
      {behind && <AlertTriangle size={12} aria-hidden />}
      {met && <CheckCircle2 size={12} aria-hidden />}
      {TARGET_STATE[state as keyof typeof TARGET_STATE]}
    </span>
  );
}
