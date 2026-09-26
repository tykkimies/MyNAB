import { redirect } from "next/navigation";

/** Goals became Targets, as in YNAB; old links still land in the right place. */
export default async function Goals({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  redirect(
    month && /^\d{4}-\d{2}$/.test(month)
      ? `/targets?month=${month}`
      : "/targets",
  );
}
