import { appPath } from "@/infrastructure/app-path";
import { NextRequest, NextResponse } from "next/server";
import { logout } from "@/application/auth";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isAllowedMutation(request.headers, config.APP_ORIGIN))
    return new Response("Forbidden", { status: 403 });
  const cookie = sessionCookie(config);
  try {
    await logout(request.cookies.get(cookie.name)?.value);
  } catch {
    logEvent("request_failed");
    return new Response("Sign out is temporarily unavailable.", {
      status: 503,
    });
  }
  const response = NextResponse.redirect(
    new URL(appPath("/login"), config.APP_ORIGIN),
    303,
  );
  response.cookies.set(cookie.name, "", {
    ...cookie,
    expires: new Date(0),
    maxAge: 0,
  });
  return response;
}
