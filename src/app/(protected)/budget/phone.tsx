import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { financePage } from "@/application/finance-page";
import { READY_TO_ASSIGN } from "@/application/finance";
import { FinanceForm } from "@/components/finance-form";
import { Drawer, DrawerSection } from "@/components/drawer";
import { Amount } from "@/components/amount";
import { AmountPill } from "@/components/ui/pill";
import { TargetEditor } from "@/components/target-editor";
import { TargetBar, dueWhen } from "@/components/budget-target";
import { TARGET_STATE } from "@/components/targets";
import { nextMonth } from "@/domain/budget";
import { formatDate } from "@/domain/dates";
import { formatUSD, money } from "@/domain/money";

type Page = Awaited<ReturnType<typeof financePage>>;
type Category = Page["categories"][number];
type Target = Page["targets"][number];

const usd = (n: bigint) => formatUSD(money(n));
/** Cents as the plain decimal the commands take, e.g. "-12.50". */
const decimal = (n: bigint) =>
  `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100n}.${String((n < 0n ? -n : n) % 100n).padStart(2, "0")}`;
const monthName = (month: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

const FILTERS = [
  { id: "ALL", label: "All" },
  { id: "UNDERFUNDED", label: "Underfunded" },
  { id: "OVERSPENT", label: "Overspent" },
  { id: "MONEY_AVAILABLE", label: "Available" },
] as const;

/**
 * The Budget on a phone, after YNAB's app: the month, Ready to Assign, and
 * each category's name, target bar and Available. Everything else about a
 * category is one tap away in its sheet. Auto-Assign, drag and drop, group
 * settings and the setup checklist stay on the desktop site.
 */
export function PhoneBudget({
  s,
  view,
  sheet,
  groups,
  inspected,
  recent,
  coverFrom,
}: {
  s: Page;
  view: string;
  sheet?: string;
  groups: { id: string; name: string; categories: Category[] }[];
  inspected?: Category;
  recent: { id: string; date: string; payee: string; amount: bigint }[];
  /** Categories with money to spare, for covering the inspected one. */
  coverFrom: Category[];
}) {
  const p = s.projection;
  const rowOf = (id: string) => p.categories.find((r) => r.id === id)!;
  const targetOf = (id: string) => s.targets.find((t) => t.categoryId === id);
  const viewQuery = view === "ALL" ? "" : `&view=${view}`;
  const here = `/budget?month=${s.month}${viewQuery}`;
  const rta = p.readyToAssign;
  const assignable = s.categories.filter(
    (c) =>
      !c.archived &&
      !c.hidden &&
      (!c.system || c.paymentAccountId) &&
      !s.groups.find((g) => g.id === c.groupId)?.hidden,
  );
  return (
    <main id="main" className="phone-page" tabIndex={-1}>
      <h1 className="sr-only">Budget</h1>
      <nav className="phone-month" aria-label="Budget month">
        <Link
          href={`/budget?month=${nextMonth(s.month, -1)}${viewQuery}`}
          scroll={false}
          className="icon-button"
        >
          <ChevronLeft size={20} aria-hidden />
          <span className="sr-only">← Previous</span>
        </Link>
        <h2 className="text-section-title text-ink">{monthName(s.month)}</h2>
        <Link
          href={`/budget?month=${nextMonth(s.month)}${viewQuery}`}
          scroll={false}
          className="icon-button"
        >
          <ChevronRight size={20} aria-hidden />
          <span className="sr-only">Next →</span>
        </Link>
      </nav>
      <Link
        href={`${here}&sheet=rta`}
        scroll={false}
        className="phone-rta"
        data-tone={rta < 0n ? "negative" : rta > 0n ? "positive" : "neutral"}
      >
        <span className="text-figure-lg" data-numeric>
          <Amount>{usd(rta)}</Amount>
        </span>
        <span className="text-label">
          {rta < 0n
            ? "Assigned more than you have"
            : rta > 0n
              ? "Ready to Assign"
              : "All money assigned"}
        </span>
      </Link>
      <nav className="phone-chips" aria-label="Show categories">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/budget?month=${s.month}${f.id === "ALL" ? "" : `&view=${f.id}`}`}
            scroll={false}
            aria-current={view === f.id ? "page" : undefined}
            className="phone-chip"
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {groups.length === 0 ? (
        <p className="px-gutter py-10 text-center text-body text-ink-2">
          {view === "ALL"
            ? "No categories yet. Set them up on the desktop site."
            : "Nothing to show here this month."}
        </p>
      ) : (
        groups.map((g) => {
          const available = g.categories.reduce(
            (sum, c) => sum + rowOf(c.id).available,
            0n,
          );
          return (
            <details key={g.id} open className="phone-group">
              <summary>
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                <span className="text-meta text-ink-3">Available</span>
                <span className="text-num" data-numeric>
                  <Amount>{usd(available)}</Amount>
                </span>
              </summary>
              <ul>
                {g.categories.map((c) => {
                  const r = rowOf(c.id);
                  const t = targetOf(c.id);
                  const needs = t && !t.snoozed && t.progress.contribution > 0n;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`${here}&inspect=${c.id}`}
                        scroll={false}
                        className="phone-category"
                        aria-current={inspected?.id === c.id ? "true" : undefined}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="truncate text-ink">{c.name}</span>
                          {t && <TargetBar target={t} />}
                          <RowNote
                            available={r.available}
                            target={t}
                            month={s.month}
                          />
                        </span>
                        <AmountPill
                          amount={r.available}
                          underfunded={Boolean(needs)}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })
      )}
      {sheet === "rta" && (
        <Drawer
          headingId="rta-heading"
          title="Ready to Assign"
          closeHref={here}
        >
          <p
            className={`text-figure-lg ${rta < 0n ? "text-negative" : "text-ink"}`}
            data-numeric
          >
            <Amount>{usd(rta)}</Amount>
          </p>
          <p className="mt-1 text-body text-ink-2">
            {rta < 0n
              ? "You assigned more than you have. Take money back from a category until this is zero."
              : "Money in your budget accounts that does not have a job yet."}
          </p>
          {s.underfunded > 0n && (
            <DrawerSection title="Targets">
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "target.fund", month: s.month }}
                label={
                  <>
                    Fund all targets · <Amount>{usd(s.underfunded)}</Amount>
                  </>
                }
                buttonLabel={`Fund all targets, ${usd(s.underfunded)}`}
              />
            </DrawerSection>
          )}
          <DrawerSection title="Assign to a category">
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "move", from: READY_TO_ASSIGN, month: s.month }}
              label="Assign"
              reset
            >
              <label>
                Category
                <select name="to" required>
                  {assignable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </label>
            </FinanceForm>
          </DrawerSection>
        </Drawer>
      )}
      {inspected && (
        <CategorySheet
          s={s}
          category={inspected}
          target={targetOf(inspected.id)}
          row={rowOf(inspected.id)}
          here={here}
          recent={recent}
          coverFrom={coverFrom}
          moveTo={assignable.filter((c) => c.id !== inspected.id)}
        />
      )}
    </main>
  );
}

/** One quiet line under the name: what the category needs, if anything. */
function RowNote({
  available,
  target,
  month,
}: {
  available: bigint;
  target?: Target;
  month: string;
}) {
  if (available < 0n)
    return (
      <span className="text-meta text-negative">
        Overspent <Amount>{usd(-available)}</Amount>
      </span>
    );
  if (!target || target.snoozed) return null;
  if (target.progress.contribution > 0n)
    return (
      <span className="text-meta text-warning">
        <Amount>{usd(target.progress.contribution)}</Amount> more needed{" "}
        {dueWhen(target, month)}
      </span>
    );
  if (target.type === "SPENDING_LIMIT")
    return (
      <span className="text-meta text-ink-3">
        <Amount>{usd(target.progress.needed)}</Amount> left of{" "}
        <Amount>{usd(target.amount)}</Amount>
      </span>
    );
  return (
    <span className="text-meta text-ink-3">
      {TARGET_STATE[target.progress.state as keyof typeof TARGET_STATE]}
    </span>
  );
}

function CategorySheet({
  s,
  category,
  target,
  row,
  here,
  recent,
  coverFrom,
  moveTo,
}: {
  s: Page;
  category: Category;
  target?: Target;
  row: Page["projection"]["categories"][number];
  here: string;
  recent: { id: string; date: string; payee: string; amount: bigint }[];
  coverFrom: Category[];
  moveTo: Category[];
}) {
  const editable = !category.system || Boolean(category.paymentAccountId);
  const monthLast = new Date(
    Date.UTC(Number(s.month.slice(0, 4)), Number(s.month.slice(5)), 0),
  )
    .toISOString()
    .slice(0, 10);
  const activityHref = `/accounts/register?category=${category.id}&from=${s.month}-01&through=${monthLast}`;
  return (
    <Drawer
      key={category.id}
      headingId="inspector-heading"
      eyebrow={s.groups.find((g) => g.id === category.groupId)?.name}
      title={category.name}
      closeHref={here}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-label text-ink-2">Available</span>
        <span
          className={`text-figure-lg ${row.available < 0n ? "text-negative" : "text-ink"}`}
          data-numeric
        >
          <Amount>{usd(row.available)}</Amount>
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-table">
        {(
          [
            ["Last month", row.carry],
            ["Assigned", row.assigned],
            ["Activity", row.activity],
          ] as const
        ).map(([label, amount]) => (
          <div key={label} className="rounded-md bg-surface-sunken px-2.5 py-2">
            <dt className="text-meta text-ink-3">{label}</dt>
            <dd className="text-num text-ink" data-numeric>
              <Amount>{usd(amount)}</Amount>
            </dd>
          </div>
        ))}
      </dl>
      {target && !target.snoozed && target.progress.contribution > 0n && (
        <div className="mt-4">
          <FinanceForm
            budgetId={s.budget.id}
            command={{
              type: "target.fund",
              month: s.month,
              categoryId: category.id,
            }}
            label={
              <>
                Assign <Amount>{usd(target.progress.contribution)}</Amount>{" "}
                needed {dueWhen(target, s.month)}
              </>
            }
            buttonLabel={`Assign ${usd(target.progress.contribution)} to ${category.name}`}
            buttonClassName="w-full"
          />
        </div>
      )}
      {row.available < 0n && coverFrom.length > 0 && (
        <DrawerSection title="Cover overspending">
          <FinanceForm
            budgetId={s.budget.id}
            command={{
              type: "move",
              to: category.id,
              month: s.month,
              amount: decimal(-row.available),
            }}
            label={
              <>
                Cover <Amount>{usd(-row.available)}</Amount>
              </>
            }
          >
            <label>
              From
              <select name="from" aria-label={`Cover ${category.name} from`}>
                {coverFrom.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </FinanceForm>
        </DrawerSection>
      )}
      {editable && (
        <DrawerSection title="Assign">
          <FinanceForm
            budgetId={s.budget.id}
            command={{
              type: "assign",
              categoryId: category.id,
              month: s.month,
            }}
            label="Assign"
            inline
            reset
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Assign to {category.name}</span>
              <input
                name="amount"
                required
                inputMode="decimal"
                className="w-full!"
                placeholder="Add, or −25.00 to take back"
                aria-label={`Assign to ${category.name}`}
              />
            </label>
          </FinanceForm>
        </DrawerSection>
      )}
      {row.available > 0n && (
        <DrawerSection title="Move money">
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "move", from: category.id, month: s.month }}
            label="Move"
            reset
          >
            <div className="field-grid" data-cols="2">
              <label>
                Amount
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  placeholder={decimal(row.available)}
                  aria-label={`Amount to move from ${category.name}`}
                />
              </label>
              <label>
                To
                <select name="to" aria-label={`Move from ${category.name} to`}>
                  <option value={READY_TO_ASSIGN}>Ready to Assign</option>
                  {moveTo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </FinanceForm>
        </DrawerSection>
      )}
      <DrawerSection title="This month">
        {recent.length ? (
          <ul className="divide-y divide-hairline">
            {recent.slice(0, 5).map((t) => (
              <li
                key={t.id}
                className="flex justify-between gap-2 py-2 text-table"
              >
                <span className="min-w-0 truncate text-ink">
                  {t.payee || "No payee"}
                  <span className="block text-meta text-ink-3">
                    {formatDate(t.date, s.budget.dateFormat)}
                  </span>
                </span>
                <span className="text-num text-ink-2" data-numeric>
                  <Amount>{usd(t.amount)}</Amount>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-table text-ink-2">No spending yet.</p>
        )}
        <Link className="link mt-2 inline-block text-table" href={activityHref}>
          All transactions
        </Link>
      </DrawerSection>
      {editable && (
        <details className="phone-disclosure mt-4">
          <summary>{target ? "Edit target" : "Add a target"}</summary>
          <div className="pt-3">
            <TargetEditor
              key={`${category.id}-${target?.type ?? "none"}-${target?.amount ?? ""}`}
              budgetId={s.budget.id}
              categoryId={category.id}
              categoryName={category.name}
              month={s.month}
              currentMonth={s.today.slice(0, 7)}
              card={Boolean(category.paymentAccountId)}
              current={
                target
                  ? {
                      type: target.type,
                      amount: decimal(target.amount),
                      dueMonth: target.dueMonth,
                      cadenceMonths: target.cadenceMonths,
                      refill: target.refill,
                      dayOfWeek: target.dayOfWeek,
                      dueDay: target.dueDay,
                      snoozed: target.snoozed,
                    }
                  : null
              }
            />
          </div>
        </details>
      )}
    </Drawer>
  );
}
