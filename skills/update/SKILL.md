---
description: Update the slop-analyser plugin to the latest version on its marketplace
disable-model-invocation: true
allowed-tools: Bash(claude plugin marketplace update:*), Bash(claude plugin update:*)
---

Run `claude plugin marketplace update slop-analyser`, then `claude plugin update slop-analyser@slop-analyser`, as two separate Bash calls exactly as written: not joined with `&&` or `;`, not prefixed with `cd`, and not via an absolute path to the binary, so they match the allowed commands. If `claude` is not found, tell the user to run `/plugin` and update slop-analyser from there. If either command fails otherwise, show its output and stop.

Reply with the result line the update command printed, as printed (e.g. `Plugin "slop-analyser" updated from 0.3.1 to 0.3.2 ...` or `slop-analyser is already at the latest version (0.3.2).`). When it updated, add that it applies after restarting Claude Code. Do not edit settings or reinstall the plugin.
