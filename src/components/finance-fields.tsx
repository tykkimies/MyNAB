import { FinanceForm, SplitFields } from "./finance-form";
export const dollars = (n: bigint) =>
  `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100n}.${((n < 0n ? -n : n) % 100n).toString().padStart(2, "0")}`;
/**
 * The transaction entry form: one line of fields on a wide screen, like the
 * register's own rows, with the category splits and the rarer options below.
 */
export function TransactionForm({
  budgetId,
  accountId,
  today,
  accounts,
  categories,
  initial,
  offBudget = false,
}: {
  budgetId: string;
  accountId: string;
  /** A tracking account: income there never reaches Ready to Assign. */
  offBudget?: boolean;
  today: string;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  initial?: {
    id: string;
    kind: string;
    date: string;
    amount: string;
    payee: string;
    memo: string;
    cleared?: boolean;
    /** Marked an impulse buy for Spending review. */
    unplanned?: boolean;
    transferAccountId?: string | null;
    refundOfId?: string | null;
    splits: { categoryId: string; amount: string }[];
  };
}) {
  const helpId = `amount-help-${initial?.id ?? accountId}`;
  return (
    <FinanceForm
      budgetId={budgetId}
      command={{
        type: "transaction.create",
        accountId,
        ...(initial ? { replacesId: initial.id } : {}),
        ...(initial ? { reason: "Edited in register" } : {}),
      }}
      label={initial ? "Save changes" : "Add transaction"}
      reset={!initial}
    >
      <div className="field-grid" data-cols={initial ? "2" : "6"}>
        <label>
          Type
          <select
            name="kind"
            aria-label="Type"
            defaultValue={initial?.kind ?? "EXPENSE"}
          >
            {initial?.kind === "OPENING" ? (
              <option value="OPENING">Starting balance</option>
            ) : (
              <>
                <option value="EXPENSE">Expense / interest / fee</option>
                <option value="INCOME">
                  {offBudget ? "Income (off budget)" : "Income to Ready to Assign"}
                </option>
                <option value="REFUND">Categorized refund</option>
                <option value="TRANSFER">Transfer / card payment</option>
                <option value="CREDIT">Card statement credit</option>
                <option value="ADJUSTMENT">Balance adjustment</option>
              </>
            )}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            name="date"
            required
            min="1900-01-01"
            max={today}
            defaultValue={initial?.date ?? today}
          />
        </label>
        <label>
          Amount (USD)
          <input
            name="amount"
            inputMode="decimal"
            required
            aria-label="Amount (USD)"
            aria-describedby={helpId}
            defaultValue={initial?.amount}
            placeholder="-25.00"
          />
          <small id={helpId}>Negative leaving, positive entering.</small>
        </label>
        <label>
          Payee
          <input name="payee" maxLength={120} defaultValue={initial?.payee} />
        </label>
        <label>
          Transfer account
          <select
            name="transferAccountId"
            aria-label="Transfer account"
            defaultValue={initial?.transferAccountId ?? ""}
          >
            <option value="">Not a transfer</option>
            {accounts
              .filter((a) => a.id !== accountId)
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Memo
          <input name="memo" maxLength={500} defaultValue={initial?.memo} />
        </label>
      </div>
      <SplitFields categories={categories} initial={initial?.splits} offBudget={offBudget} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="check-field">
          <input
            type="checkbox"
            name="cleared"
            defaultChecked={initial?.cleared}
          />
          Cleared by the institution on this account
        </label>
        {(!initial || initial.kind === "EXPENSE") && (
          <label className="check-field">
            <input
              type="checkbox"
              name="unplanned"
              defaultChecked={initial?.unplanned}
            />
            Unplanned purchase
          </label>
        )}
        {initial && (
          <label className="check-field">
            <input type="checkbox" name="acknowledgeReconciled" />I understand
            that any affected reconciliation will need review.
          </label>
        )}
        <details>
          <summary>Refund attribution</summary>
          <label className="mt-2 max-w-sm">
            Original purchase ID (optional)
            <input name="refundOfId" defaultValue={initial?.refundOfId ?? ""} />
            <small>
              Copy the transaction ID from the original purchase details.
            </small>
          </label>
        </details>
      </div>
    </FinanceForm>
  );
}
