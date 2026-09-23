import { getDb } from "@/infrastructure/db";
import { logEvent } from "@/infrastructure/log";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const rows = await getDb().$queryRaw<
      { migration_name: string; finished_at: Date | null }[]
    >`SELECT migration_name, finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL ORDER BY migration_name`;
    if (
      rows.length !== 3 ||
      !rows[2].finished_at ||
      rows[2].migration_name !== "202609230002_trigger_dispatch" ||
      !rows[0].finished_at ||
      !rows[1].finished_at ||
      rows[1].migration_name !== "202609230001_finance" ||
      rows[0].migration_name !== "202609220001_foundation"
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
