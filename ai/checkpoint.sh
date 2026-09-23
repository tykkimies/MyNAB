#!/bin/sh
# Interruption recovery for alternating AI agents. No model calls, no network.
#
#   ai/checkpoint.sh checkpoint [label]   save a snapshot of uncommitted work
#   ai/checkpoint.sh recover              report what exists now vs the snapshot
#   ai/checkpoint.sh status               one-line summary
#
# It NEVER resets, stashes, discards, stages or commits. It only reads the
# working tree and writes under ai/.state, which is git-ignored.
set -eu
umask 077

root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
state="ai/.state"
snaps="$state/checkpoints"
keep=${CHECKPOINT_KEEP:-20}
# Content is copied only for small text files; bigger ones are recorded by hash.
max_bytes=${CHECKPOINT_MAX_BYTES:-262144}

sha() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else sha256sum "$1" | cut -d' ' -f1; fi
}

# Never capture secrets, dependencies, build output or the tool's own state.
# Untracked scanning already honours .gitignore; this is a second line of
# defence for anything that is not ignored.
excluded() {
  case "$1" in
    ai/.state/*|.git/*) return 0 ;;
    *.env|.env|.env.*|*.pem|*.key|*.p12|*.pfx|*credential*|*secret*|id_rsa*) return 0 ;;
    node_modules/*|.next/*|dist/*|build/*|coverage/*|.local/*) return 0 ;;
    test-results/*|playwright-report/*|backups/*|*.tsbuildinfo) return 0 ;;
    *.png|*.jpg|*.jpeg|*.gif|*.pdf|*.zip|*.gz|*.tar|*.dump|*.sqlite*|*.ico|*.woff*) return 0 ;;
    *) return 1 ;;
  esac
}

# A file with a NUL byte in its first chunk is treated as binary: hashed, never
# copied. Counting bytes before and after stripping NULs is portable; `grep` for
# an escape sequence is not, and silently passed binaries through on BSD grep.
is_text() {
  raw=$(head -c 4096 "$1" 2>/dev/null | wc -c | tr -d ' ')
  stripped=$(head -c 4096 "$1" 2>/dev/null | LC_ALL=C tr -d '\000' | wc -c | tr -d ' ')
  [ "$raw" = "$stripped" ]
}

# path<TAB>size<TAB>sha for every untracked, non-ignored, non-excluded file.
# Git diff alone cannot see these, so recovery would otherwise miss new files.
untracked_manifest() {
  git ls-files --others --exclude-standard -z 2>/dev/null |
    while IFS= read -r -d '' f; do
      excluded "$f" && continue
      [ -f "$f" ] || continue
      size=$(wc -c < "$f" | tr -d ' ')
      printf '%s\t%s\t%s\n' "$f" "$size" "$(sha "$f")"
    done | LC_ALL=C sort
}

# Tracked files that differ from HEAD, by hash, so recovery can compare them
# even when the diff text is large. Untracked entries are handled separately,
# so listing them here too would double count every new file.
tracked_manifest() {
  git status --porcelain=v1 -z 2>/dev/null |
    while IFS= read -r -d '' entry; do
      case "$entry" in
        '??'*) continue ;;
        'R '*|'RM'*) continue ;;
      esac
      f=${entry#???}
      excluded "$f" && continue
      [ -f "$f" ] || continue
      printf '%s\t%s\t%s\n' "$f" "$(wc -c < "$f" | tr -d ' ')" "$(sha "$f")"
    done | LC_ALL=C sort
}

latest() { [ -d "$snaps" ] && ls -1 "$snaps" 2>/dev/null | LC_ALL=C sort | tail -1; }

do_checkpoint() {
  label=${1:-}
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$snaps"
  # Written to a temp directory and moved into place, so a snapshot is never
  # half-written if this is interrupted mid-run.
  tmp=$(mktemp -d "$state/.tmp.XXXXXX")
  trap 'rm -rf "$tmp"' EXIT HUP INT TERM

  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
  head=$(git rev-parse HEAD 2>/dev/null || echo none)
  git status --porcelain=v1 > "$tmp/status.txt" 2>/dev/null || : > "$tmp/status.txt"
  git diff --staged > "$tmp/staged.diff" 2>/dev/null || : > "$tmp/staged.diff"
  git diff > "$tmp/unstaged.diff" 2>/dev/null || : > "$tmp/unstaged.diff"
  untracked_manifest > "$tmp/untracked.tsv" || : > "$tmp/untracked.tsv"
  tracked_manifest > "$tmp/tracked.tsv" || : > "$tmp/tracked.tsv"

  # Copy small untracked text files so their content can be recovered, not just
  # their existence. Anything larger or binary is recorded by hash only.
  mkdir -p "$tmp/untracked"
  : > "$tmp/hash-only.txt"
  while IFS="$(printf '\t')" read -r f size _; do
    [ -n "${f:-}" ] || continue
    if [ "$size" -gt "$max_bytes" ] || ! is_text "$f"; then
      # Recorded by hash so a change is still detected, but the content is not
      # copied: see "What is not captured" in AGENTS.md.
      printf '%s\n' "$f" >> "$tmp/hash-only.txt"
      continue
    fi
    mkdir -p "$tmp/untracked/$(dirname "$f")"
    cp "$f" "$tmp/untracked/$f"
  done < "$tmp/untracked.tsv"

  printf '{"timestamp":"%s","label":"%s","branch":"%s","head":"%s","tracked":%s,"untracked":%s}\n' \
    "$stamp" "$label" "$branch" "$head" \
    "$(wc -l < "$tmp/tracked.tsv" | tr -d ' ')" \
    "$(wc -l < "$tmp/untracked.tsv" | tr -d ' ')" > "$tmp/meta.json"

  mv "$tmp" "$snaps/$stamp"
  trap - EXIT HUP INT TERM

  # Bounded storage: keep only the most recent snapshots.
  count=$(ls -1 "$snaps" | wc -l | tr -d ' ')
  if [ "$count" -gt "$keep" ]; then
    ls -1 "$snaps" | LC_ALL=C sort | head -n $((count - keep)) |
      while IFS= read -r old; do rm -rf "${snaps:?}/$old"; done
  fi
  printf 'checkpoint %s  %s  %s files changed, %s untracked%s\n' \
    "$stamp" "$branch" \
    "$(wc -l < "$snaps/$stamp/tracked.tsv" | tr -d ' ')" \
    "$(wc -l < "$snaps/$stamp/untracked.tsv" | tr -d ' ')" \
    "${label:+  [$label]}"
}

do_recover() {
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)
  head=$(git rev-parse HEAD 2>/dev/null || echo none)
  last=$(latest || true)

  echo "== recovery =="
  printf 'now       %s  branch %s  head %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$branch" "$(echo "$head" | cut -c1-8)"

  if [ -z "${last:-}" ]; then
    echo "no checkpoint yet; reporting current uncommitted work only"
  else
    prev_branch=$(sed -n 's/.*"branch":"\([^"]*\)".*/\1/p' "$snaps/$last/meta.json")
    prev_head=$(sed -n 's/.*"head":"\([^"]*\)".*/\1/p' "$snaps/$last/meta.json")
    printf 'checkpoint %s  branch %s  head %s\n' "$last" "$prev_branch" "$(echo "$prev_head" | cut -c1-8)"
    [ "$prev_head" = "$head" ] || echo "NOTE: HEAD moved since the checkpoint (commit or checkout happened)"
    [ "$prev_branch" = "$branch" ] || echo "NOTE: branch changed since the checkpoint"
  fi

  # The filesystem is always the source of truth, so edits made after the last
  # checkpoint are still discovered after an abrupt cutoff.
  cur=$(mktemp); curu=$(mktemp)
  trap 'rm -f "$cur" "$curu"' EXIT HUP INT TERM
  tracked_manifest > "$cur" || :
  untracked_manifest > "$curu" || :

  echo
  echo "-- uncommitted now --"
  if [ -s "$cur" ] || [ -s "$curu" ]; then
    [ -s "$cur" ] && awk -F'\t' '{printf "  modified   %s\n", $1}' "$cur"
    [ -s "$curu" ] && awk -F'\t' '{printf "  untracked  %s\n", $1}' "$curu"
  else
    echo "  working tree clean"
  fi

  if [ -n "${last:-}" ]; then
    echo
    echo "-- changed since checkpoint $last --"
    changed=0
    for kind in tracked untracked; do
      case "$kind" in tracked) now="$cur"; was="$snaps/$last/tracked.tsv" ;;
                      untracked) now="$curu"; was="$snaps/$last/untracked.tsv" ;; esac
      [ -f "$was" ] || continue
      # Compare path+hash, so a file edited after the checkpoint is flagged even
      # though it was already dirty at checkpoint time.
      while IFS="$(printf '\t')" read -r f _ h; do
        [ -n "${f:-}" ] || continue
        old=$(LC_ALL=C grep -F "$(printf '%s\t' "$f")" "$was" 2>/dev/null | head -1 | cut -f3 || true)
        if [ -z "${old:-}" ]; then printf '  NEW        %s (%s)\n' "$f" "$kind"; changed=1
        elif [ "$old" != "$h" ]; then printf '  EDITED     %s (%s)\n' "$f" "$kind"; changed=1; fi
      done < "$now"
      while IFS="$(printf '\t')" read -r f _ _; do
        [ -n "${f:-}" ] || continue
        LC_ALL=C grep -qF "$(printf '%s\t' "$f")" "$now" 2>/dev/null ||
          printf '  GONE       %s (%s, reverted or committed)\n' "$f" "$kind"
      done < "$was"
    done
    [ "$changed" = 0 ] && echo "  (no content changes since the checkpoint)"
    echo
    echo "  snapshot dir: $snaps/$last"
    echo "  saved copies of small untracked text files: $snaps/$last/untracked/"
    if [ -s "$snaps/$last/hash-only.txt" ]; then
      echo "  recorded by hash only, content NOT recoverable from the snapshot:"
      sed 's/^/    /' "$snaps/$last/hash-only.txt"
    fi
  fi
  rm -f "$cur" "$curu"; trap - EXIT HUP INT TERM
  echo
  echo "Treat any edit above as UNVERIFIED until its tests are re-run."
  echo "Next action: see ai/HANDOFF.md"
}

case "${1:-}" in
  checkpoint) shift; do_checkpoint "${1:-}" ;;
  recover) do_recover ;;
  status)
    last=$(latest || true)
    printf 'branch %s  head %s  last checkpoint %s  dirty %s\n' \
      "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)" \
      "$(git rev-parse --short HEAD 2>/dev/null || echo none)" \
      "${last:-none}" "$(git status --porcelain | wc -l | tr -d ' ')" ;;
  *) echo "usage: ai/checkpoint.sh {checkpoint [label]|recover|status}" >&2; exit 2 ;;
esac
