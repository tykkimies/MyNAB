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
  "202609240002_schedule_revisions",
  "202609240003_automation_rules",
  "202609240004_transaction_preferences",
  "202609250001_recurring_dismissals",
  "202609250002_debt_minimum_rules",
  "202609250003_jobs",
  "202609250004_import_batches",
  "202609250005_ynab_alignment",
  "202609250006_scheduled_entry",
  "202609250007_target_snooze",
  "202609250008_category_organization",
  "202609250009_focused_views",
  "202609250010_money_moves",
  "202609250011_transaction_flags",
  "202609250012_household",
  "202609250013_member_role",
  "202609250014_undo_moves",
  "202609250015_twice_monthly",
  "202609250016_target_due_day",
  "202609250017_date_format",
  "202609250018_account_delete",
  "202609260001_card_payment_schedule",
  "202609260002_deferred_interest",
  "202609260003_debt_plan",
  "202609260004_debt_plan_tracking",
  "202609270001_debt_reminders",
  "202609270002_debt_plan_pins",
  "202609280001_simplefin_provider",
  "202609280002_promo_ends_on",
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
