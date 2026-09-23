import { z } from "zod";
import { getDb } from "@/infrastructure/db";
import { getConfig, plaidConfigured } from "@/infrastructure/config";
import { decryptSecret, encryptSecret } from "@/infrastructure/crypto";
import { createPlaidProvider } from "@/infrastructure/providers/plaid";
import { ProviderError, type Provider } from "@/infrastructure/providers/types";
import {
  planIngestion,
  type KnownEntry,
  type NormalizedEntry,
} from "@/domain/ingestion";
import { isCard } from "@/domain/budget";
import { financialDate } from "@/domain/dates";
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
    redirectOrigin: config.APP_ORIGIN,
  });
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
  if (existing) return existing;
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
) {
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
      kind,
      date: new Date(`${entry.date}T00:00:00Z`),
      amount: entry.amount,
      payee: entry.payee.slice(0, 120),
    },
  });
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
  // The exchange is a provider call, so it happens before any transaction opens.
  const connected = await provider.exchange(publicToken);
  const accounts = await provider.listAccounts(connected.accessToken);
  const key = getConfig().SECRET_ENCRYPTION_KEY;
  return getDb().$transaction(
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
}

/** Linking is explicit: discovery never creates budget accounts by itself. */
export async function linkAccount(
  userId: string,
  budgetId: string,
  providerAccountId: string,
  accountId: string,
) {
  for (const id of [budgetId, providerAccountId, accountId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const provider = await tx.providerAccount.findFirst({
        where: { id: providerAccountId, budgetId },
      });
      if (!provider) fail("Provider account unavailable.");
      const account = await tx.financialAccount.findFirst({
        where: { id: accountId, budgetId },
      });
      if (!account) fail("Account unavailable.");
      if (account.closed) fail("Reopen this account before linking it.");
      const taken = await tx.providerAccount.findFirst({
        where: { budgetId, accountId, NOT: { id: providerAccountId } },
      });
      if (taken) fail("That account is already linked to another connection.");
      await tx.providerAccount.update({
        where: { id: providerAccountId },
        data: { accountId },
      });
      await tx.auditEvent.create({
        data: {
          budgetId,
          actorId: userId,
          action: "FINANCE_COMMAND",
          entityId: providerAccountId,
          details: { type: "account.link", accountId },
        },
      });
      return { providerAccountId, accountId };
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
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

  const claim = await getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    const connection = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (!connection) fail("Connection unavailable.");
    if (connection.status === "DISCONNECTED")
      fail("This connection was removed.");
    const held =
      connection.syncingSince &&
      Date.now() - connection.syncingSince.getTime() < SYNC_LOCK_MS;
    if (held) fail("A sync is already running for this connection.");
    await tx.providerConnection.update({
      where: { id: connectionId },
      data: { syncingSince: new Date() },
    });
    return {
      cursor: connection.cursor,
      token: decryptSecret(
        connection.accessToken,
        key,
        tokenContext(connectionId),
      ),
    };
  });

  const provider = providerFor();
  let batch;
  try {
    batch = await provider.sync(claim.token, claim.cursor);
  } catch (error) {
    const code = error instanceof ProviderError ? error.code : "UNAVAILABLE";
    await getDb().providerConnection.update({
      where: { id: connectionId },
      data: {
        syncingSince: null,
        status: code === "REAUTH_REQUIRED" ? "ERROR" : "ACTIVE",
        errorCode: code,
      },
    });
    fail(
      code === "REAUTH_REQUIRED"
        ? "This connection needs to be signed in again."
        : "The institution could not be reached. Try again later.",
    );
  }

  try {
    return await getDb().$transaction(
      async (tx) => {
        await authorize(tx, userId, budgetId);
        const linked = await tx.providerAccount.findMany({
          where: { budgetId, connectionId, accountId: { not: null } },
        });
        const byExternal = new Map(linked.map((a) => [a.externalAccountId, a]));
        const accounts = await tx.financialAccount.findMany({
          where: { budgetId, id: { in: linked.map((a) => a.accountId!) } },
        });
        const known = await tx.ingestedEntry.findMany({
          where: { budgetId, connectionId },
        });
        const declined = await tx.declinedMatch.findMany({
          where: { budgetId, connectionId },
        });
        const removed = new Set(batch.removed);
        const plan = planIngestion({
          // A provider reporting an entry as removed is the same as not reporting it.
          entries: batch.entries.filter((e) => !removed.has(e.externalId)),
          known: known.map((k): KnownEntry => ({
            externalId: k.externalId,
            externalAccountId:
              linked.find((a) => a.id === k.providerAccountId)
                ?.externalAccountId ?? "",
            status: k.status as "PENDING" | "POSTED",
            date: k.date.toISOString().slice(0, 10),
            amount: k.amount,
            payee: k.payee,
            transactionId: k.transactionId,
            voided: false,
          })),
          candidates: [],
          linked: [...byExternal.keys()],
          declined: declined.map((d) => d.externalId),
        });

        let created = 0;
        let corrected = 0;
        for (const decision of plan.decisions) {
          if (decision.kind === "ignored" || decision.kind === "unchanged")
            continue;
          if (
            decision.kind === "propose-match" ||
            decision.kind === "propose-transfer"
          )
            continue;
          if (decision.kind === "remove") {
            await voidTransaction(
              tx,
              budgetId,
              decision.transactionId,
              "Removed by the institution",
              true,
            );
            await tx.ingestedEntry.deleteMany({
              where: {
                budgetId,
                connectionId,
                externalId: decision.externalId,
              },
            });
            corrected++;
            continue;
          }
          const entry = decision.entry;
          const provider = byExternal.get(entry.externalAccountId);
          if (!provider) continue;
          const account = accounts.find((a) => a.id === provider.accountId);
          if (!account) continue;
          // A changed pending row and a promotion both reverse the old entry and
          // append a new one, so the ledger keeps its lineage either way.
          if (decision.kind !== "create") {
            const previous = known.find(
              (k) =>
                k.externalId ===
                (decision.kind === "promote"
                  ? decision.from
                  : decision.externalId),
            );
            if (previous) {
              await voidTransaction(
                tx,
                budgetId,
                previous.transactionId,
                decision.kind === "promote"
                  ? "Replaced by the posted transaction"
                  : "Updated by the institution",
                true,
              );
              await tx.ingestedEntry.delete({ where: { id: previous.id } });
              corrected++;
            }
          }
          const transactionId = await writeEntry(tx, budgetId, entry, account);
          await tx.ingestedEntry.create({
            data: {
              budgetId,
              connectionId,
              providerAccountId: provider.id,
              externalId: entry.externalId,
              pendingExternalId: entry.pendingExternalId ?? null,
              status: entry.status,
              date: new Date(`${entry.date}T00:00:00Z`),
              amount: entry.amount,
              payee: entry.payee.slice(0, 120),
              transactionId,
            },
          });
          created++;
        }

        await tx.providerConnection.update({
          where: { id: connectionId },
          data: {
            // Cursor and ledger changes commit together, or neither does.
            cursor: batch.cursor,
            syncingSince: null,
            status: "ACTIVE",
            errorCode: null,
            lastSyncedAt: new Date(),
          },
        });
        await tx.budget.update({
          where: { id: budgetId },
          data: { financeRevision: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            budgetId,
            actorId: userId,
            action: "FINANCE_COMMAND",
            entityId: connectionId,
            details: { type: "connection.sync", created, corrected },
          },
        });
        return { created, corrected, proposals: plan.proposals };
      },
      { isolationLevel: "Serializable", timeout: 60000 },
    );
  } catch (error) {
    await getDb()
      .providerConnection.update({
        where: { id: connectionId },
        data: { syncingSince: null },
      })
      .catch(() => undefined);
    throw error;
  }
}

/** Approving is what gives an imported entry a real category. */
export async function approveEntry(
  userId: string,
  budgetId: string,
  entryId: string,
  categoryId: string | null,
) {
  for (const id of [budgetId, entryId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const entry = await tx.ingestedEntry.findFirst({
        where: { id: entryId, budgetId },
      });
      if (!entry) fail("Imported entry unavailable.");
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
          true,
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
    },
    { isolationLevel: "Serializable", timeout: 20000 },
  );
}

export async function disconnect(
  userId: string,
  budgetId: string,
  connectionId: string,
) {
  for (const id of [budgetId, connectionId])
    if (!uuid.safeParse(id).success) fail("Invalid identifier.");
  const key = getConfig().SECRET_ENCRYPTION_KEY;
  const connection = await getDb().$transaction(async (tx) => {
    await authorize(tx, userId, budgetId);
    const found = await tx.providerConnection.findFirst({
      where: { id: connectionId, budgetId },
    });
    if (!found) fail("Connection unavailable.");
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

export function parseStartDate(value: string, timezone: string) {
  financialDate(value);
  if (value > today(timezone)) fail("A start date cannot be in the future.");
  return value;
}
