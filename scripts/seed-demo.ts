/**
 * Build a realistic, entirely fictional budget for local development.
 *
 * Everything is created through the ordinary command layer, so the ledger's
 * triggers, the double-entry postings and every budget invariant are exercised
 * by the seeding itself. A run that succeeds is evidence the rules hold across
 * a year of ordinary use, not just across a handful of test rows.
 *
 * The data is deterministic: the same seed produces the same ledger, so a bug
 * found here can be reproduced exactly.
 *
 * This script refuses to touch anything that is not a local database with a
 * development-shaped name, and it never drops or migrates anything.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getDb } from "../src/infrastructure/db";
import { createOwner } from "../src/application/auth";
import {
  executeFinance,
  getFinance,
  type FinanceCommand,
} from "../src/application/finance";

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const valueOf = (flag: string, fallback: number) => {
  const at = argv.indexOf(flag);
  if (at === -1) return fallback;
  const parsed = Number(argv[at + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const MONTHS = Math.min(Math.max(valueOf("--months", 14), 1), 24);
const SEED = valueOf("--seed", 20260924);
const PASSPHRASE = process.env.SEED_PASSPHRASE ?? "demo-passphrase-mynab-2026";

// ---------------------------------------------------------------------------
// Refusing to run anywhere that could matter
// ---------------------------------------------------------------------------

function guard() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const parsed = new URL(url);
  const local = ["127.0.0.1", "localhost", "::1", "[::1]"];
  if (!local.includes(parsed.hostname))
    throw new Error(
      `Refusing to seed a non-local database at ${parsed.hostname}.`,
    );
  const database = parsed.pathname.replace(/^\//, "");
  if (!/(_dev|_demo|_seed|_test)$/.test(database))
    throw new Error(
      `Refusing to seed "${database}": a seed target must be named *_dev, *_demo, *_seed or *_test.`,
    );
  if (!has("--yes"))
    throw new Error(
      `This writes fictional data into "${database}". Pass --yes to confirm.`,
    );
  return database;
}

/** Finance tables only: the owner, their session and the schema are left alone. */
const FINANCE_TABLES = [
  "IngestedEntry",
  "DeclinedMatch",
  "ProviderAccount",
  "ProviderConnection",
  "ReconciliationItem",
  "Reconciliation",
  "TransactionState",
  "FinancialSplit",
  "FinancialTransaction",
  "Posting",
  "Journal",
  "BudgetAssignment",
  "CategoryTarget",
  "DebtTerms",
  "Category",
  "CategoryGroup",
  "FinancialAccount",
  "FinanceRequest",
];

// ---------------------------------------------------------------------------
// Deterministic randomness
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(SEED);
/** Cents, inclusive, so amounts look like prices rather than round numbers. */
const between = (low: number, high: number) =>
  Math.round(low + random() * (high - low));
const pick = <T>(items: readonly T[]) =>
  items[Math.floor(random() * items.length)];
const chance = (probability: number) => random() < probability;

// ---------------------------------------------------------------------------
// Money and dates
// ---------------------------------------------------------------------------

/** Cents to the plain decimal string the command layer parses. */
const usd = (cents: number) =>
  `${cents < 0 ? "-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(
    Math.abs(cents) % 100,
  ).padStart(2, "0")}`;

const monthOf = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;
const daysIn = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const dayIn = (month: string, day: number) =>
  `${month}-${String(Math.min(day, daysIn(month))).padStart(2, "0")}`;
const addMonths = (month: string, count: number) => {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + count;
  return monthOf(Math.floor(total / 12), (total % 12) + 1);
};

// ---------------------------------------------------------------------------
// The fictional household
// ---------------------------------------------------------------------------

const PAYEES = {
  groceries: ["Wegmans", "Aldi", "Trader Joe's", "Costco", "Giant Eagle"],
  fuel: ["Shell", "Wawa", "Sunoco", "BP"],
  dining: [
    "Chipotle",
    "Thai Basil",
    "Corner Diner",
    "Pizza Works",
    "Sweetgreen",
  ],
  household: ["Target", "Home Depot", "IKEA"],
  fun: ["Cinemark", "Steam", "Barnes & Noble"],
  pets: ["Chewy", "Village Vet"],
  medical: ["Riverside Family Practice", "CVS Pharmacy"],
  repair: ["Kline Auto", "Firestone"],
  home: ["Ace Hardware", "Lowe's"],
  gifts: ["Etsy", "Amazon", "Local Makers Market"],
} as const;

