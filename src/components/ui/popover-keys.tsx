"use client";

import { useEffect } from "react";

/**
 * Closes open popovers the way a menu closes: Escape shuts the innermost open
 * one, and a click outside every open popover shuts them all. Nothing else is
 * touched, so the drawer's own Escape (which navigates) only runs once no
 * popover is open. Disclosures that are not popovers keep native behaviour.
 */
export function PopoverKeys() {
  useEffect(() => {
    const openPopovers = () =>
      Array.from(
        document.querySelectorAll<HTMLDetailsElement>("details.popover[open]"),
      );
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const open = openPopovers();
      if (!open.length) return;
      const target = event.target as HTMLElement | null;
      const innermost =
        open.reverse().find((d) => d.contains(target)) ?? open[0];
      innermost.open = false;
      innermost.querySelector("summary")?.focus();
      event.preventDefault();
    };
    const onPointer = (event: PointerEvent) => {
      if (document.documentElement.dataset.view === "phone") return;
      const target = event.target as Node | null;
      for (const popover of openPopovers())
        if (!popover.contains(target)) popover.open = false;
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  return null;
}
