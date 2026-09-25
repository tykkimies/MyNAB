import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { isRetryableConflict } from "@/infrastructure/retry";
import { getConfig, plaidConfigured } from "@/infrastructure/config";
import { decryptSecret, encryptSecret } from "@/infrastructure/crypto";
import { createPlaidProvider } from "@/infrastructure/providers/plaid";
import { ProviderError, type Provider } from "@/infrastructure/providers/types";
import { planIngestion, type NormalizedEntry } from "@/domain/ingestion";
import { isCard } from "@/domain/budget";
import { suggestCategory } from "@/domain/payees";
import { previewRules, type RuleField } from "@/domain/rules";
import { filingHistory, ruleDefinitions } from "./rules";
import { financialDate } from "@/domain/dates";
import { formatUSD, money } from "@/domain/money";
import {
  authorize,
  fail,
  journal,
  today,
  voidTransaction,
  type Tx,
} from "./finance";

const uuid = z.string().uuid();
/** A stale claim is released rather than locking a connection out forever. */
const SYNC_LOCK_MS = 10 * 60 * 1000;

export function providerFor(): Provider {
  const config = getConfig();
  if (!plaidConfigured(config)) fail("No provider is configured.");
  return createPlaidProvider({
    clientId: config.PLAID_CLIENT_ID,
    secret: config.PLAID_SECRET,
    environment: config.PLAID_ENV,
    redirectUri: config.PLAID_REDIRECT_URI,
  });
}

export function parseStartDate(value: string, timezone: string) {
  financialDate(value);
  if (value < "1900-01-01") fail("Start date must be from 1900 onward.");
  if (value > today(timezone)) fail("A start date cannot be in the future.");
  return value;
}

const tokenContext = (connectionId: string) =>
  `provider-connection:${connectionId}`;

/**
 * The category imported spending lands in before the owner has said what it was.
 * It is an ordinary spending category, so unassigned imports show as overspending
 * rather than quietly inventing budget money.
 */
async function uncategorized(tx: Tx, budgetId: string) {
  const existing = await tx.category.findFirst({
    where: { budgetId, system: true, paymentAccountId: null },
  });
  if (existing)
    return existing.archived
      ? tx.category.update({
          where: { id: existing.id },
          data: { archived: false },
        })
      : existing;
  let group = await tx.categoryGroup.findFirst({
    where: { budgetId, system: true },
  });
  group ??= await tx.categoryGroup.create({
    data: { budgetId, name: "Credit card payments", system: true },
  });
  return tx.category.create({
    data: {
      budgetId,
      groupId: group.id,
      name: "Uncategorized",
      system: true,
    },
  });
}

/**
 * Write one imported entry as an ordinary balanced transaction. Plaid cannot say
 * what an inflow was for, so an inflow reaches Ready to Assign rather than a
 * category, and a card inflow is a statement credit rather than income.
 */
async function writeEntry(
  tx: Tx,
  budgetId: string,
  entry: NormalizedEntry,
  account: { id: string; name: string; participation: string; type: string },
  replacesId?: string,
) {
  if (entry.status === "PENDING") return null;
  const budgeted = account.participation === "BUDGET";
  const outflow = entry.amount < 0n;
  const kind = outflow
    ? "EXPENSE"
    : budgeted && isCard(account)
      ? "CREDIT"
      : "INCOME";
  const journalId = await journal(
    tx,
    budgetId,
    entry.date,
    account.id,
    entry.amount,
    kind,
  );
  const created = await tx.financialTransaction.create({
    data: {
      budgetId,
      journalId,
      accountId: account.id,
      replacesId,
      kind,
      date: new Date(`${entry.date}T00:00:00Z`),
      amount: entry.amount,
      payee: entry.payee.slice(0, 120),
    },
  });
  if (replacesId) {
    const preference = await tx.transactionPreference.findUnique({
      where: { transactionId: replacesId },
    });
    if (preference)
      await tx.transactionPreference.create({
        data: {
          transactionId: created.id,
          budgetId,
          tags: preference.tags,
          locked: preference.locked,
        },
      });
  }
  // Only a budget-account outflow carries envelope effect, so only it is split.
  if (budgeted && outflow) {
    const category = await uncategorized(tx, budgetId);
    await tx.financialSplit.create({
      data: {
        budgetId,
        transactionId: created.id,
        categoryId: category.id,
        amount: entry.amount,
        position: 0,
      },
    });
  }
  // Posted means the institution has settled it, which is what cleared means here.
  await tx.transactionState.create({
    data: {
      budgetId,
      transactionId: created.id,
      accountId: account.id,
      cleared: entry.status === "POSTED",
    },
  });
  await tx.reconciliation.updateMany({
    where: {
      budgetId,
      accountId: account.id,
      date: { gte: new Date(`${entry.date}T00:00:00Z`) },
    },
    data: { affectedAt: new Date() },
  });
  return created.id;
}

