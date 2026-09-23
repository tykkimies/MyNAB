/**
 * Pure ingestion planning. Given everything a sync staged and everything already
 * known, decide what should happen, deterministically and without touching the
 * ledger, the database or any provider. See docs/PHASE5_INGESTION.md.
 *
 * Domain module: no framework, persistence or provider imports.
 */
import { financialDate } from "./dates";

export type EntryStatus = "PENDING" | "POSTED";

/** One staged row from a provider batch, from the external account's perspective. */
export interface NormalizedEntry {
  externalId: string;
  pendingExternalId?: string | null;
  status: EntryStatus;
  externalAccountId: string;
  date: string;
  amount: bigint;
  payee: string;
}

/** An entry this budget has already ingested, with its ledger lineage. */
export interface KnownEntry {
  externalId: string;
  externalAccountId: string;
  status: EntryStatus;
  date: string;
  amount: bigint;
  payee: string;
  transactionId: string;
  voided: boolean;
}

/** An existing transaction that was not created by this connection. */
export interface ManualCandidate {
  transactionId: string;
  externalAccountId: string;
  date: string;
  amount: bigint;
  payee: string;
}

export interface IngestionInput {
  entries: NormalizedEntry[];
  known: KnownEntry[];
  candidates: ManualCandidate[];
  /** External account IDs the owner explicitly linked. Others are ignored entirely. */
  linked: string[];
  /** External IDs whose match proposal the owner already declined. */
  declined?: string[];
}

export type Decision =
  | { kind: "ignored"; externalId: string; reason: "unlinked" }
  | { kind: "unchanged"; externalId: string }
  | { kind: "create"; entry: NormalizedEntry }
  | {
      kind: "promote";
      externalId: string;
      from: string;
      entry: NormalizedEntry;
    }
  | { kind: "amend"; externalId: string; entry: NormalizedEntry }
  | { kind: "correct"; externalId: string; entry: NormalizedEntry }
  | { kind: "remove"; externalId: string; transactionId: string }
  | { kind: "propose-match"; externalId: string; transactionId: string }
  | { kind: "propose-transfer"; externalId: string; counterpartId: string };

export interface IngestionPlan {
  decisions: Decision[];
  /** Externally removed entries still need an owner acknowledgement path. */
  corrections: number;
  proposals: number;
}

const DEFAULT_WINDOW_DAYS = 5;

function dayNumber(date: string): number {
  financialDate(date);
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
}

function within(a: string, b: string, days: number): boolean {
  return Math.abs(dayNumber(a) - dayNumber(b)) <= days;
}

