/** Pure previews: rules never write to accounting and never infer an accepted transfer. */
export type RuleField =
  "payee" | "categoryId" | "memo" | "tags" | "transferAccountId";
export interface RuleInput {
  accountId: string;
  amount: bigint;
  description: string;
  payee: string;
  categoryId?: string;
  memo: string;
  tags: string[];
  transferAccountId?: string;
  locked: RuleField[];
}
export interface AutomationRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  match: {
    accountId?: string;
    payee?: { mode: "EXACT" | "CONTAINS"; value: string };
    description?: string;
    minimum?: bigint;
    maximum?: bigint;
  };
  actions: Partial<Pick<RuleInput, RuleField>>;
}
const normalize = (s: string) => s.normalize("NFKC").trim().toLowerCase();
export function previewRules(input: RuleInput, rules: AutomationRule[]) {
  const output: RuleInput = {
    ...input,
    tags: [...input.tags],
    locked: [...input.locked],
  };
  const claimed = new Set<RuleField>();
  const explanation: {
    ruleId: string;
    name: string;
    applied: RuleField[];
    locked: RuleField[];
    superseded: RuleField[];
  }[] = [];
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error("Rule identities must be unique");
    ids.add(rule.id);
    if (!Number.isSafeInteger(rule.priority))
      throw new Error("Invalid rule priority");
    if (
      rule.match.minimum !== undefined &&
      rule.match.maximum !== undefined &&
      rule.match.minimum > rule.match.maximum
    )
      throw new Error("Invalid rule amount range");
    if (rule.match.payee && !normalize(rule.match.payee.value))
      throw new Error("A payee match cannot be empty");
    if (
      rule.match.description !== undefined &&
      !normalize(rule.match.description)
    )
      throw new Error("A description match cannot be empty");
  }
  for (const rule of [...rules].sort(
    (a, b) =>
      a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )) {
    const m = rule.match;
    if (
      !rule.enabled ||
      (m.accountId !== undefined && m.accountId !== input.accountId) ||
      (m.minimum !== undefined && input.amount < m.minimum) ||
      (m.maximum !== undefined && input.amount > m.maximum) ||
      (m.description !== undefined &&
        !normalize(input.description).includes(normalize(m.description)))
    )
      continue;
    if (
      m.payee &&
      (m.payee.mode === "EXACT"
        ? normalize(input.payee) !== normalize(m.payee.value)
        : !normalize(input.payee).includes(normalize(m.payee.value)))
    )
      continue;
    const reason = {
      ruleId: rule.id,
      name: rule.name,
      applied: [] as RuleField[],
      locked: [] as RuleField[],
      superseded: [] as RuleField[],
    };
    for (const field of [
      "payee",
      "categoryId",
      "memo",
      "tags",
      "transferAccountId",
    ] as const) {
      const value = rule.actions[field];
      if (value === undefined) continue;
      if (input.locked.includes(field)) {
        reason.locked.push(field);
        continue;
      }
      if (claimed.has(field)) {
        reason.superseded.push(field);
        continue;
      }
      claimed.add(field);
      if (field === "tags") output.tags = [...rule.actions.tags!];
      else output[field] = rule.actions[field]!;
      reason.applied.push(field);
    }
    explanation.push(reason);
  }
  return {
    output,
    explanation,
    transferIsSuggestion: output.transferAccountId !== undefined,
  };
}
