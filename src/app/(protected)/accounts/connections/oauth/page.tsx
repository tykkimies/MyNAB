import Link from "next/link";
import { ResumeLink } from "@/components/provider-link";
import { requireUser } from "@/application/session";

/** Where an OAuth institution returns the browser (PLAID_REDIRECT_URI). */
export default async function OAuthReturn() {
  await requireUser();
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg"
    >
      <h1 className="font-headline-lg text-headline-lg text-text-primary">
        Returning from your bank
      </h1>
      <div className="mt-space-md">
        <ResumeLink />
      </div>
      <Link
        className="mt-space-md inline-block font-semibold text-secondary underline underline-offset-2"
        href="/accounts/connections"
      >
        Back to bank sync
      </Link>
    </main>
  );
}
