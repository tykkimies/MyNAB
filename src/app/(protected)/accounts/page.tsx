import Link from "next/link";
import {
  CalendarClock,
  CreditCard,
  Download,
  Landmark,
  Link2,
  LineChart,
  List,
  SlidersHorizontal,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { Amount } from "@/components/amount";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/ui/empty-state";

function icon(type: string) {
  if (type === "CREDIT_CARD" || type === "LINE_OF_CREDIT") return CreditCard;
  if (type === "INVESTMENT") return LineChart;
  if (type === "CASH") return Wallet;
  return Landmark;
}
const TOOLS = [
  {
    href: "/accounts/schedules",
    label: "Schedules and upcoming bills",
    Icon: CalendarClock,
  },
  { href: "/accounts/connections", label: "Manage bank connections", Icon: Link2 },
  { href: "/accounts/register", label: "All accounts register", Icon: List },
  { href: "/accounts/payees", label: "Payees", Icon: Users },
  { href: "/accounts/rules", label: "Rules and previews", Icon: SlidersHorizontal },
  { href: "/accounts/import", label: "Import a file", Icon: Upload },
  { href: "/accounts/export", label: "Your data", Icon: Download },
];
const MUTED = "text-table text-ink-2";
export default async function Accounts() {
  const s = await financePage();
  const accounts = s.projection.accounts;
  // Presentation totals only: these re-read balances the projection already
  // produced. No accounting happens here — that belongs in src/domain.
  const sum = (rows: typeof accounts) =>
    money(rows.reduce((total, a) => total + a.balance, 0n));
  const netWorth = sum(accounts);
  const liquid = sum(
    accounts.filter((a) => a.participation === "BUDGET" && a.balance > 0n),
  );
  const owed = money(
    accounts.reduce(
      (total, a) => total + (a.balance < 0n ? -a.balance : 0n),
      0n,
    ),
  );
  const tracking = sum(accounts.filter((a) => a.participation === "TRACKING"));
  const closed = new Map(s.accounts.map((a) => [a.id, a.closed]));
  const groups = [
    {
      title: "Budget accounts",
      caption: "Everyday money; these balances fund your envelopes.",
      accounts: accounts.filter((a) => a.participation === "BUDGET"),
    },
    {
      title: "Tracking accounts",
      caption: "Watched alongside the budget; they never add money to assign.",
      accounts: accounts.filter((a) => a.participation === "TRACKING"),
    },
  ].filter((g) => g.accounts.length > 0);
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Accounts"
        actions={
          <>
            <Link className="btn btn-secondary" href="/accounts/connections">
              <Link2 size={14} aria-hidden />
              Bank sync
            </Link>
            <Link className="btn btn-ghost" href="/accounts/import">
              <Upload size={14} aria-hidden />
              Import a file
            </Link>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <SummaryStrip ariaLabel="Financial position">
          <Stat
            lead
            label="Net worth"
            value={formatUSD(netWorth)}
            tone={netWorth < 0n ? "negative" : "neutral"}
            note="Everything you hold, less everything you owe"
          />
          <Stat
            label="On-budget cash"
            value={formatUSD(liquid)}
            note="Cash and positive card balances"
          />
          <Stat
            label="Owed"
            value={formatUSD(owed)}
            tone={owed > 0n ? "negative" : "neutral"}
            note="Balances carried on cards and loans"
          />
          <Stat
            label="Tracking"
            value={formatUSD(tracking)}
            note="Loans and investments, never budgeted"
          />
        </SummaryStrip>
        <section className="surface mt-4" aria-label="Accounts">
          {groups.length === 0 ? (
            <EmptyState title="Add your first account">
              Start with today’s balance. Enter money owed as a negative
              amount; opening card debt does not reserve payment money. Loans
              and investments are tracking accounts.
            </EmptyState>
          ) : (
            <div
              className="max-sm:overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Account balances"
            >
              <table className="ledger">
                <caption className="sr-only">Account balances</caption>
                <thead>
                  <tr>
                    <th scope="col">Account</th>
                    <th scope="col" data-hide="sm">
                      Type
                    </th>
                    <th scope="col" data-hide="sm">
                      Status
                    </th>
                    <th scope="col" className="num">
                      Balance
                    </th>
                  </tr>
                </thead>
                {groups.map((g) => {
                  const total = g.accounts.reduce(
                    (sum, a) => sum + a.balance,
                    0n,
                  );
                  return (
                    <tbody key={g.title} aria-label={g.title}>
                      <tr className="bg-surface-sunken hover:bg-surface-sunken!">
                        <th
                          className="h-9! pt-1! text-left align-middle"
                          colSpan={3}
                          scope="colgroup"
                        >
                          <span className="text-caps uppercase text-ink-2">
                            {g.title} · {g.accounts.length}
                          </span>
                          <span className="ml-2 text-meta font-normal text-ink-3 max-sm:hidden">
                            {g.caption}
                          </span>
                        </th>
                        <td
                          className={`num h-9! text-ink-2 ${total < 0n ? "text-negative" : ""}`}
                        >
                          <Amount>{formatUSD(money(total))}</Amount>
                        </td>
                      </tr>
                      {g.accounts.map((a) => {
                        const Icon = icon(a.type);
                        const isClosed = closed.get(a.id);
                        return (
                          <tr key={a.id}>
                            <th scope="row">
                              <Link
                                className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
                                href={`/accounts/${a.id}`}
                              >
                                <Icon
                                  size={15}
                                  className="shrink-0 text-ink-3"
                                  aria-hidden
                                />
                                {a.name}
                              </Link>
                              <span className="ledger-sub sm:hidden">
                                {a.type.replaceAll("_", " ").toLowerCase()}
                                {isClosed ? " · closed" : ""}
                              </span>
                            </th>
                            <td
                              className="text-caps uppercase text-ink-3"
                              data-hide="sm"
                            >
                              {a.type.replaceAll("_", " ")}
                            </td>
                            <td data-hide="sm">
                              <Pill tone={isClosed ? "neutral" : "positive"}>
                                {isClosed ? "Closed" : "Open"}
                              </Pill>
                            </td>
                            <td
                              className={`num ${a.balance < 0n ? "text-negative" : "text-ink"}`}
                            >
                              <Amount>{formatUSD(money(a.balance))}</Amount>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}
        </section>
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section className="surface p-4" aria-labelledby="add-account-heading">
            <h2 id="add-account-heading" className="section-title">
              Add an account
            </h2>
            <p className={`mt-1 ${MUTED}`}>
              Enter today’s balance; money owed is negative. Type and budget
              participation are fixed once the account exists.
            </p>
            <div className="mt-3">
              <FinanceForm
                budgetId={s.budget.id}
                command={{ type: "account.create" }}
                label="Create account"
                reset
              >
                <div className="field-grid" data-cols="5">
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
              </FinanceForm>
            </div>
          </section>
          <nav aria-label="Account tools" className="surface p-4">
            <h2 className="section-title">Tools</h2>
            <ul className="mt-2 grid gap-0.5 sm:grid-cols-2 xl:grid-cols-1">
              {TOOLS.map(({ href, label, Icon }) => (
                <li key={href}>
                  <Link
                    className="flex h-8 items-center gap-2.5 rounded-md px-2 text-table font-medium text-ink-2 transition-colors hover:bg-surface-sunken hover:text-ink"
                    href={href}
                  >
                    <Icon size={15} className="shrink-0 text-ink-3" aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <p className={`mt-3 ${MUTED}`}>
              Balances never leave this machine unless you connect a bank
              yourself.
            </p>
          </nav>
        </div>
      </div>
    </main>
  );
}
