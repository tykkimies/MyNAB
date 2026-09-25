"use client";
import { useState } from "react";
import Link from "next/link";
import { FinanceForm } from "@/components/finance-form";
import { Amount } from "@/components/amount";

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
        className="flex flex-wrap items-end gap-space-md border-b border-border-warm px-space-lg py-space-md"
        aria-label="Bulk actions"
        role="group"
      >
        <span className="font-body-sm text-body-sm text-text-secondary" aria-live="polite">
          {selected.size} selected
        </span>
        {selected.size > 0 && (
          <>
            <FinanceForm budgetId={budgetId} command={{ type: "transaction.flag" }} label="Flag selected" inline>
              {hidden}
              <label className="flex flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                Flag
                <select name="flag" defaultValue="">
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
              <label className="flex flex-col gap-1 font-body-sm text-body-sm text-text-secondary">
                Category
                <select name="categoryId" required>
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
        <table className="register-all w-full min-w-max border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-border-warm text-left text-text-secondary">
              <th scope="col" className="px-space-md py-space-xs">
                <input
                  type="checkbox"
                  aria-label="Select every transaction on this page"
                  checked={all}
                  onChange={() =>
                    setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))
                  }
                />
              </th>
              <th scope="col" className="px-space-sm py-space-xs font-semibold">Date</th>
              <th scope="col" className="px-space-sm py-space-xs font-semibold">Account</th>
              <th scope="col" className="px-space-sm py-space-xs font-semibold">Payee</th>
              <th scope="col" className="px-space-sm py-space-xs font-semibold">Category</th>
              <th scope="col" className="px-space-sm py-space-xs font-semibold">Flag</th>
              <th scope="col" className="px-space-sm py-space-xs text-right font-semibold">Amount</th>
              <th scope="col" className="px-space-sm py-space-xs font-semibold">Cleared</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="register-row border-b border-border-warm text-text-primary">
                <td className="px-space-md py-space-xs">
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.payee || "transaction"} on ${r.date}`}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-space-sm py-space-xs tabular-nums">{r.date}</td>
                <td className="px-space-sm py-space-xs">
                  <Link className="underline-offset-2 hover:underline" href={r.accountHref}>
                    {r.account}
                  </Link>
                </td>
                <td className="px-space-sm py-space-xs">
                  {r.payee || "—"}
                  {r.memo && (
                    <span className="block text-text-tertiary">{r.memo}</span>
                  )}
                </td>
                <td className="px-space-sm py-space-xs text-text-secondary">{r.category}</td>
                <td className="px-space-sm py-space-xs">
                  {r.flag ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="flag-dot" data-flag={r.flag} aria-hidden />
                      {r.flagLabel}
                    </span>
                  ) : (
                    <span className="sr-only">None</span>
                  )}
                </td>
                <td className="px-space-sm py-space-xs text-right tabular-nums">
                  <Amount>{r.amount}</Amount>
                </td>
                <td className="px-space-sm py-space-xs text-text-secondary">
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
