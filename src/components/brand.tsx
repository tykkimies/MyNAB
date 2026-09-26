import Link from "next/link";

/**
 * The wordmark: a small ink square and the name. `inverse` is for the navy
 * panels where ink would disappear.
 */
export function Brand({
  inverse = false,
  href = "/budget",
}: {
  inverse?: boolean;
  /** `null` renders a plain mark with nothing to focus (the login page). */
  href?: string | null;
}) {
  const mark = (
    <>
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[0.6875rem] font-semibold tracking-tight ${
          inverse ? "bg-on-accent text-accent" : "bg-ink text-canvas"
        }`}
        aria-hidden
      >
        mn
      </span>
      <span
        className={`text-[0.9375rem] font-semibold leading-none ${inverse ? "text-on-accent" : "text-ink"}`}
      >
        MyNAB
      </span>
    </>
  );
  if (href === null) return <span className="flex items-center gap-2">{mark}</span>;
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="MyNAB home">
      {mark}
    </Link>
  );
}
