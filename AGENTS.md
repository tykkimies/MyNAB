# Working agreement for AI agents in this repository

Claude Code and Codex alternate here, one at a time, in VS Code terminals. Either may be
cut off mid-task when a subscription limit is reached. These rules exist so the next agent
can resume without guessing, and without re-reading the whole repository.

## Start of every session, and whenever asked to resume

1. Read this file, `ai/PROJECT.md`, and `ai/HANDOFF.md`.
2. Run `sh ai/checkpoint.sh recover`.
3. Reconcile the handoff notes against what recovery actually reports, including edits made
   after the last checkpoint.
4. Treat interrupted edits and unrecorded test results as **unverified**. A test is passed
   only if its result is recorded with the command that produced it.
5. Read only the files needed for the next step. Do not rescan the repository unless
   recovery points at a specific need.
6. **Preserve unrelated changes.** Not every modified file belongs to the previous agent;
   the user edits this repository too. Never revert something you cannot account for.
7. If the recorded next action is clear, continue it. Ask only when a material ambiguity
   actually blocks progress.

## Write intent before changing code

Persist intent to `ai/HANDOFF.md` _before_ editing application code, not after:

- Before starting: record the request, acceptance criteria, plan, and the first step.
- Before each small batch of edits: mark that step `IN PROGRESS` and name the files you
  expect to touch.
- After the batch: checkpoint the outcome and mark the step `IMPLEMENTED` or `VERIFIED`.

Use these three words precisely, because the next agent depends on the distinction:

- **PLANNED** — decided, nothing written.
- **IMPLEMENTED** — code written, tests not run or not passing yet.
- **VERIFIED** — written _and_ the recorded command was run and passed.

Do not save this up for an end-of-session summary, and do not wait until usage is nearly
exhausted. The cutoff is not announced.

## Git and GitHub

The repository lives on GitHub: private `https://github.com/tykkimies/MyNAB`, remote
`origin`, branch `main`. **Push every commit** (`git push`) as soon as it is made; a
commit that exists only on this Mac is not done. Releases build only from pushed
commits (`scripts/release.sh` enforces it); the full release and deploy steps are in
`ai/PROJECT.md` under Deployment. Keep the repository private: `ai/HANDOFF.md` and the
logs hold real balances, payees and server details. Never commit `.env*` (other than
the `*.example` files) or anything under `.local/`.

## Checkpointing

```sh
sh ai/checkpoint.sh checkpoint "short label"   # snapshot uncommitted work
sh ai/checkpoint.sh recover                    # what exists now vs the snapshot
sh ai/checkpoint.sh status                     # one line
```

The helper only reads the working tree and writes under `ai/.state/` (git-ignored). It
**never** resets, stashes, discards, stages or commits. It needs no model calls, so it
still works when credits are exhausted.

Run a checkpoint after each meaningful batch of edits, and before anything risky.

### What is not captured

Excluded entirely: `.env` and other credential-shaped files, `node_modules`, `.next`,
build output, `test-results`, `backups`, `.local`, and the tool's own state. Untracked
scanning honours `.gitignore`, and an explicit deny-list is a second line of defence.

Binary files and anything over 256 KB are recorded **by hash only** — a change is detected,
but the content is not recoverable from the snapshot. The snapshot lists these under
"recorded by hash only". Recovering their content means Git history or the file itself.

Only small untracked **text** files have their content saved. Everything else relies on the
working tree still being present, which it normally is: an interruption stops the agent,
not the filesystem.

## Also true while doing new work

Keep this workflow running for new tasks, not only recovery. The point is that any turn can
be the last one.
