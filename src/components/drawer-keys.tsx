"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keyboard behaviour for the non-modal drawer: focus its heading when it opens
 * (or shows a different record), and let Escape close it. Focus is not
 * trapped, because the ledger behind it stays usable. An open popover or
 * disclosure takes Escape first (PopoverKeys closes it), so the drawer only
 * closes once nothing floats above it.
 */
export function DrawerKeys({
  closeHref,
  headingId,
}: {
  closeHref: string;
  headingId: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (document.documentElement.dataset.view === "phone") return;
    document.getElementById(headingId)?.focus({ preventScroll: true });
  }, [headingId]);
  // Below the tablet breakpoint the drawer is a bottom sheet over the page, so
  // the shell pads by its height (--sheet-h) to let the last rows scroll above it.
  useEffect(() => {
    if (document.documentElement.dataset.view === "phone") return;
    const sheet = document.getElementById(headingId)?.closest(".drawer");
    if (!sheet) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty(
        "--sheet-h",
        `${sheet.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(sheet);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--sheet-h");
    };
  }, [headingId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.documentElement.dataset.view === "phone") return;
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("details.popover[open]")) return;
      if ((event.target as HTMLElement | null)?.closest("details[open]")) return;
      router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return null;
}
