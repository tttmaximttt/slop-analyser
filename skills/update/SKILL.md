---
description: Update the slop-analyser plugin to the latest version on its marketplace
disable-model-invocation: true
allowed-tools: Bash(claude plugin marketplace update:*), Bash(claude plugin update:*)
---

Run `claude plugin marketplace update slop-analyser`, then `claude plugin update slop-analyser@slop-analyser`. If either command fails, show its output and stop.

Reply in one line with the version change from the update output (or that it is already on the latest version). When it changed, add that it applies after restarting Claude Code. Do not edit settings or reinstall the plugin.
