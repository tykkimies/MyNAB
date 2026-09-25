import Link from "next/link";
import { listBudgets } from "@/application/auth";
import { openBudget } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { appPath } from "@/infrastructure/app-path";
import { getDb } from "@/infrastructure/db";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL = `finance-panel ${CARD} p-space-lg`;
const H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
// Only messages this application writes are shown back.
const KNOWN_ERRORS = new Set([
  "Name the plan (up to 120 characters).",
  "You can keep up to 50 plans.",
  "Plan unavailable.",
  "Only an owner can rename a plan.",
  "Only an owner can start fresh.",
]);

export default async function Plans({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string; fresh?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const [plans, open] = await Promise.all([
    listBudgets(user.userId),
    openBudget(user.userId),
  ]);
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
  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Plans
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          Keep separate plans.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          Each plan has its own accounts, categories and history. Switching
          plans changes only what this browser shows. To budget with someone
          else, share a plan from{" "}
          <Link
            className="font-semibold text-secondary underline underline-offset-2"
            href="/household"
          >
            Household
          </Link>
          .
        </p>
      </div>
      {q.error && KNOWN_ERRORS.has(q.error) && (
        <p role="alert" className="mt-space-md font-body-sm text-body-sm text-status-negative-text">
          {q.error}
        </p>
      )}
      {q.error === "confirm" && (
        <p role="alert" className="mt-space-md font-body-sm text-body-sm text-status-negative-text">
          Confirm that you want a Fresh Start before continuing.
        </p>
      )}
      {fresh && (
        <section role="status" className={`mt-space-md ${PANEL}`} aria-label="Fresh Start result">
          <h2 className={H2}>Fresh Start complete</h2>
          <p className={`mt-space-xs ${MUTED}`}>
            {open?.name} now starts from today&apos;s balances. The previous
            plan is kept, unchanged, under its archived name.
          </p>
          {warnings.length > 0 && (
            <>
              <p className={`mt-space-sm ${MUTED}`}>
                These could not be carried over; set them up again if you
                still need them:
              </p>
              <ul className="mt-space-xs list-disc pl-space-lg font-body-sm text-body-sm text-text-secondary">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
      {q.saved === "renamed" && (
        <p role="status" className={`mt-space-md ${MUTED}`}>
          Plan renamed.
        </p>
      )}
      <section className={`mt-space-lg ${PANEL}`} aria-labelledby="plans-heading">
        <h2 id="plans-heading" className={H2}>
          Your plans
        </h2>
        <ul className="mt-space-md divide-y divide-border-warm">
          {plans.map((plan) => (
            <li className="plan-row py-space-md" key={plan.id}>
              <div className="flex flex-wrap items-center justify-between gap-space-sm">
                <span className="font-body-md text-body-md font-semibold text-text-primary">
                  {plan.name}
                  {plan.id === open?.id && (
                    <span className="ml-space-sm font-label-sm text-label-sm font-normal text-text-secondary">
                      Open now
                    </span>
                  )}
                </span>
                {plan.id !== open?.id && (
                  <form action={action} method="post">
                    <input type="hidden" name="intent" value="select" />
                    <input type="hidden" name="budgetId" value={plan.id} />
                    <button className="secondary-button" type="submit">
                      Open {plan.name}
                    </button>
                  </form>
                )}
              </div>
              <details className="mt-space-sm">
                <summary className="cursor-pointer font-body-sm text-body-sm text-text-secondary">
                  Rename
                </summary>
                <form action={action} method="post" className="finance-form mt-space-sm">
                  <input type="hidden" name="intent" value="rename" />
                  <input type="hidden" name="budgetId" value={plan.id} />
                  <label>
                    Plan name
                    <input name="name" required maxLength={120} defaultValue={plan.name} />
                  </label>
                  <button className="secondary-button" type="submit">
                    Save name
                  </button>
                </form>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <section className={`mt-space-lg ${PANEL}`} aria-labelledby="new-plan-heading">
        <h2 id="new-plan-heading" className={H2}>
          Start a new plan
        </h2>
        <p className={`mt-space-xs ${MUTED}`}>
          A new plan starts empty and opens straight away. Your other plans
          are not changed.
        </p>
        <form action={action} method="post" className="finance-form mt-space-md">
          <input type="hidden" name="intent" value="create" />
          <label>
            New plan name
            <input name="name" required maxLength={120} />
          </label>
          <button className="primary-button" type="submit">
            Create plan
          </button>
        </form>
      </section>
      {open && (
        <section className={`mt-space-lg ${PANEL}`} aria-labelledby="fresh-heading">
          <h2 id="fresh-heading" className={H2}>
            Fresh Start
          </h2>
          <p className={`mt-space-xs ${MUTED}`}>
            Start {open.name} over from today. A new plan keeps your open
            accounts at their current balances, your categories, notes,
            targets, debt terms, schedules and focused views, with no
            transaction history. All money starts in Ready to Assign. The
            current plan is kept, unchanged, and renamed as archived. Bank
            connections stay with the archived plan; link them again in the
            new one.
          </p>
          <form action={action} method="post" className="finance-form mt-space-md">
            <input type="hidden" name="intent" value="fresh-start" />
            <input type="hidden" name="budgetId" value={open.id} />
            <label className="check-field">
              <input type="checkbox" name="confirm" required />
              I understand {open.name} will be archived and a new plan will
              start today
            </label>
            <button className="secondary-button" type="submit">
              Start fresh
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
