import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { QuickAdd } from "@/components/quick-add";
import { suggestCategory, type CategorisedPayee } from "@/domain/payees";
import { isCard } from "@/domain/budget";

const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
const CARD = "rounded-lg border border-border-warm bg-surface-card";

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
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Add
        </span>
        <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
          Record it now.
        </h1>
        <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
          Enter a purchase while you remember it. The category you used for a
          payee before is filled in for you. Transfers and splits are entered
          from the account&apos;s register.
        </p>
      </div>
      {accounts.length ? (
        <section className={`finance-panel mt-space-lg max-w-2xl ${CARD} p-space-lg`} aria-label="New transaction">
          <QuickAdd
            budgetId={s.budget.id}
            today={s.today}
            accounts={accounts}
            categories={categories}
            payees={payees}
          />
        </section>
      ) : (
        <p className="mt-space-lg font-body-md text-body-md text-text-secondary">
          <Link className="font-semibold text-secondary underline underline-offset-2" href="/accounts">
            Add an account
          </Link>{" "}
          first.
        </p>
      )}
    </main>
  );
}