export async function completeLink(
  userId: string,
  budgetId: string,
  publicToken: string,
) {
  if (!uuid.safeParse(budgetId).success) fail("Invalid budget.");
  if (
    typeof publicToken !== "string" ||
    !publicToken ||
    publicToken.length > 256
  )
    fail("Invalid public token.");
  const provider = providerFor();
  await getDb().$transaction((tx) => authorize(tx, userId, budgetId));
  // Authorize before exchanging any token; provider calls stay outside transactions.
  const connected = await provider.exchange(publicToken);
  try {
    const accounts = await provider.listAccounts(connected.accessToken);
    const key = getConfig().SECRET_ENCRYPTION_KEY;
    return await getDb().$transaction(
      async (tx) => {
        await authorize(tx, userId, budgetId);
        const connection = await tx.providerConnection.create({
          data: {
            budgetId,
            provider: provider.name,
            institutionId: connected.institutionId,
            institutionName: connected.institutionName.slice(0, 120),
            // Placeholder: the envelope binds to the row id, which needs the row.
            accessToken: "",
          },
        });
        await tx.providerConnection.update({
          where: { id: connection.id },
          data: {
            accessToken: encryptSecret(
              connected.accessToken,
              key,
              tokenContext(connection.id),
            ),
          },
        });
        await tx.providerAccount.createMany({
          data: accounts.map((a) => ({
            budgetId,
            connectionId: connection.id,
            externalAccountId: a.externalAccountId,
            name: a.name,
            mask: a.mask,
            type: a.type,
          })),
        });
        await tx.auditEvent.create({
          data: {
            budgetId,
            actorId: userId,
            action: "FINANCE_COMMAND",
            entityId: connection.id,
            details: {
              type: "connection.create",
              institution: connected.institutionName,
              accounts: accounts.length,
            },
          },
        });
        return { connectionId: connection.id, accounts: accounts.length };
      },
      { isolationLevel: "Serializable", timeout: 20000 },
    );
  } catch (error) {
    await provider.disconnect(connected.accessToken).catch(() => undefined);
    throw error;
  }
}

