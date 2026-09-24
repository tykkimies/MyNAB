"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-start justify-center gap-space-md bg-canvas-paper px-gutter">
      <h1 className="font-headline-lg text-headline-lg text-text-primary">
        Something needs a moment.
      </h1>
      <p className="font-body-md text-body-md leading-relaxed text-text-secondary">
        Your workspace is temporarily unavailable. Please try again.
      </p>
      <button
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary-container px-space-lg font-label-sm text-label-sm font-semibold text-on-primary transition-colors hover:brightness-110"
        onClick={reset}
      >
        Try again
      </button>
    </main>
  );
}
