"use client";

import { useRef, useState } from "react";
import { Popover } from "@/components/ui/popover";
import { formatUSD, money } from "@/domain/money";

export type AvailableCategory = {
  id: string;
  name: string;
  group: string;
  available: string;
};

/** A budget-aware category choice shared by desktop and phone bulk editing. */
export function CategoryAvailabilityPicker({
  categories,
  value,
  onChange,
}: {
  categories: AvailableCategory[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const chosen = categories.find((category) => category.id === value);
  const visible = categories.filter((category) =>
    `${category.group} ${category.name}`.toLowerCase().includes(search.toLowerCase()),
  );
  const groups = [...new Set(visible.map((category) => category.group))];
  return (
    <div ref={ref} className="min-w-56">
      <input type="hidden" name="categoryId" value={value} />
      <Popover
        summary={chosen ? chosen.name : "Choose category"}
        label="Choose category and see available money"
        className="category-availability-popover"
        panelClassName="category-availability-panel"
        summaryClassName="btn btn-secondary min-h-11 w-full justify-between"
      >
        <label className="block text-meta text-ink-2">
          Search categories
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Category or group"
            className="mt-1 w-full"
          />
        </label>
        <p className="mt-2 text-meta text-ink-3">Available in this month’s budget</p>
        <div className="mt-2 max-h-72 overflow-y-auto">
          {groups.map((group) => (
            <div key={group}>
              <h3 className="px-2 py-2 text-meta font-semibold text-ink-2">{group}</h3>
              {visible.filter((category) => category.group === group).map((category) => {
                const available = BigInt(category.available);
                return (
                  <button
                    key={category.id}
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-4 rounded-lg px-2 py-2 text-left hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-accent"
                    aria-pressed={value === category.id}
                    onClick={() => {
                      onChange(category.id);
                      ref.current?.querySelector("details")?.removeAttribute("open");
                    }}
                  >
                    <span className="text-table text-ink">{category.name}</span>
                    <span className={`shrink-0 text-num text-table ${available < 0n ? "text-negative" : available > 0n ? "text-positive" : "text-ink-3"}`}>
                      {formatUSD(money(available))}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {!visible.length && <p className="px-2 py-4 text-meta text-ink-2">No matching categories.</p>}
        </div>
      </Popover>
    </div>
  );
}
