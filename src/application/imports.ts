import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/infrastructure/db";
import {
  isOfx,
  mapCsv,
  parseCsv,
  parseOfx,
  guessMapping,
  MAX_FILE_BYTES,
  type CsvMapping,
  type ParsedFile,
} from "@/domain/files";
import type { NormalizedEntry } from "@/domain/ingestion";
import { authorize, fail, voidTransaction, type Tx } from "./finance";
import { audit, commitEntries, financialWrite } from "./ingestion";

/**
 * CSV and OFX/QFX imports. A file is just another source of bank rows: it is
 * parsed and validated here, then handed to the same ingestion planner that
 * bank sync uses, so rows land in Uncategorized, await approval, are matched
 * against manual entries and are never imported twice.
 */

const uuid = z.string().uuid();
export const mappingSchema = z.object({
  header: z.boolean(),
  date: z.number().int().min(0).max(200),
  dateFormat: z.enum(["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY"]),
  payee: z.number().int().min(0).max(200),
  amount: z.number().int().min(0).max(200).optional(),
  invert: z.boolean().optional(),
  outflow: z.number().int().min(0).max(200).optional(),
  inflow: z.number().int().min(0).max(200).optional(),
});
export const fileInput = z.object({
  accountId: uuid,
  fileName: z.string().max(200).default(""),
  content: z.string().min(1).max(MAX_FILE_BYTES),
  mapping: mappingSchema.optional(),
});
export type FileInput = z.input<typeof fileInput>;

/** Headers, a sample and a suggested mapping, before anything is chosen. */
export function inspectFile(content: string) {
  if (content.length > MAX_FILE_BYTES) fail("File is larger than 2 MB.");
  if (isOfx(content)) {
    const parsed = safely(() => parseOfx(content));
    return { format: "OFX" as const, rows: parsed.rows.length };
  }
  const records = safely(() => parseCsv(content));
  if (!records.length) fail("The file is empty.");
  return {
    format: "CSV" as const,
    headers: records[0].map((h) => h.slice(0, 60)),
    sample: records.slice(1, 6).map((r) => r.map((c) => c.slice(0, 60))),
    suggested: guessMapping(records[0]),
    rows: records.length - 1,
  };
}

function safely<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unreadable file.");
  }
}

function parse(input: z.infer<typeof fileInput>): {
  format: "CSV" | "OFX";
  parsed: ParsedFile;
} {
  if (isOfx(input.content))
    return { format: "OFX", parsed: safely(() => parseOfx(input.content)) };
  if (!input.mapping)
    fail("Choose which columns hold the date, payee and amount.");
  const mapping = input.mapping as CsvMapping;
  return {
    format: "CSV",
    parsed: safely(() => mapCsv(parseCsv(input.content), mapping)),
  };
}

/** The file source for this budget, created on first use. Never synced. */
async function fileConnection(tx: Tx, budgetId: string) {
  const existing = await tx.providerConnection.findFirst({
    where: { budgetId, provider: "FILE" },
  });
  if (existing) return existing;
  return tx.providerConnection.create({
    data: {
      budgetId,
      provider: "FILE",
      institutionId: "file",
      institutionName: "File imports",
      accessToken: "",
    },
  });
}

/**
 * The account's file link. Rows dated on or before its opening balance are
 * skipped, exactly as for bank sync: that history is already inside it.
 */
async function fileAccount(
  tx: Tx,
  budgetId: string,
  connectionId: string,
  accountId: string,
) {
  const account = await tx.financialAccount.findFirst({
    where: { id: accountId, budgetId },
  });
  if (!account) fail("Account unavailable.");
  if (account.closed) fail("Reopen this account before importing into it.");
  const link = await tx.providerAccount.findFirst({
    where: { budgetId, accountId },
  });
  if (link && link.connectionId !== connectionId)
    fail(
      "This account is synced from your bank. Import files only into accounts without a bank connection, or the same transactions would arrive twice.",
    );
  if (link) return { account, link };
  const opening = await tx.financialTransaction.findFirst({
    where: { budgetId, accountId, kind: "OPENING" },
    orderBy: { date: "asc" },
  });
  const created = await tx.providerAccount.create({
    data: {
      budgetId,
      connectionId,
      externalAccountId: `account:${accountId}`,
      name: account.name,
      type: account.type,
      accountId,
      linkedFrom: opening?.date ?? null,
    },
  });
  return { account, link: created };
}

