import type { NormalizedEntry } from "@/domain/ingestion";
import type { SyncContext } from "./types";

/** A pending row that posts under a new id: same amount, within these days. */
export const REPOST_DAYS = 5;
/** Pending charges entered from the owner's pre-link bank export. */
export const RECOVERED_PENDING_PREFIX = "recovered-pending:";

/**
 * For a provider with no cursor, which re-reads a window of recent history:
 * turn one account's window into the delta the planner expects. Pending rows
 * seen before, inside the window, and no longer reported are removed; a posted
 * row with an id never seen that matches one of those by amount and date is
 * linked to it, so the planner promotes it rather than adding a duplicate.
 * Only call this for an account the provider actually reported: a bank that
 * failed to answer must not withdraw its pending rows.
 */
export function windowDelta(
  rows: NormalizedEntry[],
  externalAccountId: string,
  since: string,
  pending: SyncContext["pending"],
) {
  const seen = new Set(rows.map((r) => r.externalId));
  const known = new Set(pending.map((p) => p.externalId));
  const vanished = pending.filter(
    (p) =>
      p.externalAccountId === externalAccountId &&
      (p.date >= since || p.externalId.startsWith(RECOVERED_PENDING_PREFIX)) &&
      !seen.has(p.externalId),
  ).sort((a, b) =>
    Number(b.externalId.startsWith(RECOVERED_PENDING_PREFIX)) -
    Number(a.externalId.startsWith(RECOVERED_PENDING_PREFIX))
  );
  const entries = rows.map((row) => {
    if (row.status !== "POSTED" || known.has(row.externalId)) return row;
    const day = Date.parse(`${row.date}T00:00:00Z`);
    const match = vanished.findIndex(
      (p) =>
        p.amount === row.amount &&
        Math.abs(Date.parse(`${p.date}T00:00:00Z`) - day) <=
          REPOST_DAYS * 86_400_000,
    );
    if (match < 0) return row;
    const [linked] = vanished.splice(match, 1);
    return { ...row, pendingExternalId: linked.externalId };
  });
  // The export was a genuine pending snapshot, but Bridge has not reported
  // those IDs yet. An empty Bridge window is not evidence that they vanished.
  return {
    entries,
    removed: vanished
      .filter((p) => !p.externalId.startsWith(RECOVERED_PENDING_PREFIX))
      .map((p) => p.externalId),
  };
}
