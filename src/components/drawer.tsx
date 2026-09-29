import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { DrawerKeys } from "./drawer-keys";

/**
 * For a <details> row whose body should be the drawer (a register row, a saved
 * rule): pinned to the right edge over the list, which keeps its full width.
 * Below the tablet breakpoint the body opens in place. Give the rows one
 * shared `name` so opening one closes the other.
 */
export const DETAILS_DRAWER =
  "md:fixed md:bottom-(--tabbar-h) md:right-0 md:top-(--topbar-h) md:z-30 md:m-0 md:w-[400px] xl:w-[440px] md:overflow-y-auto md:overscroll-contain md:rounded-none md:border-l md:border-t-0 md:border-hairline md:bg-surface md:p-5 md:shadow-drawer motion-safe:md:animate-drawer-in";

/**
 * The inspector drawer: a non-modal panel pinned to the right edge that
 * overlays the workspace instead of sitting in the page flow, so the table
 * behind it keeps its full width and stays readable and scrollable. There is
 * no scrim.
 *
 * Whether it is open is part of the URL (for example `?inspect=` on Budget),
 * so it survives a reload, works without JavaScript, and closes with a plain
 * link. With JavaScript, Escape closes it too and focus moves to its heading
 * when it opens. Below the tablet breakpoint it becomes a bottom sheet above
 * the tab bar. The dedicated phone shell adds modal focus/backdrop behavior,
 * a taller visual-viewport layout and animated touch dismissal via MobileSheets.
 */
export function Drawer({
  headingId,
  title,
  eyebrow,
  closeHref,
  footer,
  className = "",
  ariaLabel,
  children,
}: {
  headingId: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  closeHref: string;
  footer?: ReactNode;
  className?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-close-href={closeHref}
      aria-labelledby={ariaLabel ? undefined : headingId}
      aria-label={ariaLabel}
      className={`drawer fixed inset-x-0 bottom-0 z-50 flex max-h-[75vh] flex-col rounded-t-xl border-t border-hairline bg-surface shadow-sheet motion-safe:animate-sheet-in md:inset-x-auto md:bottom-(--tabbar-h) md:right-0 md:top-(--topbar-h) md:z-30 md:max-h-none md:w-[400px] md:rounded-none md:border-l md:border-t-0 md:shadow-drawer motion-safe:md:animate-drawer-in xl:w-[440px] ${className}`}
    >
      <DrawerKeys closeHref={closeHref} headingId={headingId} />
      <span
        className="phone-sheet-handle mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-hairline-strong md:hidden"
        aria-hidden
      />
      <header className="flex shrink-0 items-start justify-between gap-2 border-b border-hairline px-5 py-3">
        <div className="flex min-w-0 flex-col">
          {eyebrow && (
            <span className="truncate text-caps uppercase text-ink-3">
              {eyebrow}
            </span>
          )}
          <h2
            id={headingId}
            tabIndex={-1}
            className="truncate text-drawer-title text-ink outline-none"
          >
            {title}
          </h2>
        </div>
        <Link
          data-sheet-close
          className="btn btn-ghost btn-sm -mr-2 gap-1"
          href={closeHref}
          scroll={false}
        >
          <X size={14} aria-hidden />
          Close
        </Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        {children}
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-hairline bg-canvas px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

/** A titled block inside the drawer: caps heading, hairline, then content. */
export function DrawerSection({
  title,
  action,
  children,
  className = "",
  id,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={`mt-5 first:mt-0 ${className}`} id={id}>
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-hairline pb-1">
        <h3 className="text-caps uppercase text-ink-3">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
