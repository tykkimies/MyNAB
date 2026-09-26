import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover } from "./popover";

/**
 * Explanation on demand: a small "?" that opens the sentence or two that used
 * to sit inline. Keeps the page quiet without losing the guidance.
 */
export function Help({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <Popover
      summary={<CircleHelp size={16} aria-hidden />}
      label={label}
      summaryClassName="icon-button h-6 w-6 min-h-6 text-ink-3"
      panelClassName="max-w-80 text-table text-ink-2 leading-relaxed"
      align={align}
      chevron={false}
    >
      {children}
    </Popover>
  );
}
