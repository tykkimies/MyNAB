/**
 * Background job policy. Pure: the worker and its tests share these rules.
 *
 * Domain module: no persistence, framework or provider imports.
 */

/** Delay before retry `attempt` (1-based): one minute, doubling, capped at six hours. */
export function backoffMs(attempt: number): number {
  if (!Number.isInteger(attempt) || attempt < 1)
    throw new Error("An attempt number starts at 1");
  const minute = 60_000;
  return Math.min(minute * 2 ** Math.min(attempt - 1, 20), 6 * 60 * minute);
}

/** Whether a connection is due an automatic sync. */
export function syncDue(
  lastSyncedAt: Date | null,
  now: Date,
  intervalHours: number,
): boolean {
  if (!lastSyncedAt) return true;
  return now.getTime() - lastSyncedAt.getTime() >= intervalHours * 3_600_000;
}

/** Keeps stored job errors short and free of anything that looks like a secret. */
export function sanitizeJobError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Unknown failure";
  return raw
    .replace(/(access|public|link)-[a-z]+-[0-9a-f-]+/gi, "[token]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .slice(0, 300);
}
