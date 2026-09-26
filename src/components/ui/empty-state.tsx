import type { ReactNode } from "react";

/** Where a list would be: what is missing, why, and the one thing to do. */
export function EmptyState({
  title,
  children,
  action,
  className = "",
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-start gap-2 px-4 py-8 lg:px-6 ${className}`}
    >
      <p className="text-body font-medium text-ink">{title}</p>
      {children && (
        <p className="max-w-prose text-table text-ink-2">{children}</p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