/** Linking is explicit: discovery never creates budget accounts by itself. */
export async function linkAccount(
  userId: string,
  budgetId: string,
  providerAccountId: string,
  accountId: string,
  startDate?: string,
) {
  for (const id of [budgetId, providerAccountId, accountId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return financialWrite(userId, budgetId, async (tx) => {
    const budget = await authorize(tx, userId, budgetId);
    const provider = await tx.providerAccount.findFirst({
      where: { id: providerAccountId, budgetId },
    });
    if (!provider) fail("Provider account unavailable.");
    const connection = await tx.providerConnection.findUniqueOrThrow({
      where: { id: provider.connectionId },
    });
    if (connection.status === "DISCONNECTED")
      fail("Reconnect this institution first.");
    if (provider.accountId) {
      if (
        provider.accountId === accountId &&
        (!startDate ||
          provider.linkedFrom?.toISOString().slice(0, 10) === startDate)
      )
        return {
          providerAccountId,
          accountId,
          from: provider.linkedFrom?.toISOString().slice(0, 10),
        };
      fail(
        "An existing link cannot be reassigned. Its imported history belongs to the original account.",
      );
    }
    const account = await tx.financialAccount.findFirst({
      where: { id: accountId, budgetId },
    });
    if (!account) fail("Account unavailable.");
    if (account.closed) fail("Reopen this account before linking it.");
    const taken = await tx.providerAccount.findFirst({
      where: { budgetId, accountId, NOT: { id: providerAccountId } },
    });
    if (taken) fail("That account is already linked to another connection.");
    // Default to the account's own opening entry: everything the owner already
    // accounted for sits at or before it, so importing from there forward is
    // exactly the history the opening balance does not already contain.
    const opening = await tx.financialTransaction.findFirst({
      where: { budgetId, accountId, kind: "OPENING" },
      orderBy: { date: "asc" },
    });
    const from =
      startDate ??
      (opening
        ? opening.date.toISOString().slice(0, 10)
        : today(budget.timezone));
    parseStartDate(from, budget.timezone);
    await tx.providerConnection.update({
      where: { id: provider.connectionId },
      data: { cursor: null, syncToken: null, syncingSince: null },
    });
    await tx.providerAccount.update({
      where: { id: providerAccountId },
      data: { accountId, linkedFrom: new Date(`${from}T00:00:00Z`) },
    });
    await tx.auditEvent.create({
      data: {
        budgetId,
        actorId: userId,
        action: "FINANCE_COMMAND",
        entityId: providerAccountId,
        details: { type: "account.link", accountId, from },
      },
    });
    return { providerAccountId, accountId, from };
  });
}

/**
 * Three stages, because a provider call must never happen inside a financial
 * transaction. Claim the connection and read the cursor; call the provider with
 * nothing held; then commit the ledger changes and the next cursor together. An
 * interrupted sync leaves the stored cursor untouched and simply runs again.
 */
export async function syncConnection(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const key = getConfig().SECRET_ENCRYPTION_KEY;

  const syncToken = randomUUID();
  const claim = await financialWrite(userId, budgetId, async (tx) => {
    const connection = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (!connection || connection.status === "DISCONNECTED")
      fail("This connection was removed or is unavailable.");
    if (connection.provider !== "PLAID")
      fail("File imports are not synced; import a new file instead.");
    if (
      connection.syncingSince &&
      Date.now() - connection.syncingSince.getTime() < SYNC_LOCK_MS
    )
      fail("A sync is already running for this connection.");
    const token = decryptSecret(
      connection.accessToken,
      key,
      tokenContext(connectionId),
    );
    await tx.providerConnection.update({
      where: { id: connectionId },
      data: { syncToken, syncingSince: new Date() },
    });
    return { cursor: connection.cursor, token };
  });
  try {
    const batch = await providerFor().sync(claim.token, claim.cursor);
    return await financialWrite(userId, budgetId, async (tx) => {
      const connection = await tx.providerConnection.findFirst({
        where: {
          id: connectionId,
          budgetId,
          syncToken,
          status: { not: "DISCONNECTED" },
        },
      });
      if (!connection || connection.cursor !== claim.cursor)
        fail("This sync was superseded. Retry from the current position.");
      const { created, corrected, reviewed, proposals } = await commitEntries(
        tx,
        budgetId,
        connectionId,
        batch,
      );
      await tx.providerConnection.update({
        where: { id: connectionId },
        data: {
          cursor: batch.cursor,
          syncToken: null,
          syncingSince: null,
          status: "ACTIVE",
          errorCode: null,
          lastSyncedAt: new Date(),
        },
      });
      await audit(tx, userId, budgetId, connectionId, {
        type: "connection.sync",
        created,
        corrected,
        reviewed,
      });
      return { created, corrected, reviewed, proposals };
    });
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "UNAVAILABLE";
    // A stale request must never release another request's lease or resurrect a disconnect.
    await getDb()
      .providerConnection.updateMany({
        where: { id: connectionId, budgetId, syncToken },
        data: {
          syncToken: null,
          syncingSince: null,
          errorCode: code,
          status: "ERROR",
        },
      })
      .catch(() => undefined);
    if (error instanceof ProviderError)
      fail(
        code === "REAUTH_REQUIRED"
          ? "This connection needs to be signed in again."
          : "The institution could not be reached. Try again later.",
      );
    throw error;
  }
}

/**
 * Apply one complete, staged batch of observations to the ledger: new posted
 * rows become Uncategorized transactions awaiting approval, changes to accepted
 * history become reviews, and removals become corrections. Shared by bank sync
 * and file imports, so a file row is treated exactly like a bank row.
 */
export async function commitEntries(
  tx: Tx,
  budgetId: string,
  connectionId: string,
  batch: { entries: NormalizedEntry[]; removed: string[] },
  batchId?: string,
) {
  const linked = await tx.providerAccount.findMany({
    where: { budgetId, connectionId, accountId: { not: null } },
  });
  const accounts = await tx.financialAccount.findMany({
    where: { budgetId, id: { in: linked.map((a) => a.accountId!) } },
  });
  const known = await tx.ingestedEntry.findMany({
    where: { budgetId, connectionId },
  });
  const byExternal = new Map(linked.map((a) => [a.externalAccountId, a]));
  const entries = batch.entries.filter((e) => {
    const link = byExternal.get(e.externalAccountId);
    // Existing identities still receive corrections when a bank changes their date.
    return (
      link &&
      (known.some((k) => k.externalId === e.externalId) ||
        !link.linkedFrom ||
        e.date > link.linkedFrom.toISOString().slice(0, 10))
    );
  });
  const plan = planIngestion({
    entries,
    removed: batch.removed,
    known: known.map((k) => ({
      externalId: k.externalId,
      externalAccountId:
        linked.find((a) => a.id === k.providerAccountId)?.externalAccountId ??
        "",
      status: k.status as "PENDING" | "POSTED",
      date: k.date.toISOString().slice(0, 10),
      amount: k.amount,
      payee: k.payee,
      transactionId: k.transactionId,
      voided: false,
    })),
    candidates: [],
    linked: [...byExternal.keys()],
  });
  let created = 0,
    corrected = 0,
    reviewed = 0;
  for (const decision of plan.decisions) {
    if (
      ["ignored", "unchanged", "propose-match", "propose-transfer"].includes(
        decision.kind,
      )
    )
      continue;
    if (decision.kind === "remove") {
      const old = known.find((k) => k.externalId === decision.externalId)!;
      if (old.transactionId) {
        await tx.ingestedEntry.update({
          where: { id: old.id },
          data: {
            review: { id: randomUUID(), kind: "remove" },
            approved: false,
          },
        });
        reviewed++;
      } else
        await tx.ingestedEntry.update({
          where: { id: old.id },
          data: { removed: true, review: Prisma.DbNull },
        });
      continue;
    }
    if (!("entry" in decision)) continue;
    const entry = decision.entry,
      provider = byExternal.get(entry.externalAccountId)!;
    const account = accounts.find((a) => a.id === provider.accountId)!;
    const previous = known.find(
      (k) =>
        k.externalId ===
        (decision.kind === "promote" ? decision.from : entry.externalId),
    );
    const data = {
      pendingExternalId: entry.pendingExternalId ?? null,
      status: entry.status,
      date: new Date(`${entry.date}T00:00:00Z`),
      amount: entry.amount,
      payee: entry.payee.slice(0, 120),
    };
    if (previous?.transactionId) {
      // Bank corrections are proposals. Owner changes and statement comparisons survive sync.
      await tx.ingestedEntry.update({
        where: { id: previous.id },
        data: {
          review: {
            id: randomUUID(),
            kind: "change",
            entry: { ...entry, amount: entry.amount.toString() },
          },
          approved: false,
        },
      });
      reviewed++;
      continue;
    }
    if (account.closed)
      fail("Reopen a linked account before importing its new transactions.");
    const transactionId = await writeEntry(tx, budgetId, entry, account);
    if (previous && previous.externalId !== entry.externalId)
      await tx.ingestedEntry.update({
        where: { id: previous.id },
        data: { removed: true, review: Prisma.DbNull },
      });
    await tx.ingestedEntry.upsert({
      where: {
        connectionId_externalId: {
          connectionId,
          externalId: entry.externalId,
        },
      },
      create: {
        budgetId,
        connectionId,
        providerAccountId: provider.id,
        externalId: entry.externalId,
        ...data,
        transactionId,
        batchId: batchId ?? null,
      },
      update: {
        ...data,
        transactionId,
        batchId: batchId ?? null,
        removed: false,
        approved: false,
        review: Prisma.DbNull,
      },
    });
    if (transactionId) created++;
    else corrected++;
  }
  return { created, corrected, reviewed, proposals: plan.proposals };
}

/** Same budget serialization boundary as manual commands, with bounded conflict retry. */
export async function financialWrite<T>(
  userId: string,
  budgetId: string,
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getDb().$transaction(
        async (tx) => {
          await authorize(tx, userId, budgetId);
          await tx.$queryRaw`SELECT id FROM "Budget" WHERE id=${budgetId}::uuid FOR UPDATE`;
          return work(tx);
        },
        { isolationLevel: "Serializable", timeout: 20000 },
      );
    } catch (error) {
      if (isRetryableConflict(error) && attempt < 3) continue;
      throw error;
    }
  }
}
export async function audit(
  tx: Tx,
  userId: string,
  budgetId: string,
  id: string,
  details: Prisma.InputJsonObject,
) {
  await tx.budget.update({
    where: { id: budgetId },
    data: { financeRevision: { increment: 1 } },
  });
  await tx.auditEvent.create({
    data: {
      budgetId,
      actorId: userId,
      entityId: id,
      action: "FINANCE_COMMAND",
      details,
    },
  });
}

