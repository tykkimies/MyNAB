import { openBudget } from "@/application/finance-page";
import { household, HOUSEHOLD_LIMIT } from "@/application/household";
import { requireUser } from "@/application/session";
import { appPath } from "@/infrastructure/app-path";
import { ActionForm } from "@/components/action-form";

const CARD = "rounded-lg border border-border-warm bg-surface-card";
const PANEL = `finance-panel ${CARD} p-space-lg`;
const H2 = "font-headline-md text-headline-md text-text-primary";
const MUTED = "font-body-sm text-body-sm leading-relaxed text-text-secondary";
const MAIN =
  "mx-auto w-full max-w-canvas px-gutter pb-space-xl pt-space-lg outline-none lg:px-space-lg";
// Only messages this application writes are shown back.
const KNOWN_ERRORS = new Set([
  "Only the person who set up MyNAB can manage people.",
  "Only a plan's owner can share it.",
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
  return (
    <main id="main" className={MAIN} tabIndex={-1}>
      <div className="flex max-w-2xl flex-col">
        <span className="font-label-caps text-label-caps uppercase tracking-widest text-secondary">
          Household
        </span>
        <h1 className="mt-space-xs font-headline-lg text-headline-lg leading-tight text-text-primary">
          Budget together.
        </h1>
        <p className="mt-space-xs font-body-md text-body-md leading-relaxed text-text-secondary">
          Up to {HOUSEHOLD_LIMIT} people can each have their own sign-in and
          their own plans, and share the plans they choose. Everyone sharing a
          plan can budget in it; each change records who made it.
        </p>
      </div>
      {q.error && KNOWN_ERRORS.has(q.error) && (
        <p role="alert" className="mt-space-md font-body-sm text-body-sm text-status-negative-text">
          {q.error}
        </p>
      )}
      {q.saved && SAVED[q.saved] && (
        <p role="status" className={`mt-space-md ${MUTED}`}>
          {SAVED[q.saved]}
        </p>
      )}

      {plan && (
        <section className={`mt-space-lg ${PANEL}`} aria-labelledby="sharing-heading">
          <h2 id="sharing-heading" className={H2}>
            Sharing {plan.name}
          </h2>
          <ul className="mt-space-md divide-y divide-border-warm">
            {h.people.map((person) => {
              const role = memberRole.get(person.id);
              return (
                <li key={person.id} className="household-person flex flex-wrap items-center justify-between gap-space-sm py-space-sm">
                  <span className="font-body-md text-body-md text-text-primary">
                    {person.username}
                    {person.id === user.userId ? " (you)" : ""}
                    <span className="ml-space-sm font-body-sm text-body-sm text-text-secondary">
                      {role === "owner" ? "Owner" : role ? "Shares this plan" : "Not shared"}
                    </span>
                  </span>
                  {h.isPlanOwner && person.id !== user.userId && role !== "owner" && (
                    <ActionForm action={action}>
                      <input type="hidden" name="intent" value={role ? "unshare" : "share"} />
                      <input type="hidden" name="budgetId" value={plan.id} />
                      <input type="hidden" name="userId" value={person.id} />
                      <button className="secondary-button" type="submit">
                        {role ? `Stop sharing with ${person.username}` : `Share with ${person.username}`}
                      </button>
                    </ActionForm>
                  )}
                </li>
              );
            })}
          </ul>
          {!h.isPlanOwner && (
            <p className={`mt-space-sm ${MUTED}`}>
              Only this plan&apos;s owner can change who shares it.
            </p>
          )}
        </section>
      )}

      {h.isAdmin && (
        <section className={`mt-space-lg ${PANEL}`} aria-labelledby="people-heading">
          <h2 id="people-heading" className={H2}>
            People
          </h2>
          {h.people.length < HOUSEHOLD_LIMIT ? (
            <ActionForm action={action} className="finance-form mt-space-md">
              <input type="hidden" name="intent" value="add-person" />
              <div className="field-grid">
                <label>
                  New person&apos;s username
                  <input name="username" required minLength={3} maxLength={64} autoComplete="off" />
                </label>
                <label>
                  Their first passphrase
                  <input name="passphrase" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />
                </label>
              </div>
              <button className="primary-button" type="submit">
                Add person
              </button>
            </ActionForm>
          ) : (
            <p className={`mt-space-sm ${MUTED}`}>
              This household has the most people it can hold.
            </p>
          )}
          {others.map((person) => (
            <details key={person.id} className="mt-space-md rounded-md border border-border-warm px-space-md py-space-sm">
              <summary className="cursor-pointer font-body-sm text-body-sm font-semibold text-text-primary">
                Reset {person.username}&apos;s passphrase
              </summary>
              <ActionForm action={action} className="finance-form mt-space-sm">
                <input type="hidden" name="intent" value="reset-passphrase" />
                <input type="hidden" name="userId" value={person.id} />
                <label>
                  New passphrase for {person.username}
                  <input name="passphrase" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />
                </label>
                <button className="secondary-button" type="submit">
                  Reset passphrase
                </button>
              </ActionForm>
            </details>
          ))}
        </section>
      )}

      <section className={`mt-space-lg ${PANEL}`} aria-labelledby="passphrase-heading">
        <h2 id="passphrase-heading" className={H2}>
          Your passphrase
        </h2>
        <p className={`mt-space-xs ${MUTED}`}>
          Changing it signs you out everywhere, including here.
        </p>
        <ActionForm action={action} className="finance-form mt-space-md">
          <input type="hidden" name="intent" value="change-own" />
          <div className="field-grid">
            <label>
              Current passphrase
              <input name="current" type="password" required autoComplete="current-password" />
            </label>
            <label>
              New passphrase
              <input name="passphrase" type="password" required minLength={15} maxLength={128} autoComplete="new-password" />
            </label>
          </div>
          <button className="secondary-button" type="submit">
            Change passphrase
          </button>
        </ActionForm>
      </section>
    </main>
  );
}
