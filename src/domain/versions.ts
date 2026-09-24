/**
 * Effective dating, per PROJECT_SPEC sections 7 and 8.
 *
 * A target or a set of contract terms is a decision made at a point in time.
 * Editing one must not rewrite what earlier months were asked to do, so a
 * change is a new version effective from a month, and the version in force for
 * a month is the latest one effective on or before it.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { budgetMonth } from "./dates";

export interface Versioned {
  /** The month this version takes effect, inclusive. */
  effectiveFrom: string;
}

/**
 * The version in force for a month, or null when none had taken effect yet.
 * A month before every version deliberately returns nothing rather than the
 * earliest one: a target created in March did not exist in February.
 */
export function versionFor<T extends Versioned>(
  versions: T[],
  month: string,
): T | null {
  budgetMonth(month);
  let winner: T | null = null;
  for (const version of versions) {
    budgetMonth(version.effectiveFrom);
    if (version.effectiveFrom > month) continue;
    if (!winner || version.effectiveFrom > winner.effectiveFrom)
      winner = version;
  }
  return winner;
}

/** Newest first, for showing what changed and when. */
export function versionHistory<T extends Versioned>(versions: T[]): T[] {
  return [...versions].sort((a, b) =>
    b.effectiveFrom.localeCompare(a.effectiveFrom),
  );
}

/**
 * Every version that applies from a month onward, newest last, starting with
 * the one already in force. A simulation that runs into the future needs this:
 * a promotional rate ending is a later version, not a special case.
 */
export function versionsFrom<T extends Versioned>(
  versions: T[],
  month: string,
): T[] {
  const current = versionFor(versions, month);
  const later = versions
    .filter((v) => v.effectiveFrom > month)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return current ? [current, ...later] : later;
}
