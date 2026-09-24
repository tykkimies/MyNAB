/**
 * `inverse` is for the login story panel, which sits on the forest gradient:
 * the default mark is near-black forest on paper and would disappear there.
 */
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <div className="flex items-center gap-space-sm">
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-headline-md text-headline-md leading-none tracking-[-0.08em] ${
          inverse
            ? "bg-accent-mint text-hero-via"
            : "bg-primary text-on-primary"
        }`}
        aria-hidden
      >
        mn
      </span>
      <span className="flex flex-col">
        <span
          className={`font-headline-md text-headline-md leading-none ${inverse ? "text-hero-text" : "text-text-primary"}`}
        >
          MyNAB
        </span>
        <span
          className={`mt-1 font-label-caps text-label-caps uppercase ${inverse ? "text-hero-muted" : "text-text-tertiary"}`}
        >
          Make room for what matters
        </span>
      </span>
    </div>
  );
}
