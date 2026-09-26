import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Download,
  Landmark,
  LineChart,
  List,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  Users,
  Wallet,
} from "lucide-react";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
import { Amount, MaybeAmount } from "@/components/amount";
function icon(type: string) {
  if (type === "CREDIT_CARD" || type === "LINE_OF_CREDIT") return CreditCard;
  if (type === "INVESTMENT") return LineChart;
  if (type === "CASH") return Wallet;
  return Landmark;
}
const ACCOUNT_TOOLS = [
  { href: "/accounts/schedules", label: "Schedules and upcoming bills", Icon: CalendarClock },
  { href: "/accounts/register", label: "All accounts register", Icon: List },
  { href: "/accounts/payees", label: "Payees", Icon: Users },
  { href: "/accounts/rules", label: "Rules and previews", Icon: SlidersHorizontal },
  { href: "/accounts/import", label: "Import a file", Icon: Upload },
  { href: "/accounts/export", label: "Your data", Icon: Download },
];
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
  const budgetAccounts = accounts.filter((a) => a.participation === "BUDGET");
  const trackingAccounts = accounts.filter(
    (a) => a.participation === "TRACKING",
  );
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg"
      tabIndex={-1}
    >
      <div>
        <div className="flex max-w-2xl flex-col">
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
            Accounts
          </span>
          <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
            See the whole picture.
          </h1>
          <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
            Keep everyday money in your budget. Track loans and investments
            alongside it.
          </p>
        </div>
      </div>
      <nav
        aria-label="Account tools"
        className="account-tools mt-space-lg flex flex-wrap gap-space-sm"
      >
        {ACCOUNT_TOOLS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex h-10 items-center gap-space-xs whitespace-nowrap rounded-md border border-border-warm bg-surface-card px-space-md font-label-sm text-label-sm font-semibold text-text-primary transition-colors hover:bg-row-hover"
          >
            <Icon size={16} aria-hidden className="text-text-secondary" />
            {label}
          </Link>
        ))}
      </nav>
      <section
        className="mt-space-md grid grid-cols-1 gap-space-sm md:grid-cols-2 xl:grid-cols-4"
        aria-label="Financial position"
      >
        <article className="flex flex-col justify-between overflow-hidden rounded-lg bg-linear-to-br from-primary-container via-primary to-tertiary p-space-md text-on-primary md:col-span-2 xl:col-span-1">
          <div className="flex items-start justify-between gap-space-sm">
            <span className="font-label-caps text-label-caps uppercase tracking-widest text-hero-muted">
              Net worth
            </span>
            <ShieldCheck size={20} aria-hidden />
          </div>
          <strong
            className="mt-space-md block font-headline-lg text-headline-lg font-normal text-hero-text"
            data-numeric
          >
            <Amount>{formatUSD(netWorth)}</Amount>
          </strong>
          <span className="mt-space-sm font-body-sm text-body-sm text-hero-muted">
            Everything you hold, less everything you owe
          </span>
        </article>
        <Metric
          label="Liquid on-budget"
          value={formatUSD(liquid)}
          note="Cash available to assign"
          Icon={Wallet}
          tone="ready"
        />
        <Metric
          label="Credit & liabilities"
          value={formatUSD(owed)}
          note="Balances carried on cards and loans"
          Icon={CreditCard}
          tone={owed > 0n ? "negative" : "neutral"}
        />
        <Metric
          label="Investments & tracking"
          value={formatUSD(tracking)}
          note="Watched, never budgeted"
          Icon={LineChart}
          tone="neutral"
        />
      </section>
      <div className="mt-space-lg flex flex-col gap-space-lg">
        <div className="flex flex-col gap-space-lg">
          {s.accounts.length > 0 && (
            <AccountLedger
              groups={[
                {
                  title: "Budget accounts",
                  caption: "Everyday money. These balances fund your envelopes.",
                  accounts: budgetAccounts,
                },
                {
                  title: "Tracking accounts",
                  caption:
                    "Watched alongside the budget. They never add money to assign.",
                  accounts: trackingAccounts,
                },
              ]}
              closedIds={s.accounts}
            />
          )}
          {!s.accounts.length && (
            <section className="finance-panel rounded-lg border border-border-warm bg-surface-card p-space-lg">
              <h2 className="font-headline-md text-headline-md text-text-primary">
                Add your first account
              </h2>
              <p className="mt-space-sm font-body-md text-body-md leading-relaxed text-text-secondary">
                Start with today’s balance. Enter money owed as a negative
                amount. Opening card debt does not reserve payment money.
              </p>
            </section>
          )}
        </div>
        <div className="grid grid-cols-1 items-start gap-space-lg lg:grid-cols-2">
          <section className="finance-panel rounded-lg border border-border-warm bg-surface-card p-space-lg">
            <h2 className="font-headline-md text-headline-md text-text-primary">
              Bank sync
            </h2>
            <p className="mt-space-sm font-body-sm text-body-sm leading-relaxed text-text-secondary">
              Connect an institution to import transactions instead of entering
              them by hand. Imported spending waits in Uncategorized until you
              review it.
            </p>
            <Link
              className="mt-space-md inline-flex items-center gap-space-sm rounded-md border border-border-warm px-space-md py-space-sm font-label-sm text-label-sm font-semibold text-text-primary transition-colors hover:bg-row-hover"
              href="/accounts/connections"
            >
              Manage bank connections
              <ArrowUpRight size={15} aria-hidden />
            </Link>
          </section>
          <section className="finance-panel rounded-lg border border-border-warm bg-surface-card p-space-lg">
            <h2 className="font-headline-md text-headline-md text-text-primary">
              Add an account
            </h2>
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
              <p className="font-body-sm text-body-sm leading-relaxed text-text-secondary">
                Use a negative opening balance for debt. Loans and investments
                are tracking accounts and never add budget money.
              </p>
            </FinanceForm>
          </section>
          <div className="flex items-start gap-space-sm rounded-lg border border-border-warm bg-surface-container-low p-space-md">
            <ShieldCheck
              size={18}
              className="mt-0.5 shrink-0 text-secondary"
              aria-hidden
            />
            <p className="font-body-sm text-body-sm leading-relaxed text-text-secondary">
              Balances never leave this machine unless you connect a bank
              yourself.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