function entries(
  accountId: string,
  externalAccountId: string,
  parsed: ParsedFile,
): NormalizedEntry[] {
  return parsed.rows.map((row) => ({
    // Bound to the account, so the same file into two accounts stays separate.
    externalId: createHash("sha256")
      .update(`${accountId}|${row.identity}`)
      .digest("hex"),
    status: "POSTED",
    externalAccountId,
    date: row.date,
    amount: row.amount,
    payee: row.payee,
  }));
}

/** Dry run: what an import would do, row by row. Writes nothing. */
export async function previewImport(
  userId: string,
  budgetId: string,
  raw: FileInput,
) {
  const input = fileInput.parse(raw);
  const { format, parsed } = parse(input);
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const account = await tx.financialAccount.findFirst({
        where: { id: input.accountId, budgetId },
      });
      if (!account) fail("Account unavailable.");
      const link = await tx.providerAccount.findFirst({
        where: { budgetId, accountId: account.id },
      });
      const connection = await tx.providerConnection.findFirst({
        where: { budgetId, provider: "FILE" },
      });
      if (link && link.connectionId !== connection?.id)
        fail(
          "This account is synced from your bank. Import files only into accounts without a bank connection.",
        );
      const opening = await tx.financialTransaction.findFirst({
        where: { budgetId, accountId: account.id, kind: "OPENING" },
        orderBy: { date: "asc" },
      });
      const from = (link?.linkedFrom ?? opening?.date)
        ?.toISOString()
        .slice(0, 10);
      const rows = entries(account.id, `account:${account.id}`, parsed);
      const known = new Set(
        connection
          ? (
              await tx.ingestedEntry.findMany({
                where: {
                  budgetId,
                  connectionId: connection.id,
                  externalId: { in: rows.map((r) => r.externalId) },
                },
                select: { externalId: true },
              })
            ).map((k) => k.externalId)
          : [],
      );
      const classified = parsed.rows.map((row, i) => ({
        line: row.line,
        date: row.date,
        amount: row.amount,
        payee: row.payee,
        status: known.has(rows[i].externalId)
          ? ("duplicate" as const)
          : from && row.date <= from
            ? ("before-opening" as const)
            : ("new" as const),
      }));
      const count = (s: string) =>
        classified.filter((r) => r.status === s).length;
      return {
        format,
        account: { id: account.id, name: account.name },
        openingDate: from ?? null,
        counts: {
          new: count("new"),
          duplicate: count("duplicate"),
          beforeOpening: count("before-opening"),
          invalid: parsed.rejected.length,
        },
        rows: classified.slice(0, 200),
        rejected: parsed.rejected.slice(0, 50),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 15000 },
  );
}

