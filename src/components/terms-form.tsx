"use client";
import { useState } from "react";
import { FinanceForm } from "@/components/finance-form";
import { Amount } from "@/components/amount";
import { minimumDue, monthlyInterest } from "@/domain/debt";
import { formatUSD, money, parseUSD } from "@/domain/money";

/** A debt account's terms in force, as the strings its form fields hold. */
export interface TermsDraft {
  apr: string;
  minimumPercent: string;
  minimumPayment: string;
  minimumIncludesInterest: boolean;
  statementBalance: string;
  statementDate: string;
  dueDay: string;
  creditLimit: string;
  /** A promotional rate in force now, and the month `apr` takes over. */
  introApr: string;
  /** The promotion's last day, YYYY-MM-DD. */
  introEndsOn: string;
  /** The intro is deferred interest, with what has built up so far. */
  introDeferred: boolean;
  deferredAccrued: string;
  /** The version being edited; saving without a later month overwrites it. */
  effectiveFrom: string;
}
export interface TermsAccount {
  id: string;
  name: string;
  isLoan: boolean;
  /** Owed now, from the ledger, in cents. */
  owed: bigint;
  terms: TermsDraft | null;
  payment: {
    payFromAccountId: string;
    amount: string;
    categoryId: string | null;
  } | null;
}

const usd = (n: bigint) => formatUSD(money(n));
const cents = (value: string) => {
  try {
    return value.trim() ? parseUSD(value.trim()) : null;
  } catch {
    return null;
  }
};
const basisPoints = (value: string) =>
  /^\d{1,3}(\.\d{1,2})?$/.test(value.trim())
    ? Math.round(Number(value) * 100)
    : null;

/**
 * Record or edit a debt's terms. Choosing an account with terms fills every
 * field from them, and saving replaces that version; a later "takes effect
 * from" month records a change that starts then instead. The minimum the rule
 * demands at today's balance is worked out as the fields change.
 */
