import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/application/auth";
import { FinanceError } from "@/application/finance";
import {
  createPlan,
  PLAN_COOKIE,
  renamePlan,
  selectPlan,
} from "@/application/plans";
import { freshStart } from "@/application/fresh-start";
import { appPath } from "@/infrastructure/app-path";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";

/** Create, rename or open a plan from a plain form post. */
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isAllowedMutation(request.headers, config.APP_ORIGIN))
    return new Response("Forbidden", { status: 403 });
  const back = (path: string) =>
    NextResponse.redirect(new URL(appPath(path), config.APP_ORIGIN), 303);
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
    } else if (intent === "create")
      open = (
        await createPlan(
          user.userId,
          name,
          request.cookies.get(PLAN_COOKIE)?.value,
        )
      ).id;
    else if (intent === "rename") {
      await renamePlan(user.userId, budgetId, name);
      return back("/plans?saved=renamed");
    } else if (intent === "select") open = await selectPlan(user.userId, budgetId);
    else return new Response("Unknown plan action.", { status: 400 });
    const response = back(destination);
    response.cookies.set(PLAN_COOKIE, open, {
      httpOnly: true,
      secure: config.APP_ORIGIN.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 31536000,
    });
    return response;
  } catch (error) {
    if (error instanceof FinanceError)
      return back(`/plans?error=${encodeURIComponent(error.message)}`);
    logEvent("request_failed");
    return new Response("Plans are temporarily unavailable.", { status: 503 });
  }
}
