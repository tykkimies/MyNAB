import Link from "next/link";
import { DETAILS_DRAWER } from "@/components/drawer";
import { DetailsClose } from "@/components/details-close";
import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getRules } from "@/application/rules";
import { FinanceForm } from "@/components/finance-form";
import { RuleFields } from "@/components/rule-fields";
import { formatUSD, money } from "@/domain/money";
import { formatDate } from "@/domain/dates";
import Form from "next/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Help } from "@/components/ui/help";

const MUTED = "text-table text-ink-2";
export default async function Rules({
  searchParams,
}: {
  searchParams: Promise<{ transactionId?: string }>;
}) {
  const state = await financePage();
  const { transactionId } = await searchParams;
  const data = await getRules(
    (await requireUser()).userId,
    state.budget.id,
    transactionId,
  );
  const accounts = state.accounts.filter((a) => !a.closed),
    categories = state.categories.filter(
      (c) => !c.archived && !c.paymentAccountId,
    );
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        breadcrumb={[{ href: "/accounts", label: "Accounts" }]}
        title="Rules"
        meta={`${data.rules.length} saved · rules never run on their own`}
        actions={
          <>
            <Link className="btn btn-primary" href="#create">
              New rule
            </Link>
            <Help label="About rules" align="right">
              Save reusable conditions, preview their effect on a sample
              transaction, and explicitly apply reviewed changes. New imports
              that match an enabled rule arrive already filed by it; nothing
              already in your ledger changes unless you apply it.
            </Help>
          </>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="surface" aria-labelledby="saved-heading">
              <div className="px-4 py-2 lg:px-6">
                <h2 id="saved-heading" className="section-title">
                  Saved rules
                </h2>
              </div>
              {!data.rules.length ? (
                <EmptyState title="No rules yet.">
                  Start with one repeated decision, then preview it.
                </EmptyState>
              ) : (
                <div className="border-t border-hairline">
                  {data.rules.map((rule) => (
                    <details
                      key={rule.id}
                      name="saved-rule"
                      className="border-b border-hairline last:border-b-0 [&[open]>summary]:bg-row-selected"
                    >
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-table hover:bg-row-hover lg:px-6">
                        <span className="font-medium text-ink">
                          {rule.name} · {rule.enabled ? "Enabled" : "Disabled"} ·
                          priority {rule.priority}
                        </span>
                        <span className="ml-auto text-meta text-ink-3">Edit ▾</span>
                      </summary>
                      <div
                        className={`border-t border-hairline px-4 py-3 lg:px-6 ${DETAILS_DRAWER}`}
                      >
                        <div className="mb-3 hidden items-start justify-between gap-2 border-b border-hairline pb-2 md:flex">
                          <span className="text-caps uppercase text-ink-3">
                            Edit rule
                          </span>
                          <DetailsClose />
                        </div>
                        <FinanceForm
                          budgetId={state.budget.id}
                          command={{
                            type: "rule.save",
                            id: rule.id,
                            revision: rule.revision,
                          }}
                          label="Save rule changes"
                        >
                          <RuleFields
                            accounts={accounts}
                            categories={categories}
                            rule={rule}
                          />
                        </FinanceForm>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>
            {data.suggestions.length > 0 && (
              <section className="surface" aria-labelledby="suggested-rules">
                <div className="flex items-center justify-between gap-2 px-4 py-2 lg:px-6">
                  <h2 id="suggested-rules" className="section-title">
                    Suggested from your choices
                  </h2>
                  <Help label="About suggested rules" align="right">
                    You filed each payee below to the same category every
                    time. A rule is only created if you choose to, and it still
                    never runs on its own.
                  </Help>
                </div>
                <ul className="border-t border-hairline">
                  {data.suggestions.slice(0, 10).map((s) => {
                    const category = categories.find(
                      (c) => c.id === s.categoryId,
                    );
                    if (!category) return null;
                    return (
                      <li
                        key={s.payee}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-1.5 last:border-b-0 lg:px-6"
                      >
                        <span className="text-table">
                          <strong className="font-medium text-ink">{s.payee}</strong>{" "}
                          → {category.name}
                          <span className="ledger-sub">
                            Filed this way {s.support} times
                          </span>
                        </span>
                        <FinanceForm
                          budgetId={state.budget.id}
                          command={{
                            type: "rule.save",
                            name: s.payee,
                            payeeMatch: s.payee,
                            matchMode: "EXACT",
                            categoryId: s.categoryId,
                          }}
                          label="Create this rule"
                          inline
                          buttonClassName="btn-sm"
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <section
              id="create"
              className="surface scroll-mt-16 p-4"
              aria-labelledby="create-heading"
            >
              <h2 id="create-heading" className="section-title">
                Create a rule
              </h2>
              <div className="mt-3">
                <FinanceForm
                  budgetId={state.budget.id}
                  command={{ type: "rule.save" }}
                  label="Save rule"
                  reset
                >
                  <RuleFields accounts={accounts} categories={categories} />
                </FinanceForm>
              </div>
            </section>
            <section className="surface p-4" aria-labelledby="preview-heading">
              <div className="flex items-center justify-between gap-2">
                <h2 id="preview-heading" className="section-title">
                  Preview proposed changes
                </h2>
                <Help label="About previews" align="right">
                  Choose a recent income or expense as a sample. Previewing
                  changes nothing; applying is a separate, explicit step. Split
                  categories are protected. Description conditions use its
                  memo.
                </Help>
              </div>
              <Form
                action="/accounts/rules"
                scroll={false}
                className="finance-form mt-3"
              >
                <label>
                  Sample transaction
                  <select
                    name="transactionId"
                    aria-label="Sample transaction"
                    defaultValue={transactionId ?? ""}
                    required
                  >
                    <option value="" disabled>
                      Choose a transaction
                    </option>
                    {data.transactions.map((t) => (
                      <option key={t.id} value={t.id}>
                        {formatDate(t.date, state.budget.dateFormat)} ·{" "}
                        {t.payee || "No payee"} · {formatUSD(money(t.amount))}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn btn-secondary">
                    Preview rules
                  </button>
                </div>
              </Form>
              {data.transaction && (
                <div className="mt-4 border-t border-hairline pt-3">
                  <h3 className="text-caps uppercase text-ink-3">
                    Protect owner choices
                  </h3>
                  <p className={`mt-1 ${MUTED}`}>
                    Checked fields cannot be changed by a rule. Uncheck only
                    fields you want this preview to change.
                  </p>
                  <div className="mt-2">
                    <FinanceForm
                      budgetId={state.budget.id}
                      command={{
                        type: "transaction.protect",
                        id: data.transaction.id,
                        fingerprint: data.fingerprint,
                        locked: [],
                      }}
                      label="Save field protection"
                    >
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {(
                          [
                            ["payee", "Payee"],
                            ["categoryId", "Category"],
                            ["memo", "Memo"],
                            ["tags", "Tags"],
                            ["transferAccountId", "Transfer destination"],
                          ] as const
                        ).map(([field, label]) => (
                          <label className="check-field" key={field}>
                            <input
                              type="checkbox"
                              name="locked"
                              value={field}
                              defaultChecked={data.locked.includes(field)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </FinanceForm>
                  </div>
                </div>
              )}
              {data.preview && (
                <div className="mt-4 border-t border-hairline pt-3" aria-live="polite">
                  <h3 className="text-caps uppercase text-ink-3">
                    Proposed result
                  </h3>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-table">
                    <dt className="text-ink-3">Payee</dt>
                    <dd>{data.preview.output.payee || "No payee"}</dd>
                    <dt className="text-ink-3">Category</dt>
                    <dd>
                      {state.categories.find(
                        (c) => c.id === data.preview!.output.categoryId,
                      )?.name ?? "Unchanged / no single category"}
                    </dd>
                    <dt className="text-ink-3">Memo</dt>
                    <dd>{data.preview.output.memo || "Empty"}</dd>
                    <dt className="text-ink-3">Tags</dt>
                    <dd>{data.preview.output.tags.join(", ") || "None"}</dd>
                    <dt className="text-ink-3">Transfer suggestion</dt>
                    <dd>
                      {state.accounts.find(
                        (a) => a.id === data.preview!.output.transferAccountId,
                      )?.name ?? "None"}
                    </dd>
                  </dl>
                  {!data.preview.explanation.length && (
                    <p className={`mt-2 ${MUTED}`}>No enabled rules matched.</p>
                  )}
                  {data.transaction &&
                    data.preview.explanation.some((e) => e.applied.length > 0) &&
                    !data.preview.transferIsSuggestion && (
                      <div className="mt-3">
                        <FinanceForm
                          budgetId={state.budget.id}
                          command={{
                            type: "rule.apply",
                            id: data.transaction.id,
                            fingerprint: data.fingerprint,
                          }}
                          label="Apply reviewed changes"
                        >
                          <p className={MUTED}>
                            This records a reversal and replacement while
                            keeping the date, amount and cleared state. The
                            original stays in history.
                          </p>
                          <label className="check-field">
                            <input type="checkbox" name="acknowledgeReconciled" />
                            I acknowledge changes to reconciled history
                          </label>
                        </FinanceForm>
                      </div>
                    )}
                  <ul className="mt-3 flex flex-col gap-1">
                    {data.preview.explanation.map((e) => (
                      <li
                        key={e.ruleId}
                        className="rounded-md bg-surface-sunken px-3 py-2 text-table"
                      >
                        <strong className="font-medium text-ink">{e.name}</strong>
                        <span className="ledger-sub">
                          Proposes: {e.applied.join(", ") || "no changes"}
                          {e.locked.length ? ` · Protected: ${e.locked.join(", ")}` : ""}
                          {e.superseded.length
                            ? ` · Earlier rule wins: ${e.superseded.join(", ")}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
