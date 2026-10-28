---
description: Report the current session's cost, code churn, and the spend behind code that was later discarded
argument-hint: "[transcript.jsonl] [--top n]"
disable-model-invocation: true
allowed-tools: Bash(slop-report:*)
---

Run `slop-report --latest $ARGUMENTS` from the project root, or `slop-report $ARGUMENTS` when the arguments name a transcript file. If `slop-report` is not on PATH, run `node ${CLAUDE_PLUGIN_ROOT}/bin/slop-report` with the same arguments.

Show the output as-is in a code block. Then add at most three lines: the slop level, the costliest turn by wasted spend, and the file with the most churn. Do not re-derive or re-price anything, and do not start cleaning up; if the user wants that, they can ask for the slop-cleaner agent.
