/**
 * Payee memory: suggest the category an owner has chosen before for the same
 * payee, so reviewing an import is a confirmation rather than a decision.
 *
 * A suggestion is only ever a default. It is never applied without the owner
 * accepting it, because a wrong category is silent and compounds: the wrong
 * guess becomes history, and history is what the next guess is drawn from.
 *
 * Domain module: no persistence, framework or provider imports.
 */
import { fingerprint } from "./ingestion";

/** One past decision: this payee was filed under this category on this date. */
export interface CategorisedPayee {
  payee: string;
  categoryId: string;
  date: string;
}

export interface Suggestion {
  categoryId: string;
  /** How many past transactions support it. Shown so a weak guess looks weak. */
  support: number;
  /** An exact normalised match, or a shared prefix such as a store number. */
  basis: "exact" | "partial";
}

/**
 * Institutions vary a payee between appearances, appending store numbers, dates
 * or reference codes, so matching is on the normalised form and then on a
 * shared prefix. An exact match always beats a partial one, however popular.
 */
export function suggestCategory(
  history: CategorisedPayee[],
  payee: string,
): Suggestion | null {
  const target = fingerprint(payee);
  if (!target) return null;

  const exact: CategorisedPayee[] = [];
  const partial: CategorisedPayee[] = [];
  for (const entry of history) {
    const candidate = fingerprint(entry.payee);
    if (!candidate) continue;
    if (candidate === target) exact.push(entry);
    else if (candidate.startsWith(target) || target.startsWith(candidate))
      partial.push(entry);
  }

  const best = (matches: CategorisedPayee[], basis: Suggestion["basis"]) => {
    if (!matches.length) return null;
    const tally = new Map<string, { support: number; latest: string }>();
    for (const match of matches) {
      const current = tally.get(match.categoryId);
      if (!current)
        tally.set(match.categoryId, { support: 1, latest: match.date });
      else {
        current.support++;
        if (match.date > current.latest) current.latest = match.date;
      }
    }
    // Most often chosen wins; the most recent choice breaks a tie, then the id
    // so that an unchanged history always produces an unchanged suggestion.
    const ranked = [...tally.entries()].sort(
      (a, b) =>
        b[1].support - a[1].support ||
        b[1].latest.localeCompare(a[1].latest) ||
        a[0].localeCompare(b[0]),
    );
    return { categoryId: ranked[0][0], support: ranked[0][1].support, basis };
  };

  return best(exact, "exact") ?? best(partial, "partial");
}
