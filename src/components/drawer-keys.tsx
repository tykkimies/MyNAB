"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keyboard behaviour for the non-modal drawer: focus its heading when it opens
 * (or shows a different record), and let Escape close it. Focus is not
 * trapped, because the ledger behind it stays usable.
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
    document.getElementById(headingId)?.focus({ preventScroll: true });
  }, [headingId]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // An open popover or menu handles its own Escape first.
      if ((event.target as HTMLElement | null)?.closest("details[open]")) return;
      router.push(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return null;
}
