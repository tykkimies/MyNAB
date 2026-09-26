import type { AutomationRule } from "@/generated/prisma/client";
import { decimal } from "./schedule-fields";
export function RuleFields({
  accounts,
  categories,
  rule,
}: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  rule?: AutomationRule;
}) {
  return (
    <>
      <div className="field-grid" data-cols="2">
        <label>
          Rule name
          <input
            name="name"
            defaultValue={rule?.name}
            required
            maxLength={120}
          />
        </label>
        <label>
          Priority
          <input
            name="priority"
            type="number"
            min={0}
            max={100000}
            defaultValue={rule?.priority ?? 100}
          />
          <small>Lower numbers run first. Ties use stable rule IDs.</small>
        </label>
      </div>
      <label className="check-field">
        <input
          name="enabled"
          type="checkbox"
          defaultChecked={rule?.enabled ?? true}
        />
        Enabled
      </label>
      <h3 className="text-caps uppercase text-ink-3">Match all these conditions</h3>
      <div className="field-grid" data-cols="2">
        <label>
          Account
          <select
            name="accountId"
            aria-label="Rule account"
            defaultValue={rule?.accountId ?? ""}
          >
            <option value="">Any account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payee text
          <input
            name="payeeMatch"
            defaultValue={rule?.payeeMatch ?? ""}
            maxLength={120}
          />
        </label>
        <label>
          Payee match
          <select
            name="matchMode"
            aria-label="Payee match"
            defaultValue={rule?.matchMode ?? "CONTAINS"}
          >
            <option value="CONTAINS">Contains</option>
            <option value="EXACT">Exact</option>
          </select>
        </label>
        <label>
          Memo contains
          <input
            name="descriptionContains"
            defaultValue={rule?.descriptionContains ?? ""}
            maxLength={500}
          />
        </label>
        <label>
          Minimum signed amount (USD)
          <input
            name="minimum"
            inputMode="decimal"
            defaultValue={rule?.minimum != null ? decimal(rule.minimum) : ""}
          />
        </label>
        <label>
          Maximum signed amount (USD)
          <input
            name="maximum"
            inputMode="decimal"
            defaultValue={rule?.maximum != null ? decimal(rule.maximum) : ""}
          />
        </label>
      </div>
      <p className="text-meta text-ink-3">
        Amounts include their sign: a $25 expense is -25.00. Equal minimum and
        maximum match one exact amount. Leave optional conditions blank.
      </p>
      <h3 className="text-caps uppercase text-ink-3">Propose these changes</h3>
      <div className="field-grid" data-cols="2">
        <label>
          Rename payee
          <input
            name="renamePayee"
            defaultValue={rule?.renamePayee ?? ""}
            maxLength={120}
          />
        </label>
        <label>
          Set category
          <select
            name="categoryId"
            aria-label="Set category"
            defaultValue={rule?.categoryId ?? ""}
          >
            <option value="">Keep category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Set memo
          <input name="memo" defaultValue={rule?.memo ?? ""} maxLength={500} />
        </label>
        <label>
          Tags, separated by commas
          <input
            name="tags"
            defaultValue={rule?.tags.join(", ") ?? ""}
            maxLength={500}
          />
        </label>
        <label>
          Suggest transfer to
          <select
            name="transferAccountId"
            aria-label="Suggest transfer to"
            defaultValue={rule?.transferAccountId ?? ""}
          >
            <option value="">No transfer suggestion</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}
