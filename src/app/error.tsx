"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="main">
      <h1>Something needs a moment.</h1>
      <p>Your workspace is temporarily unavailable. Please try again.</p>
      <button className="primary-button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
