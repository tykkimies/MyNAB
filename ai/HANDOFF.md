# Current handoff

Updated 2026-09-24 by Claude Code. Keep this short; it is read every session.

## Request

Seed the app with realistic but fake data before starting Phase 4, so behaviour can be
exercised against a year of history rather than a handful of test rows.

### Acceptance criteria

- A script that builds a full, plausible budget: several accounts, the starter categories,
  a year or so of income, bills, everyday spending, transfers, card use and payments.
- Data goes through the **command layer**, not raw inserts, so the ledger, triggers and
  budget invariants are exercised by the seeding itself.
- Deterministic: the same seed produces the same ledger.
- It must be impossible to point at production. Refuse anything that is not a local
  database with a dev/demo/test name, and require an explicit flag.
- Exercises the new Phase 3 work: several target kinds, effective-dated changes, a
  promotional rate that ends, and a debt payoff target.
- Verified by running it and checking the resulting pages.

## Status: VERIFIED

| Step                                                 | State    | Evidence                                                  |
| ---------------------------------------------------- | -------- | --------------------------------------------------------- |
| 1. `scripts/seed-demo.ts`, guarded and deterministic | VERIFIED | guards refused a remote host and a production-shaped name |
| 2. Seeded the dev and test databases                 | VERIFIED | 376 transactions, 14 months, RTA $240, net worth $32,410  |
| 3. Reviewed the pages against seeded data            | VERIFIED | Budget, Goals, Debt, Accounts screenshots, no page errors |
| 4. Documented in README                              | VERIFIED | "Realistic demo data"                                     |

### Three defects the seeded data exposed

1. **Adding a credit card locked away the starter categories.** A card's payment category
   is not flagged `system`, so the "budget already has categories" guard counted it.
2. **Spending un-funded a refill target.** It measured `available`, which falls when the
   money is spent, so a month with the rent assigned and paid asked for the rent again.
   Same mistake as the dated-target one, in a different branch.
3. **The payoff plan contradicted itself**, listing a debt as never paid off beside its own
   payoff date, because per-month detection flagged early months that a rolled-up minimum
   later rescued.

### How to use it

```sh
npm run seed:demo -- --yes --reset              # local *_dev/_demo/_seed/_test only
npm run seed:demo -- --yes --reset --months 24 --seed 7
```

The owner is left alone if one exists. Seeding the `_test` database and starting
`node --import tsx scripts/e2e-server.ts` is how the pages above were reviewed; the e2e
suite truncates that database on its next run, so nothing needs undoing.

## Next action

Phase 4: schedules first, then rules. The seeded ledger is the place to try them, since
recurring transactions are already visible in it.

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