/** Approving is what gives an imported entry a real category. */
export async function approveEntry(
  userId: string,
  budgetId: string,
  entryId: string,
  categoryId: string | null,
  acknowledgeReconciled = false,
) {
  for (const id of [budgetId, entryId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return financialWrite(userId, budgetId, async (tx) => {
    await authorize(tx, userId, budgetId);
    const entry = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId },
    });
    if (!entry || entry.removed) fail("Imported entry unavailable.");
    if (entry.status !== "POSTED" || !entry.transactionId || entry.review)
      fail("Resolve the bank change or wait for posting before approving.");
    if (entry.approved) return { entryId };
    if (categoryId) {
      if (!uuid.safeParse(categoryId).success) fail("Invalid category.");
      const category = await tx.category.findFirst({
        where: { id: categoryId, budgetId, archived: false },
      });
      if (!category) fail("Category unavailable.");
      if (category.paymentAccountId)
        fail("Use a transfer to pay a card, not a payment category.");
      const splits = await tx.financialSplit.findMany({
        where: { budgetId, transactionId: entry.transactionId },
      });
      if (!splits.length)
        fail("This entry has no category to change; correct it instead.");
      // Splits are immutable, so recategorising replaces the transaction.
      const previous = await voidTransaction(
        tx,
        budgetId,
        entry.transactionId,
        "Recategorised on approval",
        acknowledgeReconciled,
      );
      const journalId = await journal(
        tx,
        budgetId,
        previous.date.toISOString().slice(0, 10),
        previous.accountId,
        previous.amount,
        previous.kind,
      );
      const replacement = await tx.financialTransaction.create({
        data: {
          budgetId,
          journalId,
          accountId: previous.accountId,
          kind: previous.kind,
          date: previous.date,
          amount: previous.amount,
          payee: previous.payee,
          memo: previous.memo,
          replacesId: previous.id,
        },
      });
      await tx.financialSplit.create({
        data: {
          budgetId,
          transactionId: replacement.id,
          categoryId,
          amount: previous.amount,
          position: 0,
        },
      });
      await tx.transactionState.create({
        data: {
          budgetId,
          transactionId: replacement.id,
          accountId: previous.accountId,
          cleared: entry.status === "POSTED",
        },
      });
      await tx.ingestedEntry.update({
        where: { id: entryId },
        data: { transactionId: replacement.id, approved: true },
      });
    } else {
      await tx.ingestedEntry.update({
        where: { id: entryId },
        data: { approved: true },
      });
    }
    await tx.budget.update({
      where: { id: budgetId },
      data: { financeRevision: { increment: 1 } },
    });
    await tx.auditEvent.create({
      data: {
        budgetId,
        actorId: userId,
        action: "FINANCE_COMMAND",
        entityId: entryId,
        details: { type: "entry.approve", categoryId },
      },
    });
    return { entryId };
  });
}

