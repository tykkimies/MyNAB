/**
 * One transaction line, shared by every register-style list: date · payee
 * with its category or transfer beneath · amount · running balance · cleared
 * state. On a phone the payee takes its own row and the balance and state
 * fold away. The summary of a `<details>` row uses these; the header row
 * above the list uses the same columns.
 */
export function registerColumns(showBalance = true) {
  return showBalance
    ? "sm:grid-cols-[5.5rem_minmax(0,1fr)_7rem_7rem_5rem]"
    : "sm:grid-cols-[5.5rem_minmax(0,1fr)_7rem_5rem]";
}
export const REGISTER_COLUMNS = registerColumns();
export function registerSummary(showBalance = true) {
  return `grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-2 text-table transition-colors hover:bg-row-hover lg:px-6 ${registerColumns(showBalance)}`;
}
export const REGISTER_SUMMARY = registerSummary();
export const REGISTER_PAYEE =
  "order-first col-span-2 min-w-0 truncate font-medium text-ink sm:order-none sm:col-span-1";
export const REGISTER_SUB = "block truncate text-meta font-normal text-ink-3";
export const REGISTER_DATE = "hidden text-num font-normal text-ink-2 sm:block";
export const REGISTER_AMOUNT = "text-right text-num";
export const REGISTER_BALANCE =
  "hidden text-right text-num font-normal text-ink-3 sm:block";
export const REGISTER_STATE =
  "hidden text-right text-caps uppercase text-ink-3 sm:block";

/** The column headings above a register, hidden on a phone. */
export function RegisterHead({
  balance = "Balance",
  state = "Cleared",
  showBalance = true,
}: {
  balance?: string | null;
  state?: string;
  showBalance?: boolean;
}) {
  return (
    <div
      className={`hidden gap-x-3 border-b border-hairline bg-surface-sunken px-4 py-1.5 text-caps uppercase text-ink-3 sm:grid lg:px-6 ${registerColumns(showBalance)}`}
      aria-hidden
    >
      <span>Date</span>
      <span>Payee</span>
      <span className="text-right">Amount</span>
      {showBalance && <span className="text-right">{balance ?? ""}</span>}
      <span className="text-right">{state}</span>
    </div>
  );
}