/** Payees vary in case, spacing and trailing reference noise between sources. */
export function fingerprint(payee: string): string {
  return payee
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similar(a: string, b: string): boolean {
  const x = fingerprint(a),
    y = fingerprint(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

function sameContent(a: KnownEntry, b: NormalizedEntry): boolean {
  return (
    a.status === b.status &&
    a.date === b.date &&
    a.amount === b.amount &&
    a.payee === b.payee
  );
}

/**
 * Plan a staged batch. Pending and posted rows can arrive on different pages, so
 * every decision is made against the whole batch rather than row by row.
 */
export function planIngestion(
  input: IngestionInput,
  windowDays = DEFAULT_WINDOW_DAYS,
): IngestionPlan {
  const linked = new Set(input.linked);
  const declined = new Set(input.declined ?? []);
  const known = new Map(input.known.map((k) => [k.externalId, k]));
  // Deterministic order: date, then external ID. Provider page order is irrelevant.
  const entries = [...input.entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.externalId.localeCompare(b.externalId),
  );
  for (const entry of entries) {
    financialDate(entry.date);
    if (entry.amount === 0n) throw new Error("Provider entry has no amount");
  }
  const seen = new Set(entries.map((e) => e.externalId));
  if (seen.size !== entries.length)
    throw new Error("Provider batch repeats an external ID");

  const decisions: Decision[] = [];
  const consumed = new Set<string>();
  const matchedCandidates = new Set<string>();
  const paired = new Set<string>();

  // A posted row supersedes its own pending row, which may be elsewhere in the batch.
  const supersedes = new Map<string, string>();
  for (const entry of entries)
    if (entry.status === "POSTED" && entry.pendingExternalId)
      supersedes.set(entry.externalId, entry.pendingExternalId);

  // Transfer pairs: opposing amounts across two linked accounts, close in time.
  for (const entry of entries) {
    if (!linked.has(entry.externalAccountId) || paired.has(entry.externalId))
      continue;
    const counterpart = entries.find(
      (other) =>
        other.externalId !== entry.externalId &&
        !paired.has(other.externalId) &&
        linked.has(other.externalAccountId) &&
        other.externalAccountId !== entry.externalAccountId &&
        other.amount === -entry.amount &&
        within(other.date, entry.date, windowDays),
    );
    if (counterpart) {
      paired.add(entry.externalId);
      paired.add(counterpart.externalId);
    }
  }

  for (const entry of entries) {
    const { externalId } = entry;
    if (!linked.has(entry.externalAccountId)) {
      decisions.push({ kind: "ignored", externalId, reason: "unlinked" });
      continue;
    }
    const existing = known.get(externalId);
    if (existing && !existing.voided) {
      if (sameContent(existing, entry)) {
        decisions.push({ kind: "unchanged", externalId });
      } else if (existing.status === "PENDING" && entry.status === "PENDING") {
        // A pending row was never a statement fact, so it is amended in place.
        decisions.push({ kind: "amend", externalId, entry });
      } else if (existing.status === "PENDING" && entry.status === "POSTED") {
        decisions.push({
          kind: "promote",
          externalId,
          from: externalId,
          entry,
        });
      } else {
        // Accepted posted history is immutable; a change appends a correction.
        decisions.push({ kind: "correct", externalId, entry });
      }
      continue;
    }
    const pendingId = supersedes.get(externalId);
    const pending = pendingId ? known.get(pendingId) : undefined;
    if (pending && !pending.voided) {
      consumed.add(pendingId!);
      decisions.push({ kind: "promote", externalId, from: pendingId!, entry });
      continue;
    }
    if (paired.has(externalId)) {
      const counterpart = entries.find(
        (other) =>
          other.externalId !== externalId &&
          paired.has(other.externalId) &&
          other.amount === -entry.amount &&
          other.externalAccountId !== entry.externalAccountId &&
          within(other.date, entry.date, windowDays),
      );
      if (counterpart && externalId < counterpart.externalId) {
        decisions.push({
          kind: "propose-transfer",
          externalId,
          counterpartId: counterpart.externalId,
        });
        continue;
      }
      if (counterpart) continue;
    }
    // Never merge on a fingerprint; repeated purchases are genuinely common.
    if (!declined.has(externalId)) {
      const candidate = input.candidates.find(
        (c) =>
          !matchedCandidates.has(c.transactionId) &&
          c.externalAccountId === entry.externalAccountId &&
          c.amount === entry.amount &&
          within(c.date, entry.date, windowDays) &&
          similar(c.payee, entry.payee),
      );
      if (candidate) {
        matchedCandidates.add(candidate.transactionId);
        decisions.push({
          kind: "propose-match",
          externalId,
          transactionId: candidate.transactionId,
        });
        continue;
      }
    }
    decisions.push({ kind: "create", entry });
  }

  // Anything the provider stopped reporting is corrected, never silently dropped.
  for (const entry of input.known) {
    if (entry.voided || seen.has(entry.externalId)) continue;
    if (consumed.has(entry.externalId)) continue;
    if (!linked.has(entry.externalAccountId)) continue;
    decisions.push({
      kind: "remove",
      externalId: entry.externalId,
      transactionId: entry.transactionId,
    });
  }

  return {
    decisions,
    corrections: decisions.filter(
      (d) => d.kind === "correct" || d.kind === "remove",
    ).length,
    proposals: decisions.filter(
      (d) => d.kind === "propose-match" || d.kind === "propose-transfer",
    ).length,
  };
}
