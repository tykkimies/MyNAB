# Claude Code instructions

@AGENTS.md

The shared working agreement above applies in full. Follow its startup, intent-writing and
checkpoint rules automatically, without being asked.

## Claude-specific

Hooks in `.claude/settings.json` run the recovery helper for you:

- **SessionStart** runs `ai/checkpoint.sh recover` and feeds the result into context. You
  still have to read `ai/HANDOFF.md` and reconcile it; the hook only gathers facts.
- **Stop** and **PreCompact** take a checkpoint automatically, so an interruption at the end
  of a turn, or a compaction, cannot lose the state of the working tree.

Because Stop already checkpoints, you rarely need to run `checkpoint` by hand. Do it
explicitly before anything risky, and whenever you finish a batch of edits mid-turn.

Codex has no equivalent project hook, so it checkpoints manually. Leave `ai/HANDOFF.md` in a
state Codex can pick up cold.

This project's own verification commands and constraints are in `ai/PROJECT.md`. Do not
re-derive them from the repository.
