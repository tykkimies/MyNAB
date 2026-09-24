import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-start justify-center gap-space-md bg-canvas-paper px-gutter">
      <h1 className="font-headline-lg text-headline-lg text-text-primary">
        We couldn’t find that page.
      </h1>
      <Link
        className="font-body-md text-body-md font-semibold text-secondary underline underline-offset-2"
        href="/budget"
      >
        Return to your budget
      </Link>
    </main>
  );
}
