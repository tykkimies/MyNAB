import Link from "next/link";
import type { ReactNode } from "react";
import Form from "next/form";
import { Search } from "lucide-react";
import { Amount } from "@/components/amount";
import { Drawer } from "@/components/drawer";
import { FinanceForm } from "@/components/finance-form";
import { TransactionForm } from "@/components/finance-fields";
import { ProviderAction } from "@/components/provider-link";
import { Pill } from "@/components/ui/pill";
import { formatDate } from "@/domain/dates";
import { formatUSD, money } from "@/domain/money";

const usd = (n: bigint) => formatUSD(money(n));

export interface PhoneTxn {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  payee: string;
  /** Category, transfer or account: the quiet second line. */
  sub: string;
  amount: bigint;
  cleared: boolean;
  unapprovedEntryId: string | null;
}

const HEADING = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const HEADING_YEAR = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
function dayHeading(date: string, today: string) {
  if (date === today) return "Today";
  const d = new Date(`${date}T00:00:00Z`);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (date === yesterday.toISOString().slice(0, 10)) return "Yesterday";
  return (date.slice(0, 4) === today.slice(0, 4) ? HEADING : HEADING_YEAR).format(d);
}

/**
 * A register on the phone, as YNAB's app lists it: transactions under date
 * headings, payee and category on the left, amount on the right, new imports
 * marked. Tapping a row opens its sheet (`?txn=`); `more` pages further back.
 */
