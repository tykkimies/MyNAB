import Link from "next/link";
import { ShowSetup } from "@/components/dismiss-setup";

const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
const CARD = "rounded-lg border border-border-warm bg-surface-card";
const H2 = "font-headline-md text-headline-md text-text-primary";
const BODY = "mt-space-sm font-body-md text-body-md leading-relaxed text-text-secondary";
const LINK = "font-semibold text-secondary underline underline-offset-2";

/** Each topic: an anchor others can link to, a heading, and plain paragraphs. */
const TOPICS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "principles",
    title: "Four habits",
    body: (
      <ul className={`${BODY} list-disc space-y-space-xs pl-space-lg`}>
        <li>
          <strong>Every dollar gets a job.</strong> Money you have today is
          split into categories until nothing is left unplanned.
        </li>
        <li>
          <strong>Big, irregular costs become small, regular ones.</strong>{" "}
          Set money aside monthly for the car repair, the annual insurance
          bill or the holidays, so they stop being emergencies.
        </li>
        <li>
          <strong>Plans change; move money, not guilt.</strong> Overspent?
          Move money from a category that can spare it.
        </li>
        <li>
          <strong>Spend money that is older.</strong> As the habits settle,
          you pay this month&apos;s bills with last month&apos;s income. Age of
          Money on the Budget page measures it.
        </li>
      </ul>
    ),
  },
  {
    id: "routine",
    title: "A simple routine",
    body: (
      <ul className={`${BODY} list-disc space-y-space-xs pl-space-lg`}>
        <li>
          <strong>When money arrives:</strong> assign it on the Budget page
          until Ready to Assign is zero. Ask what this money needs to cover
          before more arrives.
        </li>
        <li>
          <strong>A few times a week:</strong> approve imported transactions
          and match anything you entered by hand.
        </li>
        <li>
          <strong>Once a month:</strong> reconcile each account against its
          statement, then look at Reports to see where the month went.
        </li>
      </ul>
    ),
  },
  {
    id: "ready-to-assign",
    title: "Ready to Assign",
    body: (
      <p className={BODY}>
        Ready to Assign is money in your budget accounts that has no job yet.
        Assigning is labelling, not spending: money you assign to savings is
        still yours. The goal is zero, meaning every dollar is planned. If it
        goes below zero you have planned more than you have; take money back
        from a category until it returns to zero. Future months can only use
        money you already hold.
      </p>
    ),
  },
  {
    id: "categories",
    title: "Categories and groups",
    body: (
      <p className={BODY}>
        On the <Link className={LINK} href="/budget">Budget</Link> page, open
        &ldquo;Browse stock groups&rdquo; to inspect the standard groups and
        categories. Add a whole group or only the categories you need; installed
        categories link to their inspector, where you can assign money, set a
        target, add notes, or rename, move and hide them. Unused suggestions
        stay out of your plan. Hiding a category keeps its money and history;
        focused views narrow the list without changing any money.
      </p>
    ),
  },
  {
    id: "credit-cards",
    title: "Credit cards",
    body: (
      <p className={BODY}>
        Each card has a payment category. When you spend on a card from a
        funded category, that money moves into the card&apos;s payment
        category automatically, ready to pay the bill. Paying the card is a
        transfer from checking, not new spending. For a balance you already
        owed when you added the card, set a payoff target on its payment
        category and fund it over time.
      </p>
    ),
  },
  {
    id: "overspending",
    title: "Overspending",
    body: (
      <p className={BODY}>
        A negative category means you spent more than you planned. Move money
        into it from another category. Cash overspending left uncovered at
        month end reduces next month&apos;s Ready to Assign; overspending on a
        card becomes card debt instead, so cover it before the month ends.
      </p>
    ),
  },
  {
    id: "targets",
    title: "Targets",
    body: (
      <p className={BODY}>
        A target says what a category needs: a monthly amount, a balance by a
        date, a weekly amount, or a card payoff. On{" "}
        <Link className={LINK} href="/targets">Targets</Link> you can see what each
        still needs, snooze one for this month, and fund them all at once.
        Auto-Assign on the Budget page previews other ways to fill a month,
        such as repeating last month.
      </p>
    ),
  },
  {
    id: "imports",
    title: "Imports, approval and matching",
    body: (
      <p className={BODY}>
        Linked accounts and imported files arrive categorised where possible
        and wait for your approval. When an import looks like something you
        already entered, MyNAB offers to match the two so nothing is counted
        twice. Rules can rename payees and choose categories for you, and
        schedules enter repeating bills on their date for you to approve.
      </p>
    ),
  },
  {
    id: "register",
    title: "Registers and flags",
    body: (
      <p className={BODY}>
        Each account has its own register, and the{" "}
        <Link className={LINK} href="/accounts/register">All accounts</Link>{" "}
        register shows everything with filters. Flags are coloured labels you
        can name, such as &ldquo;Reimbursable&rdquo;. Select several rows to
        flag or categorise them together; every edit can be undone from the
        account.
      </p>
    ),
  },
  {
    id: "debt",
    title: "Paying down debt",
    body: (
      <p className={BODY}>
        Add interest rates and minimums on the{" "}
        <Link className={LINK} href="/debt">Debt</Link> page to compare
        avalanche and snowball plans, see payoff dates and interest, try a
        one-time payment, or choose a payoff month and let MyNAB work out the
        monthly amount. Scenarios are never saved to your budget.
      </p>
    ),
  },
  {
    id: "reports",
    title: "Reports and forecasts",
    body: (
      <p className={BODY}>
        <Link className={LINK} href="/reports">Reports</Link> show spending by
        group, category and payee, income against expense month by month, net
        worth and cash flow, each filterable by account and category and each
        opening to the transactions behind it. A forecast looks ahead using
        your scheduled income and bills plus your recent average spending,
        without changing anything.
      </p>
    ),
  },
  {
    id: "plans",
    title: "Plans, Fresh Start and sharing",
    body: (
      <p className={BODY}>
        Keep separate plans on the <Link className={LINK} href="/plans">Plans</Link>{" "}
        page. Fresh Start begins a plan again from today&apos;s balances and
        keeps the old one archived. On{" "}
        <Link className={LINK} href="/household">Household</Link>, add the
        people you budget with and share plans with them.
      </p>
    ),
  },
  {
    id: "privacy",
    title: "Privacy and your data",
    body: (
      <p className={BODY}>
        Everything lives on your own server. The eye button hides amounts on
        this device when someone is looking over your shoulder. Export
        everything at any time from Accounts, and import files from your bank
        or another app.
      </p>
    ),
  },
];

export default function Guide() {
  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Guide
        </span>
        <h1 className="mt-space-xs font-headline-hero-mobile text-headline-hero-mobile leading-none text-text-primary lg:font-headline-hero lg:text-headline-hero">
          How MyNAB works.
        </h1>
        <p className="mt-space-sm font-body-lg text-body-lg leading-relaxed text-text-secondary">
          One question runs through all of it: what does the money you have
          today need to do before more arrives?
        </p>
        <p className="mt-space-sm font-body-md text-body-md text-text-secondary">
          Hid the checklist on the Budget page? <ShowSetup />
        </p>
      </div>
      <nav aria-label="Guide topics" className={`mt-space-lg ${CARD} p-space-lg`}>
        <ul className="grid gap-space-xs sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((t) => (
            <li key={t.id}>
              <a className={LINK} href={`#${t.id}`}>
                {t.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {TOPICS.map((t) => (
        <section
          key={t.id}
          id={t.id}
          className={`mt-space-lg scroll-mt-space-lg ${CARD} p-space-lg`}
          aria-labelledby={`${t.id}-heading`}
        >
          <h2 id={`${t.id}-heading`} className={H2}>
            {t.title}
          </h2>
          {t.body}
        </section>
      ))}
    </main>
  );
}
