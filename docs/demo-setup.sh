#!/bin/sh
# Copies one real session of this repo (and its subagent transcripts) to $DEMO_DIR with local paths
# rewritten, so docs/demo.tape can record slop-report on real data without showing the home directory.
# Usage: DEMO_SESSION=<session id> sh docs/demo-setup.sh   (run from the repo root)
set -eu

repo=$(pwd)
project="$HOME/.claude/projects/$(printf '%s' "$repo" | sed 's/[^a-zA-Z0-9]/-/g')"
session=${DEMO_SESSION:?set DEMO_SESSION to a session id of this repo}
out=${DEMO_DIR:-/tmp/slop-demo}
user_slug=$(printf '%s' "$HOME" | sed 's/[^a-zA-Z0-9]/-/g')

redact() {
  sed -e "s|/private/tmp/claude-[0-9]*/[^\"/]*/[^\"/]*/scratchpad|/tmp/scratch|g" \
      -e "s|$repo|.|g" \
      -e "s|$HOME|~|g" \
      -e "s|$user_slug|-Users-me|g" \
      -e "s|${USER:-$(id -un)}|me|g" "$1" > "$2"
}

rm -rf "$out"
mkdir -p "$out/session/subagents"
redact "$project/$session.jsonl" "$out/session.jsonl"
if [ -d "$project/$session/subagents" ]; then
  for f in "$project/$session/subagents"/*.jsonl; do redact "$f" "$out/session/subagents/$(basename "$f")"; done
fi