export async function disconnect(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const key = getConfig().SECRET_ENCRYPTION_KEY;
  const connection = await financialWrite(userId, budgetId, async (tx) => {
    await authorize(tx, userId, budgetId);
    const found = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (!found || found.provider !== "PLAID") fail("Connection unavailable.");
    await tx.providerConnection.update({
      where: { id: connectionId },
      data: { status: "DISCONNECTED", syncToken: null, syncingSince: null },
    });
    return found;
  });
  // Best effort: the institution may already have revoked it. Local state is
  // cleared regardless, so a failed revoke cannot strand the connection.
  await providerFor()
    .disconnect(
      decryptSecret(connection.accessToken, key, tokenContext(connectionId)),
    )
    .catch(() => undefined);
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      await tx.providerConnection.update({
        where: { id: connectionId },
        data: {
          status: "DISCONNECTED",
          syncToken: null,
          // Imported history stays; only the ability to reach the bank is removed.
          accessToken: encryptSecret("", key, tokenContext(connectionId)),
          cursor: null,
          syncingSince: null,
        },
      });
      await tx.auditEvent.create({
        data: {
          budgetId,
          actorId: userId,
          action: "FINANCE_COMMAND",
          entityId: connectionId,
          details: { type: "connection.disconnect" },
        },
      });
      return { connectionId };
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

/**
 * Update mode: a short-lived Link token bound to an existing item, so the owner
 * can sign in again without creating a new connection or losing its history.
 */
export async function startReauth(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const provider = providerFor();
  const token = await getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    const connection = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (
      !connection ||
      connection.status === "DISCONNECTED" ||
      connection.provider !== "PLAID"
    )
      fail("This connection was removed or is unavailable.");
    return decryptSecret(
      connection.accessToken,
      getConfig().SECRET_ENCRYPTION_KEY,
      tokenContext(connectionId),
    );
  });
  // The provider call happens with nothing held.
  return {
    linkToken: await provider.createLinkToken(userId, { accessToken: token }),
  };
}

/**
 * Link reported a successful sign-in. The access token is unchanged in update
 * mode, so only the error state is cleared; a sync is queued straight away.
 */
export async function completeReauth(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  await getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const { count } = await tx.providerConnection.updateMany({
        where: { id: connectionId, budgetId, status: { not: "DISCONNECTED" } },
        data: { status: "ACTIVE", errorCode: null },
      });
      if (!count) fail("This connection was removed or is unavailable.");
      await audit(tx, userId, budgetId, connectionId, {
        type: "connection.reauth",
      });
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
  const { enqueue } = await import("./jobs");
  await enqueue({
    kind: "provider.sync",
    dedupeKey: `provider.sync:${connectionId}`,
    budgetId,
    subjectId: connectionId,
  });
  return { connectionId };
}

