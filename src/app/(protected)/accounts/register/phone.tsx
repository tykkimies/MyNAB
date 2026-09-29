import Link from "next/link";
import { X } from "lucide-react";
import { BulkApprove } from "@/components/provider-link";
import { PendingEntries, type PendingEntry } from "@/components/pending-entries";
import {
  PhoneApproveBar,
  PhoneRegister,
  PhoneSearch,
  PhoneTxnSheet,
  type PhoneTxn,
} from "@/components/phone/register";

/**
 * Every account's transactions on the phone. The desktop filters collapse to
 * a search and, when the page was opened for one category or account (from
 * the Budget, say), a chip that clears it.
 */
export function PhoneAllAccounts({
  pageNumber,
  caughtUp,
  budgetId,
  today,
  dateFormat,
  toApprove,
  pending,
  categories,
  rows,
  query,
  keep,
  filterLabel,
  moreHref,
  selected,
  panel,
}: {
  pageNumber: number;
  caughtUp: boolean;
  budgetId: string;
  today: string;
  dateFormat: string;
  toApprove: string[];
  pending: PendingEntry[];
  categories: { id: string; name: string }[];
  rows: PhoneTxn[];
  query: string;
  /** Filters to keep across search, paging and the sheet (not q or page). */
  keep: Record<string, string>;
  filterLabel: string | null;
  moreHref?: string;
  selected?: Omit<
    Parameters<typeof PhoneTxnSheet>[0],
    "budgetId" | "closeHref" | "dateFormat" | "selfHref" | "panel"
  >;
  panel?: string;
}) {
  const params = new URLSearchParams(keep);
  if (query) params.set("q", query);
  if (pageNumber > 1) params.set("page", String(pageNumber));
  const here = `/accounts/register${params.size ? `?${params}` : ""}`;
  const txnHref = (id: string) =>
    `/accounts/register?${params.size ? `${params}&` : ""}txn=${id}`;
  return (
    <main id="main" className="phone-page" tabIndex={-1}>
      <Link className="link text-table" href="/accounts">
        ‹ Accounts
      </Link>
      <h1 className="text-page-title text-ink">All accounts</h1>
      {filterLabel && (
        <Link className="phone-chip self-start" href="/accounts/register" aria-label={`Clear filter: ${filterLabel}`}>
          {filterLabel}
          <X size={14} aria-hidden className="ml-1" />
        </Link>
      )}
      <PhoneApproveBar count={toApprove.length}>
        <BulkApprove entryIds={toApprove} />
      </PhoneApproveBar>
      <PendingEntries
        entries={pending}
        categories={categories}
        dateFormat={dateFormat}
        showAccount
      />
      <PhoneSearch action="/accounts/register" query={query} hidden={keep} />
      <PhoneRegister
        rows={rows}
        today={today}
        txnHref={txnHref}
        moreHref={moreHref}
        empty={caughtUp ? "You’re all caught up" : query || filterLabel ? "Nothing matches." : "No transactions yet."}
      />
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
