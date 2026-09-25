import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/application/auth";
import { activeBudget, PLAN_COOKIE } from "@/application/plans";
import { FinanceError } from "@/application/finance";
import {
  commitImport,
  fileInput,
  inspectFile,
  previewImport,
  undoImport,
} from "@/application/imports";
import { getConfig } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";

// A 2 MB file grows when JSON-escaped; anything larger is refused unread.
const LIMIT = 3 * 1024 * 1024;
const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("inspect"), content: z.string().min(1) }),
  fileInput.extend({ type: z.literal("preview") }),
  fileInput.extend({ type: z.literal("commit") }),
  z.object({
    type: z.literal("undo"),
    batchId: z.string().uuid(),
    acknowledgeReconciled: z.boolean().default(false),
  }),
]);

/** Serialise bigints as integer-cent strings; the client formats them. */
const json = (value: unknown, status = 200) =>
  new Response(
    JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );

export async function POST(request: NextRequest) {
  const config = getConfig();
  if (!isAllowedMutation(request.headers, config.APP_ORIGIN))
    return json({ error: "Forbidden" }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return json({ error: "JSON required" }, 415);
  try {
    const user = await authenticate(
      request.cookies.get(sessionCookie(config).name)?.value,
    );
    if (!user) return json({ error: "Sign in again before continuing." }, 401);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Empty request" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) {
        await reader.cancel();
        return json({ error: "File is larger than 2 MB." }, 413);
      }
      chunks.push(value);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    const parsed = command.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid request" }, 400);
    const budget = await activeBudget(
      user.userId,
      request.cookies.get(PLAN_COOKIE)?.value,
    );
    if (!budget) return json({ error: "Budget unavailable" }, 400);
    const c = parsed.data;
    const result =
      c.type === "inspect"
        ? inspectFile(c.content)
        : c.type === "preview"
          ? await previewImport(user.userId, budget.id, c)
          : c.type === "commit"
            ? await commitImport(user.userId, budget.id, c)
            : await undoImport(
                user.userId,
                budget.id,
                c.batchId,
                c.acknowledgeReconciled,
              );
    return json(result);
  } catch (error) {
    if (error instanceof FinanceError)
      return json({ error: error.message }, 400);
    // File contents are financial data: never logged or echoed.
    logEvent("request_failed");
    return json({ error: "That did not complete. Try again." }, 503);
  }
}
