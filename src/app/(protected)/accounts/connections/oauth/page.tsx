import Link from "next/link";
import { ResumeLink } from "@/components/provider-link";
import { requireUser } from "@/application/session";
import { PageHeader } from "@/components/ui/page-header";

/** Where an OAuth institution returns the browser (PLAID_REDIRECT_URI). */
export default async function OAuthReturn() {
  await requireUser();
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[
          { href: "/accounts", label: "Accounts" },
          { href: "/accounts/connections", label: "Bank sync" },
        ]}
        title="Returning from your bank"
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <div className="surface mt-4 max-w-[30rem] p-4">
          <ResumeLink />
          <Link className="link mt-3 inline-block" href="/accounts/connections">
            Back to bank sync
          </Link>
        </div>
      </div>
    </main>
  );
}
