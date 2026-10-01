import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/application/auth";
import { FinanceError } from "@/application/finance";
import {
  createPlan,
  PLAN_COOKIE,
  activeBudget,
  archivePlan,
  purgeEmptyPlan,
  renamePlan,
  restorePlan,
  selectPlan,
  updatePlanSettings,
} from "@/application/plans";
import { freshStart } from "@/application/fresh-start";
import { appPath } from "@/infrastructure/app-path";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";

/** Manage plans from a plain form post. */
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isAllowedMutation(request.headers, config.APP_ORIGIN))
    return new Response("Forbidden", { status: 403 });
  // A fetch from ActionForm gets the next page as JSON and updates in place;
  // a plain form post is redirected as before.
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const back = (path: string) =>
    wantsJson
      ? NextResponse.json({ redirect: path })
      : NextResponse.redirect(new URL(appPath(path), config.APP_ORIGIN), 303);
  try {
    const user = await authenticate(
      request.cookies.get(sessionCookie(config).name)?.value,
    );
    if (!user) return back("/login");
    const form = await request.formData();
    const intent = String(form.get("intent") ?? "");
    const budgetId = String(form.get("budgetId") ?? "");
    const name = String(form.get("name") ?? "");
    let open: string | null = null;
    let destination = "/budget";
    if (intent === "fresh-start") {
      if (form.get("confirm") !== "on")
        return back("/plans?error=confirm");
      open = (await freshStart(user.userId, budgetId)).id;
      destination = "/plans?fresh=done";
    } else if (intent === "archive") {
      if (form.get("confirm") !== "on")
        return back("/plans?error=confirm-archive");
      await archivePlan(user.userId, budgetId);
      open = (await activeBudget(user.userId, request.cookies.get(PLAN_COOKIE)?.value))?.id ?? null;
      destination = "/plans?saved=archived";
    } else if (intent === "restore") {
      open = await restorePlan(user.userId, budgetId);
      destination = "/plans?saved=restored";
    } else if (intent === "purge") {
      if (form.get("confirm") !== "on")
        return back("/plans?error=confirm-purge");
      await purgeEmptyPlan(user.userId, budgetId);
      open = (await activeBudget(user.userId, request.cookies.get(PLAN_COOKIE)?.value))?.id ?? null;
      destination = "/plans?saved=purged";
    } else if (intent === "create")
      open = (
        await createPlan(
          user.userId,
          name,
          request.cookies.get(PLAN_COOKIE)?.value,
        )
      ).id;
    else if (intent === "settings") {
      await updatePlanSettings(user.userId, budgetId, String(form.get("dateFormat") ?? ""));
      return back("/plans?saved=settings");
    } else if (intent === "rename") {
      await renamePlan(user.userId, budgetId, name);
      return back("/plans?saved=renamed");
    } else if (intent === "select") open = await selectPlan(user.userId, budgetId);
    else return new Response("Unknown plan action.", { status: 400 });
    const response = back(destination);
    if (open) {
      response.cookies.set(PLAN_COOKIE, open, {
        httpOnly: true,
        secure: config.APP_ORIGIN.startsWith("https:"),
        sameSite: "lax",
        path: "/",
        maxAge: 31536000,
      });
    } else if (intent === "archive" || intent === "purge") {
      response.cookies.delete(PLAN_COOKIE);
    }
    return response;
  } catch (error) {
    if (error instanceof FinanceError)
      return back(`/plans?error=${encodeURIComponent(error.message)}`);
    logEvent("request_failed");
    return new Response("Plans are temporarily unavailable.", { status: 503 });
  }
}
