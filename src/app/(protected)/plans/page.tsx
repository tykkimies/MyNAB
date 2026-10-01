import Link from "next/link";
import { listBudgets } from "@/application/auth";
import { openBudget } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { appPath } from "@/infrastructure/app-path";
import { getDb } from "@/infrastructure/db";
import { DATE_FORMATS, DATE_FORMAT_LABEL } from "@/domain/dates";
import { listArchivedPlans } from "@/application/plans";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { Help } from "@/components/ui/help";

const MUTED = "text-table text-ink-2";
// Only messages this application writes are shown back.
const KNOWN_ERRORS = new Set([
  "Name the plan (up to 120 characters).",
  "You can keep up to 50 plans.",
  "Plan unavailable.",
  "Only an owner can rename a plan.",
  "Only an owner can start fresh.",
  "Only an owner can change plan settings.",
  "Only an owner can archive a plan.",
  "Only an owner can restore a plan.",
  "Only an owner can delete a plan.",
  "This plan's recovery period has ended.",
  "Wait until the plan's 30-day recovery period ends.",
  "Plans with budget data must remain archived.",
  "Choose a date format.",
]);

export default async function Plans({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; fresh?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const [plans, open, archivedPlans] = await Promise.all([
    listBudgets(user.userId),
    openBudget(user.userId),
    listArchivedPlans(user.userId),
  ]);
  const openIsOwner = open
    ? plans.find((plan) => plan.id === open.id)?.role === "owner"
    : false;
  const action = appPath("/api/plans");
  const fresh =
    q.fresh === "done" && open
      ? await getDb().auditEvent.findFirst({
          where: {
            budgetId: open.id,
            details: { path: ["type"], equals: "plan.fresh-start" },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
  const warnings =
    ((fresh?.details as { warnings?: unknown } | null)?.warnings as
      | string[]
      | undefined) ?? [];
  const error =
    q.error === "confirm-archive"
      ? "Confirm that you want to archive this plan."
      : q.error === "confirm-purge"
        ? "Confirm that you want to permanently delete this empty plan."
        : q.error === "confirm"
          ? "Confirm that you want a Fresh Start before continuing."
      : q.error && KNOWN_ERRORS.has(q.error)
        ? q.error
        : null;
  const saved =
    q.saved === "renamed"
      ? "Plan renamed."
      : q.saved === "settings"
        ? "Plan settings saved."
        : q.saved === "archived"
          ? "Plan archived. Restore it within 30 days."
          : q.saved === "restored"
            ? "Plan restored."
            : q.saved === "purged"
              ? "Empty plan permanently deleted."
        : null;
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Plans"
        meta={`${plans.length} plan${plans.length === 1 ? "" : "s"}`}
        actions={
          <Help label="About plans" align="right">
            Each plan has its own accounts, categories and history. Switching
            plans changes only what this browser shows. To budget with someone
            else, share a plan from{" "}
            <Link className="link" href="/household">
              Household
            </Link>
            .
          </Help>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {(error || saved) && (
          <div className="mt-4">
            {error ? (
              <Notice tone="negative" role="alert">
                {error}
              </Notice>
            ) : (
              <Notice tone="positive" role="status">
                {saved}
              </Notice>
            )}
          </div>
        )}
        {fresh && (
          <section
            role="status"
            className="surface mt-4 p-4"
            aria-label="Fresh Start result"
          >
            <h2 className="section-title">Fresh Start complete</h2>
            <p className={`mt-1 ${MUTED}`}>
              {open?.name} now starts from today&apos;s balances. The previous
              plan is kept, unchanged, under its archived name.
            </p>
            {warnings.length > 0 && (
              <>
                <p className={`mt-2 ${MUTED}`}>
                  These could not be carried over; set them up again if you
                  still need them:
                </p>
                <ul className={`mt-1 list-disc pl-5 ${MUTED}`}>
                  {warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <section className="surface" aria-labelledby="plans-heading">
              <div className="border-b border-hairline px-4 py-2 lg:px-6">
                <h2 id="plans-heading" className="section-title">
                  Your plans
                </h2>
              </div>
              <ul>
                {plans.map((plan) => (
                  <li
                    className="plan-row border-b border-hairline px-4 py-2 last:border-b-0 lg:px-6"
                    key={plan.id}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="flex min-w-0 flex-1 items-center gap-2 text-body font-medium text-ink">
                        <span className="truncate">{plan.name}</span>
                        {plan.id === open?.id && <Pill tone="accent">Open now</Pill>}
                      </span>
                      {plan.role === "owner" && (
                        <>
                          <details className="popover" data-align="right">
                            <summary className="btn btn-ghost btn-sm">Rename</summary>
                            <div className="popover-panel">
                              <ActionForm action={action} className="finance-form">
                                <input type="hidden" name="intent" value="rename" />
                                <input type="hidden" name="budgetId" value={plan.id} />
                                <label>
                                  Plan name
                                  <input name="name" required maxLength={120} defaultValue={plan.name} />
                                </label>
                                <div className="form-actions">
                                  <button className="btn btn-secondary" type="submit">Save name</button>
                                </div>
                              </ActionForm>
                            </div>
                          </details>
                          <details className="popover" data-align="right">
                            <summary className="btn btn-ghost btn-sm">Archive</summary>
                            <div className="popover-panel">
                              <ActionForm action={action} className="finance-form">
                                <input type="hidden" name="intent" value="archive" />
                                <input type="hidden" name="budgetId" value={plan.id} />
                                <p className={MUTED}>Everyone loses access. Restore within 30 days.</p>
                                <label className="check-field">
                                  <input type="checkbox" name="confirm" required />
                                  Archive {plan.name}
                                </label>
                                <div className="form-actions">
                                  <button className="btn btn-secondary" type="submit">Archive plan</button>
                                </div>
                              </ActionForm>
                            </div>
                          </details>
                        </>
                      )}
                      {plan.id !== open?.id && (
                        <ActionForm action={action}>
                          <input type="hidden" name="intent" value="select" />
                          <input type="hidden" name="budgetId" value={plan.id} />
                          <button className="btn btn-secondary btn-sm" type="submit">
                            Open {plan.name}
                          </button>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            {archivedPlans.length > 0 && (
              <section className="surface" aria-labelledby="archived-plans-heading">
                <div className="border-b border-hairline px-4 py-2 lg:px-6">
                  <h2 id="archived-plans-heading" className="section-title">Archived plans</h2>
                </div>
                <ul>
                  {archivedPlans.map((plan) => (
                      <li key={plan.id} className="plan-row flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-2 last:border-b-0 lg:px-6">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-medium text-ink">{plan.name}</span>
                          <span className={MUTED}>
                            {plan.purgeAfter
                              ? `Restore until ${plan.purgeAfter.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "UTC" })}`
                              : "Recovery date unavailable"}
                          </span>
                        </span>
                        {plan.canRestore && (
                          <ActionForm action={action}>
                            <input type="hidden" name="intent" value="restore" />
                            <input type="hidden" name="budgetId" value={plan.id} />
                            <button className="btn btn-secondary btn-sm" type="submit">Restore</button>
                          </ActionForm>
                        )}
                        {plan.canPurge && (
                          <details className="popover" data-align="right">
                            <summary className="btn btn-ghost btn-sm">Delete permanently</summary>
                            <div className="popover-panel">
                              <ActionForm action={action} className="finance-form">
                                <input type="hidden" name="intent" value="purge" />
                                <input type="hidden" name="budgetId" value={plan.id} />
                                <p className={MUTED}>Only plans with no budget data can be deleted.</p>
                                <label className="check-field">
                                  <input type="checkbox" name="confirm" required />
                                  Permanently delete {plan.name}
                                </label>
                                <div className="form-actions">
                                  <button className="btn btn-secondary" type="submit">Delete empty plan</button>
                                </div>
                              </ActionForm>
                            </div>
                          </details>
                        )}
                      </li>
                    ))}
                </ul>
              </section>
            )}
            <section className="surface p-4" aria-labelledby="new-plan-heading">
              <div className="flex items-center justify-between gap-2">
                <h2 id="new-plan-heading" className="section-title">
                  Start a new plan
                </h2>
                <Help label="About new plans" align="right">
                  A new plan starts empty and opens straight away. On its
                  Budget page, open &ldquo;Browse stock groups&rdquo; to add a
                  complete standard group or only the categories you need from
                  Bills, Everyday, Irregular, Quality of Life and Savings. Your
                  other plans are not changed. To copy your current categories
                  instead, use Fresh Start.
                </Help>
              </div>
              <ActionForm action={action} className="finance-form mt-3">
                <input type="hidden" name="intent" value="create" />
                <label>
                  New plan name
                  <input name="name" required maxLength={120} />
                </label>
                <div className="form-actions">
                  <button className="btn btn-primary" type="submit">
                    Create plan
                  </button>
                </div>
              </ActionForm>
            </section>
          </div>
          {open && openIsOwner && (
            <div className="flex flex-col gap-4">
              <section className="surface p-4" aria-labelledby="settings-heading">
                <h2 id="settings-heading" className="section-title">
                  Plan settings
                </h2>
                <p className={`mt-1 ${MUTED}`}>
                  How {open.name} shows dates. Amounts are always US dollars.
                </p>
                <ActionForm action={action} className="finance-form mt-3">
                  <input type="hidden" name="intent" value="settings" />
                  <input type="hidden" name="budgetId" value={open.id} />
                  <label>
                    Date format
                    <select name="dateFormat" defaultValue={open.dateFormat}>
                      {DATE_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {DATE_FORMAT_LABEL[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-secondary" type="submit">
                      Save settings
                    </button>
                  </div>
                </ActionForm>
              </section>
              <section className="surface p-4" aria-labelledby="fresh-heading">
                <h2 id="fresh-heading" className="section-title">
                  Fresh Start
                </h2>
                <p className={`mt-1 ${MUTED}`}>
                  Start {open.name} over from today. A new plan keeps your open
                  accounts at their current balances, your categories, notes,
                  targets, debt terms, schedules and focused views, with no
                  transaction history. All money starts in Ready to Assign. The
                  current plan is kept, unchanged, and renamed as archived. Bank
                  connections stay with the archived plan; link them again in
                  the new one.
                </p>
                <ActionForm action={action} className="finance-form mt-3">
                  <input type="hidden" name="intent" value="fresh-start" />
                  <input type="hidden" name="budgetId" value={open.id} />
                  <label className="check-field">
                    <input type="checkbox" name="confirm" required />
                    I understand {open.name} will be archived and a new plan
                    will start today
                  </label>
                  <div className="form-actions">
                    <button className="btn btn-secondary" type="submit">
                      Start fresh
                    </button>
                  </div>
                </ActionForm>
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
