"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { phonePage } from "@/infrastructure/device";

/**
 * Shows the page only if it is one of the phone areas. It reads the path on
 * the client because the shell's layout is not re-rendered when the phone
 * moves between pages.
 */
export function PhoneGate({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) {
  return phonePage(usePathname()) ? children : fallback;
}
