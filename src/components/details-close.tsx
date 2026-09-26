"use client";

import { X } from "lucide-react";

/**
 * Closes the <details> it sits in. Used where a register row's detail is shown
 * as the side drawer: the row's own summary still toggles it, and this gives
 * the drawer a visible Close like every other drawer.
 */
export function DetailsClose() {
  return (
    <button
      type="button"
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-label-sm text-label-sm text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
      onClick={(event) => {
        const details = event.currentTarget.closest("details");
        if (details) {
          details.open = false;
          details.querySelector("summary")?.focus();
        }
      }}
    >
      <X size={14} aria-hidden />
      Close
    </button>
  );
}