export function PhoneRegister({
  rows,
  today,
  txnHref,
  moreHref,
  empty,
}: {
  rows: PhoneTxn[];
  today: string;
  /** The href that opens one transaction's sheet. */
  txnHref: (id: string) => string;
  moreHref?: string;
  empty: string;
}) {
  if (!rows.length)
    return (
      <p className="px-gutter py-10 text-center text-body text-ink-2">{empty}</p>
    );
  const days: { date: string; rows: PhoneTxn[] }[] = [];
  for (const row of rows) {
    const last = days.at(-1);
    if (last?.date === row.date) last.rows.push(row);
    else days.push({ date: row.date, rows: [row] });
  }
  return (
    <section aria-label="Transactions" className="phone-list">
      {days.map((d) => (
        <div key={d.date}>
          <h3 className="phone-section-head">{dayHeading(d.date, today)}</h3>
          <ul>
            {d.rows.map((t) => (
              <li key={t.id}>
                <Link
                  href={txnHref(t.id)}
                  scroll={false}
                  className="phone-row"
                  data-unapproved={t.unapprovedEntryId ? "" : undefined}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {t.unapprovedEntryId && <Pill tone="accent">New</Pill>}
                      <span className="truncate">{t.payee || "No payee"}</span>
                    </span>
                    {t.sub && (
                      <span className="truncate text-meta text-ink-3">
                        {t.sub}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-col items-end">
                    <span
                      className={`text-num ${t.amount < 0n ? "text-ink" : "text-positive"}`}
                      data-numeric
                    >
                      <Amount>{usd(t.amount)}</Amount>
                    </span>
                    <span
                      className={`phone-cleared ${t.cleared ? "" : "phone-uncleared"}`}
                      aria-label={t.cleared ? "Cleared" : "Uncleared"}
                      role="img"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {moreHref && (
        <div className="p-4 text-center">
          <Link className="btn btn-secondary" href={moreHref} scroll={false}>
            Show older transactions
          </Link>
        </div>
      )}
    </section>
  );
}

/** Payee and memo search over a phone register. */
export function PhoneSearch({
  action,
  query,
  hidden = {},
}: {
  action: string;
  query: string;
  hidden?: Record<string, string>;
}) {
  return (
    <Form action={action} scroll={false} className="phone-search" role="search">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Search size={16} aria-hidden className="text-ink-3" />
      <input
        name="q"
        type="search"
        defaultValue={query}
        placeholder="Search payee or memo"
        aria-label="Search transactions"
        enterKeyHint="search"
      />
    </Form>
  );
}

/** "N to approve" with Approve all, above a phone register. */
export function PhoneApproveBar({ children, count }: { children: ReactNode; count: number }) {
  if (!count) return null;
  return (
    <div className="phone-approve">
      <span className="text-label text-ink">
        {count} new {count === 1 ? "transaction" : "transactions"} to approve
      </span>
      {children}
    </div>
  );
}

/**
 * One transaction's sheet: what it is, Approve for a new import, and the
 * register's own edit and delete forms.
 */
export function PhoneTxnSheet({
  budgetId,
  closeHref,
  txn,
  account,
  kind,
  memo,
  splits,
  dateFormat,
  edit,
  transferNote,
}: {
  budgetId: string;
  closeHref: string;
  txn: PhoneTxn;
  account: string;
  kind: string;
  memo: string;
  splits: { name: string; amount: bigint }[];
  dateFormat: string;
  /** The edit form's inputs, or null when this side cannot be edited here. */
  edit: Parameters<typeof TransactionForm>[0] | null;
  transferNote?: ReactNode;
}) {
  return (
    <Drawer
      key={txn.id}
      headingId="txn-heading"
      eyebrow={formatDate(txn.date, dateFormat)}
      title={txn.payee || "No payee"}
      closeHref={closeHref}
    >
      <p
        className={`text-figure-lg ${txn.amount < 0n ? "text-ink" : "text-positive"}`}
        data-numeric
      >
        <Amount>{usd(txn.amount)}</Amount>
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-table">
        <div>
          <dt className="text-meta text-ink-3">Account</dt>
          <dd className="text-ink">{account}</dd>
        </div>
        <div>
          <dt className="text-meta text-ink-3">Status</dt>
          <dd className="text-ink">{txn.cleared ? "Cleared" : "Uncleared"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-meta text-ink-3">
            {splits.length > 1 ? "Split" : "Category"}
          </dt>
          <dd className="text-ink">
            {splits.length > 1
              ? splits.map((x) => (
                  <span key={x.name} className="flex justify-between gap-2">
                    {x.name}
                    <span data-numeric>
                      <Amount>{usd(x.amount)}</Amount>
                    </span>
                  </span>
                ))
              : txn.sub || kind.replaceAll("_", " ").toLowerCase()}
          </dd>
        </div>
        {memo && (
          <div className="col-span-2">
            <dt className="text-meta text-ink-3">Memo</dt>
            <dd className="text-ink">{memo}</dd>
          </div>
        )}
      </dl>
      {txn.unapprovedEntryId && (
        <div className="mt-4 flex flex-col gap-2 rounded-md bg-accent-soft p-3">
          <span className="text-table text-ink">
            Imported from your bank. Approve it as it is, or edit it, which
            approves it too.
          </span>
          <ProviderAction
            command={{ type: "entry.approve", entryId: txn.unapprovedEntryId }}
            label="Approve"
            busyLabel="Approving…"
          />
        </div>
      )}
      {edit ? (
        <details className="phone-disclosure mt-4">
          <summary>Edit transaction</summary>
          <div className="pt-3">
            <TransactionForm {...edit} />
          </div>
        </details>
      ) : (
        transferNote && <p className="mt-4 text-table text-ink-2">{transferNote}</p>
      )}
      <details className="phone-disclosure phone-danger">
        <summary>Delete transaction</summary>
        <FinanceForm
          budgetId={budgetId}
          command={{
            type: "transaction.void",
            id: txn.id,
            reason: "Deleted in register",
          }}
          label="Delete transaction"
          buttonClassName="btn-danger"
        >
          <label className="check-field">
            <input type="checkbox" name="acknowledgeReconciled" />
            Any affected reconciliation will need review.
          </label>
        </FinanceForm>
      </details>
    </Drawer>
  );
}