/** Import for real, as one batch that can be undone until it is reviewed. */
export async function commitImport(
  userId: string,
  budgetId: string,
  raw: FileInput,
) {
  const input = fileInput.parse(raw);
  const { format, parsed } = parse(input);
  const fileHash = createHash("sha256").update(input.content).digest("hex");
  return financialWrite(userId, budgetId, async (tx) => {
    const connection = await fileConnection(tx, budgetId);
    const { account, link } = await fileAccount(
      tx,
      budgetId,
      connection.id,
      input.accountId,
    );
    const batchId = randomUUID();
    await tx.importBatch.create({
      data: {
        id: batchId,
        budgetId,
        accountId: account.id,
        format,
        fileName: input.fileName.replace(/[^\w .()-]/g, "").slice(0, 120),
        fileHash,
        rows: parsed.rows.length,
        created: 0,
      },
    });
    const result = await commitEntries(
      tx,
      budgetId,
      connection.id,
      {
        entries: entries(account.id, link.externalAccountId, parsed),
        removed: [],
      },
      batchId,
    );
    if (!result.created && !result.reviewed) {
      // Nothing new: keep no empty batch to undo.
      await tx.importBatch.delete({ where: { id: batchId } });
    } else
      await tx.importBatch.update({
        where: { id: batchId },
        data: { created: result.created },
      });
    await audit(tx, userId, budgetId, batchId, {
      type: "import.commit",
      format,
      accountId: account.id,
      rows: parsed.rows.length,
      created: result.created,
      reviewed: result.reviewed,
      rejected: parsed.rejected.length,
    });
    return {
      batchId: result.created || result.reviewed ? batchId : null,
      created: result.created,
      reviewed: result.reviewed,
      skipped: parsed.rows.length - result.created - result.reviewed,
      rejected: parsed.rejected.length,
    };
  });
}

/**
 * Undo a whole import. Allowed only while none of its rows has been approved
 * or placed in review: after that the owner has made decisions about them,
 * which are corrected one by one in the register, never wiped in bulk.
 */
export async function undoImport(
  userId: string,
  budgetId: string,
  batchId: string,
  acknowledgeReconciled = false,
) {
  if (!uuid.safeParse(batchId).success) fail("Invalid import.");
  return financialWrite(userId, budgetId, async (tx) => {
    const batch = await tx.importBatch.findFirst({
      where: { id: batchId, budgetId },
    });
    if (!batch || batch.undoneAt) fail("Import unavailable or already undone.");
    const rows = await tx.ingestedEntry.findMany({
      where: { budgetId, batchId },
    });
    if (rows.some((r) => r.approved || r.review))
      fail(
        "Some of these transactions were already approved or are in review. Correct them in the account register instead.",
      );
    let voided = 0;
    for (const row of rows)
      if (row.transactionId) {
        await voidTransaction(
          tx,
          budgetId,
          row.transactionId,
          "Import undone",
          acknowledgeReconciled,
        );
        voided++;
      }
    // Forget the rows' identities so the same file can be imported again.
    await tx.ingestedEntry.deleteMany({ where: { budgetId, batchId } });
    await tx.importBatch.update({
      where: { id: batchId },
      data: { undoneAt: new Date() },
    });
    await audit(tx, userId, budgetId, batchId, {
      type: "import.undo",
      voided,
    });
    return { batchId, voided };
  });
}

/** Imports and the accounts that can take one, for the import page. */
export async function getImports(userId: string, budgetId: string) {
  return getDb().$transaction(
    async (tx) => {
      await authorize(tx, userId, budgetId);
      const [accounts, links, batches] = await Promise.all([
        tx.financialAccount.findMany({
          where: { budgetId, closed: false },
          orderBy: { name: "asc" },
        }),
        tx.providerAccount.findMany({
          where: { budgetId, accountId: { not: null } },
          }),
        tx.importBatch.findMany({
          where: { budgetId },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);
      const file = await tx.providerConnection.findFirst({
        where: { budgetId, provider: "FILE" },
      });
      const touched = await tx.ingestedEntry.groupBy({
        by: ["batchId"],
        where: {
          budgetId,
          batchId: { in: batches.map((b) => b.id) },
          OR: [{ approved: true }, { review: { not: Prisma.DbNull } }],
        },
        _count: true,
      });
      return {
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          bankLinked: links.some(
            (l) => l.accountId === a.id && l.connectionId !== file?.id,
          ),
        })),
        batches: batches.map((b) => ({
          ...b,
          accountName: accounts.find((a) => a.id === b.accountId)?.name ?? "",
          undoable: !b.undoneAt && !touched.some((t) => t.batchId === b.id),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
