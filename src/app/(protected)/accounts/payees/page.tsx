import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { suggestCategory, type CategorisedPayee } from "@/domain/payees";
import Form from "next/form";

const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL = `finance-panel ${CARD} p-space-lg`;
const H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";

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
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          <Link className="underline-offset-2 hover:underline" href="/accounts">
            Accounts
          </Link>
        </span>
        <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
          Payees
        </h1>
        <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
          Tidy up names that arrive several ways. Choose one payee to rename it,
          or several to combine them under one name. Each transaction is edited
          normally and can be undone from its account.
        </p>
      </div>
      <Form action="/accounts/payees" scroll={false} className={`mt-space-lg flex flex-wrap items-end gap-space-sm ${PANEL}`}>
        <label className="flex flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
          Find a payee
          <input name="q" type="search" defaultValue={q ?? ""} />
        </label>
        <button className="secondary-button" type="submit">
          Search
        </button>
      </Form>
      <section className={`mt-space-lg ${PANEL}`} aria-labelledby="payees-heading">
        <h2 id="payees-heading" className={H2}>
          {list.length} payee{list.length === 1 ? "" : "s"}
        </h2>
        {payees.size === 0 ? (
          <p className={`mt-space-sm ${MUTED}`}>No payees yet.</p>
        ) : (
          <FinanceForm
            budgetId={s.budget.id}
            command={{ type: "payee.rename" }}
            label="Rename selected payees"
          >
            {/* The form stays mounted when a search empties the list, so the
                result of a rename is still shown after the list refreshes. */}
            {list.length === 0 && (
              <p className={`mt-space-sm ${MUTED}`}>No payees match.</p>
            )}
            <ul className="mt-space-md divide-y divide-border-warm">
              {list.map((p) => {
                const hit = suggestCategory(history, p.name);
                return (
                  <li key={p.name} className="payee-row py-space-xs">
                    <label className="check-field">
                      <input type="checkbox" name="from" value={p.name} />
                      <span className="font-body-md text-body-md text-text-primary">{p.name}</span>
                    </label>
                    <span className={`ml-space-lg block ${MUTED}`}>
                      {p.count} transaction{p.count === 1 ? "" : "s"} · last {p.last}
                      {hit ? ` · usually ${categoryName.get(hit.categoryId) ?? "a category"}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="field-grid mt-space-md">
              <label>
                New payee name
                <input name="to" required maxLength={120} />
              </label>
            </div>
            <label className="check-field mt-space-sm">
              <input type="checkbox" name="rule" />
              Also rename these on future imports
            </label>
          </FinanceForm>
        )}
      </section>
    </main>
  );
}
