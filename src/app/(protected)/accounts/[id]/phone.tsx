import Link from "next/link";
import { Plus } from "lucide-react";
import type { RegisterView } from "@/domain/register-view";
import {
  RegisterViewOptions,
  ShowReconciled,
} from "@/components/register-view-options";
import { Amount } from "@/components/amount";
import { BulkApprove } from "@/components/provider-link";
import { PendingEntries, type PendingEntry } from "@/components/pending-entries";
import {
  PhoneApproveBar,
  PhoneRegister,
  PhoneSearch,
  PhoneTxnSheet,
  type PhoneTxn,
} from "@/components/phone/register";
import { formatUSD, money } from "@/domain/money";

const usd = (n: bigint) => formatUSD(money(n));

/**
 * One account on the phone: its balance, what waits for approval, pending
 * charges, and the register by day. Reconcile, the loan planner, balance
 * history and account settings stay on the desktop site.
 */
export function PhoneAccount({
  budgetId,
  today,
  dateFormat,
  account,
  balance,
  cleared,
  toApprove,
  toCategorize,
  pending,
  categories,
  rows,
  query,
  view,
  hiddenByView,
  moreHref,
  selected,
  panel,
}: {
  budgetId: string;
  today: string;
  dateFormat: string;
  account: { id: string; name: string; closed: boolean };
  balance: bigint;
  cleared: bigint;
  toApprove: string[];
  toCategorize: number;
  pending: PendingEntry[];
  categories: { id: string; name: string }[];
  rows: PhoneTxn[];
  query: string;
  view: RegisterView;
  hiddenByView: boolean;
  moreHref?: string;
  selected?: Omit<
    Parameters<typeof PhoneTxnSheet>[0],
    "budgetId" | "closeHref" | "dateFormat" | "selfHref" | "panel"
  >;
  panel?: string;
}) {
  const here = `/accounts/${account.id}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const txnHref = (id: string) =>
    `/accounts/${account.id}?${query ? `q=${encodeURIComponent(query)}&` : ""}txn=${id}`;
  return (
    <main id="main" className="phone-page" tabIndex={-1}>
      <div className="flex items-center justify-between gap-2">
        <Link className="link text-table" href="/accounts">
          ‹ Accounts
        </Link>
        <span className="flex items-center gap-2">
          <RegisterViewOptions view={view} today={today} returnTo={here} />
          {!account.closed && (
            <Link
              className="btn btn-secondary btn-sm"
              href={`/add?account=${account.id}`}
            >
              <Plus size={14} aria-hidden />
              Add
            </Link>
          )}
        </span>
      </div>
      <header className="phone-hero">
        <h1 className="text-section-title text-ink">{account.name}</h1>
        <span
          className={`text-figure-lg ${balance < 0n ? "text-negative" : "text-ink"}`}
          data-numeric
        >
          <Amount>{usd(balance)}</Amount>
        </span>
        <span className="text-meta text-ink-3">
          Cleared <Amount>{usd(cleared)}</Amount> · Uncleared{" "}
          <Amount>{usd(balance - cleared)}</Amount>
        </span>
      </header>
      <PhoneApproveBar count={toApprove.length}>
        <BulkApprove entryIds={toApprove} />
      </PhoneApproveBar>
      {toCategorize > 0 && (
        <Link className="phone-chip mt-3 self-start" href={`/accounts/register?review=needs-category&account=${account.id}`}>
          {toCategorize} need {toCategorize === 1 ? "a category" : "categories"} · Select transactions
        </Link>
      )}
      <PendingEntries
        entries={pending}
        categories={categories}
        dateFormat={dateFormat}
      />
      <PhoneSearch action={`/accounts/${account.id}`} query={query} />
      <PhoneRegister
        rows={rows}
        today={today}
        txnHref={txnHref}
        moreHref={moreHref}
        empty={
          query
            ? "Nothing on this account matches."
            : hiddenByView
              ? "This view is hiding every transaction."
              : "No transactions yet on this account."
        }
      />
      {hiddenByView && !view.showReconciled && (
        <div className="px-gutter pb-4">
          <ShowReconciled view={view} returnTo={here} />
        </div>
      )}
      {selected && (
        <PhoneTxnSheet
          {...selected}
          budgetId={budgetId}
          dateFormat={dateFormat}
          closeHref={here}
          selfHref={txnHref(selected.txn.id)}
          panel={panel}
        />
      )}
    </main>
  );
}
