import { NextResponse, type NextRequest } from "next/server";
import { securityHeaders } from "@/infrastructure/http-security";
import {
  DEVICE_HEADER,
  VIEW_COOKIE,
  VIEW_HEADER,
  phoneDevice,
  resolveView,
} from "@/infrastructure/device";
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const headers = securityHeaders(
    nonce,
    process.env.NODE_ENV === "development",
    process.env.APP_ORIGIN?.startsWith("https:") ?? false,
  );
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Phone or desktop presentation; pages read these through view.ts. The
  // incoming values are overwritten so a client cannot choose them directly.
  const device = {
    userAgent: request.headers.get("user-agent"),
    chMobile: request.headers.get("sec-ch-ua-mobile"),
  };
  requestHeaders.set(
    VIEW_HEADER,
    resolveView({ ...device, cookie: request.cookies.get(VIEW_COOKIE)?.value }),
  );
  requestHeaders.set(DEVICE_HEADER, phoneDevice(device) ? "phone" : "desktop");
  requestHeaders.set(
    "Content-Security-Policy",
    headers["Content-Security-Policy"],
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [name, value] of Object.entries(headers))
    response.headers.set(name, value);
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
