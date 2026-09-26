import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { suggestCategory, type CategorisedPayee } from "@/domain/payees";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

const MUTED = "text-table text-ink-2";

/** Every payee in the plan, with rename and combine. */
export default async function Payees({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const needle = (q ?? "").trim().toLowerCase().slice(0, 80);
  const s = await financePage();
  const categoryName = new Map(s.categories.map((c) => [c.id, c.name]));
  const splitsOf = new Map<string, string[]>();
  for (const x of s.splits)
    splitsOf.set(x.transactionId, [...(splitsOf.get(x.transactionId) ?? []), x.categoryId]);
  const history: CategorisedPayee[] = [];
  const payees = new Map<string, { name: string; count: number; last: string }>();
  for (const t of s.transactions) {
    if (t.voidedAt || t.kind === "OPENING" || !t.payee.trim()) continue;
    const date = t.date.toISOString().slice(0, 10);
    const splits = splitsOf.get(t.id) ?? [];
    if (splits.length === 1) history.push({ payee: t.payee, categoryId: splits[0], date });
    const key = t.payee.trim().toLowerCase();
    const entry = payees.get(key);
    if (!entry) payees.set(key, { name: t.payee.trim(), count: 1, last: date });
    else {
      entry.count++;
      if (date > entry.last) {
        entry.last = date;
        entry.name = t.payee.trim();
      }
    }
  }
  const list = [...payees.values()]
    .filter((p) => !needle || p.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="Payees"
        meta="Rename one, or combine several under one name"
        actions={
          <Form action="/accounts/payees" scroll={false} className="finance-form finance-form-inline">
            <label>
              <span className="sr-only">Find a payee</span>
              <input
                name="q"
                type="search"
                defaultValue={q ?? ""}
                placeholder="Find a payee"
                aria-label="Find a payee"
                className="w-52!"
              />
            </label>
            <button className="btn btn-secondary" type="submit">
              Search
            </button>
          </Form>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <section className="surface mt-4" aria-labelledby="payees-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="payees-heading" className="section-title">
              {list.length} payee{list.length === 1 ? "" : "s"}
            </h2>
            <span className={MUTED}>
              Each transaction is edited normally and can be undone from its
              account.
            </span>
          </div>
          {payees.size === 0 ? (
            <EmptyState title="No payees yet." />
          ) : (
            <FinanceForm
              budgetId={s.budget.id}
              command={{ type: "payee.rename" }}
              label="Rename selected payees"
            >
              {/* The form stays mounted when a search empties the list, so the
                  result of a rename is still shown after the list refreshes. */}
              {list.length === 0 && (
                <p className={`px-4 py-3 lg:px-6 ${MUTED}`}>No payees match.</p>
              )}
              <ul className="border-t border-hairline">
                {list.map((p) => {
                  const hit = suggestCategory(history, p.name);
                  return (
                    <li
                      key={p.name}
                      className="payee-row flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-hairline px-4 py-1.5 hover:bg-row-hover lg:px-6"
                    >
                      <label className="check-field">
                        <input type="checkbox" name="from" value={p.name} />
                        <span className="text-table font-medium text-ink">{p.name}</span>
                      </label>
                      <span className="ml-auto text-meta text-ink-3">
                        {p.count} transaction{p.count === 1 ? "" : "s"} · last {p.last}
                        {hit ? ` · usually ${categoryName.get(hit.categoryId) ?? "a category"}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="px-4 pt-3 lg:px-6">
                <div className="field-grid items-end" data-cols="2">
                  <label>
                    New payee name
                    <input name="to" required maxLength={120} />
                  </label>
                  <label className="check-field">
                    <input type="checkbox" name="rule" />
                    Also rename these on future imports
                  </label>
                </div>
              </div>
            </FinanceForm>
          )}
        </section>
      </div>
    </main>
  );
}
