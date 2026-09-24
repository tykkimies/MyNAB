export function Brand() {
  return (
    <div className="flex items-center gap-space-sm">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary font-headline-md text-headline-md leading-none tracking-[-0.08em] text-on-primary"
        aria-hidden
      >
        mn
      </span>
      <span className="flex flex-col">
        <span className="font-headline-md text-headline-md leading-none text-text-primary">
          MyNAB
        </span>
        <span className="mt-1 font-label-caps text-label-caps uppercase text-text-tertiary">
          Make room for what matters
        </span>
      </span>
    </div>
  );
}
