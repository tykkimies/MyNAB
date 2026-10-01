import { openBudget } from "@/application/finance-page";
import { household, HOUSEHOLD_LIMIT } from "@/application/household";
import { requireUser } from "@/application/session";
import { appPath } from "@/infrastructure/app-path";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/ui/page-header";
import { Notice } from "@/components/ui/notice";
import { Pill } from "@/components/ui/pill";
import { Help } from "@/components/ui/help";

const MUTED = "text-table text-ink-2";
// Only messages this application writes are shown back.
const KNOWN_ERRORS = new Set([
  "Only the person who set up MyNAB can manage people.",
  "Only a plan's owner can share it.",
  "Choose another person to receive the plans.",
  "Choose a person in this household to receive the plans.",
  "Plan unavailable.",
  "Usernames are 3 to 64 letters, numbers, dots, dashes or underscores.",
  "Use a passphrase of at least 15 characters.",
  `A household has up to ${HOUSEHOLD_LIMIT} people.`,
  "That username is taken.",
  "That person is not in this household.",
  "You cannot remove yourself from your own plan.",
  "That person does not share this plan.",
  "A plan's owner cannot be removed.",
  "Your current passphrase is not right.",
  "Change your own passphrase below instead.",
]);
const SAVED: Record<string, string> = {
  person: "Person added, with a plan of their own.",
  reset: "Passphrase reset. They have been signed out everywhere.",
  shared: "Plan shared.",
  unshared: "Plan no longer shared with that person.",
  removed: "Account removed. Their owned plans were transferred and their sessions revoked.",
};

