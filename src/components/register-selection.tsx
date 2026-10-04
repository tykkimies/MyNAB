"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { FinanceForm } from "@/components/finance-form";
import {
  CategoryAvailabilityPicker,
  type AvailableCategory,
} from "@/components/category-availability-picker";

const Selection = createContext<{
  selected: Set<string>;
  toggle: (id: string) => void;
} | null>(null);

export function RegisterChecks({
  budgetId,
  flags,
  categories,
  children,
}: {
  budgetId: string;
  flags: { color: string; label: string }[];
  categories: AvailableCategory[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categoryId, setCategoryId] = useState("");
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const hidden = [...selected].map((id) => (
    <input key={id} type="hidden" name="ids" value={id} />
  ));
  return (
    <Selection.Provider value={{ selected, toggle }}>
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline bg-surface-sunken px-4 py-1.5 lg:px-6"
          role="group"
          aria-label="Bulk actions"
        >
          <span className="text-meta text-ink-2" aria-live="polite">
            {selected.size} selected
          </span>
          <FinanceForm
            budgetId={budgetId}
            command={{ type: "transaction.flag" }}
            label="Flag selected"
            inline
            onSaved={() => setSelected(new Set())}
          >
            {hidden}
            <label>
              <span className="sr-only">Flag</span>
              <select name="flag" defaultValue="" aria-label="Flag">
                <option value="">No flag</option>
                {flags.map((flag) => (
                  <option key={flag.color} value={flag.color}>
                    {flag.label}
                  </option>
                ))}
              </select>
            </label>
          </FinanceForm>
          <FinanceForm
            budgetId={budgetId}
            command={{ type: "transaction.categorize" }}
            label="Categorize selected"
            inline
            submitDisabled={!categoryId}
            onSaved={() => {
              setSelected(new Set());
              setCategoryId("");
            }}
          >
            {hidden}
            <CategoryAvailabilityPicker
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
            />
          </FinanceForm>
        </div>
      )}
      {children}
    </Selection.Provider>
  );
}

export function StopToggle({ children }: { children: ReactNode }) {
  return (
    <span
      className="mr-1.5 inline-flex"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </span>
  );
}

export function RowCheck({ id, label }: { id: string; label: string }) {
  const selection = useContext(Selection);
  if (!selection) return null;
  return (
    <input
      type="checkbox"
      className="hidden sm:inline-block"
      aria-label={label}
      checked={selection.selected.has(id)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onChange={() => selection.toggle(id)}
    />
  );
}
