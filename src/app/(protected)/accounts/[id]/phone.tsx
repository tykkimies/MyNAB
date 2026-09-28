import Link from "next/link";
import { Plus } from "lucide-react";
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
  pending,
  categories,
  rows,
  query,
  moreHref,
  selected,
}: {
  budgetId: string;
  today: string;
  dateFormat: string;
  account: { id: string; name: string; closed: boolean };
  balance: bigint;
  cleared: bigint;
  toApprove: string[];
  pending: PendingEntry[];
  categories: { id: string; name: string }[];
  rows: PhoneTxn[];
  query: string;
  moreHref?: string;
  selected?: Omit<Parameters<typeof PhoneTxnSheet>[0], "budgetId" | "closeHref" | "dateFormat">;
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
        {!account.closed && (
          <Link
            className="btn btn-secondary btn-sm"
            href={`/add?account=${account.id}`}
          >
            <Plus size={14} aria-hidden />
            Add
          </Link>
        )}
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
            : "No transactions yet on this account."
        }
      />
      {selected && (
        <PhoneTxnSheet
          {...selected}
          budgetId={budgetId}
          dateFormat={dateFormat}
          closeHref={here}
        />
      )}
    </main>
  );
}
