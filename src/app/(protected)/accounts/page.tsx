import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
export default async function Accounts() {
  const s = await financePage();
  return (
    <main id="main" className="main finance" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">ACCOUNTS</span>
        <h1>See the whole picture.</h1>
        <p>
          Keep everyday money in your budget. Track loans and investments
          alongside it.
        </p>
      </div>
      <section className="account-grid" aria-label="Your accounts">
        {s.projection.accounts.map((a) => (
          <Link className="account-card" href={`/accounts/${a.id}`} key={a.id}>
            <span className="eyebrow">
              {a.participation} · {a.type.replaceAll("_", " ")}
            </span>
            <h2>{a.name}</h2>
            <strong>{formatUSD(money(a.balance))}</strong>
            <span>
              {s.accounts.find((r) => r.id === a.id)?.closed
                ? "Closed"
                : "View transactions →"}
            </span>
          </Link>
        ))}
        {!s.accounts.length && (
          <div className="finance-panel">
            <h2>Add your first account</h2>
            <p>
              Start with today’s balance. Enter money owed as a negative amount.
              Opening card debt does not reserve payment money.
            </p>
          </div>
        )}
      </section>
      <section className="finance-panel">
        <h2>Bank sync</h2>
        <p className="muted">
          Connect an institution to import transactions instead of entering them
          by hand. Imported spending waits in Uncategorized until you review it.
        </p>
        <Link className="secondary-button" href="/accounts/connections">
          Manage bank connections
        </Link>
      </section>
      <section className="finance-panel">
        <h2>Add an account</h2>
        <FinanceForm
          budgetId={s.budget.id}
          command={{ type: "account.create" }}
          label="Create account"
          reset
        >
          <div className="field-grid">
            <label>
              Account name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Account type
              <select name="accountType" aria-label="Account type">
                <option value="CHECKING">Checking</option>
                <option value="SAVINGS">Savings</option>
                <option value="CASH">Cash</option>
                <option value="CREDIT_CARD">Credit card</option>
                <option value="LINE_OF_CREDIT">Line of credit</option>
                <option value="LOAN">Installment loan</option>
                <option value="INVESTMENT">Investment</option>
                <option value="OTHER_ASSET">Other asset</option>
                <option value="OTHER_LIABILITY">Other liability</option>
              </select>
            </label>
            <label>
              Participation
              <select name="participation" aria-label="Participation">
                <option value="BUDGET">Budget</option>
                <option value="TRACKING">Tracking</option>
              </select>
            </label>
            <label>
              Opening balance (USD)
              <input
                name="opening"
                required
                inputMode="decimal"
                defaultValue="0"
              />
            </label>
            <label>
              Balance date
              <input
                name="date"
                type="date"
                required
                min="1900-01-01"
                max={s.today}
                defaultValue={s.today}
              />
            </label>
          </div>
          <p>
            Use a negative opening balance for debt. Loans and investments are
            tracking accounts and never add budget money.
          </p>
        </FinanceForm>
      </section>
    </main>
  );
}
