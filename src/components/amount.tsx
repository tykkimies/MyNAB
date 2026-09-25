import type { ReactNode } from "react";

/**
 * A money figure. When Hide Amounts is on, CSS masks every `.amount` on the
 * page; the number stays in the DOM for screen readers and copy.
 */
export function Amount({ children }: { children: ReactNode }) {
  return <span className="amount">{children}</span>;
}

/** Masks a preformatted string only when it is a money figure. */
export function MaybeAmount({ value }: { value: string }) {
  return /^[-−]?\$/.test(value) ? <Amount>{value}</Amount> : <>{value}</>;
}
