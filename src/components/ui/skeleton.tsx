/**
 * What a route shows while its ledger is being read: the header's shape and a
 * column of rows, so nothing jumps when the real page arrives.
 */
export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div
      className="mx-auto w-full max-w-canvas px-gutter pt-4 lg:px-space-lg"
      aria-busy="true"
      aria-label="Loading"
      role="status"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="skeleton h-6 w-40" />
        <span className="skeleton h-8 w-56" />
      </div>
      <div className="mt-5 flex gap-6">
        <span className="skeleton h-12 w-40" />
        <span className="skeleton h-12 w-32" />
        <span className="skeleton h-12 w-32" />
      </div>
      <div className="surface mt-6 overflow-hidden">
        <span className="block h-8 bg-surface-sunken" />
        {Array.from({ length: rows }, (_, i) => (
          <div
            className="flex items-center gap-4 border-b border-hairline px-4 last:border-b-0"
            key={i}
          >
            <span className="skeleton my-3 h-3.5 w-1/3" />
            <span className="skeleton my-3 ml-auto h-3.5 w-16" />
            <span className="skeleton my-3 h-3.5 w-16" />
            <span className="skeleton my-3 h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