/** What the household plans to put in each category every month, in cents. */
const MONTHLY_PLAN: Record<string, number> = {
  "Rent / Mortgage": 145000,
  Electric: 10000,
  "Gas / Heating": 4500,
  Water: 4000,
  Internet: 7000,
  Phone: 5500,
  Insurance: 11500,
  Subscriptions: 3000,
  "Car Payment": 31200,
  Groceries: 62000,
  "Fuel / Transport": 17000,
  "Dining Out": 20000,
  Household: 6000,
  Personal: 5000,
  Pets: 4500,
  "Car Repair": 6000,
  "Car Registration": 1800,
  Medical: 5000,
  "Home Maintenance": 4000,
  Gifts: 4500,
  "Annual Renewals": 1500,
  "Fun Money": 12000,
  Hobbies: 4000,
  Travel: 20000,
  "Emergency Fund": 15000,
  "Savings Goal": 10000,
};

async function main() {
  const database = guard();
  const db = getDb();

  // Categories and accounts count as existing work too: a budget that has been
  // set up by hand but never used is still someone's, and seeding would be
  // layered on top of it rather than replacing it.
  const [transactionCount, accountCount, categoryCount] = await Promise.all([
    db.financialTransaction.count(),
    db.financialAccount.count(),
    db.category.count(),
  ]);
  const existing = transactionCount + accountCount + categoryCount;
  if (existing > 0 && !has("--reset"))
    throw new Error(
      `"${database}" already holds ${transactionCount} transactions, ${accountCount} accounts and ${categoryCount} categories. Pass --reset to replace them, or point at an empty database.`,
    );
  if (existing > 0) {
    // Finance tables only, and only in a database the guard has already
    // confirmed is a local development one.
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${FINANCE_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
    );
    console.log(
      `Cleared ${transactionCount} transactions, ${accountCount} accounts and ${categoryCount} categories from ${database}.`,
    );
  }

  let owner = await db.installation.findFirst();
  if (!owner) {
    await createOwner("owner", PASSPHRASE);
    owner = await db.installation.findFirstOrThrow();
    console.log(
      `Created the owner "owner" with the demo passphrase "${PASSPHRASE}".`,
    );
  }
  const userId = owner.ownerId;
  const budgetId = (await db.budget.findFirstOrThrow()).id;

  const run = (command: FinanceCommand) =>
    executeFinance(userId, budgetId, randomUUID(), command);

  // Today, in the budget's own timezone: nothing may be dated after it.
  const state = await getFinance(userId, budgetId);
  const today = state.today;
  const thisMonth = today.slice(0, 7);
  const firstMonth = addMonths(thisMonth, -(MONTHS - 1));
  const opened = `${firstMonth}-01`;

  console.log(
    `Seeding ${MONTHS} months, ${firstMonth} through ${thisMonth}, seed ${SEED}.`,
  );

  // --- accounts ------------------------------------------------------------
  const checking = (
    await run({
      type: "account.create",
      name: "Everyday Checking",
      accountType: "CHECKING",
      participation: "BUDGET",
      opening: "2480.00",
      date: opened,
    })
  ).id;
  const savings = (
    await run({
      type: "account.create",
      name: "Ally Savings",
      accountType: "SAVINGS",
      participation: "BUDGET",
      opening: "6100.00",
      date: opened,
    })
  ).id;
  const card = (
    await run({
      type: "account.create",
      name: "Everyday Card",
      accountType: "CREDIT_CARD",
      participation: "BUDGET",
      opening: "0",
      date: opened,
    })
  ).id;
  const transferCard = (
    await run({
      type: "account.create",
      name: "Balance Transfer Card",
      accountType: "CREDIT_CARD",
      participation: "BUDGET",
      opening: "-2640.00",
      date: opened,
    })
  ).id;
  const carLoan = (
    await run({
      type: "account.create",
      name: "Car Loan",
      accountType: "LOAN",
      participation: "TRACKING",
      opening: "-13250.00",
      date: opened,
    })
  ).id;
  await run({
    type: "account.create",
    name: "Brokerage",
    accountType: "INVESTMENT",
    participation: "TRACKING",
    opening: "18400.00",
    date: opened,
  });

  // --- categories ----------------------------------------------------------
  await run({ type: "starter.apply" });
  const after = await getFinance(userId, budgetId);
  const bills = after.groups.find((g) => g.name === "Bills")!;
  await run({
    type: "category.create",
    name: "Car Payment",
    groupId: bills.id,
  });

  const loaded = await getFinance(userId, budgetId);
  const byName = new Map(loaded.categories.map((c) => [c.name, c.id]));
  const categoryId = (name: string) => {
    const id = byName.get(name);
    if (!id) throw new Error(`Seed expected a category named ${name}`);
    return id;
  };
  const paymentCategory = (accountId: string) =>
    loaded.categories.find((c) => c.paymentAccountId === accountId)!.id;

  // --- targets, covering every kind ---------------------------------------
  const targets: FinanceCommand[] = [
    {
      type: "target.set",
      categoryId: categoryId("Rent / Mortgage"),
      targetType: "MONTHLY",
      amount: "1450.00",
      refill: true,
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Groceries"),
      targetType: "WEEKLY",
      amount: "145.00",
      dayOfWeek: 0,
      refill: true,
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Internet"),
      targetType: "MONTHLY",
      amount: "70.00",
      refill: true,
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Dining Out"),
      targetType: "SPENDING_LIMIT",
      amount: "220.00",
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Insurance"),
      targetType: "PERIODIC",
      amount: "690.00",
      dueMonth: addMonths(firstMonth, 5),
      cadenceMonths: 6,
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Car Registration"),
      targetType: "PERIODIC",
      amount: "210.00",
      dueMonth: addMonths(firstMonth, 9),
      cadenceMonths: 12,
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Emergency Fund"),
      targetType: "MAINTAIN",
      amount: "5000.00",
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Travel"),
      targetType: "BALANCE_BY_DATE",
      amount: "2400.00",
      dueMonth: addMonths(thisMonth, 7),
      effectiveFrom: firstMonth,
    },
    {
      type: "target.set",
      categoryId: categoryId("Savings Goal"),
      targetType: "BALANCE",
      amount: "3000.00",
      effectiveFrom: firstMonth,
    },
    // The new Phase 3 kind: paying a card down, on the card's own category.
    {
      type: "target.set",
      categoryId: paymentCategory(transferCard),
      targetType: "DEBT_PAYOFF",
      amount: "150.00",
      effectiveFrom: firstMonth,
    },
  ];
  for (const command of targets) await run(command);

  // A target the household revised part way through, which is the whole point
  // of effective dating: earlier months keep what they were asked to do.
  await run({
    type: "target.set",
    categoryId: categoryId("Groceries"),
    targetType: "WEEKLY",
    amount: "165.00",
    dayOfWeek: 0,
    refill: true,
    effectiveFrom: addMonths(thisMonth, -3),
  });

  // --- debt terms, including a promotional rate that ends ------------------
  await run({
    type: "debt.terms.set",
    accountId: card,
    apr: "19.99",
    minimumPayment: "35.00",
    dueDay: 18,
    creditLimit: "6000.00",
    effectiveFrom: firstMonth,
  });
  await run({
    type: "debt.terms.set",
    accountId: transferCard,
    apr: "0",
    minimumPayment: "45.00",
    dueDay: 6,
    creditLimit: "4500.00",
    effectiveFrom: firstMonth,
  });
  // The intro period ends, and the go-to rate takes over from that month.
  await run({
    type: "debt.terms.set",
    accountId: transferCard,
    apr: "22.99",
    minimumPayment: "45.00",
    dueDay: 6,
    creditLimit: "4500.00",
    effectiveFrom: addMonths(thisMonth, 4),
  });
  await run({
    type: "debt.terms.set",
    accountId: carLoan,
    apr: "4.90",
    minimumPayment: "312.00",
    dueDay: 22,
    effectiveFrom: firstMonth,
  });

  // --- a year of ordinary life --------------------------------------------
  let cardSpentLastMonth = 0;
  let transactions = 0;
  let firstGrocery: { id: string; amount: number; month: string } | null = null;

  const spend = async (options: {
    account: string;
    date: string;
    cents: number;
    payee: string;
    category: string;
    memo?: string;
  }) => {
    if (options.date > today) return null;
    const result = await run({
      type: "transaction.create",
      accountId: options.account,
      kind: "EXPENSE",
      date: options.date,
      amount: usd(-options.cents),
      payee: options.payee,
      memo: options.memo ?? "",
      cleared: options.date < dayIn(thisMonth, 1),
      splits: [
        {
          categoryId: categoryId(options.category),
          amount: usd(-options.cents),
        },
      ],
    });
    transactions++;
    if (options.account === card) cardSpentLastMonth += options.cents;
    return result;
  };

  for (let index = 0; index < MONTHS; index++) {
    const month = addMonths(firstMonth, index);
    const spentOnCardBefore = cardSpentLastMonth;
    cardSpentLastMonth = 0;

    // Income first: envelope budgeting only ever assigns money that exists.
    for (const day of [15, daysIn(month)]) {
      const date = dayIn(month, day);
      if (date > today) continue;
      await run({
        type: "transaction.create",
        accountId: checking,
        kind: "INCOME",
        date,
        amount: usd(between(228000, 236000)),
        payee: "Northwind Logistics payroll",
        cleared: true,
      });
      transactions++;
    }

    // Assign the plan, then let the targets top up whatever is still short.
    for (const [name, planned] of Object.entries(MONTHLY_PLAN)) {
      if (!byName.has(name)) continue;
      await run({
        type: "assign",
        categoryId: categoryId(name),
        month,
        amount: usd(planned),
      });
    }
    await run({
      type: "assign",
      categoryId: paymentCategory(transferCard),
      month,
      amount: "150.00",
    });
    // The money the household started with gets a job in the first month,
    // rather than sitting in Ready to Assign for a year looking like a mistake.
    if (index === 0)
      for (const [name, extra] of [
        ["Emergency Fund", "4850.00"],
        ["Travel", "1500.00"],
        ["Savings Goal", "1000.00"],
      ] as const)
        await run({
          type: "assign",
          categoryId: categoryId(name),
          month,
          amount: extra,
        });
    // Targets are topped up in the month the household is actually living in.
    // Leaving earlier months as they were funded is what makes the history
    // worth looking at: some months came up short, which is normal.
    if (month === thisMonth)
      try {
        await run({ type: "target.fund", month });
      } catch {
        // "Every target is already funded" is a perfectly good outcome.
      }

    // Bills, on the days they actually land.
    await spend({
      account: checking,
      date: dayIn(month, 1),
      cents: 145000,
      payee: "Keystone Property Management",
      category: "Rent / Mortgage",
    });
    await spend({
      account: checking,
      date: dayIn(month, 8),
      cents: between(7400, 13800),
      payee: "Duquesne Light",
      category: "Electric",
    });
    await spend({
      account: checking,
      date: dayIn(month, 5),
      cents: 6999,
      payee: "Verizon Fios",
      category: "Internet",
    });
    await spend({
      account: checking,
      date: dayIn(month, 20),
      cents: 5420,
      payee: "Mint Mobile",
      category: "Phone",
    });
    await spend({
      account: checking,
      date: dayIn(month, 12),
      cents: between(3100, 4900),
      payee: "Pittsburgh Water",
      category: "Water",
    });
    if (["11", "12", "01", "02", "03"].includes(month.slice(5)))
      await spend({
        account: checking,
        date: dayIn(month, 14),
        cents: between(4200, 9800),
        payee: "Peoples Natural Gas",
        category: "Gas / Heating",
      });
    await spend({
      account: card,
      date: dayIn(month, 7),
      cents: 1549,
      payee: "Netflix",
      category: "Subscriptions",
    });
    await spend({
      account: card,
      date: dayIn(month, 14),
      cents: 1199,
      payee: "Spotify",
      category: "Subscriptions",
    });

    // Everyday spending, on the card, as most households actually do it.
    for (let week = 0; week < 4; week++)
      await spend({
        account: card,
        date: dayIn(month, 3 + week * 7 + between(0, 2)),
        cents: between(7600, 18400),
        payee: pick(PAYEES.groceries),
        category: "Groceries",
      });
    for (let fill = 0; fill < 2; fill++)
      await spend({
        account: card,
        date: dayIn(month, 6 + fill * 13),
        cents: between(3400, 6600),
        payee: pick(PAYEES.fuel),
        category: "Fuel / Transport",
      });
    for (let out = 0; out < between(3, 6); out++)
      await spend({
        account: card,
        date: dayIn(month, between(2, 27)),
        cents: between(1800, 8200),
        payee: pick(PAYEES.dining),
        category: "Dining Out",
      });
    if (chance(0.8))
      await spend({
        account: card,
        date: dayIn(month, between(4, 25)),
        cents: between(1900, 7400),
        payee: pick(PAYEES.household),
        category: "Household",
      });
    await spend({
      account: card,
      date: dayIn(month, between(3, 26)),
      cents: between(3200, 6400),
      payee: pick(PAYEES.pets),
      category: "Pets",
    });
    if (chance(0.6))
      await spend({
        account: card,
        date: dayIn(month, between(5, 26)),
        cents: between(1500, 9500),
        payee: pick(PAYEES.fun),
        category: "Fun Money",
      });

    // The irregular things that wreck an unprepared budget.
    if (chance(0.25))
      await spend({
        account: checking,
        date: dayIn(month, between(6, 24)),
        cents: between(8500, 48000),
        payee: pick(PAYEES.repair),
        category: "Car Repair",
      });
    if (chance(0.3))
      await spend({
        account: card,
        date: dayIn(month, between(4, 25)),
        cents: between(2500, 31000),
        payee: pick(PAYEES.medical),
        category: "Medical",
      });
    if (chance(0.2))
      await spend({
        account: checking,
        date: dayIn(month, between(8, 22)),
        cents: between(4500, 28000),
        payee: pick(PAYEES.home),
        category: "Home Maintenance",
      });
    if (["11", "12"].includes(month.slice(5)))
      await spend({
        account: card,
        date: dayIn(month, between(2, 20)),
        cents: between(6500, 24000),
        payee: pick(PAYEES.gifts),
        category: "Gifts",
      });
    if (index === 5 || index === 11)
      await spend({
        account: checking,
        date: dayIn(month, 16),
        cents: 69000,
        payee: "Erie Insurance",
        category: "Insurance",
        memo: "Six month premium",
      });

    // Keep a grocery purchase to refund later, once there is one.
    if (!firstGrocery && index === MONTHS - 2) {
      const receipt = await spend({
        account: card,
        date: dayIn(month, 21),
        cents: 8640,
        payee: "Wegmans",
        category: "Groceries",
        memo: "Two of these were spoiled",
      });
      if (receipt) firstGrocery = { id: receipt.id, amount: 2140, month };
    }

    // Transfers: savings, the car loan, and paying the cards.
    const savingsDate = dayIn(month, 16);
    if (savingsDate <= today) {
      await run({
        type: "transaction.create",
        accountId: checking,
        transferAccountId: savings,
        kind: "TRANSFER",
        date: savingsDate,
        amount: "-250.00",
        payee: "Monthly savings",
        cleared: true,
      });
      transactions++;
    }
    // A loan lives outside the budget, so paying it is budgeted spending on
    // one side and a smaller debt on the other.
    const loanDate = dayIn(month, 22);
    if (loanDate <= today) {
      await run({
        type: "transaction.create",
        accountId: checking,
        transferAccountId: carLoan,
        kind: "TRANSFER",
        date: loanDate,
        amount: "-312.00",
        payee: "First Commonwealth auto loan",
        cleared: true,
        splits: [{ categoryId: categoryId("Car Payment"), amount: "-312.00" }],
      });
      transactions++;
    }
    // The card is paid from the reserve the spending already built up. Paying
    // most of it, not all, is what leaves a real balance to plan against.
    const payDate = dayIn(month, 18);
    const payment = Math.round(spentOnCardBefore * 0.88);
    if (payDate <= today && payment > 0) {
      await run({
        type: "transaction.create",
        accountId: checking,
        transferAccountId: card,
        kind: "TRANSFER",
        date: payDate,
        amount: usd(-payment),
        payee: "Everyday Card payment",
        cleared: true,
      });
      transactions++;
    }
    const transferPayDate = dayIn(month, 6);
    if (transferPayDate <= today) {
      await run({
        type: "transaction.create",
        accountId: checking,
        transferAccountId: transferCard,
        kind: "TRANSFER",
        date: transferPayDate,
        amount: "-150.00",
        payee: "Balance Transfer Card payment",
        cleared: true,
      });
      transactions++;
    }
  }

  // --- a refund, and a correction -----------------------------------------
  if (firstGrocery) {
    await run({
      type: "transaction.create",
      accountId: card,
      kind: "REFUND",
      date: dayIn(firstGrocery.month, 25),
      amount: usd(firstGrocery.amount),
      payee: "Wegmans",
      memo: "Returned the spoiled items",
      refundOfId: firstGrocery.id,
      cleared: true,
      splits: [
        {
          categoryId: categoryId("Groceries"),
          amount: usd(firstGrocery.amount),
        },
      ],
    });
    transactions++;
  }

  // Something entered wrong and put right, which is what the ledger's
  // immutability is for: the original stays, reversed, with a reason.
  const mistake = await spend({
    account: checking,
    date: dayIn(thisMonth, Math.min(9, Number(today.slice(8)))),
    cents: 12800,
    payee: "Corner Diner",
    category: "Dining Out",
  });
  if (mistake) {
    await run({
      type: "transaction.create",
      accountId: checking,
      kind: "EXPENSE",
      date: dayIn(thisMonth, Math.min(9, Number(today.slice(8)))),
      amount: "-28.00",
      payee: "Corner Diner",
      memo: "Entered from the receipt",
      replacesId: mistake.id,
      reason: "Typed 128.00 instead of 28.00",
      cleared: true,
      splits: [{ categoryId: categoryId("Dining Out"), amount: "-28.00" }],
    });
    transactions++;
  }

  // Give whatever is left a job, which is the whole point of the method. A
  // demo that ends with a thousand dollars sitting in Ready to Assign is
  // showing an unfinished budget rather than a working one.
  const beforeSweep = await getFinance(userId, budgetId);
  const spare = Number(beforeSweep.projection.readyToAssign) - 24000;
  if (spare > 0)
    await run({
      type: "assign",
      categoryId: categoryId("Savings Goal"),
      month: thisMonth,
      amount: usd(spare),
    });

  // --- reconcile the everyday accounts, as anyone would ---------------------
  // A statement only ever shows cleared money, so this is the cleared balance,
  // not the account balance: this month's uncleared spending is not on it yet.
  const finished = await getFinance(userId, budgetId);
  const clearedBalance = (accountId: string) =>
    finished.input.transactions
      .filter((t) =>
        finished.states.some(
          (s) =>
            s.transactionId === t.id && s.accountId === accountId && s.cleared,
        ),
      )
      .reduce(
        (total, t) =>
          total + (t.accountId === accountId ? t.amount : -t.amount),
        0n,
      );
  for (const accountId of [checking, savings]) {
    await run({
      type: "reconcile",
      accountId,
      date: today,
      observed: usd(Number(clearedBalance(accountId))),
    });
  }

  const summary = await getFinance(userId, budgetId);
  console.log(
    [
      "",
      `Seeded ${database}.`,
      `  ${transactions} transactions across ${MONTHS} months`,
      `  ${summary.accounts.length} accounts, ${summary.categories.length} categories`,
      `  ${summary.targets.length} targets in force this month`,
      `  Ready to Assign: ${usd(Number(summary.projection.readyToAssign))}`,
      `  Net worth: ${usd(
        Number(
          summary.projection.accounts.reduce(
            (total, a) => total + a.balance,
            0n,
          ),
        ),
      )}`,
      "",
      `Sign in as "owner". Re-run with --reset to rebuild, --seed N for a different ledger.`,
    ].join("\n"),
  );
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  await getDb().$disconnect();
  process.exit(1);
});
