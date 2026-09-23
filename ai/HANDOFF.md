# Current handoff

Updated 2026-09-23 by Claude Code. Keep this short; it is read every session.

## Request

Finish Phase 3 Goals. Targets were built as part of the 0.3.2 budgeting work and live
entirely inside the Budget page; the Goals pillar was never given a page and still renders
the `[pillar]` placeholder. Give Goals a real page and tie it to the existing target
machinery rather than building a parallel one.

### Acceptance criteria

- `/goals` is a real route showing every target: kind, amount, funded, still needed, this
  month's contribution, due occurrence, state, and a projected completion.
- Target creation, removal and one-click funding are reachable from Goals.
- The Budget page keeps its inline Target column and its fund button, and points at Goals
  instead of carrying a duplicate form.
- Projection is derived from the existing `evaluateTarget`; no second source of truth, and
  nothing about a target assigns money on its own.
- Placeholder route removed once no pillar needs it.
- `npm run check` passes; e2e updated where it asserted the placeholder.

## Status: VERIFIED

| Step                                                                 | State    | Evidence                                            |
| -------------------------------------------------------------------- | -------- | --------------------------------------------------- |
| 1. `projectCompletion` + `summarizeTargets` in `src/domain/goals.ts` | VERIFIED | 134 unit tests pass                                 |
| 2. `goalsPage()` in `src/application/finance-page.ts`                | VERIFIED | drives the page in e2e                              |
| 3. `src/app/(protected)/goals/page.tsx`                              | VERIFIED | 32 e2e pass; screenshots reviewed on both viewports |
| 4. Budget page points at Goals                                       | VERIFIED | budget screenshot reviewed                          |
| 5. `[pillar]` placeholder route and its 286 lines of CSS removed     | VERIFIED | selectors checked dead first; full e2e re-run after |
| 6. e2e moved to `/goals`, one new test added                         | VERIFIED | `npm run test:e2e`                                  |

### Tests actually run

```sh
npm run check              # lint, typecheck, 134 unit
npm run test:integration   # 55 against PostgreSQL
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build
APP_BASE_PATH=/mynab npm run test:e2e   # 32 across desktop and mobile
npm run format:check
```

Not run: `npm run test:backup` (no schema change), and no release images were built.

### Found while testing

- The e2e assertion that the funding overshoot message is visible was passing on a race:
  the panel unmounts once nothing is owed, taking its message with it. Now asserts the
  standing notice, which states the exact negative Ready to Assign.
- `<small>` in a table cell rendered inline; only `th small` had been styled.
- The finance e2e chain hit the login throttle when a tenth sign-in was added. Cleared per
  test, as foundation.spec already does.

### Known gaps deliberately NOT closed

Effective-dated targets and terms, stored completion history, promotional rate periods, and
debt payoff as a target type. All recorded in `NEXT_STEPS.md` and PROJECT_SPEC §§7-8.

## Next action

Unreleased. Either cut 0.3.4 and build images, or start Phase 4 automation (schedules,
then rules). 0.3.3 is still not deployed; see below.

---

## Prior unfinished work, carried forward

1. **0.3.3 is built but NOT deployed.** Production runs **0.3.2**. Images
   `mynab:0.3.3` (`sha256:cec91b10…`) and `mynab-tools:0.3.3` (`sha256:7b32cc88…`) are on
   192.168.1.7. Deploying needs a database backup first (migrations
   `202609230008_target_cadence`, `202609230009_debt_terms`) and the **whole** `stack.yml`
   pasted, not tag edits.
2. **UNVERIFIED: the sign of a real Plaid transaction.** Sandbox proved an outflow is
   negative; no real PNC transaction has arrived yet. Check the first one against the
   statement before trusting imported balances. Highest-value open check.
3. **Phase 3 spec gaps** in `NEXT_STEPS.md`: no effective-dated terms or targets, no
   promotional rate periods, debt payoff is not a target type.
4. **Match-proposal gap**: the ingestion planner computes duplicate/transfer proposals but
   the UI does not present them.

## Recovery workflow (completed earlier today, VERIFIED)

`ai/checkpoint.sh`, `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json` hooks
(SessionStart/Stop/PreCompact, Claude Code 2.1.226) and `ai/.state/` ignored. Codex has no
per-project hook and checkpoints manually. Fixture-tested with staged, unstaged, untracked,
`.env`, dependency, binary and oversized files; two defects found and fixed there.
