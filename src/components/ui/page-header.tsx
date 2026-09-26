import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The top of every route: a functional title, optional breadcrumb and meta
 * line, and the page's controls in a toolbar on the right. It sticks under the
 * global top bar so month switchers and filters stay reachable while a long
 * ledger scrolls. A second row (tabs, filter forms) goes in `children`.
 */
export function PageHeader({
  title,
  titleId,
  breadcrumb,
  meta,
  actions,
  children,
}: {
  title: ReactNode;
  titleId?: string;
  /** Parent pages, nearest last. */
  breadcrumb?: { href: string; label: string }[];
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="flex min-h-13 flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-2 lg:px-space-lg">
        <div className="flex min-w-0 flex-col">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-1 text-meta text-ink-3"
            >
              {breadcrumb.map((crumb) => (
                <span key={crumb.href} className="flex items-center gap-1">
                  <Link
                    className="underline-offset-2 hover:text-ink hover:underline"
                    href={crumb.href}
                  >
                    {crumb.label}
                  </Link>
                  <span aria-hidden>›</span>
                </span>
              ))}
            </nav>
          )}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h1 id={titleId} className="truncate text-page-title text-ink">
              {title}
            </h1>
            {meta && <span className="text-meta text-ink-3">{meta}</span>}
          </div>
        </div>
        {actions && (
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children && (
        <div className="px-gutter pb-2 lg:px-space-lg">{children}</div>
      )}
    </header>
  );
}

/** A row of 32px controls; wraps on narrow screens. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}
