"use client";
import { useMemo, useState } from "react";
import { FinanceForm } from "@/components/finance-form";

export interface QuickAccount {
  id: string;
  name: string;
  card: boolean;
  budget: boolean;
}

/**
 * Fast entry for a phone: the few fields that matter, with the category
 * remembered from the payee. It submits an ordinary transaction, so it is
 * journaled, editable and undoable like any other.
 */
export function QuickAdd({
  budgetId,
  today,
  accounts,
  categories,
  payees,
}: {
  budgetId: string;
  today: string;
  accounts: QuickAccount[];
  categories: { id: string; name: string; group: string }[];
  /** Payee name to the category chosen for it before. */
  payees: Record<string, string>;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [direction, setDirection] = useState<"OUT" | "IN">("OUT");
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [touched, setTouched] = useState(false);
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState("");
  const account = accounts.find((a) => a.id === accountId);
  const payeeKey = payee.trim().toLowerCase();
  const remembered = useMemo(() => {
    const hit = Object.entries(payees).find(
      ([name]) => name.toLowerCase() === payeeKey,
    );
    return hit?.[1];
  }, [payees, payeeKey]);
  // The remembered category fills in until the owner picks one themselves.
  const chosen = touched ? categoryId : (remembered ?? categoryId);
  const categorised = Boolean(account?.budget && chosen);
  const kind =
    direction === "OUT"
      ? "EXPENSE"
      : categorised
        ? "REFUND"
        : account?.card
          ? "CREDIT"
          : "INCOME";
  const clean = amount.trim().replace(/^[-+]/, "");
  const signed = clean ? `${direction === "OUT" ? "-" : ""}${clean}` : "";
  const groups = [...new Set(categories.map((c) => c.group))];
  return (
    <FinanceForm
      budgetId={budgetId}
      command={{ type: "transaction.create" }}
      label="Save transaction"
      queueOffline
      onSaved={() => {
        setAmount("");
        setPayee("");
        setCategoryId("");
        setTouched(false);
        setMemo("");
      }}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="amount" value={signed} />
      <input type="hidden" name="splitCategory" value={categorised ? chosen : ""} />
      <input type="hidden" name="splitAmount" value={categorised ? signed : ""} />
      <div className="quick-add field-grid">
        <fieldset className="flex gap-space-sm">
          <legend className="font-label-sm text-label-sm text-text-secondary">
            Money
          </legend>
          {(["OUT", "IN"] as const).map((d) => (
            <label key={d} className="check-field">
              <input
                type="radio"
                name="direction"
                value={d}
                checked={direction === d}
                onChange={() => setDirection(d)}
              />
              {d === "OUT" ? "Outflow (spent)" : "Inflow (received)"}
            </label>
          ))}
        </fieldset>
        <label>
          Amount (USD)
          <input
            name="entryAmount"
            required
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label>
          Payee
          <input
            name="payee"
            list="quick-add-payees"
            autoComplete="off"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
          <datalist id="quick-add-payees">
            {Object.keys(payees).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label>
          Account
          <select
            name="accountId"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        {account?.budget && (
          <label>
            Category
            <select
              name="entryCategory"
              value={chosen}
              required={direction === "OUT"}
              onChange={(e) => {
                setTouched(true);
                setCategoryId(e.target.value);
              }}
            >
              <option value="">
                {direction === "IN" ? "Ready to Assign" : "Choose a category"}
              </option>
              {groups.map((group) => (
                <optgroup key={group} label={group}>
                  {categories
                    .filter((c) => c.group === group)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            {!touched && remembered && (
              <small className="font-body-sm text-body-sm text-text-tertiary">
                Remembered from this payee
              </small>
            )}
          </label>
        )}
        <label>
          Date
          <input
            name="date"
            type="date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label>
          Memo
          <input
            name="memo"
            maxLength={500}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </label>
        <label className="check-field">
          <input type="checkbox" name="cleared" />
          Already cleared by the bank
        </label>
      </div>
    </FinanceForm>
  );
}
