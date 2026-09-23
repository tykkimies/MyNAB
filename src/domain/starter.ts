/**
 * A starting category structure, offered once to a budget that has none.
 *
 * Ordered the way envelope budgeting wants decisions made when money is tight:
 * what must be paid before the next paycheck, then the irregular expenses that
 * wreck budgets when they arrive as surprises, then comfort, then what is left
 * over named honestly rather than sitting unassigned.
 *
 * This is a suggestion, not a requirement. It creates categories only; it never
 * assigns money, sets targets, or touches the ledger.
 */
export interface StarterGroup {
  name: string;
  note: string;
  categories: string[];
}

export const STARTER_GROUPS: StarterGroup[] = [
  {
    name: "Bills",
    note: "Due on a schedule, roughly the same every month.",
    categories: [
      "Rent / Mortgage",
      "Electric",
      "Gas / Heating",
      "Water",
      "Internet",
      "Phone",
      "Insurance",
      "Subscriptions",
    ],
  },
  {
    name: "Everyday",
    note: "Spending that varies week to week.",
    categories: [
      "Groceries",
      "Fuel / Transport",
      "Dining Out",
      "Household",
      "Personal",
      "Pets",
    ],
  },
  {
    name: "Irregular",
    note: "Real costs that do not arrive monthly. Divide the yearly cost by twelve and fund that much each month, so the bill is already paid for when it lands.",
    categories: [
      "Car Repair",
      "Car Registration",
      "Medical",
      "Home Maintenance",
      "Gifts",
      "Annual Renewals",
    ],
  },
  {
    name: "Quality of Life",
    note: "The things that make the plan worth keeping.",
    categories: ["Fun Money", "Hobbies", "Travel", "Education"],
  },
  {
    name: "Savings",
    note: "Money with a job that is not spending. Assigning here is what stops it being spent by accident.",
    categories: ["Emergency Fund", "Savings Goal"],
  },
];

export const STARTER_CATEGORY_COUNT = STARTER_GROUPS.reduce(
  (total, group) => total + group.categories.length,
  0,
);
