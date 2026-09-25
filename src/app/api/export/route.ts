import { NextRequest } from "next/server";
import { authenticate } from "@/application/auth";
import { activeBudget, PLAN_COOKIE } from "@/application/plans";
import { FinanceError } from "@/application/finance";
import { exportCsv, exportJson } from "@/application/exports";
import { getConfig } from "@/infrastructure/config";
import { sessionCookie } from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";

/** Download a portable export. Read-only; the session decides whose data. */
export async function GET(request: NextRequest) {
  const config = getConfig();
  try {
    const user = await authenticate(
      request.cookies.get(sessionCookie(config).name)?.value,
    );
    if (!user) return new Response("Sign in again.", { status: 401 });
    const budget = await activeBudget(
      user.userId,
      request.cookies.get(PLAN_COOKIE)?.value,
    );
    if (!budget) return new Response("Budget unavailable.", { status: 400 });
    const format = request.nextUrl.searchParams.get("format");
    const table = request.nextUrl.searchParams.get("table") ?? "";
    const stamp = new Date().toISOString().slice(0, 10);
    const [body, type, name] =
      format === "csv"
        ? [
            await exportCsv(user.userId, budget.id, table),
            "text/csv; charset=utf-8",
            `mynab-${table}-${stamp}.csv`,
          ]
        : format === "json"
          ? [
              await exportJson(user.userId, budget.id),
              "application/json; charset=utf-8",
              `mynab-export-${stamp}.json`,
            ]
          : [null, "", ""];
    if (body === null) return new Response("Unknown format.", { status: 400 });
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof FinanceError)
      return new Response(error.message, { status: 400 });
    logEvent("request_failed");
    return new Response("Export failed. Try again.", { status: 503 });
  }
}
