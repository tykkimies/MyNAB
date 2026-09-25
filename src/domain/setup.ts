/**
 * The getting-started checklist. Every step is read from the plan itself, so
 * nothing extra is stored and the list is always honest about what is done.
 */
export interface SetupFacts {
  categories: number;
  accounts: number;
  /** Live transactions other than opening balances. */
  transactions: number;
  targets: number;
  assignments: number;
  readyToAssign: bigint;
}
export type SetupStep =
  | "categories"
  | "accounts"
  | "assign"
  | "target"
  | "record";

export function setupSteps(f: SetupFacts): { step: SetupStep; done: boolean }[] {
  return [
    { step: "categories", done: f.categories > 0 },
    { step: "accounts", done: f.accounts > 0 },
    {
      step: "assign",
      done: f.accounts > 0 && f.assignments > 0 && f.readyToAssign === 0n,
    },
    { step: "target", done: f.targets > 0 },
    { step: "record", done: f.transactions > 0 },
  ];
}
