import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A `<details>` whose panel floats under its summary. It works without
 * JavaScript, its open state is plain DOM (the browser suite toggles it by
 * clicking the summary), and `PopoverKeys` in the shell closes it on Escape or
 * an outside click. Marker classes the suite depends on pass through
 * `className`; the summary's accessible name is its text unless `label` is set.
 */
export function Popover({
  summary,
  label,
  className = "",
  summaryClassName = "btn btn-secondary",
  panelClassName = "",
  align = "left",
  open,
  role,
  ariaLabel,
  chevron = true,
  id,
  children,
}: {
  summary: ReactNode;
  label?: string;
  className?: string;
  summaryClassName?: string;
  panelClassName?: string;
  align?: "left" | "right";
  open?: boolean;
  role?: string;
  ariaLabel?: string;
  chevron?: boolean;
  id?: string;
  children: ReactNode;
}) {
  return (
    <details
      className={`popover ${className}`}
      data-align={align}
      open={open}
      role={role}
      aria-label={ariaLabel}
      id={id}
    >
      <summary className={summaryClassName} aria-label={label}>
        {summary}
        {chevron && (
          <ChevronDown size={14} aria-hidden className="opacity-70" />
        )}
      </summary>
      <div className={`popover-panel ${panelClassName}`}>
        <div className="phone-menu-heading">
          <span className="phone-sheet-handle" aria-hidden />
          <button type="button" data-sheet-close className="btn btn-ghost">
            Close
          </button>
        </div>
        <div className="popover-content">{children}</div>
      </div>
    </details>
  );
}
