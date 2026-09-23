import type { Config } from "./config";
export function isAllowedMutation(headers: Headers, origin: string): boolean {
  return (
    headers.get("origin") === origin &&
    headers.get("sec-fetch-site") !== "cross-site"
  );
}
export function sessionCookie(config: Pick<Config, "APP_ORIGIN">) {
  const secure = config.APP_ORIGIN.startsWith("https:");
  return {
    name: secure ? "__Host-mynab-session" : "mynab-session",
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
  };
}
export function securityHeaders(
  nonce: string,
  development: boolean,
  https: boolean,
): Record<string, string> {
  return {
    "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'${development ? " ws: wss:" : ""}; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "private, no-store, max-age=0",
    ...(https ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}
export async function readLoginForm(
  request: Request,
): Promise<URLSearchParams> {
  if (
    request.headers.get("content-type")?.split(";")[0] !==
    "application/x-www-form-urlencoded"
  )
    throw new Error("Invalid form");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid form");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      throw new Error("Form too large");
    }
    chunks.push(value);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
