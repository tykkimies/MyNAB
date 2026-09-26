import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { DrawerKeys } from "./drawer-keys";

/**
 * For a <details> row whose body should be the drawer on desktop (a register
 * row, a saved rule): pinned to the right edge over the list, which keeps its
 * full width. Below the desktop breakpoint the body opens in place. Give the
 * rows one shared `name` so opening one closes the other.
 */
export const DETAILS_DRAWER =
  "lg:fixed lg:bottom-0 lg:right-0 lg:top-16 lg:z-30 lg:m-0 lg:w-[380px] lg:overflow-y-auto lg:overscroll-contain lg:rounded-none lg:border-l lg:border-t-0 lg:border-border-warm lg:bg-surface-card lg:p-space-lg lg:shadow-2xl motion-safe:lg:animate-drawer-in";

/**
 * The inspector drawer from the Stitch "Unified Ledger & Drawer" screens: a
 * non-modal panel pinned to the right edge that overlays the workspace
 * instead of sitting in the page flow, so the table behind it keeps its full
 * width and stays readable and scrollable. There is no scrim.
 *
 * Whether it is open is part of the URL (for example `?inspect=` on Budget),
 * so it survives a reload, works without JavaScript, and closes with a plain
 * link. With JavaScript, Escape closes it too and focus moves to its heading
 * when it opens. Below the desktop breakpoint it becomes a bottom sheet.
 */
export function Drawer({
  headingId,
  title,
  eyebrow,
  closeHref,
  footer,
  className = "",
  children,
}: {
  headingId: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  closeHref: string;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={`drawer fixed inset-x-0 bottom-0 z-30 flex max-h-[85vh] flex-col rounded-t-xl border-t border-border-warm bg-surface-card shadow-2xl motion-safe:animate-drawer-in lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-16 lg:max-h-none lg:w-[380px] lg:rounded-none lg:border-l lg:border-t-0 ${className}`}
    >
      <DrawerKeys closeHref={closeHref} headingId={headingId} />
      <header className="flex shrink-0 items-start justify-between gap-space-sm border-b border-border-warm px-space-lg py-space-md">
        <div className="flex min-w-0 flex-col">
          {eyebrow && (
            <span className="font-label-caps text-label-caps uppercase text-text-tertiary">
              {eyebrow}
            </span>
          )}
          <h2
            id={headingId}
            tabIndex={-1}
            className="truncate font-headline-md text-headline-md text-text-primary outline-none"
          >
            {title}
          </h2>
        </div>
        <Link
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-label-sm text-label-sm text-text-secondary transition-colors hover:bg-surface-container hover:text-text-primary"
          href={closeHref}
          scroll={false}
        >
          <X size={14} aria-hidden />
          Close
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-space-lg py-space-md">
        {children}
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-border-warm bg-canvas-paper px-space-lg py-space-md">
          {footer}
        </footer>
      )}
    </section>
  );
}
