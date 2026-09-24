import { getDb } from "@/infrastructure/db";
import { logEvent } from "@/infrastructure/log";
export const dynamic = "force-dynamic";
/**
 * Every migration this build requires, in order. Readiness stays 503 until the
 * database reports exactly these as finished, so a half-migrated deployment is
 * never served traffic. Add each new migration here.
 */
export const expectedMigrations = [
  "202609220001_foundation",
  "202609230001_finance",
  "202609230002_trigger_dispatch",
  "202609230003_provider_ingestion",
  "202609230004_sync_lock",
  "202609230005_link_start_date",
  "202609230006_sync_integrity",
  "202609230007_category_targets",
  "202609230008_target_cadence",
  "202609230009_debt_terms",
  "202609230010_effective_dating",
  "202609240001_schedules",
];
export async function GET() {
  try {
    const rows = await getDb().$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name`;
    if (
      rows.length !== expectedMigrations.length ||
      rows.some(
        (row, i) =>
          row.migration_name !== expectedMigrations[i] || !row.finished_at,
      )
    )
      throw new Error("Schema mismatch");
    await getDb().installation.count();
    return Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    logEvent("database_unavailable");
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
