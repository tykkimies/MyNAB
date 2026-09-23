import { notFound } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowRight,
  Check,
  CircleDashed,
  Flag,
  Landmark,
  Layers,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { requireUser } from "@/application/session";
const content = {
  budget: {
    label: "Budget",
    title: "Give your money a purpose.",
    description:
      "A clear plan for the money you have, and the things that matter to you.",
    Icon: Wallet,
    empty: "Your next chapter starts here",
    detail:
      "Soon, you’ll bring in your accounts, create your categories, and give every dollar a job.",
    next: "Manual budgeting",
    step: "Accounts, categories, and your first spending plan",
    concept: "A plan grounded in today",
    explanation:
      "Build your budget with money you already have. Keep future income in your plans, without spending it before it arrives.",
    cards: [
      ["Assigned", "Money you’ve given a job."],
      ["Activity", "What has come in and gone out."],
      ["Available", "What’s still there for you to use."],
    ],
  },
  accounts: {
    label: "Accounts",
    title: "See the whole picture.",
    description:
      "A place for your everyday money, long-term assets, and everything in between.",
    Icon: Landmark,
    empty: "A home for every account",
    detail:
      "Manual accounts and transactions are coming next. You’ll be able to get started without connecting a bank.",
    next: "Accounts & transactions",
    step: "Balances, transfers, and reconciliation",
    concept: "Connected by clarity",
    explanation:
      "Budget accounts support your spending plan. Tracking accounts round out your net worth, without adding money to your budget.",
    cards: [
      ["Budget accounts", "Checking, savings, cash, and cards."],
      ["Tracking accounts", "Investments, loans, and other assets."],
      ["Reconciliation", "Confidence that your records match."],
    ],
  },
  goals: {
    label: "Goals",
    title: "Make space for what’s ahead.",
    description:
      "Big milestones. Small comforts. A buffer for the unexpected. Make them yours.",
    Icon: Flag,
    empty: "Something worth working toward",
    detail:
      "Goal planning is coming after the manual budgeting system. Your goals will be personal, flexible, and built around your life.",
    next: "Goals & targets",
    step: "Savings targets, timelines, and steady progress",
    concept: "Your priorities, your pace",
    explanation:
      "Save for a trip, build an emergency fund, or prepare for an annual bill. A goal guides your plan; it never creates money you don’t have.",
    cards: [
      ["Save a balance", "Build toward an amount that matters."],
      ["Save by a date", "Find a monthly pace for your timeline."],
      ["Keep a cushion", "Maintain a comfortable reserve."],
    ],
  },
  debt: {
    label: "Debt",
    title: "Find your way forward.",
    description:
      "Understand what you owe and explore a payoff plan that works for you.",
    Icon: TrendingDown,
    empty: "Progress begins with a clear plan",
    detail:
      "Debt planning is coming after the manual ledger. You’ll be able to compare approaches before choosing your next step.",
    next: "Debt payoff planning",
    step: "Payment schedules and scenario comparisons",
    concept: "Small changes, visible progress",
    explanation:
      "Explore the effect of an extra monthly payment or a one-time contribution. Estimates stay separate from your real budget and account balances.",
    cards: [
      ["Avalanche", "Prioritize the highest interest rate."],
      ["Snowball", "Start with the smallest balance."],
      ["Your own order", "Choose the priorities that suit you."],
    ],
  },
} as const;
export default async function Pillar({
  params,
}: {
  params: Promise<{ pillar: string }>;
}) {
  await requireUser(); // Do not rely on layout-only authorization for future data queries.
  const { pillar } = await params;
  if (!Object.hasOwn(content, pillar)) notFound();
  const page = content[pillar as keyof typeof content];
  const Icon = page.Icon;
  return (
    <main id="main" className="main" tabIndex={-1}>
      <div className="page-heading">
        <span className="eyebrow">{page.label.toUpperCase()}</span>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
      </div>
      <section className="welcome-grid" aria-label={`${page.label} overview`}>
        <div className="empty-card">
          <div className="envelope-art" aria-hidden>
            <div className="art-orbit" />
            <div className="art-paper">
              <span />
              <span />
              <span />
            </div>
            <div className="art-envelope">
              <Icon size={32} strokeWidth={1.5} />
            </div>
            <span className="art-spark">✦</span>
            <span className="art-dot" />
          </div>
          <span className="small-label">A FRESH START</span>
          <h2>{page.empty}</h2>
          <p>{page.detail}</p>
          <span className="coming-label">
            <CircleDashed size={15} aria-hidden />
            Coming in a future release
          </span>
        </div>
        <aside className="principle-card">
          <div className="principle-icon">
            <Layers size={22} aria-hidden />
          </div>
          <span className="eyebrow">THE MYNAB APPROACH</span>
          <h2>{page.concept}</h2>
          <p>{page.explanation}</p>
          <div className="principle-rule" />
          <div className="principle-foot">
            <Check size={17} aria-hidden />
            <span>Clarity before complexity.</span>
          </div>
        </aside>
      </section>
      <section className="concepts" aria-label="How it will work">
        {page.cards.map(([title, text], i) => (
          <article key={title}>
            <span className="concept-number">0{i + 1}</span>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="next-card" aria-label="What’s next">
        <div className="next-icon">
          <ArrowDownLeft size={23} aria-hidden />
        </div>
        <div>
          <span className="eyebrow">ON THE HORIZON</span>
          <h2>{page.next}</h2>
          <p>{page.step}</p>
        </div>
        <ArrowRight className="next-arrow" size={21} aria-hidden />
      </section>
    </main>
  );
}
