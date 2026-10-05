import type { NormalizedEntry } from "@/domain/ingestion";
import type { SyncContext } from "./types";

/** A pending row that posts under a new id: same amount, within these days. */
export const REPOST_DAYS = 5;
/** Days at the start of a window too close to its edge to call a row missing. */
const EDGE_DAYS = 2;
/** Pending charges entered from the owner's pre-link bank export. */
export const RECOVERED_PENDING_PREFIX = "recovered-pending:";

/**
 * For a provider with no cursor, which re-reads a window of recent history:
 * turn one account's window into the delta the planner expects. Pending rows
 * seen before, inside the window, and no longer reported are removed; a posted
 * row with an id never seen that matches one of those by amount and date is
 * linked to it, so the planner promotes it rather than adding a duplicate. In
 * the same way a new posted ID that matches a known posted row the window no
 * longer reports is linked to it, so the planner re-keys it.
 * Only call this for an account the provider actually reported: a bank that
 * failed to answer must not withdraw its pending rows.
 */
export function windowDelta(
  rows: NormalizedEntry[],
  externalAccountId: string,
  since: string,
  pending: SyncContext["pending"],
  posted: SyncContext["pending"] = [],
) {
  const seen = new Set(rows.map((r) => r.externalId));
  const known = new Set(
    [...pending, ...posted].map((p) => p.externalId),
  );
  // Posted rows inside the window the bank no longer reports. They are never
  // withdrawn (posted history is a fact); they can only be re-identified. The
  // window's first days are left out: time zones blur its edge.
  const inside = new Date(Date.parse(`${since}T00:00:00Z`) + EDGE_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const reissued = posted.filter(
    (p) =>
      p.externalAccountId === externalAccountId &&
      p.date >= inside &&
      !seen.has(p.externalId),
  );
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
    const near = (p: { amount: bigint; date: string }) =>
      p.amount === row.amount &&
      Math.abs(Date.parse(`${p.date}T00:00:00Z`) - day) <=
        REPOST_DAYS * 86_400_000;
    const match = vanished.findIndex(near);
    if (match >= 0) {
      const [linked] = vanished.splice(match, 1);
      return { ...row, pendingExternalId: linked.externalId };
    }
    // A bank that re-issues a settled row under a new ID (PNC via SimpleFIN
    // does, when it enriches payees): same amount, near date, old ID gone.
    const again = reissued.findIndex(near);
    if (again < 0) return row;
    const [previous] = reissued.splice(again, 1);
    return { ...row, previousExternalId: previous.externalId };
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
