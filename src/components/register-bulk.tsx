"use client";
import { useState } from "react";
import Link from "next/link";
import { FinanceForm } from "@/components/finance-form";
import { Amount } from "@/components/amount";
import { ProviderAction } from "@/components/provider-link";
import { Pill } from "@/components/ui/pill";

export interface RegisterRow {
  id: string;
  date: string;
  account: string;
  accountHref: string;
  payee: string;
  memo: string;
  category: string;
  amount: string;
  flag: string | null;
  flagLabel: string | null;
  cleared: boolean;
  /** The import to approve when this is an unapproved bank transaction. */
  unapprovedEntryId?: string | null;
}

/** The cross-account register with row selection and bulk actions. */
export function RegisterBulk({
  budgetId,
  rows,
  flags,
  categories,
}: {
  budgetId: string;
  rows: RegisterRow[];
  flags: { color: string; label: string }[];
  categories: { id: string; name: string }[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const hidden = [...selected].map((id) => (
    <input key={id} type="hidden" name="ids" value={id} />
  ));
  return (
    <>
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-surface-sunken px-4 py-1.5 lg:px-6"
        aria-label="Bulk actions"
        role="group"
      >
        <span className="text-meta text-ink-2" aria-live="polite">
          {selected.size} selected
        </span>
        {selected.size > 0 && (
          <>
            <FinanceForm budgetId={budgetId} command={{ type: "transaction.flag" }} label="Flag selected" inline>
              {hidden}
              <label>
                <span className="sr-only">Flag</span>
                <select name="flag" defaultValue="" aria-label="Flag">
                  <option value="">No flag</option>
                  {flags.map((f) => (
                    <option key={f.color} value={f.color}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
            </FinanceForm>
            <FinanceForm budgetId={budgetId} command={{ type: "transaction.categorize" }} label="Categorize selected" inline>
              {hidden}
              <label>
                <span className="sr-only">Category</span>
                <select name="categoryId" required aria-label="Category">
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </FinanceForm>
          </>
        )}
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Transactions, scrolls sideways" tabIndex={0}>
        <table className="ledger register-all min-w-max">
          <thead>
            <tr>
              <th scope="col" className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select every transaction on this page"
                  checked={all}
                  onChange={() =>
                    setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                />
              </th>
              <th scope="col">Date</th>
              <th scope="col">Account</th>
              <th scope="col">Payee</th>
              <th scope="col">Category</th>
              <th scope="col">Flag</th>
              <th scope="col" className="num">Amount</th>
              <th scope="col">Cleared</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="register-row"
                data-selected={selected.has(r.id) ? "" : undefined}
                data-unapproved={r.unapprovedEntryId ? "" : undefined}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.payee || "transaction"} on ${r.date}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="text-num font-normal text-ink-2">{r.date}</td>
                <td>
                  <Link className="underline-offset-2 hover:underline" href={r.accountHref}>
                    {r.account}
                  </Link>
                </td>
                <td className="font-medium text-ink">
                  {r.unapprovedEntryId && (
                    <Pill tone="accent" className="mr-1.5">
                      New
                    </Pill>
                  )}
                  {r.payee || "—"}
                  {r.memo && <span className="ledger-sub">{r.memo}</span>}
                  {r.unapprovedEntryId && (
                    <span className="mt-1 block">
                      <ProviderAction
                        command={{ type: "entry.approve", entryId: r.unapprovedEntryId }}
                        label="Approve"
                        busyLabel="Approving…"
                        secondary
                      />
                    </span>
                  )}
                </td>
                <td className="text-ink-2">{r.category}</td>
                <td>
                  {r.flag ? (
                    <span className="inline-flex items-center gap-1.5 text-meta">
                      <span className="flag-dot" data-flag={r.flag} aria-hidden />
                      {r.flagLabel}
                    </span>
                  ) : (
                    <span className="sr-only">None</span>
                  )}
                </td>
                <td className={`num ${r.amount.startsWith("-") ? "text-negative" : "text-ink"}`}>
                  <Amount>{r.amount}</Amount>
                </td>
                <td className="text-caps uppercase text-ink-3">
                  {r.cleared ? "Cleared" : "Uncleared"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