function Metric({
  label,
  value,
  note,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  Icon: typeof Wallet;
  tone: "ready" | "negative" | "neutral";
}) {
  const chip =
    tone === "ready"
      ? "bg-status-ready-bg text-status-ready-text"
      : tone === "negative"
        ? "bg-status-negative-bg text-status-negative-text"
        : "bg-surface-container-low text-text-secondary";
  return (
    <article className="flex flex-col justify-between rounded-lg border border-border-warm bg-surface-card p-space-md">
      <div className="flex items-start justify-between gap-space-sm">
        <span className="font-label-caps text-label-caps uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${chip}`}
        >
          <Icon size={18} aria-hidden />
        </span>
      </div>
      <strong
        className="mt-space-md block font-data-lg text-data-lg text-text-primary"
        data-numeric
      >
        <MaybeAmount value={value} />
      </strong>
      <span className="mt-space-sm font-body-sm text-body-sm text-text-secondary">
        {note}
      </span>
    </article>
  );
}
/**
 * Every account in one ledger-style table, grouped like the Stitch Accounts
 * screen, each group with its subtotal. A row opens the account's register.
 */
function AccountLedger({
  groups,
  closedIds,
}: {
  groups: {
    title: string;
    caption: string;
    accounts: { id: string; name: string; balance: bigint; type: string }[];
  }[];
  closedIds: { id: string; closed: boolean }[];
}) {
  const TH =
    "px-space-sm py-space-xs text-left font-label-caps text-label-caps uppercase text-text-tertiary first:pl-space-lg last:pr-space-lg last:text-right";
  return (
    <section
      className="finance-panel overflow-hidden rounded-lg border border-border-warm bg-surface-card"
      aria-label="Accounts"
    >
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label="Account balances"
      >
        <table className="w-full min-w-[36rem] border-collapse">
          <caption className="sr-only">Account balances</caption>
          <thead>
            <tr className="border-b border-border-warm bg-surface-container-low">
              {["Account", "Type", "Status", "Balance"].map((h) => (
                <th className={TH} key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          {groups
            .filter((g) => g.accounts.length > 0)
            .map((g) => {
              const total = g.accounts.reduce((sum, a) => sum + a.balance, 0n);
              return (
                <tbody key={g.title} aria-label={g.title}>
                  <tr className="border-b border-border-warm bg-surface-container-lowest">
                    <th
                      className="px-space-lg pb-space-xs pt-space-md text-left"
                      colSpan={3}
                      scope="colgroup"
                    >
                      <span className="block font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
                        {g.title} · {g.accounts.length}{" "}
                        {g.accounts.length === 1 ? "account" : "accounts"}
                      </span>
                      <span className="block font-body-sm text-body-sm font-normal text-text-tertiary">
                        {g.caption}
                      </span>
                    </th>
                    <td className="px-space-lg pb-space-xs pt-space-md text-right font-data-mono text-data-mono text-text-secondary">
                      <Amount>{formatUSD(money(total))}</Amount>
                    </td>
                  </tr>
                  {g.accounts.map((a) => {
                    const Icon = icon(a.type);
                    const closed = closedIds.find((r) => r.id === a.id)?.closed;
                    const negative = a.balance < 0n;
                    return (
                      <tr
                        className="border-b border-border-warm transition-colors last:border-b-0 hover:bg-row-hover"
                        key={a.id}
                      >
                        <th
                          className="py-space-sm pl-space-lg pr-space-sm text-left align-middle font-body-md text-body-md font-medium text-text-primary"
                          scope="row"
                        >
                          <Link
                            className="group inline-flex items-center gap-space-sm underline-offset-2 hover:underline"
                            href={`/accounts/${a.id}`}
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-surface-container-low text-text-secondary">
                              <Icon size={15} aria-hidden />
                            </span>
                            {a.name}
                          </Link>
                        </th>
                        <td className="px-space-sm py-space-sm align-middle font-label-caps text-label-caps uppercase text-text-tertiary">
                          {a.type.replaceAll("_", " ")}
                        </td>
                        <td className="px-space-sm py-space-sm align-middle">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-label-sm text-label-sm ${closed ? "bg-surface-container text-text-tertiary" : "bg-status-ready-bg text-status-ready-text"}`}
                          >
                            {closed ? "Closed" : "Open"}
                          </span>
                        </td>
                        <td
                          className={`py-space-sm pl-space-sm pr-space-lg text-right align-middle font-data-mono text-data-mono ${negative ? "text-status-negative-text" : "text-text-primary"}`}
                          data-numeric
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
    </section>
  );
}
