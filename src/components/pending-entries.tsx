import { DetailsClose } from "@/components/details-close";
import { DETAILS_DRAWER } from "@/components/drawer";
import { ProviderAction, ProviderSelect } from "@/components/provider-link";
import {
  REGISTER_BALANCE,
  REGISTER_DATE,
  REGISTER_STATE,
  REGISTER_SUB,
  REGISTER_SUMMARY,
  RegisterFlowCells,
} from "@/components/ui/register-row";
import { formatDate } from "@/domain/dates";

export interface PendingEntry {
  id: string;
  accountId: string;
  accountName: string;
  /** YYYY-MM-DD */
  date: string;
  amount: bigint;
  payee: string;
  suggestedCategoryId: string | null;
  /** An outflow on a budget account can be filed under a category. */
  canCategorize: boolean;
}

/**
 * YNAB's "Enter now": puts a pending observation in the register, uncleared
 * and counted, with a category for an outflow on a budget account.
 */
export function EnterNow({
  entry,
  categories,
}: {
  entry: Pick<PendingEntry, "id" | "suggestedCategoryId" | "canCategorize">;
  categories: { id: string; name: string }[];
}) {
  return entry.canCategorize && categories.length > 0 ? (
    <ProviderSelect
      command={{ type: "entry.enter", entryId: entry.id }}
      field="categoryId"
      options={categories}
      label="Category"
      suggested={entry.suggestedCategoryId}
      allowNone="Uncategorized"
      action="Enter now"
      hint="It goes in the register uncleared and counts in your budget from now; when it posts, the bank's version updates it."
    />
  ) : (
    <ProviderAction
      command={{ type: "entry.enter", entryId: entry.id }}
      label="Enter now"
    />
  );
}

/**
 * The register's pending section, as YNAB shows it: what the bank has seen
 * but not settled, greyed and collapsible, counting in no balance or budget
 * figure until it posts or the owner enters it now.
 */
export function PendingEntries({
  entries,
  categories,
  dateFormat,
  showAccount = false,
}: {
  entries: PendingEntry[];
  categories: { id: string; name: string }[];
  dateFormat: string;
  showAccount?: boolean;
}) {
  if (!entries.length) return null;
  return (
    <section
      className="surface pending-entries mt-4"
      aria-labelledby="pending-heading"
    >
      <details open>
        <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-2 lg:px-6">
          <h2 id="pending-heading" className="section-title">
            Pending at the bank ({entries.length})
          </h2>
          <span className="text-table text-ink-2">
            Not in your balance or budget until they post, or you enter them
            now.
          </span>
        </summary>
        {entries.map((entry) => (
          <details
            key={entry.id}
            name="pending-entry"
            className="register-row border-t border-hairline [&[open]>summary]:bg-row-selected"
          >
            <summary className={REGISTER_SUMMARY}>
              <span className={`${REGISTER_DATE} text-ink-3!`}>
                {formatDate(new Date(`${entry.date}T00:00:00Z`), dateFormat)}
              </span>
              <span className="order-first col-span-1 min-w-0 truncate font-medium text-ink-3 sm:order-none sm:col-span-1">
                {entry.payee || "No payee"}
                <span className={REGISTER_SUB}>
                  <span className="sm:hidden">
                    {formatDate(new Date(`${entry.date}T00:00:00Z`), dateFormat)}{" "}
                    ·{" "}
                  </span>
                  {showAccount ? `${entry.accountName} · ` : ""}Pending
                </span>
              </span>
              <RegisterFlowCells amount={entry.amount} className="text-ink-3!" />
              <span className={REGISTER_BALANCE}>—</span>
              <span className={REGISTER_STATE}>Pending</span>
            </summary>
            <div
              className={`flex flex-col gap-4 border-t border-hairline px-4 py-3 text-table text-ink-2 lg:px-6 ${DETAILS_DRAWER}`}
            >
              <div className="hidden items-start justify-between gap-2 border-b border-hairline pb-2 md:flex">
                <span className="text-caps uppercase text-ink-3">
                  Pending at the bank
                </span>
                <DetailsClose />
              </div>
              <p>
                {entry.accountName}: the bank has seen this but not settled
                it, so it counts in nothing yet. It appears here on its own
                once it posts, or you can enter it now.
              </p>
              <EnterNow entry={entry} categories={categories} />
            </div>
          </details>
        ))}
      </details>
    </section>
  );
}
