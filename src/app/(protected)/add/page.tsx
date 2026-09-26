import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { QuickAdd } from "@/components/quick-add";
import { suggestCategory, type CategorisedPayee } from "@/domain/payees";
import { isCard } from "@/domain/budget";
import { PageHeader } from "@/components/ui/page-header";
import { Help } from "@/components/ui/help";
import { EmptyState } from "@/components/ui/empty-state";

/** Fast transaction entry, shaped for a phone. */
export default async function Add() {
  const s = await financePage();
  const accounts = s.accounts
    .filter((a) => !a.closed)
    .map((a) => ({
      id: a.id,
      name: a.name,
      card: isCard(a),
      budget: a.participation === "BUDGET",
    }));
  const groupName = new Map(s.groups.map((g) => [g.id, g.name]));
  const categories = s.categories
    .filter((c) => !c.archived && !c.system && !c.paymentAccountId && !c.hidden)
    .map((c) => ({ id: c.id, name: c.name, group: groupName.get(c.groupId) ?? "" }));
  const spendable = new Set(categories.map((c) => c.id));
  // Payee memory from single-category entries, newest payees first.
  const splitsOf = new Map<string, string[]>();
  for (const x of s.splits)
    splitsOf.set(x.transactionId, [...(splitsOf.get(x.transactionId) ?? []), x.categoryId]);
  const history: CategorisedPayee[] = [];
  const recent: string[] = [];
  const seen = new Set<string>();
  for (const t of s.transactions) {
    if (t.voidedAt || !t.payee.trim() || t.transferAccountId) continue;
    const splits = splitsOf.get(t.id) ?? [];
    if (splits.length === 1)
      history.push({
        payee: t.payee,
        categoryId: splits[0],
        date: t.date.toISOString().slice(0, 10),
      });
    const key = t.payee.trim().toLowerCase();
    if (!seen.has(key) && recent.length < 300) {
      seen.add(key);
      recent.push(t.payee.trim());
    }
  }
  const payees: Record<string, string> = {};
  for (const name of recent) {
    const hit = suggestCategory(history, name);
    payees[name] = hit && spendable.has(hit.categoryId) ? hit.categoryId : "";
  }
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Add transaction"
        actions={
          <Help label="About quick entry" align="right">
            Enter a purchase while you remember it. The category you used for
            a payee before is filled in for you. Transfers and splits are
            entered from the account&apos;s register.
          </Help>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {accounts.length ? (
          <section
            className="surface mt-4 w-full max-w-[30rem] p-4 lg:p-5"
            aria-label="New transaction"
          >
            <QuickAdd
              budgetId={s.budget.id}
              today={s.today}
              accounts={accounts}
              categories={categories}
              payees={payees}
            />
          </section>
        ) : (
          <div className="surface mt-4 max-w-[30rem]">
            <EmptyState
              title="No account to record into yet."
              action={
                <Link className="btn btn-primary" href="/accounts">
                  Add an account
                </Link>
              }
            />
          </div>
        )}
      </div>
    </main>
  );
}