/** Everything the connections page renders, in one authorized read. */
export async function getConnections(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const [connections, providerAccounts, accounts, entries, categories] =
        await Promise.all([
          // File imports share the review queue below but are not bank
          // connections: nothing to sync, re-sign or disconnect.
          tx.providerConnection.findMany({
            where: { budgetId, provider: "PLAID" },
            orderBy: { createdAt: "asc" },
          }),
          tx.providerAccount.findMany({
            where: { budgetId },
            orderBy: { name: "asc" },
          }),
          tx.financialAccount.findMany({
            where: { budgetId, closed: false },
            orderBy: { name: "asc" },
          }),
          tx.ingestedEntry.findMany({
            where: {
              budgetId,
              removed: false,
              OR: [{ approved: false }, { review: { not: Prisma.DbNull } }],
            },
            orderBy: [{ date: "desc" }, { id: "desc" }],
            take: 200,
          }),
          tx.category.findMany({
            where: { budgetId, archived: false },
            orderBy: { name: "asc" },
          }),
        ]);
      const proposals = await suggestions(tx, budgetId);
      // Payee memory is drawn from the owner's own past filings, so an imported
      // transaction arrives with the category they chose last time rather than
      // with a blank field. It is a default only; approval is still explicit.
      const spendable = new Set(
        categories
          .filter((c) => !c.paymentAccountId && !c.system)
          .map((c) => c.id),
      );
      const history = await filingHistory(tx, budgetId, spendable);
      // Enabled rules outrank payee memory: they are the owner's explicit
      // instructions. Only the category is pre-filled; the rest is reviewed on
      // the Rules page, and approval stays explicit either way.
      const rules = ruleDefinitions(
        await tx.automationRule.findMany({
          where: { budgetId, enabled: true },
          orderBy: [{ priority: "asc" }, { id: "asc" }],
        }),
      );
      const linkedIds = entries.flatMap((e) =>
        e.transactionId && !e.approved ? [e.transactionId] : [],
      );
      const [linked, preferences] =
        rules.length && linkedIds.length
          ? await Promise.all([
              tx.financialTransaction.findMany({
                where: { budgetId, id: { in: linkedIds }, voidedAt: null },
              }),
              tx.transactionPreference.findMany({
                where: { budgetId, transactionId: { in: linkedIds } },
              }),
            ])
          : [[], []];
      const ruleProposal = (transactionId: string | null) => {
        const t = linked.find((x) => x.id === transactionId);
        if (!t) return null;
        const preference = preferences.find((p) => p.transactionId === t.id);
        const { output, explanation } = previewRules(
          {
            accountId: t.accountId,
            amount: t.amount,
            description: t.memo,
            payee: t.payee,
            memo: t.memo,
            tags: preference?.tags ?? [],
            locked: (preference?.locked ?? []) as RuleField[],
          },
          rules,
        );
        const categoryRule = explanation.find((e) =>
          e.applied.includes("categoryId"),
        );
        return {
          transactionId: t.id,
          categoryId:
            output.categoryId && spendable.has(output.categoryId)
              ? output.categoryId
              : null,
          categoryRule: categoryRule?.name ?? null,
          otherChanges: explanation.some((e) =>
            e.applied.some((f) => f !== "categoryId"),
          ),
        };
      };
      return {
        proposals,
        connections: connections.map((c) => ({
          // The encrypted token never leaves the application layer.
          id: c.id,
          institutionName: c.institutionName,
          status: c.status,
          errorCode: c.errorCode,
          lastSyncedAt: c.lastSyncedAt,
        })),
        providerAccounts,
        accounts,
        categories,
        entries: entries.map((e) => {
          const suggested = suggestCategory(history, e.payee);
          const rule =
            e.amount < 0n && !e.approved ? ruleProposal(e.transactionId) : null;
          const ruleCategory = rule?.categoryId ? rule : null;
          return {
            ...e,
            accountId:
              providerAccounts.find((p) => p.id === e.providerAccountId)
                ?.accountId ?? "",
            // Only offered for outflows: an inflow has no category to guess.
            suggestedCategoryId:
              ruleCategory?.categoryId ??
              (e.amount < 0n && suggested ? suggested.categoryId : null),
            suggestionSupport: ruleCategory ? 0 : (suggested?.support ?? 0),
            suggestionRule: ruleCategory?.categoryRule ?? null,
            // Rules that would also rename, annotate or tag are reviewed in full.
            ruleReviewId: rule?.otherChanges ? rule.transactionId : null,
          };
        }),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

const changeReview = z.object({
  id: z.string().uuid(),
  kind: z.enum(["change", "remove", "legacy-pending"]),
  entry: z
    .object({
      externalId: z.string(),
      pendingExternalId: z.string().nullable().optional(),
      externalAccountId: z.string(),
      status: z.enum(["PENDING", "POSTED"]),
      date: z.string(),
      amount: z.string(),
      payee: z.string(),
    })
    .optional(),
});
export function readReview(value: unknown) {
  const parsed = changeReview.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Resolve a persisted bank change, rather than silently rewriting accepted history. */
export async function resolveBankChange(
  userId: string,
  budgetId: string,
  entryId: string,
  reviewId: string,
  apply: boolean,
  acknowledgeReconciled = false,
) {
  return financialWrite(userId, budgetId, async (tx) => {
    const old = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId },
    });
    if (!old) fail("Imported entry unavailable.");
    const review = readReview(old.review);
    if (!review) return { entryId };
    if (review.id !== reviewId)
      fail("The bank change has changed. Refresh before reviewing.");
    if (review.kind === "legacy-pending" && !apply)
      fail("Remove the legacy pending ledger effect before continuing.");
    const previous = old.transactionId
      ? await tx.financialTransaction.findUnique({
          where: { id: old.transactionId },
        })
      : null;
    if (apply && previous?.transferAccountId)
      fail(
        "This is a matched transfer. Correct both account legs in the register, then keep that corrected entry here.",
      );
    let transactionId = old.transactionId;
    if (apply && previous && !previous.voidedAt) {
      await voidTransaction(
        tx,
        budgetId,
        previous.id,
        "Accepted bank correction",
        acknowledgeReconciled,
      );
      transactionId = null;
    }
    if (review.kind === "change" && review.entry) {
      const entry = { ...review.entry, amount: BigInt(review.entry.amount) };
      if (!apply && entry.status === "PENDING" && transactionId)
        fail(
          "A pending observation cannot retain a posted ledger link. Apply the correction or review it after posting.",
        );
      const link = await tx.providerAccount.findFirstOrThrow({
        where: { id: old.providerAccountId, budgetId },
      });
      if (entry.externalAccountId !== link.externalAccountId)
        fail("Bank change refers to a different account.");
      if (apply) {
        const account = await tx.financialAccount.findFirstOrThrow({
          where: { id: link.accountId!, budgetId },
        });
        if (account.closed) fail("Reopen this account first.");
        transactionId = await writeEntry(
          tx,
          budgetId,
          entry,
          account,
          previous?.id,
        );
        // Lineage is part of insertion, never an update to the immutable payload.
      }
      const data = {
        status: entry.status,
        date: new Date(`${entry.date}T00:00:00Z`),
        amount: entry.amount,
        payee: entry.payee,
        pendingExternalId: entry.pendingExternalId ?? null,
        transactionId,
        review: Prisma.DbNull,
        approved: !apply,
        removed: false,
      };
      if (old.externalId === entry.externalId)
        await tx.ingestedEntry.update({ where: { id: old.id }, data });
      else {
        await tx.ingestedEntry.update({
          where: { id: old.id },
          data: { removed: true, review: Prisma.DbNull },
        });
        await tx.ingestedEntry.create({
          data: {
            budgetId,
            connectionId: old.connectionId,
            providerAccountId: old.providerAccountId,
            externalId: entry.externalId,
            ...data,
          },
        });
      }
    } else
      await tx.ingestedEntry.update({
        where: { id: entryId },
        data: {
          transactionId,
          removed: review.kind === "remove",
          review: Prisma.DbNull,
          approved: !apply,
        },
      });
    await audit(tx, userId, budgetId, entryId, {
      type: "entry.resolve",
      reviewId,
      apply,
      acknowledgeReconciled,
    });
    return { entryId };
  });
}