export default async function Household({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const plan = await openBudget(user.userId);
  const h = await household(user.userId, plan?.id ?? "");
  const action = appPath("/api/household");
  const memberRole = new Map(h.members.map((m) => [m.userId, m.role]));
  const others = h.people.filter((p) => p.id !== user.userId);
  const error =
    q.error === "confirm-remove"
      ? "Confirm account removal and plan transfer before continuing."
      : q.error && KNOWN_ERRORS.has(q.error)
        ? q.error
        : null;
  const saved = q.saved ? SAVED[q.saved] : null;
  return (
    <main id="main" className="flex flex-col outline-none" tabIndex={-1}>
      <PageHeader
        title="Household"
        meta={`${h.people.length} of ${HOUSEHOLD_LIMIT} people`}
        actions={
          <Help label="About households" align="right">
            Up to {HOUSEHOLD_LIMIT} people can each have their own sign-in and
            their own plans, and share the plans they choose. Everyone sharing
            a plan can budget in it; each change records who made it.
          </Help>
        }
      />
      <div className="mx-auto w-full max-w-canvas px-gutter pb-12 lg:px-space-lg">
        {(error || saved) && (
          <div className="mt-4">
            {error ? (
              <Notice tone="negative" role="alert">
                {error}
              </Notice>
            ) : (
              <Notice tone="positive" role="status">
                {saved}
              </Notice>
            )}
          </div>
        )}
        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            {plan && (
              <section className="surface" aria-labelledby="sharing-heading">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline px-4 py-2 lg:px-6">
                  <h2 id="sharing-heading" className="section-title">
                    Sharing {plan.name}
                  </h2>
                  {!h.isPlanOwner && (
                    <span className={MUTED}>
                      Only this plan&apos;s owner can change who shares it
                    </span>
                  )}
                </div>
                <ul>
                  {h.people.map((person) => {
                    const role = memberRole.get(person.id);
                    return (
                      <li
                        key={person.id}
                        className="household-person flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-2 last:border-b-0 lg:px-6"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2 text-body text-ink">
                          <span className="truncate">
                            {person.username}
                            {person.id === user.userId ? " (you)" : ""}
                          </span>
                          <Pill tone={role === "owner" ? "accent" : role ? "positive" : "neutral"}>
                            {role === "owner" ? "Owner" : role ? "Shares this plan" : "Not shared"}
                          </Pill>
                        </span>
                        {h.isPlanOwner && person.id !== user.userId && role !== "owner" && (
                          <ActionForm action={action}>
                            <input type="hidden" name="intent" value={role ? "unshare" : "share"} />
                            <input type="hidden" name="budgetId" value={plan.id} />
                            <input type="hidden" name="userId" value={person.id} />
                            <button className="btn btn-secondary btn-sm" type="submit">
                              {role ? `Stop sharing with ${person.username}` : `Share with ${person.username}`}
                            </button>
                          </ActionForm>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {h.isAdmin && (
              <section className="surface p-4" aria-labelledby="people-heading">
                <h2 id="people-heading" className="section-title">
                  People
                </h2>
                {h.people.length < HOUSEHOLD_LIMIT ? (
                  <ActionForm action={action} className="finance-form mt-3">
                    <input type="hidden" name="intent" value="add-person" />
                    <div className="field-grid" data-cols="2">
                      <label>
                        New person&apos;s username
                        <input name="username" required minLength={3} maxLength={64} autoComplete="off" />
                      </label>
                      <label>
                        Their first passphrase
                        <input name="passphrase" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />
                      </label>
                    </div>
                    <div className="form-actions">
                      <button className="btn btn-primary" type="submit">
                        Add person
                      </button>
                    </div>
                  </ActionForm>
                ) : (
                  <p className={`mt-2 ${MUTED}`}>
                    This household has the most people it can hold.
                  </p>
                )}
                {others.length > 0 && (
                  <div className="mt-4 border-t border-hairline pt-3">
                    <h3 className="text-caps uppercase text-ink-3">Passphrases</h3>
                    <p className={`mt-2 ${MUTED}`}>
                      Resetting a passphrase lets you sign in as that person and
                      read their private plans. Only do this with their consent.
                    </p>
                    {others.map((person) => (
                      <details key={person.id} className="mt-2">
                        <summary className="cursor-pointer text-table font-medium text-ink">
                          Reset {person.username}&apos;s passphrase
                        </summary>
                        <ActionForm action={action} className="finance-form mt-2">
                          <input type="hidden" name="intent" value="reset-passphrase" />
                          <input type="hidden" name="userId" value={person.id} />
                          <label>
                            New passphrase for {person.username}
                            <input name="passphrase" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />
                          </label>
                          <div className="form-actions">
                            <button className="btn btn-secondary" type="submit">
                              Reset passphrase
                            </button>
                          </div>
                        </ActionForm>
                      </details>
                    ))}
                  </div>
                )}
                <div className="mt-4 border-t border-hairline pt-3">
                  <h3 className="text-caps uppercase text-ink-3">Remove an account</h3>
                  <p className={`mt-2 ${MUTED}`}>
                    Owned plans must be transferred to a household member. The
                    recipient gains access, including to plans that were private.
                    Removing your own installer account also transfers installer
                    control.
                  </p>
                  {h.people.map((person) => {
                    const recipients = h.people.filter((candidate) => candidate.id !== person.id);
                    return (
                      <details key={person.id} className="mt-2">
                        <summary className="cursor-pointer text-table font-medium text-negative">
                          Remove {person.username}{person.id === user.userId ? " (you)" : ""}
                        </summary>
                        <ActionForm action={action} className="finance-form mt-2">
                          <input type="hidden" name="intent" value="remove-person" />
                          <input type="hidden" name="userId" value={person.id} />
                          <label>
                            Transfer owned plans to
                            <select name="transferToId" required defaultValue="">
                              <option value="" disabled>Select a household member</option>
                              {recipients.map((recipient) => (
                                <option key={recipient.id} value={recipient.id}>
                                  {recipient.username}{recipient.id === user.userId ? " (you)" : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="check-field">
                            <input type="checkbox" name="confirm" required />
                            I understand this account will be deleted, its sessions
                            revoked, and its owned plans transferred
                          </label>
                          <div className="form-actions">
                            <button className="btn btn-secondary" type="submit">
                              Remove account
                            </button>
                          </div>
                        </ActionForm>
                      </details>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
          <section className="surface p-4" aria-labelledby="passphrase-heading">
            <h2 id="passphrase-heading" className="section-title">
              Your passphrase
            </h2>
            <p className={`mt-1 ${MUTED}`}>
              Changing it signs you out everywhere, including here.
            </p>
            <ActionForm action={action} className="finance-form mt-3">
              <input type="hidden" name="intent" value="change-own" />
              <div className="field-grid" data-cols="2">
                <label>
                  Current passphrase
                  <input name="current" type="password" required autoComplete="current-password" />
                </label>
                <label>
                  New passphrase
                  <input name="passphrase" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />
                </label>
              </div>
              <div className="form-actions">
                <button className="btn btn-secondary" type="submit">
                  Change passphrase
                </button>
              </div>
            </ActionForm>
          </section>
        </div>
      </div>
    </main>
  );
}
