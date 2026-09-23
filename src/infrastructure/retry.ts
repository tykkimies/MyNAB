/**
 * Whether a failed financial transaction should simply be tried again.
 *
 * Prisma reports a serialization conflict as P2034, but only when it detects it
 * through the query engine. The budget row is locked with a raw statement, and a
 * conflict there surfaces as a raw-query failure carrying PostgreSQL's own code
 * instead. Both mean the same thing, and retrying is safe because nothing was
 * committed. Missing the raw form meant a legitimate concurrent command failed
 * outright rather than retrying.
 */
export function isRetryableConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String(error.code) : "";
  if (code === "P2034") return true;
  const text = `${"message" in error ? error.message : ""} ${
    "meta" in error ? JSON.stringify(error.meta) : ""
  }`;
  // 40001 serialization failure, 40P01 deadlock detected.
  return /\b40001\b|\b40P01\b|could not serialize access/i.test(text);
}
