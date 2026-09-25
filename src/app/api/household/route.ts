import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/application/auth";
import { FinanceError } from "@/application/finance";
import {
  addPerson,
  changeOwnPassphrase,
  resetPersonPassphrase,
  sharePlan,
  unsharePlan,
} from "@/application/household";
import { appPath } from "@/infrastructure/app-path";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";

/** People, plan sharing and passphrases, from plain form posts. */
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
    const field = (name: string) => String(form.get(name) ?? "");
    switch (field("intent")) {
      case "add-person":
        await addPerson(user.userId, field("username"), field("passphrase"));
        return back("/household?saved=person");
      case "reset-passphrase":
        await resetPersonPassphrase(user.userId, field("userId"), field("passphrase"));
        return back("/household?saved=reset");
      case "share":
        await sharePlan(user.userId, field("budgetId"), field("userId"));
        return back("/household?saved=shared");
      case "unshare":
        await unsharePlan(user.userId, field("budgetId"), field("userId"));
        return back("/household?saved=unshared");
      case "change-own":
        await changeOwnPassphrase(user.userId, field("current"), field("passphrase"));
        // Every session, including this one, has ended.
        return back("/login");
      default:
        return new Response("Unknown household action.", { status: 400 });
    }
  } catch (error) {
    if (error instanceof FinanceError)
      return back(`/household?error=${encodeURIComponent(error.message)}`);
    logEvent("request_failed");
    return new Response("Household settings are temporarily unavailable.", {
      status: 503,
    });
  }
}
