#!/usr/bin/env bash
# Frequent git autosave — guards against work loss from connection drops while
# running Claude Code. Commits all source changes (junk/binaries excluded via
# .gitignore). Invoked from BOTH the Claude Code Stop hook (after each turn) and
# a systemd timer every 3 min (so a mid-turn connection drop is still captured).
set -uo pipefail
cd /root/kuasaprestij || exit 0

# Anything to save? unstaged, staged, or new (non-ignored) untracked files.
if git diff --quiet && git diff --cached --quiet && \
   [ -z "$(git ls-files --others --exclude-standard)" ]; then
  exit 0
fi

git add -A
git commit -m "wip: autosave $(date +%Y-%m-%dT%H:%M:%S)" 2>/dev/null || true
