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
      className="btn btn-ghost btn-sm shrink-0"
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
