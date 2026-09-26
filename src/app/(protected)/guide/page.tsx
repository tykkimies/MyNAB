import Link from "next/link";
import { ShowSetup } from "@/components/dismiss-setup";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";

const BODY = "mt-2 text-prose text-ink-2";
const LINK = "link";

/** Each topic: an anchor others can link to, a heading, and plain paragraphs. */
const TOPICS: { id: string; title: string; body: React.ReactNode }[] = [
  {
    id: "principles",
    title: "Four habits",
    body: (
      <ul className={`${BODY} list-disc space-y-1 pl-5`}>
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
      <ul className={`${BODY} list-disc space-y-1 pl-5`}>
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
        from a category until it returns to zero. To send money back, use
        Move money with Ready to Assign as the destination, or &ldquo;Return
        available to Ready to Assign&rdquo; in the category&apos;s panel.
        Future months can only use money you already hold.
      </p>
    ),
  },
  {
    id: "categories",
    title: "Categories and groups",
    body: (
      <p className={BODY}>
        On the <Link className={LINK} href="/budget">Budget</Link> page,
        &ldquo;+ Add group&rdquo; creates a group: type your own name, or
        start from a stock group with its usual categories. Each group&apos;s
        &ldquo;+ Add category&rdquo; takes a name or one of the suggestions
        shown under it. Click any category to open its inspector, the one
        place to assign money, set its target, see what is scheduled from it,
        add notes, or rename, move and hide it. Hiding a category keeps its
        money and history; focused views narrow the list without changing any
        money.
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
        transfer from checking to the card, with no category: the money comes
        out of the payment category. For a balance you already owed when you
        added the card, record its terms on the{" "}
        <Link className={LINK} href="/debt#terms">Debt</Link> page with a due
        day and the account you pay from: MyNAB then sets a monthly target on
        the payment category (today&apos;s minimum, or the amount you choose)
        and schedules the transfer on the due day. Saving the terms again
        updates both.
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
        date, a weekly amount, or a card payoff. A target only plans money; a
        schedule is the real transaction that will hit an account, such as a
        bill or a card payment. A bill usually has both: the target sets money
        aside, and the schedule records the payment when it comes. On{" "}
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
        monthly amount. Trying scenarios changes nothing. Adopt one to follow
        it: each month MyNAB works it out again from your balances and sets
        each card&apos;s payment target and scheduled payment. A card that is
        paid off leaves the plan, and new spending on it does not bring it
        back.
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
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Guide"
        meta="What does the money you have today need to do before more arrives?"
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        <div className="mt-4 grid items-start gap-6 xl:grid-cols-[minmax(0,45rem)_14rem]">
          <div className="min-w-0">
            <Notice action={<ShowSetup />}>
              Hid the checklist on the Budget page?
            </Notice>
            <nav aria-label="Guide topics" className="mt-4 xl:hidden">
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-table">
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
                className="mt-8 scroll-mt-4 border-b border-hairline pb-6 last:border-b-0"
                aria-labelledby={`${t.id}-heading`}
              >
                <h2 id={`${t.id}-heading`} className="section-title">
                  {t.title}
                </h2>
                {t.body}
              </section>
            ))}
          </div>
          <nav
            aria-label="Guide topics"
            className="hidden xl:sticky xl:top-[calc(var(--topbar-h)+4.25rem)] xl:block"
          >
            <p className="text-caps uppercase text-ink-3">On this page</p>
            <ul className="mt-2 flex flex-col gap-1 border-l border-hairline text-table">
              {TOPICS.map((t) => (
                <li key={t.id}>
                  <a
                    className="-ml-px block border-l border-transparent py-0.5 pl-3 text-ink-2 hover:border-ink hover:text-ink"
                    href={`#${t.id}`}
                  >
                    {t.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  );
}
