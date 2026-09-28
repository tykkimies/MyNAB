import Link from "next/link";
import {
  financePage,
  pendingBankEntries,
  unapprovedImports,
} from "@/application/finance-page";
import { BulkApprove } from "@/components/provider-link";
import { PendingEntries } from "@/components/pending-entries";
import { FinanceForm } from "@/components/finance-form";
import { RegisterBulk, type RegisterRow } from "@/components/register-bulk";
import { FLAG_COLORS, flagName, type FlagColor } from "@/domain/flags";
import { formatUSD, money } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Amount } from "@/components/amount";

const MUTED = "text-table text-ink-2";
const PAGE_SIZE = 50;
const usd = (n: bigint) => formatUSD(money(n));
const day = (d: Date) => d.toISOString().slice(0, 10);
const validDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

type Search = {
  q?: string;
  account?: string;
  category?: string;
  flag?: string;
  cleared?: string;
  from?: string;
  through?: string;
  page?: string;
};

/** YNAB's "All Accounts" register: every live transaction, filtered. */
export default async function AllAccounts({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const q = await searchParams;
  const s = await financePage();
  const needle = (q.q ?? "").trim().slice(0, 80).toLowerCase();
  const from = validDate(q.from);
  const through = validDate(q.through);
  const accountName = new Map(s.accounts.map((a) => [a.id, a.name]));
  const categoryName = new Map(s.categories.map((c) => [c.id, c.name]));
  const splitsOf = new Map<string, typeof s.splits>();
  for (const x of s.splits)
    splitsOf.set(x.transactionId, [...(splitsOf.get(x.transactionId) ?? []), x]);
  const stateOf = new Map(
    s.states.map((x) => [`${x.transactionId}/${x.accountId}`, x]),
  );
  const label = (color: string) =>
    flagName(color as FlagColor, s.flagNames);
  const matching = s.transactions
    .filter((t) => !t.voidedAt)
    .filter((t) => {
      const splits = splitsOf.get(t.id) ?? [];
      const flag = s.flags.get(t.id) ?? null;
      const cleared = Boolean(stateOf.get(`${t.id}/${t.accountId}`)?.cleared);
      const date = day(t.date);
      return (
        (!q.account || t.accountId === q.account || t.transferAccountId === q.account) &&
        (!q.category || splits.some((x) => x.categoryId === q.category)) &&
        (!q.flag ||
          (q.flag === "ANY" ? flag !== null : q.flag === "NONE" ? flag === null : flag === q.flag)) &&
        (q.cleared !== "CLEARED" || cleared) &&
        (q.cleared !== "UNCLEARED" || !cleared) &&
        (!from || date >= from) &&
        (!through || date <= through) &&
        (!needle ||
          t.payee.toLowerCase().includes(needle) ||
          t.memo.toLowerCase().includes(needle))
      );
    })
    .sort(
      (a, b) =>
        day(b.date).localeCompare(day(a.date)) || b.id.localeCompare(a.id),
    );
  const total = matching.reduce((sum, t) => sum + t.amount, 0n);
  // YNAB's unapproved imports, marked and approved in place.
  const waiting = await unapprovedImports();
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const pageNumber = Math.min(pages, Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1));
  const rows: RegisterRow[] = matching
    .slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE)
    .map((t) => {
      const splits = splitsOf.get(t.id) ?? [];
      const flag = s.flags.get(t.id) ?? null;
      return {
        id: t.id,
        date: formatDate(t.date, s.budget.dateFormat),
        account: accountName.get(t.accountId) ?? "Account",
        accountHref: `/accounts/${t.accountId}`,
        payee: t.transferAccountId
          ? `Transfer: ${accountName.get(t.transferAccountId) ?? "account"}`
          : t.payee,
        memo: t.memo,
        category:
          splits.length > 1
            ? "Split"
            : splits[0]
              ? (categoryName.get(splits[0].categoryId) ?? "Unknown")
              : t.kind === "INCOME"
                ? "Ready to Assign"
                : "—",
        amount: usd(t.amount),
        flag,
        flagLabel: flag ? label(flag) : null,
        cleared: Boolean(stateOf.get(`${t.id}/${t.accountId}`)?.cleared),
        unapprovedEntryId: waiting.byTransaction.get(t.id)?.entryId ?? null,
      };
    });
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v && k !== "page") params.set(k, v);
  const pageHref = (n: number) => `/accounts/register?${params.toString()}&page=${n}`;
  const spendable = s.categories
    .filter((c) => !c.archived && !c.paymentAccountId && !c.system)
    .map((c) => ({ id: c.id, name: c.name }));
  const flags = FLAG_COLORS.map((color) => ({ color, label: label(color) }));
  const filtering = params.toString() !== "";
  // Pending at the bank: above the ledger, outside its figures and filters.
  const pending = await pendingBankEntries();
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="All accounts"
        meta="Every transaction in one register"
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <Form
          action="/accounts/register"
          scroll={false}
          className="finance-form surface mt-4 p-4"
          aria-label="Filters"
        >
          <div className="field-grid" data-cols="4">
            <label className="lg:col-span-2">
              Search payee or memo
              <input name="q" type="search" defaultValue={q.q ?? ""} />
            </label>
            <label>
              Account
              <select name="account" defaultValue={q.account ?? ""}>
                <option value="">All accounts</option>
                {s.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.closed ? " (closed)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select name="category" defaultValue={q.category ?? ""}>
                <option value="">All categories</option>
                {s.categories
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Flag
              <select name="flag" defaultValue={q.flag ?? ""}>
                <option value="">Any or none</option>
                <option value="ANY">Flagged</option>
                <option value="NONE">Not flagged</option>
                {flags.map((f) => (
                  <option key={f.color} value={f.color}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cleared
              <select name="cleared" defaultValue={q.cleared ?? ""}>
                <option value="">Cleared and uncleared</option>
                <option value="CLEARED">Cleared</option>
                <option value="UNCLEARED">Uncleared</option>
              </select>
            </label>
            <label>
              From
              <input name="from" type="date" defaultValue={from} />
            </label>
            <label>
              Through
              <input name="through" type="date" defaultValue={through} />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn btn-secondary" type="submit">
              Filter
            </button>
            {filtering && (
              <Link className="link" href="/accounts/register">
                Clear filters
              </Link>
            )}
          </div>
        </Form>

        <PendingEntries
          entries={pending}
          categories={spendable}
          dateFormat={s.budget.dateFormat}
          showAccount
        />
        <section className="surface mt-4" aria-labelledby="register-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
            <h2 id="register-heading" className="section-title">
              Transactions
            </h2>
            <span className={MUTED}>
              {matching.length} matching · net{" "}
              <span className="text-num text-ink" data-numeric>
                <Amount>{usd(total)}</Amount>
              </span>
            </span>
          </div>
          {waiting.all.length > 0 && (
            <div className="unapproved-bar flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-2 lg:px-6">
              <span className="text-label text-ink">
                {waiting.all.length} imported{" "}
                {waiting.all.length === 1 ? "transaction" : "transactions"} to
                approve
              </span>
              <BulkApprove entryIds={waiting.all} />
            </div>
          )}
          {rows.length ? (
            <RegisterBulk
              key={rows.map((r) => r.id).join(",")}
              budgetId={s.budget.id}
              rows={rows}
              flags={flags}
              categories={spendable}
            />
          ) : (
            <EmptyState title="No transactions match these filters." />
          )}
          {pages > 1 && (
            <nav aria-label="Register pages" className="flex items-center gap-3 border-t border-hairline px-4 py-2 lg:px-6">
              {pageNumber > 1 && (
                <Link className="btn btn-secondary btn-sm" href={pageHref(pageNumber - 1)} scroll={false}>
                  Newer
                </Link>
              )}
              <span className={MUTED}>
                Page {pageNumber} of {pages}
              </span>
              {pageNumber < pages && (
                <Link className="btn btn-secondary btn-sm" href={pageHref(pageNumber + 1)} scroll={false}>
                  Older
                </Link>
              )}
            </nav>
          )}
        </section>

        <details className="surface mt-4 p-4">
          <summary className="cursor-pointer text-label text-ink-2 hover:text-ink">
            Name your flags
          </summary>
          <p className={`mt-2 ${MUTED}`}>
            Give a flag a meaning, such as &ldquo;Reimbursable&rdquo;. Leave a
            name empty to go back to the colour.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FLAG_COLORS.map((color) => (
              <FinanceForm
                key={color}
                budgetId={s.budget.id}
                command={{ type: "flag.rename", color }}
                label={`Save ${color.toLowerCase()} flag name`}
                inline
              >
                <label>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="flag-dot" data-flag={color} aria-hidden />
                    {color.charAt(0) + color.slice(1).toLowerCase()} flag name
                  </span>
                  <input
                    name="name"
                    maxLength={40}
                    className="w-40!"
                    defaultValue={s.flagNames.find((n) => n.color === color)?.name ?? ""}
                  />
                </label>
              </FinanceForm>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
