"use client";

import { useState } from "react";
import Link from "next/link";
import { Amount } from "@/components/amount";
import { CategoryAvailabilityPicker, type AvailableCategory } from "@/components/category-availability-picker";
import { FinanceForm } from "@/components/finance-form";
import type { PhoneTxn } from "@/components/phone/register";
import { formatUSD, money } from "@/domain/money";

export function PhoneBulkCategorize({
  budgetId,
  rows,
  categories,
  doneHref,
}: {
  budgetId: string;
  rows: PhoneTxn[];
  categories: AvailableCategory[];
  doneHref: string;
}) {
  const eligible = rows.filter((row) => row.canCategorize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const picked = eligible.filter((row) => selected.has(row.id));
  const all = eligible.length > 0 && picked.length === eligible.length;
  const total = picked.reduce((sum, row) => sum + row.amount, 0n);
  return (
    <section className="surface mt-3 rounded-xl p-4" aria-label="Categorize transactions">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Categorize transactions</h2>
        <Link className="btn btn-ghost" href={doneHref} scroll={false}>Done</Link>
      </div>
      <p className="mt-1 text-meta text-ink-2">Select expenses, then choose one category for all of them.</p>
      <label className="mt-3 flex min-h-11 items-center gap-3 border-y border-hairline py-2 text-table text-ink">
        <input
          type="checkbox"
          checked={all}
          onChange={() => setSelected(all ? new Set() : new Set(eligible.map((row) => row.id)))}
          aria-label="Select all categorisable transactions on this page"
        />
        Select all on this page
      </label>
      <ul className="max-h-[45dvh] overflow-y-auto">
        {eligible.map((row) => (
          <li key={row.id} className="border-b border-hairline last:border-b-0">
            <label className="flex min-h-14 items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={selected.has(row.id)}
                onChange={() => setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(row.id)) next.delete(row.id);
                  else next.add(row.id);
                  return next;
                })}
                aria-label={`Select ${row.payee || "transaction"} ${formatUSD(money(row.amount))}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-table font-medium text-ink">{row.payee || "No payee"}</span>
                <span className={`text-meta ${row.needsCategory ? "text-warning" : "text-ink-3"}`}>
                  {row.needsCategory ? "Category needed" : row.sub}
                </span>
              </span>
              <span className="shrink-0 text-num text-table text-ink"><Amount>{formatUSD(money(row.amount))}</Amount></span>
            </label>
          </li>
        ))}
      </ul>
      {eligible.length === 0 && <p className="py-5 text-table text-ink-2">No categorisable transactions on this page.</p>}
      {picked.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-4">
          <p className="mb-3 text-label text-ink">{picked.length} selected · {formatUSD(money(-total))} spending</p>
          <FinanceForm
            budgetId={budgetId}
            command={{ type: "transaction.categorize" }}
            label={`Categorize ${picked.length}`}
            submitDisabled={!categoryId}
            onSaved={() => { setSelected(new Set()); setCategoryId(""); }}
          >
            {picked.map((row) => <input key={row.id} type="hidden" name="ids" value={row.id} />)}
            <CategoryAvailabilityPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          </FinanceForm>
        </div>
      )}
    </section>
  );
}
