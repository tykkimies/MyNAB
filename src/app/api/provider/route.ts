import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/application/auth";
import { activeBudget, PLAN_COOKIE } from "@/application/plans";
import { FinanceError } from "@/application/finance";
import {
  approveEntry,
  approveEntries,
  enterPending,
  resolveBankChange,
  resolveMatch,
  completeLink,
  disconnect,
  linkAccount,
  createLinkedAccount,
  relinkAccount,
  replaceSimpleFinToken,
  syncConnection,
} from "@/application/ingestion";
import {
  bankSyncConfigured,
  getConfig,
  simplefinEnabled,
} from "@/infrastructure/config";
import {
  isAllowedMutation,
  sessionCookie,
} from "@/infrastructure/http-security";
import { logEvent } from "@/infrastructure/log";
import { pushConfigured, sendPush } from "@/infrastructure/push";

const command = z.discriminatedUnion("type", [
  // A SimpleFIN setup token pasted by the owner; claimed on the server.
  z.object({
    type: z.literal("link.complete.simplefin"),
    setupToken: z.string().min(1).max(2000),
  }),
  // Replace a SimpleFIN connection's access after fixing it on SimpleFIN.
  z.object({
    type: z.literal("link.retoken.simplefin"),
    connectionId: z.string().uuid(),
    setupToken: z.string().min(1).max(2000),
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
  // Move an account synced by another connection to this bank account.
  z.object({
    type: z.literal("account.relink"),
    providerAccountId: z.string().uuid(),
    accountId: z.string().uuid(),
  }),
  // YNAB's "link to a new account": create it from the bank's account and link it.
  z.object({
    type: z.literal("account.create_linked"),
    providerAccountId: z.string().uuid(),
    name: z.string().trim().max(120).optional(),
  }),
  z.object({ type: z.literal("sync"), connectionId: z.string().uuid() }),
  z.object({
    type: z.literal("entries.approve"),
    // Bounded to fit the request limit; the page sends larger sets in batches.
    entryIds: z.array(z.string().uuid()).min(1).max(150),
  }),
  z.object({
    type: z.literal("entry.approve"),
    entryId: z.string().uuid(),
    categoryId: z.string().uuid().nullable().default(null),
    acknowledgeReconciled: z.boolean().default(false),
  }),
  // YNAB's "Enter now" on a pending bank transaction.
  z.object({
    type: z.literal("entry.enter"),
    entryId: z.string().uuid(),
    categoryId: z.string().uuid().nullable().default(null),
  }),
  z.object({
    type: z.literal("entry.resolve"),
    entryId: z.string().uuid(),
    reviewId: z.string().uuid(),
    apply: z.boolean(),
    acknowledgeReconciled: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("match.resolve"),
    entryId: z.string().uuid(),
    transactionId: z.string().uuid().optional(),
    otherEntryId: z.string().uuid().optional(),
    duplicateOfEntryId: z.string().uuid().optional(),
    decline: z.boolean().optional(),
    acknowledgeReconciled: z.boolean().default(false),
  }),
  z.object({ type: z.literal("disconnect"), connectionId: z.string().uuid() }),
  // Sends one phone push so the owner can see debt reminders will arrive.
  z.object({ type: z.literal("push.test") }),
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
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json({ error: "Missing command" }, { status: 400 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return Response.json({ error: "Request too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
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
    const budget = await activeBudget(
      user.userId,
      request.cookies.get(PLAN_COOKIE)?.value,
    );
    if (!budget)
      return Response.json({ error: "Budget unavailable" }, { status: 400 });
    const c = parsed.data;
    if (
      [
        "link.complete.simplefin",
        "link.retoken.simplefin",
        "sync",
      ].includes(c.type) &&
      !bankSyncConfigured(config)
    )
      return Response.json(
        { error: "Bank sync is not configured on this server." },
        { status: 400 },
      );
    if (
      (c.type === "link.complete.simplefin" ||
        c.type === "link.retoken.simplefin") &&
      !simplefinEnabled(config)
    )
      return Response.json(
        { error: "SimpleFIN is turned off on this server." },
        { status: 400 },
      );
    if (c.type === "push.test") {
      if (!pushConfigured(config))
        return Response.json(
          { error: "Phone push is not configured on this server (NTFY_TOPIC)." },
          { status: 400 },
        );
      await sendPush(config, {
        title: "MyNAB test notification",
        message: "Debt reminders will arrive here.",
        click: `${config.APP_ORIGIN}${config.APP_BASE_PATH}/debt`,
      });
      return Response.json(
        { message: "Sent. Check your phone." },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    const result =
      c.type === "link.complete.simplefin"
                ? await completeLink(user.userId, budget.id, {
                    setupToken: c.setupToken,
                  })
              : c.type === "link.retoken.simplefin"
                ? await replaceSimpleFinToken(
                    user.userId,
                    budget.id,
                    c.connectionId,
                    c.setupToken,
                  )
              : c.type === "account.create_linked"
                ? await createLinkedAccount(
                    user.userId,
                    budget.id,
                    c.providerAccountId,
                    c.name,
                  )
              : c.type === "account.relink"
                ? await relinkAccount(
                    user.userId,
                    budget.id,
                    c.providerAccountId,
                    c.accountId,
                  )
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
                  : c.type === "entries.approve"
                    ? await approveEntries(user.userId, budget.id, c.entryIds)
                    : c.type === "entry.approve"
                      ? await approveEntry(
                          user.userId,
                          budget.id,
                          c.entryId,
                          c.categoryId,
                          c.acknowledgeReconciled,
                        )
                      : c.type === "entry.enter"
                        ? await enterPending(
                            user.userId,
                            budget.id,
                            c.entryId,
                            c.categoryId,
                          )
                      : c.type === "entry.resolve"
                        ? await resolveBankChange(
                            user.userId,
                            budget.id,
                            c.entryId,
                            c.reviewId,
                            c.apply,
                            c.acknowledgeReconciled,
                          )
                        : c.type === "match.resolve"
                          ? await resolveMatch(
                              user.userId,
                              budget.id,
                              c.entryId,
                              c,
                            )
                          : await disconnect(
                              user.userId,
                              budget.id,
                              c.connectionId,
                            );
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
