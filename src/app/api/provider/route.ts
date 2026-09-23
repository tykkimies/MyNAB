import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate, listBudgets } from "@/application/auth";
import { FinanceError } from "@/application/finance";
import {
  approveEntry,
  completeLink,
  disconnect,
  linkAccount,
  providerFor,
  syncConnection,
} from "@/application/ingestion";
import { getConfig, plaidConfigured } from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";

const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("link.start") }),
  z.object({
    type: z.literal("link.complete"),
    publicToken: z.string().min(1).max(256),
  }),
  z.object({
    type: z.literal("account.link"),
    providerAccountId: z.string().uuid(),
    accountId: z.string().uuid(),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  z.object({ type: z.literal("sync"), connectionId: z.string().uuid() }),
  z.object({
    type: z.literal("entry.approve"),
    entryId: z.string().uuid(),
    categoryId: z.string().uuid().nullable().default(null),
  }),
  z.object({ type: z.literal("disconnect"), connectionId: z.string().uuid() }),
]);

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
        { error: "Sign in again before continuing." },
        { status: 401 },
      );
    if (!plaidConfigured(config))
      return Response.json(
        { error: "Bank sync is not configured on this server." },
        { status: 400 },
      );
    const raw = await request.text();
    if (raw.length > 8192)
      return Response.json({ error: "Request too large" }, { status: 413 });
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = command.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid request" }, { status: 400 });
    // The owner's single budget; provider work is never cross-budget by request.
    const budget = (await listBudgets(user.userId))[0];
    if (!budget)
      return Response.json({ error: "Budget unavailable" }, { status: 400 });
    const c = parsed.data;
    const result =
      c.type === "link.start"
        ? { linkToken: await providerFor().createLinkToken(user.userId) }
        : c.type === "link.complete"
          ? await completeLink(user.userId, budget.id, c.publicToken)
          : c.type === "account.link"
            ? await linkAccount(
                user.userId,
                budget.id,
                c.providerAccountId,
                c.accountId,
                c.startDate,
              )
            : c.type === "sync"
              ? await syncConnection(user.userId, budget.id, c.connectionId)
              : c.type === "entry.approve"
                ? await approveEntry(
                    user.userId,
                    budget.id,
                    c.entryId,
                    c.categoryId,
                  )
                : await disconnect(user.userId, budget.id, c.connectionId);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FinanceError)
      return Response.json({ error: error.message }, { status: 400 });
    // A provider error can carry request details, so it is never forwarded.
    logEvent("request_failed");
    return Response.json(
      { error: "That did not complete. Try again." },
      { status: 503 },
    );
  }
}