/** Proposals never suppress ingestion. Both actuals remain visible until explicitly joined. */
async function suggestions(tx: Tx, budgetId: string) {
  const entries = await tx.ingestedEntry.findMany({
    where: {
      budgetId,
      removed: false,
      status: "POSTED",
      transactionId: { not: null },
      review: { equals: Prisma.DbNull },
    },
  });
  const transactions = await tx.financialTransaction.findMany({
    where: { budgetId, voidedAt: null, kind: { not: "OPENING" } },
  });
  const links = await tx.providerAccount.findMany({ where: { budgetId } });
  const declined = await tx.declinedMatch.findMany({ where: { budgetId } });
  const allIdentities = await tx.ingestedEntry.findMany({
    where: { budgetId },
    select: { transactionId: true },
  });
  const imported = new Set(allIdentities.map((e) => e.transactionId));
  const accounts = await tx.financialAccount.findMany({ where: { budgetId } });
  const describe = (
    accountId: string | undefined,
    date: Date,
    amount: bigint,
    payee: string,
  ) =>
    `${accounts.find((a) => a.id === accountId)?.name ?? "Account"} · ${date.toISOString().slice(0, 10)} · ${formatUSD(money(amount))} · ${payee || "No payee"}`;
  const near = (a: Date, b: Date) =>
    Math.abs(a.getTime() - b.getTime()) <= 5 * 86400000;
  const result: {
    entryId: string;
    otherEntryId?: string;
    transactionId?: string;
    label: string;
    sourceLabel: string;
  }[] = [];
  for (const e of entries) {
    if (
      declined.some(
        (d) =>
          d.connectionId === e.connectionId && d.externalId === e.externalId,
      )
    )
      continue;
    const t = transactions.find((t) => t.id === e.transactionId);
    if (!t || t.transferAccountId) continue;
    const accountId = links.find(
      (l) => l.id === e.providerAccountId,
    )?.accountId;
    if (t.accountId !== accountId || t.amount !== e.amount) continue;
    for (const manual of transactions.filter((t) => !imported.has(t.id))) {
      const amount =
        manual.accountId === accountId
          ? manual.amount
          : manual.transferAccountId === accountId
            ? -manual.amount
            : null;
      if (amount !== e.amount || !near(manual.date, e.date)) continue;
      // Date and exact amount are suggestions only; the owner compares the payees.
      result.push({
        entryId: e.id,
        transactionId: manual.id,
        sourceLabel: describe(accountId, e.date, e.amount, e.payee),
        label: describe(accountId, manual.date, amount, manual.payee),
      });
    }
    for (const other of entries) {
      if (
        e.id >= other.id ||
        e.providerAccountId === other.providerAccountId ||
        e.transactionId === other.transactionId ||
        e.amount !== -other.amount ||
        !near(e.date, other.date)
      )
        continue;
      if (
        declined.some(
          (d) =>
            d.connectionId === other.connectionId &&
            d.externalId === other.externalId,
        )
      )
        continue;
      const otherTx = transactions.find((t) => t.id === other.transactionId);
      if (
        !otherTx ||
        otherTx.transferAccountId ||
        otherTx.amount !== other.amount ||
        otherTx.accountId !==
          links.find((l) => l.id === other.providerAccountId)?.accountId
      )
        continue;
      result.push({
        entryId: e.id,
        otherEntryId: other.id,
        sourceLabel: describe(accountId, e.date, e.amount, e.payee),
        label: describe(
          otherTx.accountId,
          other.date,
          other.amount,
          other.payee,
        ),
      });
    }
  }
  return result;
}

