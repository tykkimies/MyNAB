import Link from "next/link";
import { DETAILS_DRAWER } from "@/components/drawer";
import { DetailsClose } from "@/components/details-close";
import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getRules } from "@/application/rules";
import { FinanceForm } from "@/components/finance-form";
import { RuleFields } from "@/components/rule-fields";
import { formatUSD, money } from "@/domain/money";
import { Amount } from "@/components/amount";
import { formatDate } from "@/domain/dates";
import Form from "next/form";
const panel =
  "finance-panel rounded-lg border border-border-warm bg-surface-card p-space-lg";
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
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-[1600px] flex-col gap-space-lg px-gutter py-space-lg lg:px-space-lg"
    >
      <header>
        <p className="font-label-caps text-label-caps uppercase tracking-widest text-text-secondary">
          Accounts / Automation
        </p>
        <h1 className="mt-space-sm font-headline-lg text-headline-lg leading-tight text-text-primary">
          Make repeat decisions simpler.
        </h1>
        <p className="mt-space-sm max-w-3xl text-body-md text-text-secondary">
          Save reusable conditions, preview their effect, and explicitly apply
          reviewed changes. Rules never run automatically.
        </p>
        <Link
          href="/accounts"
          className="mt-space-md inline-block text-secondary underline"
        >
          Back to accounts
        </Link>
      </header>
      <div className="grid items-start gap-space-lg xl:grid-cols-2">
        <div className="flex flex-col gap-space-lg">
          <section className={panel}>
            <h2 className="mb-space-md font-headline-md text-headline-md">
              Create a rule
            </h2>
            <FinanceForm
              budgetId={state.budget.id}
              command={{ type: "rule.save" }}
              label="Save rule"
              reset
            >
              <RuleFields accounts={accounts} categories={categories} />
            </FinanceForm>
          </section>
          {data.suggestions.length > 0 && (
            <section className={panel} aria-labelledby="suggested-rules">
              <h2
                id="suggested-rules"
                className="font-headline-md text-headline-md"
              >
                Suggested from your choices
              </h2>
              <p className="my-space-sm text-body-sm text-text-secondary">
                You filed each payee below to the same category every time. A
                rule is only created if you choose to, and it still never runs
                on its own.
              </p>
              <ul className="divide-y divide-border-warm">
                {data.suggestions.slice(0, 10).map((s) => {
                  const category = categories.find(
                    (c) => c.id === s.categoryId,
                  );
                  if (!category) return null;
                  return (
                    <li
                      key={s.payee}
                      className="flex flex-wrap items-center justify-between gap-space-sm py-space-sm"
                    >
                      <span className="text-body-md">
                        <strong>{s.payee}</strong> → {category.name}
                        <span className="block text-body-sm text-text-secondary">
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
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
        <div className="flex flex-col gap-space-lg">
          <section className={panel}>
            <h2 className="mb-space-md font-headline-md text-headline-md">
              Preview proposed changes
            </h2>
            <p className="mb-space-md text-body-sm text-text-secondary">
              Choose a recent income or expense as a sample. Previewing changes
              nothing; applying is a separate, explicit step. Split categories
              are protected. Description conditions use its memo.
            </p>
            <Form action="/accounts/rules" scroll={false} className="finance-form flex flex-col gap-space-md">
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
                      {t.payee || "No payee"} · <Amount>{formatUSD(money(t.amount))}</Amount>
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="secondary-button">
                Preview rules
              </button>
            </Form>
            {data.transaction && (
              <div className="mt-space-lg border-t border-border-warm pt-space-md">
                <h3 className="font-headline-md text-headline-md">
                  Protect owner choices
                </h3>
                <p className="my-space-sm text-body-sm text-text-secondary">
                  Checked fields cannot be changed by a rule. Uncheck only
                  fields you want this preview to change.
                </p>
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
                </FinanceForm>
              </div>
            )}
            {data.preview && (
              <div className="mt-space-lg space-y-space-md" aria-live="polite">
                <h3 className="font-headline-sm text-headline-sm">
                  Proposed result
                </h3>
                <dl className="grid grid-cols-2 gap-space-sm text-body-sm">
                  <dt>Payee</dt>
                  <dd>{data.preview.output.payee || "No payee"}</dd>
                  <dt>Category</dt>
                  <dd>
                    {state.categories.find(
                      (c) => c.id === data.preview!.output.categoryId,
                    )?.name ?? "Unchanged / no single category"}
                  </dd>
                  <dt>Memo</dt>
                  <dd>{data.preview.output.memo || "Empty"}</dd>
                  <dt>Tags</dt>
                  <dd>{data.preview.output.tags.join(", ") || "None"}</dd>
                  <dt>Transfer suggestion</dt>
                  <dd>
                    {state.accounts.find(
                      (a) => a.id === data.preview!.output.transferAccountId,
                    )?.name ?? "None"}
                  </dd>
                </dl>
                {!data.preview.explanation.length && (
                  <p className="text-body-sm text-text-secondary">
                    No enabled rules matched.
                  </p>
                )}
                {data.transaction &&
                  data.preview.explanation.some((e) => e.applied.length > 0) &&
                  !data.preview.transferIsSuggestion && (
                    <FinanceForm
                      budgetId={state.budget.id}
                      command={{
                        type: "rule.apply",
                        id: data.transaction.id,
                        fingerprint: data.fingerprint,
                      }}
                      label="Apply reviewed changes"
                    >
                      <p className="text-body-sm text-text-secondary">
                        This records a reversal and replacement while keeping
                        the date, amount and cleared state. The original stays
                        in history.
                      </p>
                      <label className="check-field">
                        <input type="checkbox" name="acknowledgeReconciled" />I
                        acknowledge changes to reconciled history
                      </label>
                    </FinanceForm>
                  )}
                {data.preview.explanation.map((e) => (
                  <div
                    key={e.ruleId}
                    className="rounded-md bg-surface-container-low p-space-md text-body-sm"
                  >
                    <strong>{e.name}</strong>
                    <p>Proposes: {e.applied.join(", ") || "no changes"}</p>
                    {!!e.locked.length && (
                      <p>Protected: {e.locked.join(", ")}</p>
                    )}
                    {!!e.superseded.length && (
                      <p>Earlier rule wins: {e.superseded.join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className={panel}>
            <h2 className="mb-space-md font-headline-md text-headline-md">
              Saved rules
            </h2>
            {!data.rules.length && (
              <p className="text-body-md text-text-secondary">
                No rules yet. Start with one repeated decision, then preview it.
              </p>
            )}
            {data.rules.map((rule) => (
              <details
                key={rule.id}
                name="saved-rule"
                className="mb-space-sm rounded-md border border-border-warm p-space-md [&[open]>summary]:text-secondary"
              >
                <summary className="cursor-pointer font-semibold text-body-md">
                  {rule.name} · {rule.enabled ? "Enabled" : "Disabled"} ·
                  priority {rule.priority}
                </summary>
                <div className={`mt-space-md ${DETAILS_DRAWER}`}>
                  <div className="mb-space-md hidden items-start justify-between gap-space-sm border-b border-border-warm pb-space-sm lg:flex">
                    <span className="font-label-caps text-label-caps uppercase text-text-tertiary">
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
          </section>
        </div>
      </div>
    </main>
  );
}
