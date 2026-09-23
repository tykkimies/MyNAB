# Current handoff

Updated 2026-09-23 by Claude Code. Keep this short; it is read every session.

## Request

Add a lightweight shared-context and interruption-recovery workflow for Claude Code and
Codex, which the user alternates between in VS Code terminals when subscription limits are
reached. One agent at a time.

### Acceptance criteria

- Shared `AGENTS.md`; `CLAUDE.md` imports it with `@AGENTS.md`, no circular import.
- `ai/PROJECT.md` (stable context) and `ai/HANDOFF.md` (current work).
- Intent written *before* edits; planned / implemented / verified kept distinct.
- Local helper with checkpoint and recover; compares against the previous checkpoint;
  includes untracked source files; never resets, stashes, discards, stages or commits.
- Generated state out of Git, no recursive self-recording, secrets and binaries excluded.
- Bounded storage, atomic writes.
- Real hooks where supported, verified rather than assumed; documented fallback otherwise.
- Tested in a disposable fixture, without touching application code.

## Status: VERIFIED

| Step | State | Evidence |
| --- | --- | --- |
| `ai/checkpoint.sh` helper | VERIFIED | fixture below |
| `AGENTS.md`, `CLAUDE.md` with `@AGENTS.md` | VERIFIED | import resolves; no nested instruction files existed to conflict |
| `ai/PROJECT.md`, `ai/HANDOFF.md` | IMPLEMENTED | populated from the live repository |
| `.claude/settings.json` hooks | VERIFIED | see below |
| `.gitignore` excludes `ai/.state/` | VERIFIED | fixture showed no self-recording |
| Codex automation | NOT POSSIBLE — manual fallback documented |

### Tests actually run

- Disposable fixture at a scratch path, with staged + unstaged + untracked changes, a
  `.env`, a `node_modules` file, a 2 KB binary and a 300 KB text file. Checkpointed, then
  simulated an interruption by editing **after** the checkpoint with no new checkpoint.
  `recover` correctly reported `EDITED src/committed.ts`, `EDITED src/newfile.ts`,
  `NEW src/late.ts`. No `.env` or dependency content captured; binary and oversized files
  recorded hash-only; `ai/.state` absent from its own manifests.
- Two defects found and fixed during that test: untracked files were double-counted as
  tracked (`git status --porcelain` parse did not skip `??`), and the binary check used
  `grep '\000'`, which BSD grep treats literally, so binaries were being copied.
- Hooks: `claude --debug hooks -p …` created a checkpoint via **Stop**, and a second run
  confirmed the model receives the **SessionStart** recovery output (it read the branch
  name back). Claude Code 2.1.226.

### Hook support, as verified on this machine

- Claude Code 2.1.226 supports `SessionStart`, `Stop`, `PreCompact`, `PreToolUse`,
  `PostToolUse`, `SessionEnd`, `SubagentStop`, `Notification`, `PostCompact`,
  `UserPromptSubmit`. Three are used, in **project** `.claude/settings.json`; the user's
  global settings were not modified.
- Codex has no per-project hook. Its only lifecycle hook is a **global** `notify` in
  `~/.codex/config.toml`, already used by a Computer Use client. Overwriting it would break
  that, so it was left alone. **Codex checkpoints manually** per `AGENTS.md`.

## Next action

Nothing outstanding on this task. Verify by starting a fresh session: recovery should
appear at session start, and a checkpoint should exist after the first turn.

---

## Prior unfinished work, recovered from this session

Confident, carried forward:

1. **0.3.3 is built but NOT deployed.** Production runs **0.3.2**. Images
   `mynab:0.3.3` (`sha256:cec91b10…`) and `mynab-tools:0.3.3` (`sha256:7b32cc88…`) are on
   192.168.1.7. Deploying needs a database backup first (migrations
   `202609230008_target_cadence`, `202609230009_debt_terms`) and the **whole** `stack.yml`
   pasted, not tag edits.
2. **UNVERIFIED: the sign of a real Plaid transaction.** Sandbox proved an outflow is
   negative; no real PNC transaction has arrived yet. Check the first one against the
   statement before trusting imported balances. Highest-value open check.
3. **Phase 3 spec gaps**, recorded in `NEXT_STEPS.md`: no effective-dated terms or targets
   (changing an APR overwrites history), no promotional rate periods, and debt payoff is
   not available as a target type.
4. **Match-proposal gap**: the ingestion planner computes duplicate/transfer proposals but
   the UI does not present them, so a hand-entered transaction that the bank later delivers
   appears twice. Low risk while the user imports rather than hand-enters.

Unknown, not invented: whether the user has since deployed 0.3.3, entered categories, or
made local edits of their own. Run `recover` and reconcile before assuming.
