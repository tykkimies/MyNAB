import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  Landmark,
  LineChart,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { financePage } from "@/application/finance-page";
import { FinanceForm } from "@/components/finance-form";
import { formatUSD, money } from "@/domain/money";
function icon(type: string) {
  if (type === "CREDIT_CARD" || type === "LINE_OF_CREDIT") return CreditCard;
  if (type === "INVESTMENT") return LineChart;
  if (type === "CASH") return Wallet;
  return Landmark;
}
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
      <div className="flex flex-col gap-space-md lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col">
          <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
            Accounts
          </span>
          <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile text-text-primary lg:font-headline-hero lg:text-headline-hero">
            See the whole picture.
          </h1>
          <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
            Keep everyday money in your budget. Track loans and investments
            alongside it.
          </p>
        </div>
        <Link
          className="inline-flex shrink-0 items-center gap-space-sm self-start rounded-md border border-border-warm bg-surface-card px-space-md py-space-sm font-label-sm text-label-sm font-semibold text-text-primary transition-colors hover:bg-row-hover lg:self-end"
          href="/accounts/schedules"
        >
          <CalendarClock size={16} aria-hidden />
          Schedules and upcoming bills
        </Link>
        <Link href="/accounts/rules" className="secondary-button">
          Rules and previews
        </Link>
        <Link href="/accounts/import" className="secondary-button">
          Import a file
        </Link>
      </div>
      <section
        className="mt-space-lg grid grid-cols-1 gap-space-md md:grid-cols-2 xl:grid-cols-4"
        aria-label="Financial position"
      >
        <article className="flex flex-col justify-between overflow-hidden rounded-lg bg-linear-to-br from-primary-container via-primary to-tertiary p-space-lg text-on-primary md:col-span-2 xl:col-span-1">
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
            {formatUSD(netWorth)}
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
      <div className="mt-space-xl grid grid-cols-1 items-start gap-space-lg xl:grid-cols-12">
        <div className="flex flex-col gap-space-lg xl:col-span-8">
          <AccountSection
            title="Budget accounts"
            caption="Everyday money. These balances fund your envelopes."
            accounts={budgetAccounts}
            closedIds={s.accounts}
          />
          {trackingAccounts.length > 0 && (
            <AccountSection
              title="Tracking accounts"
              caption="Watched alongside the budget. They never add money to assign."
              accounts={trackingAccounts}
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
        <div className="flex flex-col gap-space-lg xl:col-span-4">
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
    <article className="flex flex-col justify-between rounded-lg border border-border-warm bg-surface-card p-space-lg">
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
        {value}
      </strong>
      <span className="mt-space-sm font-body-sm text-body-sm text-text-secondary">
        {note}
      </span>
    </article>
  );
}
function AccountSection({
  title,
  caption,
  accounts,
  closedIds,
}: {
  title: string;
  caption: string;
  accounts: { id: string; name: string; balance: bigint; type: string }[];
  closedIds: { id: string; closed: boolean }[];
}) {
  if (!accounts.length) return null;
  return (
    <section aria-label={title}>
      <div className="flex items-baseline justify-between gap-space-md border-b border-border-warm pb-space-sm">
        <h2 className="font-label-caps text-label-caps uppercase tracking-widest text-text-tertiary">
          {title}
        </h2>
        <span className="font-body-sm text-body-sm text-text-tertiary">
          {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
        </span>
      </div>
      <p className="mt-space-sm font-body-sm text-body-sm text-text-secondary">
        {caption}
      </p>
      <div className="mt-space-md grid grid-cols-1 gap-space-md sm:grid-cols-2">
        {accounts.map((a) => {
          const Icon = icon(a.type);
          const closed = closedIds.find((r) => r.id === a.id)?.closed;
          const negative = a.balance < 0n;
          return (
            <Link
              className="group flex flex-col gap-space-sm rounded-lg border border-border-warm bg-surface-card p-space-md transition-colors hover:border-accent-eucalyptus hover:bg-row-hover"
              href={`/accounts/${a.id}`}
              key={a.id}
            >
              <div className="flex items-center gap-space-sm">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-surface-container-low text-text-secondary">
                  <Icon size={16} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-headline-sm text-headline-sm text-text-primary">
                    {a.name}
                  </span>
                  <span className="block font-label-caps text-label-caps uppercase text-text-tertiary">
                    {a.type.replaceAll("_", " ")}
                  </span>
                </span>
              </div>
              <strong
                className={`font-data-lg text-data-lg font-normal ${negative ? "text-status-negative-text" : "text-text-primary"}`}
                data-numeric
              >
                {formatUSD(money(a.balance))}
              </strong>
              <span className="flex items-center gap-1 font-body-sm text-body-sm text-text-tertiary">
                {closed ? (
                  "Closed"
                ) : (
                  <>
                    View transactions
                    <ArrowUpRight
                      size={14}
                      className="transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
