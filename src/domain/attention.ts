/**
 * What needs the owner, in one place: the in-app notification channel
 * (PROJECT_SPEC section 17 leaves the channel open; nothing here is sent
 * anywhere). Pure: counts in, ordered, worded items out.
 *
 * Domain module: no persistence, framework or provider imports.
 */
export interface AttentionCounts {
  reauth: number;
  connectionErrors: number;
  workerDown: boolean;
  bankChanges: number;
  unapproved: number;
  overdue: number;
  affectedReconciliations: number;
}
export interface AttentionItem {
  key: keyof AttentionCounts;
  /** "act" blocks something from working; "review" is routine upkeep. */
  level: "act" | "review";
  text: string;
  href: string;
  action: string;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export function attentionItems(c: AttentionCounts): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (c.reauth)
    items.push({
      key: "reauth",
      level: "act",
      text: `${plural(c.reauth, "bank needs", "banks need")} you to sign in again; automatic sync is paused for ${c.reauth === 1 ? "it" : "them"}.`,
      href: "/accounts/connections",
      action: "Sign in again",
    });
  if (c.connectionErrors)
    items.push({
      key: "connectionErrors",
      level: "act",
      text: `${plural(c.connectionErrors, "bank connection", "bank connections")} could not be reached last time.`,
      href: "/accounts/connections",
      action: "Check bank sync",
    });
  if (c.workerDown)
    items.push({
      key: "workerDown",
      level: "act",
      text: "Automatic bank sync is not running on the server.",
      href: "/accounts/connections",
      action: "See details",
    });
  if (c.bankChanges)
    items.push({
      key: "bankChanges",
      level: "review",
      text: `Your bank changed ${plural(c.bankChanges, "transaction", "transactions")} you had already accepted.`,
      href: "/accounts/connections",
      action: "Review changes",
    });
  if (c.unapproved)
    items.push({
      key: "unapproved",
      level: "review",
      text: `${plural(c.unapproved, "imported transaction is", "imported transactions are")} waiting for a category.`,
      href: "/accounts/connections",
      action: "Review imports",
    });
  if (c.overdue)
    items.push({
      key: "overdue",
      level: "review",
      text: `${plural(c.overdue, "scheduled item is", "scheduled items are")} past due and not yet approved, matched or skipped.`,
      href: "/accounts/schedules",
      action: "Review schedules",
    });
  if (c.affectedReconciliations)
    items.push({
      key: "affectedReconciliations",
      level: "review",
      text: `${plural(c.affectedReconciliations, "reconciled statement was", "reconciled statements were")} changed by a later correction.`,
      href: "/accounts",
      action: "Open accounts",
    });
  // Things that stop the app working first; within a level, the order above.
  return [
    ...items.filter((i) => i.level === "act"),
    ...items.filter((i) => i.level === "review"),
  ];
}
