import Link from "next/link";
import { financePage } from "@/application/finance-page";
import { requireUser } from "@/application/session";
import { getRules } from "@/application/rules";
import { FinanceForm } from "@/components/finance-form";
import { RuleFields } from "@/components/rule-fields";
import { formatUSD, money } from "@/domain/money";
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
        <h1 className="mt-space-sm font-headline-hero-mobile text-headline-hero-mobile text-text-primary sm:font-headline-hero sm:text-headline-hero">
          Make repeat decisions simpler.
        </h1>
        <p className="mt-space-sm max-w-3xl text-body-md text-text-secondary">
          Save reusable conditions and inspect the changes they propose. This
          preview does not alter your ledger or run rules automatically.
        </p>
        <Link
          href="/accounts"
          className="mt-space-md inline-block text-secondary underline"
        >
          Back to accounts
        </Link>
      </header>
      <div className="grid items-start gap-space-lg xl:grid-cols-2">
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
        <div className="flex flex-col gap-space-lg">
          <section className={panel}>
            <h2 className="mb-space-md font-headline-md text-headline-md">
              Preview proposed changes
            </h2>
            <p className="mb-space-md text-body-sm text-text-secondary">
              Choose a recent income or expense as a sample. Nothing is applied;
              existing user choices remain intact. Split categories are
              protected. Description conditions use its memo.
            </p>
            <form
              method="get"
              className="finance-form flex flex-col gap-space-md"
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
                      {t.date.toISOString().slice(0, 10)} ·{" "}
                      {t.payee || "No payee"} · {formatUSD(money(t.amount))}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="secondary-button">
                Preview rules
              </button>
            </form>
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
                className="mb-space-sm rounded-md border border-border-warm p-space-md"
              >
                <summary className="cursor-pointer font-semibold text-body-md">
                  {rule.name} · {rule.enabled ? "Enabled" : "Disabled"} ·
                  priority {rule.priority}
                </summary>
                <div className="mt-space-md">
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
