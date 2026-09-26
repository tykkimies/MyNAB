import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[22.5rem] flex-col items-start justify-center gap-3 bg-canvas px-gutter">
      <h1 className="text-page-title text-ink">We couldn’t find that page.</h1>
      <Link className="btn btn-primary" href="/budget">
        Return to your budget
      </Link>
    </main>
  );
}
