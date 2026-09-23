import { appPath } from "@/infrastructure/app-path";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, login } from "@/application/auth";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  readLoginForm,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isAllowedMutation(request.headers, config.APP_ORIGIN))
    return new Response("Forbidden", { status: 403 });
  let form: URLSearchParams;
  try {
    form = await readLoginForm(request);
  } catch {
    return new Response("Invalid form", { status: 400 });
  }
  const cookie = sessionCookie(config);
  try {
    const session = await login(
      form.get("username") ?? "",
      form.get("password") ?? "",
      new Date(),
      request.cookies.get(cookie.name)?.value,
    );
    const response = NextResponse.redirect(
      new URL(appPath("/budget"), config.APP_ORIGIN),
      303,
    );
    response.cookies.set(cookie.name, session.token, {
      ...cookie,
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      const response = NextResponse.redirect(
        new URL(
          appPath(
            `/login?error=${error.code === "throttled" ? "throttled" : "invalid"}`,
          ),
          config.APP_ORIGIN,
        ),
        303,
      );
      if (error.code === "throttled")
        response.headers.set("Retry-After", "900");
      return response;
    }
    logEvent("request_failed");
    return new Response("Sign in is temporarily unavailable.", { status: 503 });
  }
}
