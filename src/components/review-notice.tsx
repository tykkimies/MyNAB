import Link from "next/link";
import { unapprovedImports } from "@/application/finance-page";

export async function ReviewNotice() {
  const { all } = await unapprovedImports();
  if (!all.length) return null;
  return (
    <Link href="/accounts/register?review=unapproved" className="review-notice">
      <strong>
        {all.length} new {all.length === 1 ? "transaction" : "transactions"} to
        review
      </strong>
      <span>Review transactions →</span>
    </Link>
  );
}