export function TermsForm({
  budgetId,
  accounts,
  payers,
  paymentCategories,
  preselected,
}: {
  budgetId: string;
  accounts: TermsAccount[];
  payers: { id: string; name: string }[];
  paymentCategories: { id: string; name: string }[];
  preselected?: string;
}) {
  const [accountId, setAccountId] = useState(preselected ?? accounts[0]?.id);
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const draft = account?.terms;
  const [values, setValues] = useState(() => fieldsOf(account));
  const [later, setLater] = useState("");
  // Whether each loan has a scheduled payment, as this form last left it. The
  // server's answer arrives with the refresh after a save; until then the
  // props still describe the state before it, and a save that clears the
  // payment must not read that stale copy.
  const [scheduled, setScheduled] = useState<Record<string, boolean>>({});
  const hasPayment = scheduled[account?.id ?? ""] ?? Boolean(account?.payment);
  const choose = (id: string) => {
    setAccountId(id);
    setValues(fieldsOf(accounts.find((a) => a.id === id)));
    setLater("");
  };
  if (!account) return null;

  // What is charged now: the intro rate while one is running.
  const apr = basisPoints(
    values.introApr.trim() ? values.introApr : values.apr,
  );
  const percent = values.minimumPercent.trim()
    ? basisPoints(values.minimumPercent)
    : 0;
  const floor = values.minimumPayment.trim()
    ? cents(values.minimumPayment)
    : 0n;
  const interest = apr === null ? null : monthlyInterest(account.owed, apr);
  const preview =
    apr !== null && percent !== null && floor !== null && interest !== null
      ? (() => {
          const share =
            percent > 0 && account.owed > 0n
              ? (account.owed * BigInt(percent) * 2n + 10000n) / 20000n
              : 0n;
          const due = minimumDue(
            {
              minimumPayment: floor,
              percentBasisPoints: percent,
              includeInterest: values.minimumIncludesInterest,
            },
            account.owed,
            interest,
          );
          return {
            share,
            due: due < account.owed + interest ? due : account.owed + interest,
            percentPart:
              share + (values.minimumIncludesInterest ? interest : 0n),
          };
        })()
      : null;
  const planned = cents(values.monthlyPayment);
  const set =
    (key: keyof typeof values) =>
    (e: { target: HTMLInputElement | HTMLSelectElement }) =>
      setValues((v) => ({
        ...v,
        [key]:
          e.target instanceof HTMLInputElement && e.target.type === "checkbox"
            ? e.target.checked
            : e.target.value,
      }));

  return (
    <FinanceForm
      budgetId={budgetId}
      command={{ type: "debt.terms.set", replaceFuture: !later && !!draft }}
      label="Save terms"
      onSaved={() => {
        if (account.isLoan && !later)
          setScheduled((s) => ({
            ...s,
            [account.id]: !!values.payFromAccountId,
          }));
      }}
    >
      <div className="field-grid" data-cols="2">
        <label>
          Account
          <select
            name="accountId"
            required
            aria-label="Debt account"
            value={account.id}
            onChange={(e) => choose(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <small className="terms-mode">
            {draft
              ? `Editing ${account.name}'s recorded terms.`
              : `No terms recorded for ${account.name} yet.`}
          </small>
        </label>
        <span aria-hidden />
      </div>
      <h3 className="text-caps uppercase text-ink-3">Rate</h3>
      <div className="field-grid" data-cols="2">
        <label>
          APR
          <input
            name="apr"
            required
            inputMode="decimal"
            placeholder="19.99"
            aria-label="APR"
            aria-describedby="apr-help"
            value={values.apr}
            onChange={set("apr")}
          />
          <small id="apr-help">
            The regular yearly interest rate, such as 6.5.
          </small>
        </label>
        <label>
          Intro APR (optional)
          <input
            name="introApr"
            inputMode="decimal"
            placeholder="0"
            aria-label="Intro APR"
            aria-describedby="intro-help"
            value={values.introApr}
            onChange={set("introApr")}
          />
          <small id="intro-help">
            For a promotional rate, such as 0. You still pay the minimum every
            month; no interest is charged until the intro rate ends.
          </small>
        </label>
        <label>
          Intro rate ends
          <input
            type="date"
            name="introEndsOn"
            aria-label="Intro rate ends"
            aria-describedby="intro-ends-help"
            value={values.introEndsOn}
            onChange={set("introEndsOn")}
          />
          <small id="intro-ends-help">
            The promotion&apos;s last day, from your statement or agreement.
            A deferred balance is planned to be cleared by the last payment due
            before this day.
          </small>
        </label>
        {!account.isLoan && (
          <>
            <label className="check-field col-span-full">
              <input
                type="checkbox"
                name="introDeferred"
                aria-describedby="deferred-help"
                checked={values.introDeferred}
                onChange={set("introDeferred")}
              />
              Deferred interest (&ldquo;no interest if paid in full&rdquo;)
            </label>
            <small id="deferred-help" className="col-span-full">
              Interest builds during the introductory period and is charged if
              any balance remains when it ends.
            </small>
          </>
        )}
        {values.introDeferred && (
          <label>
            Deferred interest so far (USD)
            <input
              name="deferredAccrued"
              inputMode="decimal"
              aria-label="Deferred interest so far (USD)"
              aria-describedby="deferred-accrued-help"
              value={values.deferredAccrued}
              onChange={set("deferredAccrued")}
            />
            <small id="deferred-accrued-help">
              Optional, from your statement (often &ldquo;accrued deferred
              interest&rdquo;). Leave empty if it isn&apos;t shown.
            </small>
          </label>
        )}
      </div>
      <h3 className="text-caps uppercase text-ink-3">Minimum</h3>
      <div className="field-grid" data-cols="2">
        <label>
          Minimum: percent of balance
          <input
            name="minimumPercent"
            aria-label="Minimum percent of balance"
            inputMode="decimal"
            placeholder="1"
            aria-describedby="minimum-percent-help"
            value={values.minimumPercent}
            onChange={set("minimumPercent")}
          />
          <small id="minimum-percent-help">
            For a minimum that follows the balance, such as 1% plus interest. It
            is recalculated from the ledger each month.
          </small>
        </label>
        <label>
          Minimum: fixed amount or floor (USD)
          <input
            name="minimumPayment"
            inputMode="decimal"
            aria-label="Fixed minimum (USD)"
            aria-describedby="minimum-fixed-help"
            value={values.minimumPayment}
            onChange={set("minimumPayment")}
          />
          <small id="minimum-fixed-help">
            The lender&apos;s fixed minimum or the floor under a percentage
            minimum. The amount you plan to pay is separate.
          </small>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            name="minimumIncludesInterest"
            checked={values.minimumIncludesInterest}
            onChange={set("minimumIncludesInterest")}
          />
          Percentage minimum adds the month&apos;s interest
        </label>
        <p
          className="minimum-preview col-span-full text-table text-ink-2"
          aria-live="polite"
        >
          {!preview ? (
            "Enter the APR and minimum rule to see the minimum it demands."
          ) : (
            <>
              At today&apos;s balance of <Amount>{usd(account.owed)}</Amount>
              {percent ? (
                <>
                  , {values.minimumPercent.trim()}% is{" "}
                  <Amount>{usd(preview.share)}</Amount>
                  {values.minimumIncludesInterest && (
                    <>
                      {" "}
                      plus <Amount>{usd(interest!)}</Amount> interest
                    </>
                  )}
                  {floor! > preview.percentPart ? (
                    <>
                      ; your <Amount>{usd(floor!)}</Amount> floor is higher
                    </>
                  ) : null}
                </>
              ) : null}
              , so the minimum is{" "}
              <strong>
                <Amount>{usd(preview.due)}</Amount>
              </strong>
              .
              {account.owed > 0n && preview.due <= interest! && (
                <>
                  {" "}
                  That does not cover this month&apos;s{" "}
                  <Amount>{usd(interest!)}</Amount> of interest, so paying only
                  the minimum would never clear this debt.
                </>
              )}
            </>
          )}
        </p>
      </div>
      {!account.isLoan && (
        <h3 className="text-caps uppercase text-ink-3">Statement</h3>
      )}
      <div className="field-grid" data-cols="2">
        {!account.isLoan && (
          <>
            <label>
              Statement balance (USD)
              <input
                name="statementBalance"
                inputMode="decimal"
                aria-label="Statement balance (USD)"
                value={values.statementBalance}
                onChange={set("statementBalance")}
              />
            </label>
            <label>
              Statement date
              <input
                type="date"
                name="statementDate"
                aria-label="Statement date"
                value={values.statementDate}
                onChange={set("statementDate")}
              />
            </label>
          </>
        )}
      </div>
      <h3 className="text-caps uppercase text-ink-3">Payment</h3>
      <div className="field-grid" data-cols="2">
        <label>
          Due day
          <input
            name="dueDay"
            inputMode="numeric"
            placeholder="15"
            aria-label="Due day"
            aria-describedby="due-day-help"
            value={values.dueDay}
            onChange={set("dueDay")}
          />
          <small id="due-day-help">
            {account.isLoan
              ? "Day of the month. With a payment account selected, the monthly payment is scheduled automatically."
              : "Day of the month the card payment is due."}
          </small>
        </label>
        {!account.isLoan && (
          <div className="flex flex-col gap-1">
            <label className="check-field">
              <input
                type="checkbox"
                name="setPaymentTarget"
                aria-describedby="payment-target-help"
                checked={values.setPaymentTarget}
                onChange={set("setPaymentTarget")}
              />
              Set the payment target
            </label>
            <small id="payment-target-help">
              Targets this card&apos;s payment envelope for the monthly payment.
              Nothing is scheduled; the payment is recorded when you make it.
            </small>
          </div>
        )}
        {account.isLoan && (
          <label>
            Pay from
            <select
              name="payFromAccountId"
              aria-label="Pay from"
              aria-describedby="pay-from-help"
              value={values.payFromAccountId}
              onChange={set("payFromAccountId")}
            >
              <option value="">Don&apos;t schedule a payment</option>
              {payers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <small id="pay-from-help">
              Schedules a transfer from this account to the loan.
            </small>
          </label>
        )}
        {account.isLoan && values.payFromAccountId && (
          <label>
            Payment category
            <select
              name="paymentCategoryId"
              required
              aria-label="Payment category"
              value={values.paymentCategoryId}
              onChange={set("paymentCategoryId")}
            >
              <option value="">Choose a budget category</option>
              {paymentCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <small>
              Loan payments leave the budget, so choose the category that pays
              for them.
            </small>
          </label>
        )}
        {(account.isLoan
          ? values.payFromAccountId
          : values.setPaymentTarget) && (
          <label>
            Monthly payment (USD)
            <input
              name="monthlyPayment"
              inputMode="decimal"
              aria-label="Monthly payment (USD)"
              aria-describedby="monthly-payment-help"
              placeholder={preview ? plain(preview.due) : ""}
              value={values.monthlyPayment}
              onChange={set("monthlyPayment")}
            />
            <small id="monthly-payment-help">
              What you plan to pay each month. Leave empty to use the minimum.
              {preview && planned !== null && planned < preview.due
                ? " This is less than the minimum."
                : ""}
            </small>
          </label>
        )}
        {!account.isLoan && (
          <label>
            Credit limit (USD)
            <input
              name="creditLimit"
              inputMode="decimal"
              aria-label="Credit limit (USD)"
              value={values.creditLimit}
              onChange={set("creditLimit")}
            />
          </label>
        )}
        <label>
          Takes effect from
          <input
            placeholder="2027-04"
            maxLength={7}
            aria-label="Takes effect from"
            aria-describedby="effective-help"
            value={later}
            onChange={(e) => setLater(e.target.value)}
          />
          <small id="effective-help">
            Rarely needed. Leave empty to save these as the terms now. Enter a
            later month only to record a change the lender has announced, such
            as a new rate from that month.
          </small>
        </label>
        {(later || draft?.effectiveFrom) && (
          <input
            type="hidden"
            name="effectiveFrom"
            value={later || draft!.effectiveFrom}
          />
        )}
      </div>
      {account.isLoan && (
        <input
          type="hidden"
          name="clearPayment"
          value={!values.payFromAccountId && hasPayment ? "on" : ""}
        />
      )}
    </FinanceForm>
  );

  function fieldsOf(selected: TermsAccount | undefined) {
    const terms = selected?.terms ?? null;
    const payment = terms ? selected?.payment : null;
    return {
      apr: terms?.apr ?? "",
      minimumPercent: terms?.minimumPercent ?? "",
      minimumPayment: terms?.minimumPayment ?? "",
      minimumIncludesInterest: terms?.minimumIncludesInterest ?? false,
      statementBalance: terms?.statementBalance ?? "",
      statementDate: terms?.statementDate ?? "",
      dueDay: terms?.dueDay ?? "",
      creditLimit: terms?.creditLimit ?? "",
      introApr: terms?.introApr ?? "",
      introEndsOn: terms?.introEndsOn ?? "",
      introDeferred: terms?.introDeferred ?? false,
      deferredAccrued: terms?.deferredAccrued ?? "",
      payFromAccountId: payment?.payFromAccountId ?? "",
      // A card with a payment target keeps it up to date when terms are saved.
      setPaymentTarget: Boolean(payment),
      monthlyPayment: payment?.amount ?? "",
      paymentCategoryId: payment?.categoryId ?? "",
    };
  }
}

const plain = (n: bigint) =>
  `${n / 100n}.${(n % 100n).toString().padStart(2, "0")}`;
