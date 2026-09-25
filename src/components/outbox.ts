/**
 * Entries recorded while offline, waiting on this device. Each keeps the
 * idempotency key it was first sent with, so sending it again can never
 * record it twice.
 */
export interface OutboxEntry {
  budgetId: string;
  key: string;
  command: Record<string, unknown>;
  savedAt: string;
}
const KEY = "mynab-outbox";
export const OUTBOX_EVENT = "mynab-outbox-change";

export function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}
export function writeOutbox(entries: OutboxEntry[]) {
  try {
    if (entries.length) localStorage.setItem(KEY, JSON.stringify(entries));
    else localStorage.removeItem(KEY);
  } catch {
    /* Storage can be disabled; nothing more can be done here. */
  }
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}
export function queueEntry(entry: Omit<OutboxEntry, "savedAt">) {
  const rest = readOutbox().filter((e) => e.key !== entry.key);
  writeOutbox([...rest, { ...entry, savedAt: new Date().toISOString() }]);
}
