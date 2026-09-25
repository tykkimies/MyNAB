export const decimal = (v: bigint) =>
  `${v < 0n ? "-" : ""}${(v < 0n ? -v : v) / 100n}.${((v < 0n ? -v : v) % 100n).toString().padStart(2, "0")}`;
export interface ScheduleInitial {
  name: string;
  accountId: string;
  transferAccountId: string | null;
  kind: string;
  amount: bigint;
  payee: string;
  memo: string;
  startDate: string;
  endDate: string | null;
  timezone: string;
  cadence: string;
  interval: number;
  splits: { categoryId: string; amount: bigint }[];
}
export function ScheduleFields({
  accounts,
  categories,
  today,
  timezone,
  initial,
}: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  today: string;
  timezone: string;
  initial?: ScheduleInitial;
}) {
  return (
    <>
      <div className="field-grid">
        <label>
          Name
          <input
            name="name"
            defaultValue={initial?.name}
            required
            maxLength={120}
          />
        </label>
        <label>
          Account
          <select
            aria-label="Account"
            name="accountId"
            defaultValue={initial?.accountId}
          >
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Type
          <select
            aria-label="Type"
            name="kind"
            defaultValue={initial?.kind ?? "EXPENSE"}
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
            <option value="TRANSFER">Transfer</option>
          </select>
        </label>
        <label>
          Amount (USD)
          <input
            aria-label="Amount (USD)"
            name="amount"
            defaultValue={initial ? decimal(initial.amount) : ""}
            required
            inputMode="decimal"
          />
          <small>
            Negative for expenses and outgoing transfers; positive for income.
          </small>
        </label>
        <label>
          Transfer destination
          <select
            aria-label="Transfer destination"
            name="transferAccountId"
            defaultValue={initial?.transferAccountId ?? ""}
          >
            <option value="">None</option>
            {accounts.map((a) => (
              <option value={a.id} key={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payee
          <input name="payee" defaultValue={initial?.payee} maxLength={120} />
        </label>
        <label>
          Memo
          <input name="memo" defaultValue={initial?.memo} maxLength={500} />
        </label>
        <label>
          First occurrence
          <input
            name="startDate"
            type="date"
            required
            defaultValue={initial?.startDate ?? today}
          />
        </label>
        <label>
          End date (optional)
          <input
            name="endDate"
            defaultValue={initial?.endDate ?? ""}
            type="date"
          />
        </label>
        <label>
          Repeat
          <select
            aria-label="Repeat"
            name="cadence"
            defaultValue={initial?.cadence ?? "MONTHLY"}
          >
            <option value="MONTHLY">Monthly</option>
            <option value="TWICE_MONTHLY">Twice a month (day and 15 days later)</option>
            <option value="WEEKLY">Weekly</option>
            <option value="YEARLY">Yearly</option>
            <option value="DAILY">Daily</option>
            <option value="ONCE">Once</option>
          </select>
        </label>
        <label>
          Every
          <input
            name="interval"
            type="number"
            min={1}
            max={1200}
            defaultValue={initial?.interval ?? 1}
          />
          <small>For example, every 2 weeks.</small>
        </label>
        <label>
          Timezone
          <input
            name="timezone"
            defaultValue={initial?.timezone ?? timezone}
            required
          />
        </label>
      </div>
      <p>
        Split expenses among categories. Split amounts must total the signed
        expense amount. Income and internal transfers need no category.
      </p>
      {Array.from(
        { length: Math.max(4, initial?.splits.length ?? 0) },
        (_, i) => (
          <div className="field-grid" key={i}>
            <label>
              Category {i + 1}
              <select
                aria-label={`Category ${i + 1}`}
                name="splitCategory"
                defaultValue={initial?.splits[i]?.categoryId ?? ""}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Split {i + 1} (USD)
              <input
                defaultValue={
                  initial?.splits[i] ? decimal(initial.splits[i].amount) : ""
                }
                name="splitAmount"
                inputMode="decimal"
              />
            </label>
          </div>
        ),
      )}
    </>
  );
}