export async function resolveMatch(
  userId: string,
  budgetId: string,
  entryId: string,
  choice: {
    transactionId?: string;
    otherEntryId?: string;
    decline?: boolean;
    acknowledgeReconciled?: boolean;
  },
) {
  return financialWrite(userId, budgetId, async (tx) => {
    const entry = await tx.ingestedEntry.findFirst({
      where: { id: entryId, budgetId, removed: false, status: "POSTED" },
    });
    if (!entry?.transactionId) fail("Posted entry unavailable.");
    if (choice.decline) {
      await tx.declinedMatch.upsert({
        where: {
          connectionId_externalId: {
            connectionId: entry.connectionId,
            externalId: entry.externalId,
          },
        },
        create: {
          budgetId,
          connectionId: entry.connectionId,
          externalId: entry.externalId,
        },
        update: {},
      });
      await audit(tx, userId, budgetId, entryId, { type: "match.decline" });
      return { entryId };
    }
    if (choice.transactionId === entry.transactionId) return { entryId };
    if (choice.otherEntryId) {
      const other = await tx.ingestedEntry.findFirst({
        where: { id: choice.otherEntryId, budgetId },
      });
      if (other?.transactionId === entry.transactionId) return { entryId };
    }
    const proposal = (await suggestions(tx, budgetId)).find(
      (p) =>
        p.entryId === entryId &&
        p.transactionId === choice.transactionId &&
        p.otherEntryId === choice.otherEntryId,
    );
    if (!proposal)
      fail("This proposal is no longer valid. Refresh before matching.");
    const original = await tx.financialTransaction.findUniqueOrThrow({
      where: { id: entry.transactionId },
    });
    const ack = choice.acknowledgeReconciled ?? false;
    await voidTransaction(
      tx,
      budgetId,
      original.id,
      "Confirmed duplicate bank match",
      ack,
    );
    let targetId = choice.transactionId;
    if (choice.otherEntryId) {
      const other = await tx.ingestedEntry.findFirstOrThrow({
        where: { id: choice.otherEntryId, budgetId },
      });
      const counterpart = await tx.financialTransaction.findUniqueOrThrow({
        where: { id: other.transactionId! },
      });
      await voidTransaction(
        tx,
        budgetId,
        counterpart.id,
        "Confirmed transfer pair",
        ack,
      );
      const out = original.amount < 0n ? original : counterpart,
        into = original.amount < 0n ? counterpart : original;
      const accounts = await tx.financialAccount.findMany({
        where: { budgetId, id: { in: [out.accountId, into.accountId] } },
      });
      const a = accounts.find((a) => a.id === out.accountId)!,
        b = accounts.find((a) => a.id === into.accountId)!;
      const date = out.date.toISOString().slice(0, 10);
      const journalId = await journal(
        tx,
        budgetId,
        date,
        a.id,
        out.amount,
        "TRANSFER",
        b.id,
      );
      const transfer = await tx.financialTransaction.create({
        data: {
          budgetId,
          journalId,
          accountId: a.id,
          transferAccountId: b.id,
          kind: "TRANSFER",
          date: out.date,
          amount: out.amount,
          payee: "Confirmed bank transfer",
          memo: "Matched both imported account legs",
          replacesId: out.id,
        },
      });
      targetId = transfer.id;
      if (a.participation !== b.participation && a.participation === "BUDGET") {
        const splits = await tx.financialSplit.findMany({
          where: { transactionId: out.id, budgetId },
        });
        await tx.financialSplit.createMany({
          data: splits.map((s, position) => ({
            budgetId,
            transactionId: targetId!,
            categoryId: s.categoryId,
            amount: s.amount,
            position,
          })),
        });
      }
      await tx.transactionState.createMany({
        data: accounts.map((a) => ({
          budgetId,
          transactionId: targetId!,
          accountId: a.id,
          cleared: true,
        })),
      });
      await tx.ingestedEntry.update({
        where: { id: other.id },
        data: { transactionId: targetId, approved: true },
      });
    } else {
      const manual = await tx.financialTransaction.findUniqueOrThrow({
        where: { id: targetId! },
      });
      const accountId = original.accountId;
      const state = await tx.transactionState.findUniqueOrThrow({
        where: {
          transactionId_accountId: { transactionId: manual.id, accountId },
        },
      });
      if (!state.cleared) {
        const affected = await tx.reconciliation.count({
          where: { budgetId, accountId, date: { gte: manual.date } },
        });
        if (affected && !ack)
          fail(
            "Acknowledge that matching will change a prior statement comparison.",
          );
        await tx.reconciliation.updateMany({
          where: { budgetId, accountId, date: { gte: manual.date } },
          data: { affectedAt: new Date() },
        });
        await tx.transactionState.update({
          where: {
            transactionId_accountId: { transactionId: manual.id, accountId },
          },
          data: { cleared: true },
        });
      }
    }
    await tx.ingestedEntry.update({
      where: { id: entryId },
      data: { transactionId: targetId, approved: true },
    });
    await audit(tx, userId, budgetId, entryId, {
      type: "match.accept",
      targetId: targetId!,
      otherEntryId: choice.otherEntryId ?? null,
      acknowledgeReconciled: ack,
    });
    return { entryId };
  });
}
