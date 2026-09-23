import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { budgetMonth } from "@/domain/dates";
import { STARTER_GROUPS, STARTER_CATEGORY_COUNT } from "@/domain/starter";
const TARGET_STATE: Record<string, string> = {
  MET: "Funded",
  ON_TRACK: "On track",
  BEHIND: "Needs funding",
  OVERDUE: "Overdue",
  EXCEEDED: "Over limit",
};
const usd = (n: bigint) => formatUSD(money(n));
export default async function Budget({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const q = await searchParams;
  let selected = q.month;
  try {
    if (selected) budgetMonth(selected);
  } catch {
    selected = undefined;
  }
  const s = await financePage(selected);
  const p = s.projection;
  const active = s.categories.filter((c) => !c.archived);
  const groups = s.groups.filter((g) => !g.system);
  return (
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">BUDGET</span>
        <h1>Give your money a purpose.</h1>
        <p>
          Assign money you have. Cover cash overspending before the next month
          begins.
        </p>
      </div>
      <nav className="month-nav" aria-label="Budget month">
        {s.month > "1900-01" && (
          <Link href={`/budget?month=${nextMonth(s.month, -1)}`}>
            ← Previous
          </Link>
        )}
        <h2>
          {new Intl.DateTimeFormat("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${s.month}-01T00:00:00Z`))}
        </h2>
        {s.month < nextMonth(s.today.slice(0, 7), 24) && (
          <Link href={`/budget?month=${nextMonth(s.month)}`}>Next →</Link>
        )}
        <Link href="/budget">Today</Link>
      </nav>
      <section className="money-summary" aria-label="Budget totals">
        <article className={p.readyToAssign < 0n ? "negative" : ""}>
          <span>Ready to Assign</span>
          <strong>{usd(p.readyToAssign)}</strong>
        </article>
        <article>
          <span>Cash & positive card balances</span>
          <strong>{usd(p.resources)}</strong>
        </article>
        <article>
          <span>Reserved for future months</span>
          <strong>{usd(p.futureReservations)}</strong>
        </article>
      </section>
      {s.underfunded > 0n && (
        <section className="finance-panel">
          <h2>Targets need {usd(s.underfunded)} this month</h2>
          <p className="muted">
            Assigning fills targets in the order below, from money you already
            have. If there is not enough, earlier categories are funded first
            and the rest is reported rather than assigned. Nothing here can
            assign money the budget does not hold.
          </p>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "target.fund", month: s.month }}
            label="Assign what targets need"
          />
        </section>
      )}
      {(p.cashDeficit > 0n || p.creditDeficit > 0n) && (
        <aside className="finance-notice">
          <strong>Cover overspending</strong>
          <p>
            Cash / payment funding deficit: {usd(p.cashDeficit)}. Unfunded card
            spending: {usd(p.creditDeficit)}. Cash deficits reduce next month’s
            Ready to Assign; unfunded card spending remains debt.
          </p>
        </aside>
      )}
      {p.releasedReserves > 0n && (
        <p>
          Excess card payment reserves released this month:{" "}
          {usd(p.releasedReserves)}.
        </p>
      )}
      {!active.length && (
        <section className="finance-panel">
          <h2>Your first spending plan</h2>
          <p>
            <Link href="/accounts">Add an account</Link>, then give your money
            jobs. Every dollar gets assigned, but assigning is labelling, not
            spending: money set aside for savings is still assigned. Ready to
            Assign reaching zero means nothing is unaccounted for.
          </p>
          <p className="muted">
            Start from a suggested structure of {STARTER_CATEGORY_COUNT}{" "}
            categories you can rename, delete or add to, or build your own
            below. It creates categories only and never assigns money.
          </p>
          <ul className="starter-list">
            {STARTER_GROUPS.map((group) => (
              <li key={group.name}>
                <strong>{group.name}</strong>
                <span>{group.categories.join(" · ")}</span>
                <small>{group.note}</small>
              </li>
            ))}
          </ul>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "starter.apply" }}
            label="Use these categories"
          />
        </section>
      )}
      {s.groups.map((g) => {
        const cats = active.filter((c) => c.groupId === g.id);
        if (!cats.length) return null;
        return (
          <section className="finance-panel" key={g.id}>
            <h2>{g.name}</h2>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  {g.name} budget for {s.month}
                </caption>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Assigned</th>
                    <th>Activity</th>
                    <th>Available</th>
                    <th>Target</th>
                    <th>Change assignment</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.map((c) => {
                    const r = p.categories.find((r) => r.id === c.id)!;
                    return (
                      <tr key={c.id}>
                        <th scope="row">
                          {c.name}
                          {c.paymentAccountId && <small>Payment reserve</small>}
                        </th>
                        <td>{usd(r.assigned)}</td>
                        <td>{usd(r.activity)}</td>
                        <td className={r.available < 0n ? "negative" : ""}>
                          {usd(r.available)}
                        </td>
                        <td>
                          {(() => {
                            const t = s.targets.find(
                              (x) => x.categoryId === c.id,
                            );
                            if (!t)
                              return <span className="muted">No target</span>;
                            return (
                              <span
                                className={`target-state ${t.progress.state.toLowerCase()}`}
                              >
                                {TARGET_STATE[t.progress.state]}
                                <small>
                                  {t.progress.contribution > 0n
                                    ? `Needs ${usd(t.progress.contribution)} this month`
                                    : `${usd(t.amount)} target`}
                                </small>
                              </span>
                            );
                          })()}
                        </td>
                        <td>
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{
                              type: "assign",
                              categoryId: c.id,
                              month: s.month,
                            }}
                            label="Assign"
                            reset
                          >
                            <label className="compact-field">
                              <span className="sr-only">
                                Change {c.name} assignment
                              </span>
                              <input
                                name="amount"
                                required
                                inputMode="decimal"
                                placeholder="25.00"
                                aria-label={`Change ${c.name} assignment`}
                              />
                            </label>
                          </FinanceForm>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Enter an amount to add to Assigned, or a negative amount to return
              available money. Assignments never move money between accounts.
            </p>
          </section>
        );
      })}
      <div className="finance-columns">
        <section className="finance-panel">
          <h2>Move money</h2>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "move", month: s.month }}
            label="Move money"
            reset
          >
            <div className="field-grid">
              <label>
                From category
                <select
                  name="from"
                  required
                  aria-label="Move money from category"
                >
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                To category
                <select name="to" required aria-label="Move money to category">
                  {active.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount (USD)
                <input name="amount" required inputMode="decimal" />
              </label>
            </div>
          </FinanceForm>
        </section>
        <section className="finance-panel">
          <h2>Set a target</h2>
          <p className="muted">
            A target says what a category needs. It never assigns money on its
            own; it only tells you what to assign.
          </p>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "target.set" }}
            label="Save target"
          >
            <div className="field-grid">
              <label>
                Category
                <select name="categoryId" required aria-label="Target category">
                  {active
                    .filter((c) => !c.paymentAccountId && !c.system)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Kind
                <select name="targetType" aria-label="Target kind">
                  <option value="MONTHLY">Needs this much every month</option>
                  <option value="BALANCE">Build up to this amount</option>
                  <option value="BALANCE_BY_DATE">
                    Build up to this amount by a month
                  </option>
                  <option value="PERIODIC">
                    A bill that repeats every so many months
                  </option>
                  <option value="SPENDING_LIMIT">Stay under this amount</option>
                  <option value="MAINTAIN">Keep this much on hand</option>
                </select>
              </label>
              <label>
                Amount (USD)
                <input name="amount" required inputMode="decimal" />
              </label>
              <label>
                Due month
                <input name="dueMonth" placeholder="2026-12" maxLength={7} />
                <small>Only for the two dated kinds, as YYYY-MM.</small>
              </label>
              <label>
                Repeats every (months)
                <input name="cadenceMonths" inputMode="numeric" />
                <small>Only for a repeating bill. 12 is yearly.</small>
              </label>
            </div>
          </FinanceForm>
          {s.targets.length > 0 && (
            <details>
              <summary>Remove a target</summary>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "target.clear" }}
                label="Remove target"
              >
                <label>
                  Category
                  <select
                    name="categoryId"
                    required
                    aria-label="Target to remove"
                  >
                    {s.targets.map((x) => (
                      <option key={x.categoryId} value={x.categoryId}>
                        {active.find((c) => c.id === x.categoryId)?.name ??
                          "Category"}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">
                  Removing a target leaves assigned money exactly where it is.
                </p>
              </FinanceForm>
            </details>
          )}
        </section>
        <section className="finance-panel">
          <h2>Add a category group</h2>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "group.create" }}
            label="Create group"
            reset
          >
            <label>
              Group name
              <input name="name" required maxLength={120} />
            </label>
          </FinanceForm>
          <h2>Add a category</h2>
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "category.create" }}
            label="Create category"
            reset
          >
            <label>
              Category name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Group
              <select name="groupId" required aria-label="Group">
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </FinanceForm>
        </section>
      </div>
      <details className="finance-panel">
        <summary>Manage categories and groups</summary>
        {groups.map((g) => (
          <details key={g.id}>
            <summary>{g.name}</summary>
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "group.rename", id: g.id }}
              label="Rename group"
            >
              <label>
                Group name
                <input name="name" required defaultValue={g.name} />
              </label>
            </FinanceForm>
          </details>
        ))}
        {s.categories
          .filter((c) => !c.paymentAccountId)
          .map((c) => (
            <details key={c.id}>
              <summary>
                {c.name}
                {c.archived ? " · Archived" : ""}
              </summary>
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "category.update", id: c.id }}
              >
                <label>
                  Name
                  <input name="name" required defaultValue={c.name} />
                </label>
                <label>
                  Group
                  <select
                    name="groupId"
                    defaultValue={c.groupId}
                    aria-label={`Group for ${c.name}`}
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    name="archived"
                    defaultChecked={c.archived}
                  />
                  Archive category (history is retained)
                </label>
              </FinanceForm>
            </details>
          ))}
      </details>
    </main>
  );
}
