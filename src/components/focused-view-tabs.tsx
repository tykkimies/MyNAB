"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function FocusedViewTabs({ budgetId, month, selected, explicit, views }: {
  budgetId: string;
  month: string;
  selected: string;
  explicit: boolean;
  views: { id: string; label: string }[];
}) {
  const router = useRouter();
  const key = `mynab.focused-view.${budgetId}`;
  useEffect(() => {
    if (explicit) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved && saved !== "ALL" && views.some((view) => view.id === saved))
        router.replace(`/budget?month=${month}&view=${encodeURIComponent(saved)}`, { scroll: false });
    } catch { /* Storage can be disabled; the All view still works. */ }
  }, [explicit, key, month, router, views]);
  return (
    <nav aria-label="Focused budget views" className="mt-space-lg flex gap-space-xs overflow-x-auto pb-space-xs">
      {views.map((view) => (
        <Link
          key={view.id}
          className={`shrink-0 rounded-md border px-space-md py-space-sm font-label-sm text-label-sm ${selected === view.id ? "border-secondary bg-surface-container-low font-semibold text-text-primary" : "border-border-warm text-text-secondary hover:bg-surface-container-low"}`}
          aria-current={selected === view.id ? "page" : undefined}
          href={`/budget?month=${month}&view=${encodeURIComponent(view.id)}`}
          scroll={false}
          onClick={() => { try { localStorage.setItem(key, view.id); } catch {} }}
        >{view.label}</Link>
      ))}
    </nav>
  );
}
