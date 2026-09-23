import Link from "next/link";
export default function NotFound() {
  return (
    <main className="main">
      <h1>We couldn’t find that page.</h1>
      <Link href="/budget">Return to your budget</Link>
    </main>
  );
}
