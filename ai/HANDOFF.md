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

## Status: VERIFIED and DEPLOYED

**0.3.5 is deployed to production and seeded with demo data**, at the owner's request,
because the installation is not yet in real use.

| Step                                              | State    | Evidence                                                                                           |
| ------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `scripts/seed-demo.ts`, guarded and deterministic | VERIFIED | refuses a remote host and a production-shaped name without the explicit flag                       |
| Three defects the seed exposed, fixed             | VERIFIED | 147 unit, 61 integration, 36 e2e                                                                   |
| 0.3.5 images built on 192.168.1.7                 | VERIFIED | `npm run release`                                                                                  |
| Stack updated by the owner, migrations applied    | VERIFIED | migrate Exited (0), readiness 200, 11 migrations                                                   |
| Production seeded                                 | VERIFIED | 381 transactions, 6 accounts, 29 categories, 11 target versions, 4 term versions, 28 composite FKs |

### Production facts, as of 2026-09-24

- Running **0.3.5**. The earlier note that production ran 0.3.2 was wrong: it was on 0.3.3.
- **Backup before the change:** `/home/plex/mynab/backups/mynab-pre-0.3.4-20260924T003623Z.dump`
  on the host, verified with `pg_restore --list`. It holds the pre-seed state: 1 transaction,
  1 account, 2 categories and the PNC connection.
- **The PNC bank connection was removed** by the seed and has to be linked again through
  Plaid Link. This is not a bug: a connection's accounts are written once during the link
  exchange and nothing rediscovers them, so keeping the row would have stranded it.
- The owner account and the budget's name were kept; the demo passphrase was not used,
  because an owner already existed.
- Re-running the seed: `docker exec mynab-admin-1 npm run seed:demo -- --yes --reset
--replace-existing-budget`. Add `--seed N` for a different ledger.

## Next action

Phase 4: schedules first, then rules. The seeded ledger is the place to try them, since
recurring transactions are already visible in it. Re-link PNC when real data is wanted
back; seeding again would remove it a second time.

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
