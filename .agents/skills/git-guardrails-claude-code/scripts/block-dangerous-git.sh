#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# `git` may carry global options before the subcommand (e.g. `-C <path>`,
# `-c <k=v>`, `--git-dir=...`), flags may be reordered or clustered
# (`clean -xfd`), and pathspecs may follow a `--` separator.
S='[[:space:]]'
W='[^[:space:]]'
GIT="git($S+-[cC]$S+$W+|$S+--?$W+)*"
FLAGS="($S+-$W+)*"

DANGEROUS_PATTERNS=(
  "$GIT$S+push"
  "$GIT$S+reset$S+--hard"
  "$GIT$S+clean$FLAGS$S+-[A-Za-z]*f"
  "$GIT$S+clean$FLAGS$S+--force"
  "$GIT$S+branch$FLAGS$S+-[A-Za-z]*D"
  "$GIT$S+checkout$FLAGS$S+(--$S+)?\."
  "$GIT$S+restore$FLAGS$S+(--$S+)?\."
  "push --force"
  "reset --hard"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qE "$pattern"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$pattern'. The user has prevented you from doing this." >&2
    exit 2
  fi
done

exit 0
