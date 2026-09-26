"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[22.5rem] flex-col items-start justify-center gap-3 bg-canvas px-gutter">
      <h1 className="text-page-title text-ink">Something needs a moment.</h1>
      <p className="text-body text-ink-2">
        Your workspace is temporarily unavailable. Please try again.
      </p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
