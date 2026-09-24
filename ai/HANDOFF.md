# Current handoff

Updated 2026-09-23 by Claude Code. Keep this short; it is read every session.

## Request

Finish Phase 3 rather than leaving the four recorded gaps open: effective-dated targets
and terms, stored/visible completion history, promotional rate periods, and debt payoff as
a target type.

### Acceptance criteria

- Changing a target or a set of debt terms records a new version effective from a month;
  past months keep the version that was in force then.
- A promotional rate is expressible: a rate that changes in a named future month, and the
  payoff simulator charges the rate in force for each simulated month.
- `DEBT_PAYOFF` and `DEBT_PAYOFF_BY_DATE` target types exist and work on a card payment
  category, with the balance owed read from the ledger rather than stored.
- Completion stays visible: a target met in an earlier month can be seen as met.
- Composite ownership FKs survive the migration; readiness expects the new migration.
- Full verification re-run: check, integration, build, e2e.

## Status: VERIFIED

| Step                                                                      | State    | Evidence                                        |
| ------------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| 1. Migration 010, composite keys, new type vocabulary                     | VERIFIED | fresh database: 11 migrations, 28 composite FKs |
| 2. Domain: `versions.ts`, rate schedule, payoff targets, share netting    | VERIFIED | 145 unit tests                                  |
| 3. Application: version in force, versioned commands, derived history     | VERIFIED | 60 integration tests                            |
| 4. UI: Goals payoff targets, effective month, history; Debt term versions | VERIFIED | 36 e2e, screenshots reviewed                    |
| 5. Full verification                                                      | VERIFIED | commands below                                  |

### Tests actually run

```sh
npm run check              # lint, typecheck, 145 unit
npm run test:integration   # 60 against PostgreSQL
npm run test:backup        # all 26 tables matched
APP_BASE_PATH=/mynab APP_ORIGIN=https://127.0.0.1:3443 npm run build
APP_BASE_PATH=/mynab npm run test:e2e   # 36 across desktop and mobile
# fresh database: migrate deploy applied 11, 28 composite ownership FKs remained
```

### Defects this work exposed, in existing code

1. **A dated target over-funded on repeat.** Its monthly share was computed from
   `available`, which already includes this month's assignment, so funding twice assigned
   more than the plan asked for. The share now comes from what was there before the month,
   netted against what has been assigned.
2. **Negative amortisation was only checked at the start month**, so a debt whose minimum
   covered a promotional rate but not the rate replacing it was reported as payable off.
   Now checked every month against the payment actually made.

### Behaviour change worth knowing

A target set today takes effect this month, not retrospectively. Earlier months report no
target. Rows that existed before migration 010 take `1900-01` and still apply to every
month, so nothing already in the database changes meaning.

## Next action

Unreleased. Cut 0.3.4 and build images, or start Phase 4 (schedules, then rules).
**0.3.3 is still not deployed**; deploying now means migrations 008, 009 and 010 together.

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
