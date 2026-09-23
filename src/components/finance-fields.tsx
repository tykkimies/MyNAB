import { FinanceForm, SplitFields } from "./finance-form";
export const dollars = (n: bigint) =>
  `${n < 0n ? "-" : ""}${(n < 0n ? -n : n) / 100n}.${((n < 0n ? -n : n) % 100n).toString().padStart(2, "0")}`;
export function TransactionForm({
  budgetId,
  accountId,
  today,
  accounts,
  categories,
  initial,
}: {
  budgetId: string;
  accountId: string;
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
      }}
      label={initial ? "Save correction" : "Add transaction"}
      reset={!initial}
    >
      <div className="field-grid">
        <label>
          Type
          <select
            name="kind"
            aria-label="Type"
            defaultValue={
              initial?.kind === "OPENING"
                ? "ADJUSTMENT"
                : (initial?.kind ?? "EXPENSE")
            }
          >
            <option value="EXPENSE">Expense / interest / fee</option>
            <option value="INCOME">Income to Ready to Assign</option>
            <option value="REFUND">Categorized refund</option>
            <option value="TRANSFER">Transfer / card payment</option>
            <option value="CREDIT">Card statement credit</option>
            <option value="ADJUSTMENT">Balance adjustment</option>
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
          <small id={helpId}>
            Negative for money leaving this account; positive for money
            entering.
          </small>
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
      <SplitFields categories={categories} initial={initial?.splits} />
      <details>
        <summary>Refund attribution</summary>
        <label>
          Original purchase ID (optional)
          <input name="refundOfId" defaultValue={initial?.refundOfId ?? ""} />
        </label>
        <small>
          Copy the transaction ID from the original purchase details.
        </small>
      </details>
      <label className="check-field">
        <input type="checkbox" name="cleared" />
        Cleared by the institution on this account
      </label>
      {initial && (
        <>
          <label>
            Correction reason
            <input name="reason" required maxLength={500} />
          </label>
          <label className="check-field">
            <input type="checkbox" name="acknowledgeReconciled" />I understand
            that any affected reconciliation will need review.
          </label>
        </>
      )}
    </FinanceForm>
  );
}
