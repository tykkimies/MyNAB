import Link from "next/link";
import { notFound } from "next/navigation";
import {
  accountLink,
  financePage,
  loanPlan,
  pendingBankEntries,
  unapprovedImports,
} from "@/application/finance-page";
import { BulkApprove, ProviderAction } from "@/components/provider-link";
import { Pill } from "@/components/ui/pill";
import { PendingEntries } from "@/components/pending-entries";
import { FinanceForm } from "@/components/finance-form";
import { TransactionForm, dollars } from "@/components/finance-fields";
import { formatUSD, money } from "@/domain/money";
import { nextMonth } from "@/domain/budget";
import { TrendLine } from "@/components/trend-line";
import { Amount } from "@/components/amount";
import { FLAG_COLORS, flagName, type FlagColor } from "@/domain/flags";
import { RepeatDate } from "@/components/repeat-date";
import { coveringSchedule } from "@/domain/schedules";
import { scheduleCoverage } from "@/application/schedules";
import { requireUser } from "@/application/session";
import { decimal } from "@/components/schedule-fields";
import { formatDate } from "@/domain/dates";
import { registerRowShown } from "@/domain/register-view";
import { readRegisterView } from "@/infrastructure/register-view";
import {
  RegisterViewOptions,
  ShowReconciled,
} from "@/components/register-view-options";
import { RegisterChecks, RowCheck, StopToggle } from "@/components/register-selection";
import { Lock } from "lucide-react";
import { DetailsClose } from "@/components/details-close";
import { DETAILS_DRAWER } from "@/components/drawer";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryStrip, Stat } from "@/components/ui/summary-strip";
import { Notice, NoticeList } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import {
  REGISTER_BALANCE,
  REGISTER_DATE,
  REGISTER_PAYEE,
  REGISTER_STATE,
  REGISTER_SUB,
  RegisterFlowCells,
  RegisterHead,
  registerSummary,
} from "@/components/ui/register-row";
import { isPhone } from "@/infrastructure/view";
import type { PhoneTxn } from "@/components/phone/register";
import { PhoneAccount } from "./phone";
const usd = (n: bigint) => formatUSD(money(n));
const day = (value: Date) => value.toISOString().slice(0, 10);
const MUTED = "text-table text-ink-2";
const LINK = "link";
const DT = "text-caps uppercase text-ink-3";
const DD = "mt-0.5 text-table text-ink";
// On desktop an open row's detail is the inspector drawer: pinned to the
// right edge over the register, which keeps its full width. On phones it
// opens in place under the row.
const DETAIL_WRAP = `grid content-start gap-4 border-t border-hairline px-4 py-3 lg:px-6 ${DETAILS_DRAWER}`;
const PAGE_SIZE = 50;
export default async function Account({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    page?: string;
    q?: string;
    extra?: string;
    lump?: string;
    lumpMonth?: string;
    txn?: string;
    panel?: string;
  }>;
}) {
  const { id } = await params;
  const {
    page: pageParam,
    q: rawQuery,
    extra,
    lump,
    lumpMonth,
    txn,
    panel,
  } = await searchParams;
  const query = (rawQuery ?? "").trim().slice(0, 80);
  const s = await financePage();
  const account = s.accounts.find((a) => a.id === id);
  if (!account) notFound();
  const balance = s.projection.accounts.find((a) => a.id === id)!.balance;
  const spendable = s.categories
    .filter((c) => !c.archived && !c.paymentAccountId)
    .map((c) => ({ id: c.id, name: c.name }));
  const transferable = s.accounts
    .filter((a) => !a.closed)
    .map((a) => ({ id: a.id, name: a.name }));
  const legOf = (t: { accountId: string; amount: bigint }) =>
    t.accountId === id ? t.amount : -t.amount;
  const register = s.transactions.filter(
    (t) => t.accountId === id || t.transferAccountId === id,
  );
  const active = register.filter((t) => !t.voidedAt);
  // Oldest first for a running balance, then displayed newest first.
  const ordered = [...active].sort(
    (a, b) =>
      day(a.date).localeCompare(day(b.date)) || a.id.localeCompare(b.id),
  );
  const running = new Map<string, bigint>();
  let total = 0n;
  for (const t of ordered) {
    total += legOf(t);
    running.set(t.id, total);
  }
  // Lookups by transaction, so a long history does not cost a scan per row.
  const stateOf = new Map(
    s.states.filter((x) => x.accountId === id).map((x) => [x.transactionId, x]),
  );
  const splitsOf = new Map<string, typeof s.splits>();
  for (const x of s.splits)
    splitsOf.set(x.transactionId, [
      ...(splitsOf.get(x.transactionId) ?? []),
      x,
    ]);
  const cleared = ordered
    .filter((t) => stateOf.get(t.id)?.cleared)
    .reduce((n, t) => n + legOf(t), 0n);
  // Newest first; running balances above are over the whole history, so a
  // page or a search never changes what a row's balance says.
  const needle = query.toLowerCase();
  const matching = [...ordered]
    .reverse()
    .filter(
      (t) =>
        !needle ||
        t.payee.toLowerCase().includes(needle) ||
        t.memo.toLowerCase().includes(needle),
    );
  const view = await readRegisterView();
  const visible = matching.filter((t) =>
    registerRowShown(
      day(t.date),
      Boolean(stateOf.get(t.id)?.reconciliationId),
      view,
      s.today,
    ),
  );
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageNumber = Math.min(
    pages,
    Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1),
  );
  const rows = visible.slice(
    (pageNumber - 1) * PAGE_SIZE,
    pageNumber * PAGE_SIZE,
  );
  const accountHref = `/accounts/${id}${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  const hiddenByView = visible.length === 0 && matching.length > 0;
  // Month-end balances for the last twelve months, from the same running total.
  const history: { label: string; value: bigint }[] = [];
  {
    const current = s.today.slice(0, 7);
    let cursor = 0;
    let balanceSoFar = 0n;
    for (let i = 11; i >= 0; i--) {
      const month = nextMonth(current, -i);
      while (
        cursor < ordered.length &&
        day(ordered[cursor].date).slice(0, 7) <= month
      )
        balanceSoFar = running.get(ordered[cursor++].id)!;
      history.push({ label: month, value: balanceSoFar });
    }
  }
  const firstActivity = ordered[0] ? day(ordered[0].date).slice(0, 7) : null;
  const shownHistory = history.filter(
    (h) => firstActivity !== null && h.label >= firstActivity,
  );
  const pageHref = (n: number) =>
    `/accounts/${id}?page=${n}${query ? `&q=${encodeURIComponent(query)}` : ""}`;
  const voided = register.filter((t) => t.voidedAt);
  // YNAB offers Delete only when nothing but a starting balance was recorded.
  const deletable = active.every((t) => t.kind === "OPENING");
  const linked = await accountLink(id);
  // YNAB's unapproved imports: marked in the register and approved in place.
  const waiting = await unapprovedImports();
  const toApprove = waiting.byAccount.get(id) ?? [];
  const categoryNeededIds = new Set(
    s.categories.filter((category) => category.system && !category.paymentAccountId).map((category) => category.id),
  );
  const toCategorize = active.filter((transaction) =>
    (splitsOf.get(transaction.id) ?? []).some((split) => categoryNeededIds.has(split.categoryId)),
  ).length;
  const entryOf = (transactionId: string) => {
    const w = waiting.byTransaction.get(transactionId);
    return w && w.accountId === id ? w.entryId : null;
  };
  // Pending at the bank: shown above the ledger, never inside its figures.
  const pending = (await pendingBankEntries()).filter(
    (e) => e.accountId === id,
  );
  // Which schedule already covers each transaction, so Repeat says so
  // instead of letting the owner make the same schedule twice.
  const coverage = await scheduleCoverage(
    (await requireUser()).userId,
    s.budget.id,
    visible.map((t) => t.id),
  );
  const scheduledAs = (t: (typeof visible)[number]) => {
    const found = coveringSchedule(t, coverage.schedules, coverage.handledBy);
    return found
      ? {
          id: found.schedule.id,
          name: found.schedule.name,
          cadence: found.schedule.cadence,
          interval: found.schedule.interval,
          linked: found.linked,
        }
      : undefined;
  };
  if (await isPhone()) {
    const categoryName = (categoryId: string) =>
      s.categories.find((c) => c.id === categoryId)?.name ?? "Unknown";
    const accountName = (accountId: string) =>
      s.accounts.find((a) => a.id === accountId)?.name ?? "account";
    const phoneRow = (t: (typeof ordered)[number]): PhoneTxn => {
      const splits = splitsOf.get(t.id) ?? [];
      const otherId = t.transferAccountId
        ? t.accountId === id
          ? t.transferAccountId
          : t.accountId
        : null;
      return {
        id: t.id,
        date: day(t.date),
        payee: otherId ? `Transfer: ${accountName(otherId)}` : t.payee,
        sub: otherId
          ? ""
          : splits.length > 1
            ? "Split"
            : splits[0]
              ? categoryName(splits[0].categoryId)
              : t.kind === "INCOME"
                ? account.participation === "BUDGET"
                  ? "Ready to Assign"
                  : "Off budget"
                : "",
        amount: legOf(t),
        cleared: Boolean(stateOf.get(t.id)?.cleared),
        reconciled: Boolean(stateOf.get(t.id)?.reconciliationId),
        unapprovedEntryId: entryOf(t.id),
        unplanned: s.reviews.get(t.id) === "UNPLANNED",
      };
    };
    // The phone lists further back instead of paging.
    const shown = visible.slice(0, pageNumber * PAGE_SIZE);
    const picked = txn ? active.find((t) => t.id === txn) : undefined;
    const pickedSplits = picked ? (splitsOf.get(picked.id) ?? []) : [];
    const pickedOther = picked?.transferAccountId
      ? picked.accountId === id
        ? picked.transferAccountId
        : picked.accountId
      : null;
    return (
      <PhoneAccount
        panel={panel}
        budgetId={s.budget.id}
        today={s.today}
        dateFormat={s.budget.dateFormat}
        account={account}
        balance={balance}
        cleared={cleared}
        toApprove={toApprove}
        toCategorize={toCategorize}
        pending={pending}
        categories={spendable}
        rows={shown.map(phoneRow)}
        query={query}
        view={view}
        hiddenByView={hiddenByView}
        moreHref={
          visible.length > shown.length
            ? `/accounts/${id}?page=${pageNumber + 1}${query ? `&q=${encodeURIComponent(query)}` : ""}`
            : undefined
        }
        selected={
          picked && {
            txn: phoneRow(picked),
            account: account.name,
            kind: picked.kind,
            offBudget: account.participation !== "BUDGET",
            memo: picked.memo,
            splits: pickedSplits.map((x) => ({
              name: categoryName(x.categoryId),
              needsCategory: s.categories.some((c) => c.id === x.categoryId && c.system && !c.paymentAccountId),
              amount: x.amount,
            })),
            recurring:
              ["EXPENSE", "INCOME", "TRANSFER"].includes(picked.kind)
                ? {
                    accountId: picked.accountId,
                    transferAccountId: picked.transferAccountId,
                    kind: picked.kind as "EXPENSE" | "INCOME" | "TRANSFER",
                    amount: decimal(picked.amount),
                    payee: picked.payee,
                    memo: picked.memo,
                    timezone: s.budget.timezone,
                    existing: scheduledAs(picked),
                    splits: pickedSplits.map((x) => ({
                      categoryId: x.categoryId,
                      amount: decimal(x.amount),
                    })),
                  }
                : null,
            edit:
              picked.accountId === id && !account.closed
                ? {
                    budgetId: s.budget.id,
                    accountId: id,
                    offBudget: account.participation !== "BUDGET",
                    today: s.today,
                    accounts: transferable,
                    categories: spendable,
                    initial: {
                      id: picked.id,
                      kind: picked.kind,
                      date: day(picked.date),
                      amount: dollars(picked.amount),
                      payee: picked.payee,
                      memo: picked.memo,
                      cleared: stateOf.get(picked.id)?.cleared ?? false,
                      unplanned: s.reviews.get(picked.id) === "UNPLANNED",
                      transferAccountId: picked.transferAccountId,
                      refundOfId: picked.refundOfId,
                      splits: pickedSplits.map((x) => ({
                        categoryId: x.categoryId,
                        amount: dollars(x.amount),
                      })),
                    },
                  }
                : null,
            transferNote: pickedOther ? (
              <>
                The other side of a transfer. Change it from{" "}
                <Link className="link" href={`/accounts/${pickedOther}`}>
                  {accountName(pickedOther)}
                </Link>
                .
              </>
            ) : undefined,
          }
        }
      />
    );
  }
  const loan = account.closed
    ? null
    : await loanPlan(id, { extra, lump, lumpMonth });
  const loanMonth = (m: string | null) =>
    m
      ? new Intl.DateTimeFormat("en-US", {
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${m}-01T00:00:00Z`))
      : "Not within 50 years";
  const latest = s.reconciliations.find((r) => r.accountId === id);
  const name = (categoryId: string) =>
    s.categories.find((c) => c.id === categoryId)?.name ?? "Unknown";
  const deleted = voided.filter(
    (t) =>
      t.voidReason === "Deleted in register" &&
      !t.noticeDismissedAt &&
      !s.transactions.some((next) => next.replacesId === t.id),
  );
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title={account.name}
        meta={`${account.participation === "BUDGET" ? "Budget" : "Tracking"} · ${account.type.replaceAll("_", " ").toLowerCase()}${account.closed ? " · closed" : ""}`}
        actions={
          <>
            {!account.closed && (
              <Link className="btn btn-secondary" href="#reconcile">
                Reconcile
              </Link>
            )}
            <Link className="btn btn-ghost" href="#settings">
              Settings
            </Link>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <SummaryStrip ariaLabel="Account balances">
          <Stat
            as="article"
            lead
            label="Current balance"
            value={usd(balance)}
            tone={balance < 0n ? "negative" : "positive"}
          />
          <Stat
            as="article"
            label="Cleared balance"
            value={usd(cleared)}
            tone={cleared < 0n ? "negative" : "positive"}
          />
          <Stat
            as="article"
            label="Uncleared"
            value={usd(balance - cleared)}
            tone={balance === cleared ? "neutral" : "warning"}
          />
          {latest && (
            <Stat
              label="Last reconciled"
              value={formatDate(latest.date, s.budget.dateFormat)}
              note={
                <>
                  Against <Amount>{usd(latest.observed)}</Amount>
                  {latest.affectedAt
                    ? " · a later correction affected this statement; review it"
                    : ""}
                </>
              }
            />
          )}
        </SummaryStrip>
        {(account.closed || deleted.length > 0) && (
          <div className="mt-3">
            <NoticeList>
              {account.closed && (
                <Notice>
                  This account is closed. Reopen it under Settings before
                  recording anything new.
                </Notice>
              )}
              {deleted.length > 1 && (
                <Notice
                  action={
                    <FinanceForm
                      budgetId={s.budget.id}
                      command={{
                        type: "transaction.dismissDelete",
                        ids: deleted.map((t) => t.id),
                      }}
                      label="Dismiss all"
                      inline
                    />
                  }
                >
                  {deleted.length} deleted transactions can be hidden. Undo
                  will no longer be offered.
                </Notice>
              )}
              {deleted.map((t) => (
                <Notice
                  key={t.id}
                  action={
                    <span className="flex flex-wrap items-center gap-2">
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "transaction.dismissDelete",
                          ids: [t.id],
                        }}
                        label="Dismiss"
                        inline
                      />
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "transaction.undo", id: t.id }}
                        label="Undo delete"
                        inline
                      >
                        <label className="check-field">
                          <input type="checkbox" name="acknowledgeReconciled" />
                          Also if reconciled
                        </label>
                      </FinanceForm>
                    </span>
                  }
                >
                  Deleted {formatDate(t.date, s.budget.dateFormat)} ·{" "}
                  {t.payee || t.kind} · <Amount>{usd(legOf(t))}</Amount>
                </Notice>
              ))}
            </NoticeList>
          </div>
        )}
        {!account.closed && (
          <details className="surface mt-4">
            <summary
              id="record-heading"
              className="section-title cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden"
            >
              Record a transaction
            </summary>
            <div className="px-4 pb-4">
              <TransactionForm
                budgetId={s.budget.id}
                accountId={id}
                offBudget={account.participation !== "BUDGET"}
                today={s.today}
                accounts={transferable}
                categories={spendable}
              />
            </div>
          </details>
        )}
        <PendingEntries
          entries={pending}
          categories={spendable}
          dateFormat={s.budget.dateFormat}
        />
        <section className="surface mt-4" aria-labelledby="transactions-heading">
          <div className="flex items-center justify-between gap-3 px-4 py-2 lg:px-6">
            <span className="flex min-w-0 items-baseline gap-2">
              <h2 id="transactions-heading" className="section-title">
                Transactions
              </h2>
              <span className="text-meta text-ink-3">{visible.length}</span>
            </span>
            <RegisterViewOptions
              view={view}
              today={s.today}
              returnTo={accountHref}
            />
          </div>
          {(toCategorize > 0 || toApprove.length > 0 || active.length > PAGE_SIZE || query) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline px-4 py-2 lg:px-6">
            {toCategorize > 0 && (
              <Link className="btn btn-secondary btn-sm" href={`/accounts/register?review=needs-category&account=${id}`}>
                {toCategorize} need {toCategorize === 1 ? "a category" : "categories"}
              </Link>
            )}
            {toApprove.length > 0 && (
              <span className="unapproved-bar flex flex-wrap items-center gap-2">
                <span className="text-label text-ink">
                  {toApprove.length} to approve
                </span>
                <BulkApprove entryIds={toApprove} />
              </span>
            )}
            {active.length > PAGE_SIZE || query ? (
              <Form
                action={`/accounts/${id}`}
                scroll={false}
                className="finance-form finance-form-inline"
              >
                <label className="min-w-0">
                  <span className="sr-only">Search payee or memo</span>
                  <input
                    name="q"
                    type="search"
                    defaultValue={query}
                    placeholder="Search payee or memo"
                    aria-label="Search payee or memo"
                    className="w-56!"
                  />
                </label>
                <button className="btn btn-secondary" type="submit">
                  Search
                </button>
                {query && (
                  <Link className="btn btn-ghost" href={`/accounts/${id}`}>
                    Clear
                  </Link>
                )}
              </Form>
            ) : null}
          </div>
          )}
          {query && (
            <p className={`border-t border-hairline px-4 py-1.5 lg:px-6 ${MUTED}`}>
              {visible.length} matching “{query}”.
            </p>
          )}
          {!rows.length && query && (
            <EmptyState title="Nothing on this account matches." />
          )}
          {!rows.length && !query && !hiddenByView && (
            <EmptyState title="No transactions yet on this account.">
              {account.participation === "BUDGET"
                ? "Record spending above and it will appear in your budget."
                : "Tracking accounts never add money to your budget."}
            </EmptyState>
          )}
          {!rows.length && !query && hiddenByView && (
            <EmptyState
              title="This view is hiding every transaction."
              action={
                !view.showReconciled ? (
                  <ShowReconciled view={view} returnTo={accountHref} />
                ) : undefined
              }
            >
              Change View to see them.
            </EmptyState>
          )}
          <RegisterChecks
            budgetId={s.budget.id}
            flags={FLAG_COLORS.map((color) => ({
              color,
              label: flagName(color, s.flagNames),
            }))}
            categories={s.categories
              .filter((c) => !c.archived && !c.paymentAccountId && !c.system)
              .map((c) => ({
                id: c.id,
                name: c.name,
                group: s.groups.find((group) => group.id === c.groupId)?.name ?? "Other",
                available: (
                  s.projection.categories.find((row) => row.id === c.id)?.available ?? 0n
                ).toString(),
              }))}
          >
          {rows.length > 0 && (
            <RegisterHead showBalance={view.showRunningBalance} checks />
          )}
          {rows.map((t) => {
            const leg = legOf(t);
            const state = stateOf.get(t.id);
            const splits = splitsOf.get(t.id) ?? [];
            const other = t.transferAccountId
              ? s.accounts.find(
                  (a) =>
                    a.id ===
                    (t.accountId === id ? t.transferAccountId : t.accountId),
                )
              : undefined;
            const primary = t.accountId === id;
            const flag = s.flags.get(t.id);
            const unapproved = entryOf(t.id);
            return (
              <details
                className="register-row border-b border-hairline last:border-b-0 [&[open]>summary]:bg-row-selected"
                key={t.id}
                name="register-row"
                data-unapproved={unapproved ? "" : undefined}
              >
                <summary className={registerSummary(view.showRunningBalance, true)}>
                  <span className="hidden sm:block">
                    <RowCheck
                      id={t.id}
                      label={`Select ${t.payee || "transaction"}`}
                    />
                  </span>
                  <span className={REGISTER_DATE}>
                    {["EXPENSE", "INCOME", "TRANSFER"].includes(t.kind) ? (
                      <RepeatDate
                        compact
                        budgetId={s.budget.id}
                        date={day(t.date)}
                        dateFormat={s.budget.dateFormat}
                        accountId={t.accountId}
                        transferAccountId={t.transferAccountId}
                        kind={t.kind as "EXPENSE" | "INCOME" | "TRANSFER"}
                        amount={decimal(t.amount)}
                        payee={t.payee}
                        memo={t.memo}
                        timezone={s.budget.timezone}
                        existing={scheduledAs(t)}
                        splits={splits.map((x) => ({
                          categoryId: x.categoryId,
                          amount: decimal(x.amount),
                        }))}
                      />
                    ) : (
                      formatDate(t.date, s.budget.dateFormat)
                    )}
                  </span>
                  <span className={REGISTER_PAYEE}>
                    {view.showFlags && flag && (
                      <span
                        className="flag-dot mr-1.5"
                        data-flag={flag}
                        title={flagName(flag as FlagColor, s.flagNames)}
                        aria-label={`${flagName(flag as FlagColor, s.flagNames)} flag`}
                        role="img"
                      />
                    )}
                    {unapproved && (
                      <Pill tone="accent" className="mr-1.5">
                        New
                      </Pill>
                    )}
                    {s.reviews.get(t.id) === "UNPLANNED" && (
                      <Pill tone="warning" className="mr-1.5">
                        Unplanned
                      </Pill>
                    )}
                    {unapproved && (
                      <StopToggle>
                        <ProviderAction
                          command={{ type: "entry.approve", entryId: unapproved }}
                          label="Approve"
                          busyLabel="Approving…"
                          secondary
                        />
                      </StopToggle>
                    )}
                    {t.payee || t.kind.replaceAll("_", " ")}
                    <span className={REGISTER_SUB}>
                      <span className="sm:hidden">
                        {formatDate(t.date, s.budget.dateFormat)} ·{" "}
                      </span>
                      {other
                        ? `Transfer · ${other.name}`
                        : splits.length > 0
                          ? splits.map((x) => name(x.categoryId)).join(" · ")
                          : t.kind === "INCOME"
                            ? account.participation === "BUDGET"
                              ? "Ready to Assign"
                              : "Off budget"
                            : ""}
                    </span>
                  </span>
                  <RegisterFlowCells amount={leg} />
                  {view.showRunningBalance && (
                    <span
                      className={`${REGISTER_BALANCE} ${
                        running.get(t.id)! < 0n ? "text-negative" : "text-positive"
                      }`}
                    >
                      <Amount>{usd(running.get(t.id)!)}</Amount>
                    </span>
                  )}
                  <span
                    className={`${REGISTER_STATE} ${
                      state?.cleared ? "" : "text-warning"
                    }`}
                  >
                    {state?.reconciliationId ? (
                      <Lock size={14} aria-label="Reconciled" className="ml-auto text-ink-3" />
                    ) : state?.cleared ? (
                      "Cleared"
                    ) : (
                      "Uncleared"
                    )}
                  </span>
                </summary>
                <div className={DETAIL_WRAP}>
                  <div className="hidden items-start justify-between gap-2 border-b border-hairline pb-2 md:flex">
                    <div className="min-w-0">
                      {/* The payee stays on the highlighted row; repeating it
                          here would say it twice to assistive technology. */}
                      <span className="block text-caps uppercase text-ink-3">
                        Selected transaction
                      </span>
                      <span className="block text-drawer-title text-ink">
                        Details and edits
                      </span>
                    </div>
                    <DetailsClose />
                  </div>
                  {unapproved && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-accent-soft px-3 py-2">
                      <span className="text-table text-ink">
                        Imported from your bank. Approve it as it is, or edit
                        it below, which approves it too.
                      </span>
                      <ProviderAction
                        command={{ type: "entry.approve", entryId: unapproved }}
                        label="Approve"
                        busyLabel="Approving…"
                      />
                    </div>
                  )}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <dt className={DT}>Kind</dt>
                      <dd className={DD}>{t.kind.replaceAll("_", " ")}</dd>
                    </div>
                    <div>
                      <dt className={DT}>Cleared</dt>
                      <dd className={DD}>
                        {state?.cleared ? "Yes" : "No"}
                        {state?.reconciliationId ? " · reconciled" : ""}
                      </dd>
                    </div>
                    {t.memo && (
                      <div className="col-span-2">
                        <dt className={DT}>Memo</dt>
                        <dd className={DD}>{t.memo}</dd>
                      </div>
                    )}
                    {splits.length > 0 && (
                      <div className="col-span-2">
                        <dt className={DT}>Splits</dt>
                        <dd className={DD}>
                          {splits.map((x) => (
                            <span
                              className="flex justify-between gap-2"
                              key={x.id}
                            >
                              {name(x.categoryId)}
                              <span data-numeric>
                                <Amount>{usd(x.amount)}</Amount>
                              </span>
                            </span>
                          ))}
                        </dd>
                      </div>
                    )}
                    <div className="col-span-2">
                      <dt className={DT}>Transaction ID</dt>
                      <dd className="mt-0.5">
                        <code className="break-all text-meta text-ink-3">
                          {t.id}
                        </code>
                      </dd>
                    </div>
                  </dl>
                  {!account.closed && (
                    <div className="flex flex-col gap-4 border-t border-hairline pt-4">
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{ type: "transaction.flag", ids: [t.id] }}
                        label="Save flag"
                        inline
                      >
                        <label>
                          <span className="sr-only">Flag</span>
                          <select
                            name="flag"
                            aria-label="Flag"
                            defaultValue={flag ?? ""}
                          >
                            <option value="">No flag</option>
                            {FLAG_COLORS.map((color) => (
                              <option key={color} value={color}>
                                {flagName(color, s.flagNames)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </FinanceForm>
                      <FinanceForm
                        budgetId={s.budget.id}
                        command={{
                          type: "transaction.clear",
                          id: t.id,
                          accountId: id,
                        }}
                        label="Update cleared state"
                      >
                        <label className="check-field">
                          <input
                            type="checkbox"
                            name="cleared"
                            defaultChecked={state?.cleared ?? false}
                          />
                          Cleared by the institution on this account
                        </label>
                        {state?.reconciliationId && (
                          <label className="check-field">
                            <input type="checkbox" name="acknowledgeReconciled" />
                            This leg was reconciled; the statement comparison
                            will need review.
                          </label>
                        )}
                      </FinanceForm>
                      {t.replacesId && (
                        <FinanceForm
                          budgetId={s.budget.id}
                          command={{ type: "transaction.undo", id: t.id }}
                          label="Undo last edit"
                        >
                          {(state?.reconciliationId ||
                            s.states.some(
                              (prior) =>
                                prior.transactionId === t.replacesId &&
                                prior.accountId === id &&
                                prior.reconciliationId,
                            )) && (
                            <label className="check-field">
                              <input
                                type="checkbox"
                                name="acknowledgeReconciled"
                              />
                              This transaction was reconciled; review the
                              statement again.
                            </label>
                          )}
                        </FinanceForm>
                      )}
                      {primary ? (
                        <details className="rounded-md border border-hairline p-3">
                          <summary className="cursor-pointer text-label text-ink">
                            Edit transaction
                          </summary>
                          <div className="mt-2">
                            <TransactionForm
                              budgetId={s.budget.id}
                              accountId={id}
                              offBudget={account.participation !== "BUDGET"}
                              today={s.today}
                              accounts={transferable}
                              categories={spendable}
                              initial={{
                                id: t.id,
                                kind: t.kind,
                                date: day(t.date),
                                amount: dollars(t.amount),
                                payee: t.payee,
                                memo: t.memo,
                                cleared: state?.cleared ?? false,
                                unplanned: s.reviews.get(t.id) === "UNPLANNED",
                                transferAccountId: t.transferAccountId,
                                refundOfId: t.refundOfId,
                                splits: splits.map((x) => ({
                                  categoryId: x.categoryId,
                                  amount: dollars(x.amount),
                                })),
                              }}
                            />
                          </div>
                        </details>
                      ) : (
                        other && (
                          <p className={MUTED}>
                            This is the other side of a transfer. Correct it
                            from{" "}
                            <Link className={LINK} href={`/accounts/${other.id}`}>
                              {other.name}
                            </Link>
                            .
                          </p>
                        )
                      )}
                      <details className="rounded-md border border-hairline p-3">
                        <summary className="cursor-pointer text-label text-negative">
                          Delete transaction
                        </summary>
                        <div className="mt-2">
                          <FinanceForm
                            budgetId={s.budget.id}
                            command={{
                              type: "transaction.void",
                              id: t.id,
                              reason: "Deleted in register",
                            }}
                            label="Delete transaction"
                          >
                            <label className="check-field">
                              <input
                                type="checkbox"
                                name="acknowledgeReconciled"
                              />
                              Any affected reconciliation will need review.
                            </label>
                          </FinanceForm>
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
          </RegisterChecks>
          {pages > 1 && (
            <nav
              aria-label="Transaction pages"
              className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-2 lg:px-6"
            >
              <span className={MUTED}>
                Page {pageNumber} of {pages} · {matching.length} transactions
              </span>
              <span className="flex gap-1">
                {pageNumber > 1 && (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={pageHref(pageNumber - 1)}
                    scroll={false}
                  >
                    Newer
                  </Link>
                )}
                {pageNumber < pages && (
                  <Link
                    className="btn btn-secondary btn-sm"
                    href={pageHref(pageNumber + 1)}
                    scroll={false}
                  >
                    Older
                  </Link>
                )}
              </span>
            </nav>
          )}
        </section>
        {shownHistory.length > 1 && (
          <section className="surface mt-4 p-4" aria-labelledby="history-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="history-heading" className="section-title">
                Balance over time
              </h2>
              <p className={MUTED}>
                <Amount>{usd(shownHistory[0].value)}</Amount> at the end of{" "}
                {shownHistory[0].label} →{" "}
                <Amount>{usd(shownHistory.at(-1)!.value)}</Amount> now
              </p>
            </div>
            <TrendLine points={shownHistory} label={`${account.name} balance`} />
          </section>
        )}
        {loan && (
          <section
            className="surface mt-4 p-4"
            aria-labelledby="loan-planner-heading"
          >
            <h2 id="loan-planner-heading" className="section-title">
              Loan planner
            </h2>
            <p className={`mt-1 ${MUTED}`}>
              What paying more does to this debt alone, using its recorded rate
              and minimum. Nothing here changes your budget; compare every debt
              together on{" "}
              <Link className={LINK} href="/debt">
                Debt
              </Link>
              .
            </p>
            <Form
              action={`/accounts/${id}`}
              scroll={false}
              className="finance-form mt-3"
            >
              <div className="field-grid" data-cols="4">
                <label>
                  Extra each month (USD)
                  <input name="extra" inputMode="decimal" defaultValue={extra ?? ""} />
                </label>
                <label>
                  One-time payment (USD)
                  <input name="lump" inputMode="decimal" defaultValue={lump ?? ""} />
                </label>
                <label>
                  Paid in
                  <input name="lumpMonth" type="month" defaultValue={loan.lumpMonth} />
                </label>
                <span className="flex items-end">
                  <button className="btn btn-secondary btn-lg w-full" type="submit">
                    Show the difference
                  </button>
                </span>
              </div>
            </Form>
            <dl className="loan-planner mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  [
                    "Paying minimums only",
                    <>
                      {loanMonth(loan.baseline.payoffMonth)} ·{" "}
                      <Amount>{usd(loan.baseline.totalInterest)}</Amount> interest
                    </>,
                  ],
                  [
                    "With this plan",
                    <>
                      {loanMonth(loan.planned.payoffMonth)} ·{" "}
                      <Amount>{usd(loan.planned.totalInterest)}</Amount> interest
                    </>,
                  ],
                  [
                    "Time saved",
                    loan.monthsSaved === null
                      ? "—"
                      : `${loan.monthsSaved} month${loan.monthsSaved === 1 ? "" : "s"}`,
                  ],
                  ["Interest saved", <Amount key="i">{usd(loan.interestSaved)}</Amount>],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className={DT}>{label}</dt>
                  <dd className="mt-0.5 text-body font-medium text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            {loan.baseline.negativelyAmortising.length > 0 && (
              <p className={`mt-3 ${MUTED}`}>
                At the minimum alone, interest outgrows the payment, so this
                debt never clears.
              </p>
            )}
          </section>
        )}
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          {!account.closed && (
            <section
              id="reconcile"
              className="surface scroll-mt-16 p-4"
              aria-labelledby="reconcile-heading"
            >
              <h2 id="reconcile-heading" className="section-title">
                Reconcile
              </h2>
              <p className={`mt-1 ${MUTED}`}>
                Enter the balance your institution shows. Cleared entries
                through that date are compared against it.
              </p>
              <div className="mt-3">
                <FinanceForm
                  budgetId={s.budget.id}
                  command={{ type: "reconcile", accountId: id }}
                  label="Reconcile"
                  reset
                >
                  <div className="field-grid" data-cols="2">
                    <label>
                      Statement date
                      <input
                        type="date"
                        name="date"
                        required
                        min="1900-01-01"
                        max={s.today}
                        defaultValue={s.today}
                      />
                    </label>
                    <label>
                      Statement balance (USD)
                      <input
                        name="observed"
                        inputMode="decimal"
                        required
                        defaultValue={dollars(cleared)}
                      />
                    </label>
                  </div>
                  <label>
                    Adjustment reason (only if it differs)
                    <input name="adjustmentReason" maxLength={500} />
                  </label>
                </FinanceForm>
              </div>
            </section>
          )}
          <section
            id="settings"
            className="surface scroll-mt-16 p-4"
            aria-labelledby="settings-heading"
          >
            <h2 id="settings-heading" className="section-title">
              Account settings
            </h2>
            <div className="mt-3">
              <FinanceForm
                budgetId={s.budget.id}
                command={{
                  type: "account.update",
                  id,
                  version: account.version,
                }}
                label="Save account"
              >
                <label>
                  Account name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    defaultValue={account.name}
                  />
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    name="closed"
                    defaultChecked={account.closed}
                  />
                  Closed
                </label>
                {!account.closed && balance !== 0n && (
                  <label className="check-field">
                    <input type="checkbox" name="zeroBalance" />
                    When closing, add an adjustment of{" "}
                    <Amount>{usd(-balance)}</Amount> to bring it to zero
                  </label>
                )}
                <p className={MUTED}>
                  A closed account keeps its history in your reports and leaves
                  your account lists.{" "}
                  {balance !== 0n
                    ? "Money still in it is zeroed by an adjustment, which may change Ready to Assign. "
                    : ""}
                  Type and budget participation are fixed once an account
                  exists.
                </p>
              </FinanceForm>
            </div>
            {linked?.bank && (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className={MUTED}>
                  Linked to {linked.institution} · {linked.name}
                  {linked.mask ? ` ····${linked.mask}` : ""}. Unlinking stops
                  new transactions from syncing; everything already imported
                  stays.
                </p>
                <div className="mt-2">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "account.unlink", id }}
                    label="Unlink from bank"
                    inline
                  />
                </div>
              </div>
            )}
            {deletable && (
              <div className="mt-4 border-t border-hairline pt-3">
                <p className={MUTED}>
                  This account has no history beyond its starting balance, so
                  it can be deleted outright instead of closed.
                </p>
                <div className="mt-2">
                  <FinanceForm
                    budgetId={s.budget.id}
                    command={{ type: "account.delete", id }}
                    label="Delete account"
                    inline
                    buttonClassName="btn-danger"
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
