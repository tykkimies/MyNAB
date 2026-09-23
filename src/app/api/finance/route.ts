import { NextRequest } from "next/server";
import { authenticate } from "@/application/auth";
import { executeFinance, FinanceError } from "@/application/finance";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";
export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isAllowedMutation(request.headers, config.APP_ORIGIN))
    return Response.json({ error: "Forbidden" }, { status: 403 });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return Response.json({ error: "JSON required" }, { status: 415 });
  try {
    const user = await authenticate(
      request.cookies.get(sessionCookie(config).name)?.value,
    );
    if (!user)
      return Response.json(
        { error: "Sign in again before saving." },
        { status: 401 },
      );
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Missing command" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        return Response.json({ error: "Command too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (!body || typeof body !== "object")
      return Response.json({ error: "Invalid command" }, { status: 400 });
    const result = await executeFinance(
      user.userId,
      body.budgetId,
      body.key,
      body.command,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FinanceError)
      return Response.json({ error: error.message }, { status: 400 });
    logEvent("request_failed");
    return Response.json(
      {
        error:
          "Unable to save. Retry the same change; it will not be recorded twice.",
      },
      { status: 503 },
    );
  }
}
