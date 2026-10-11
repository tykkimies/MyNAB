import Link from "next/link";
import { EmergencyNote } from "@/components/emergency-note";
import { goalsPage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { TARGET_KIND, TARGET_STATE, WEEKDAYS } from "@/components/targets";
import { formatUSD, money } from "@/domain/money";
import { budgetMonth } from "@/domain/dates";
import { Amount } from "@/components/amount";
import { Drawer, DrawerSection } from "@/components/drawer";
import { TargetEditor } from "@/components/target-editor";
import { PageHeader } from "@/components/ui/page-header";
import { MonthSwitcher } from "@/components/ui/month-switcher";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Notice, NoticeList } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";

const usd = (n: bigint) => formatUSD(money(n));
const MUTED = "text-table text-ink-2";
const LINK = "link";
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
  const notices = s.projection.readyToAssign < 0n || overdue.length > 0;

  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Targets"
        meta={
          s.summary.count > 0
            ? `${s.summary.count} ${s.summary.count === 1 ? "target" : "targets"}`
            : undefined
        }
        actions={
          <>
            <MonthSwitcher
              month={s.month}
              today={s.today}
              path="/targets"
              label="Targets month"
            />
            <Link className="btn btn-ghost" href={`/budget?month=${s.month}`}>
              Open budget
            </Link>
            <Help label="About targets" align="right">
              A target says what a category needs and by when. It never
              assigns money on its own, and nothing here creates money you do
              not have. To add or change one, select its category here or on
              the Budget.
            </Help>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {s.summary.count > 0 && (
          <SummaryStrip ariaLabel="Target totals">
            <Stat
              lead
              label="Needed this month"
              value={usd(s.summary.neededThisMonth)}
              tone={s.summary.neededThisMonth > 0n ? "warning" : "positive"}
              note="Assign this to stay on plan"
            />
            <Stat
              label="Still needed overall"
              value={usd(s.summary.stillNeeded)}
              note="Across every target, to completion"
            />
            <Stat
              label="Funded"
              value={`${s.summary.met} of ${s.summary.count}`}
              tone={s.summary.met === s.summary.count ? "positive" : "neutral"}
              note="Targets fully met this month"
            />
          </SummaryStrip>
        )}
        {(notices || s.summary.neededThisMonth > 0n) && (
          <div className="mt-3">
            <NoticeList>
              {s.summary.neededThisMonth > 0n && (
                <section aria-labelledby="fund-heading">
                  <Notice
                    tone="warning"
                    action={
                      <>
                        <FinanceForm
                          budgetId={s.budget.id}
                          command={{ type: "target.fund", month: s.month }}
                          label="Assign what targets need"
                          inline
                        />
                        <Help label="About funding every target" align="right">
                          Assigns{" "}
                          <Amount>{usd(s.summary.neededThisMonth)}</Amount>{" "}
                          across the targets below in one step. If that is
                          more than the budget holds it still fills them and
                          tells you by how much, leaving Ready to Assign
                          negative for you to resolve, as YNAB does.
                        </Help>
                      </>
                    }
                  >
                    <h2 id="fund-heading" className="inline font-semibold">
                      Fund every target
                    </h2>{" "}
                    · <Amount>{usd(s.summary.neededThisMonth)}</Amount> still
                    needed this month.
                  </Notice>
                </section>
              )}
              {s.projection.readyToAssign < 0n && (
                <Notice
                  as="aside"
                  tone="negative"
                  action={
                    <Link className="btn btn-secondary btn-sm" href="/budget">
                      Open budget
                    </Link>
                  }
                >
                  <strong>You have assigned more than you have</strong>. Ready
                  to Assign is <Amount>{usd(s.projection.readyToAssign)}</Amount>
                  . Filling a target never creates money; move money out of a
                  category or reduce an assignment on the budget.
                </Notice>
              )}
              {overdue.length > 0 && (
                <Notice tone="warning">
                  <strong>Past the date you set.</strong>{" "}
                  {overdue.map((t) => t.name).join(", ")} asked to be funded by
                  a month that has passed, so the whole remainder is shown as
                  needed now. Move the date or fund what is left.
                </Notice>
              )}
            </NoticeList>
          </div>
        )}
        <section className="surface mt-4" aria-labelledby="targets-heading">
          <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="targets-heading" className="section-title">
              Every target
            </h2>
            {s.summary.count > 0 && (
              <Help label="About the Expected column" align="right">
                “Expected” assumes you keep assigning what you assigned this
                month. It is an estimate from your own pace, not a promise, and
                a category you have not assigned to yet has no pace to project
                from.
              </Help>
            )}
          </div>
          {s.summary.count === 0 ? (
            <EmptyState
              title="No targets yet"
              action={
                <Link className="btn btn-secondary" href={`/budget?month=${s.month}`}>
                  Open budget
                </Link>
              }
            >
              Give a category a target and it will tell you what to assign
              each month. A target is a plan, not a transfer: money only moves
              when you assign it on the budget.
            </EmptyState>
          ) : (
            <div
              className="max-sm:overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Every target"
            >
              <table className="ledger">
                <caption className="sr-only">
                  Targets and their progress for {s.month}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col" data-hide="md">
                      Kind
                    </th>
                    <th scope="col" className="num">
                      Target
                    </th>
                    <th scope="col" className="num" data-hide="md">
                      Funded
                    </th>
                    <th scope="col" className="num" data-hide="sm">
                      Needed
                    </th>
                    <th scope="col" className="num">
                      This month
                    </th>
                    <th scope="col" data-hide="md">
                      Expected
                    </th>
                    <th scope="col" className="num">
                      State
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.targets.map((t) => {
                    const limit = t.type === "SPENDING_LIMIT";
                    return (
                      <tr
                        key={t.categoryId}
                        data-selected={inspected?.id === t.categoryId ? "" : undefined}
                      >
                        <th scope="row">
                          <Link
                            className="underline-offset-2 hover:underline"
                            href={`${here}&inspect=${t.categoryId}`}
                            scroll={false}
                            aria-current={
                              inspected?.id === t.categoryId ? "true" : undefined
                            }
                          >
                            {t.name}
                          </Link>
                          <span className="ledger-sub">
                            {t.group}
                            {t.planned
                              ? " · from your payoff plan"
                              : t.effectiveFrom > "1900-01"
                                ? ` · since ${monthName(t.effectiveFrom)}`
                                : ""}
                          </span>
                          <Pace
                            funded={t.progress.funded}
                            amount={t.amount}
                            limit={limit}
                          />
                        </th>
                        <td data-hide="md">
                          {TARGET_KIND[t.type]}
                          <span className="ledger-sub">
                            {(t.type === "MONTHLY" || t.type === "WEEKLY") &&
                              (t.refill ? "Refill" : "Set aside")}
                            {t.type === "PERIODIC" &&
                              `Every ${t.cadenceMonths ?? 12} months`}
                            {t.dueDay !== undefined && ` · due on day ${t.dueDay}`}
                            {t.type === "WEEKLY" &&
                              t.dayOfWeek !== undefined &&
                              ` · ${WEEKDAYS[t.dayOfWeek]}`}
                          </span>
                        </td>
                        <td className="num text-ink">
                          <Amount>{usd(t.amount)}</Amount>
                          {t.progress.dueMonth && (
                            <span className="ledger-sub">
                              by {monthName(t.progress.dueMonth)}
                            </span>
                          )}
                        </td>
                        <td className="num text-ink" data-hide="md">
                          <Amount>{usd(t.progress.funded)}</Amount>
                          {limit && <span className="ledger-sub">spent</span>}
                        </td>
                        <td className="num text-ink-2" data-hide="sm">
                          <Amount>{usd(t.progress.needed)}</Amount>
                          {limit && (
                            <span className="ledger-sub">left to spend</span>
                          )}
                        </td>
                        <td
                          className={`num ${t.progress.contribution > 0n ? "text-warning" : "text-ink-2"}`}
                        >
                          {t.snoozed ? (
                            "Snoozed"
                          ) : (
                            <Amount>{usd(t.progress.contribution)}</Amount>
                          )}
                        </td>
                        <td className="text-ink-2" data-hide="md">
                          {t.completion === null ? (
                            <span className="text-ink-3">
                              —
                              {(t.type === "BALANCE" ||
                                t.type === "BALANCE_BY_DATE" ||
                                t.type === "PERIODIC") && (
                                <span className="ledger-sub">
                                  {t.pace > 0n
                                    ? "Longer than this shows"
                                    : "Nothing assigned yet"}
                                </span>
                              )}
                            </span>
                          ) : t.completion.months === 0 ? (
                            "Now"
                          ) : (
                            <>
                              {monthName(t.completion.month)}
                              <span className="ledger-sub">
                                at <Amount>{usd(t.pace)}</Amount> a month
                              </span>
                            </>
                          )}
                        </td>
                        <td className="num">
                          {t.snoozed ? (
                            <Pill>Snoozed</Pill>
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
          )}
        </section>

        {s.withoutTarget.length > 0 && (
          <section
            className="surface mt-4 p-4"
            aria-labelledby="without-target-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="without-target-heading" className="section-title">
                Categories without a target
              </h2>
              <Help label="About categories without a target" align="right">
                These are budgeted by hand. That is a legitimate choice, not a
                problem to fix.
              </Help>
            </div>
            <p className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 ${MUTED}`}>
              {s.withoutTarget.map((c) => (
                <Link
                  className="underline-offset-2 hover:underline"
                  href={`${here}&inspect=${c.id}`}
                  scroll={false}
                  key={c.id}
                >
                  {c.name}
                </Link>
              ))}
            </p>
          </section>
        )}

        {months.length > 0 && (
          <section className="surface mt-4" aria-labelledby="earlier-heading">
            <div className="flex items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
              <h2 id="earlier-heading" className="section-title">
                Earlier months
              </h2>
              <Help label="About earlier months" align="right">
                Whether each month’s targets were met, worked out from that
                month’s budget and the target that was in force then. Nothing
                is stored: changing a target today does not rewrite what an
                earlier month was asked to do.
              </Help>
            </div>
            <div
              className="max-sm:overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Targets met in earlier months"
            >
              <table className="ledger">
                <caption className="sr-only">Targets met in earlier months</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Met</th>
                    <th scope="col">Short</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((h) => {
                    const met = h.entries.filter((e) => e.met);
                    const short = h.entries.filter((e) => !e.met);
                    return (
                      <tr key={h.month}>
                        <th scope="row">{monthName(h.month)}</th>
                        <td className="text-ink">
                          {met.length} of {h.entries.length}
                          {met.length > 0 && (
                            <span className="ledger-sub">
                              {met.map((e) => e.name).join(", ")}
                            </span>
                          )}
                        </td>
                        <td className={short.length ? "text-negative" : "text-ink-3"}>
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
      </div>
      {inspected && (
        <Drawer
          key={inspected.id}
          headingId="target-drawer-heading"
          eyebrow={
            inspectTarget
              ? inspectTarget.coverMonths
                ? "Emergency fund"
                : TARGET_KIND[inspectTarget.type]
              : "No target yet"
          }
          title={inspected.name}
          closeHref={here}
          footer={
            <Link
              className="btn btn-secondary"
              href={`/budget?month=${s.month}&inspect=${inspected.id}`}
            >
              Open in Budget
            </Link>
          }
        >
          {inspectRow && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-table">
              {(
                [
                  ["Assigned this month", inspectRow.assigned],
                  ["Available", inspectRow.available],
                  ...(inspectTarget
                    ? ([
                        ["Needed this month", inspectTarget.progress.contribution],
                        ["Still needed overall", inspectTarget.progress.needed],
                      ] as const)
                    : []),
                ] as const
              ).map(([label, amount]) => (
                <div key={label}>
                  <dt className="text-meta text-ink-3">{label}</dt>
                  <dd className="text-num text-ink" data-numeric>
                    <Amount>{usd(amount)}</Amount>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {inspectTarget?.coverMonths && inspectRow && (
            <p className="mt-2 text-table text-ink-2">
              <EmergencyNote
                target={inspectTarget}
                available={inspectRow.available}
                monthlySpending={s.emergency.monthly}
              />
            </p>
          )}
          <DrawerSection
            title="Target"
            action={
              <Help label="Targets and schedules" align="right">
                A <strong>target</strong> is how much this envelope needs. A{" "}
                <strong>schedule</strong> is the real transaction that will hit
                an account.
              </Help>
            }
          >
            <TargetEditor
              key={`${inspected.id}-${inspectTarget?.type ?? "none"}-${inspectTarget?.amount ?? ""}`}
              budgetId={s.budget.id}
              categoryId={inspected.id}
              categoryName={inspected.name}
              month={s.month}
              currentMonth={s.today.slice(0, 7)}
              monthlySpending={s.emergency.monthly.toString()}
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
                      coverMonths: inspectTarget.coverMonths,
                      snoozed: inspectTarget.snoozed,
                    }
                  : null
              }
            />
          </DrawerSection>
          <p className={`mt-4 ${MUTED}`}>
            <Link className={LINK} href={`/budget?month=${s.month}&inspect=${inspected.id}`}>
              Assign money and see this month’s activity in the budget
            </Link>
          </p>
        </Drawer>
      )}
    </main>
  );
}
/**
 * The 3px pacing meter under a category name: accent while a savings target
 * fills, negative once a spending limit has been passed.
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
      className="mt-1 block h-[3px] w-full max-w-36 overflow-hidden rounded-full bg-surface-sunken"
      aria-hidden
    >
      <span
        className={`block h-full rounded-full ${over ? "bg-negative" : limit ? "bg-warning" : "bg-accent"}`}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
function StateChip({ state }: { state: string }) {
  // Yellow while a target is short this month; red only past a spending limit.
  const behind = ["BEHIND", "OVERDUE"].includes(state);
  const met = ["MET", "ON_TRACK"].includes(state);
  return (
    <Pill
      tone={
        state === "EXCEEDED"
          ? "negative"
          : behind
            ? "warning"
            : met
              ? "positive"
              : "neutral"
      }
    >
      {TARGET_STATE[state as keyof typeof TARGET_STATE]}
    </Pill>
  );
}
