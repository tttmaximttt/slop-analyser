# slop-analyser

Measures how much of a Claude Code session's spend went into code that was later thrown away, and gives you two agents to clean up what survived.

- `slop-report` reads a session transcript (`~/.claude/projects/<project>/<session>.jsonl`) and reports cost, lines written, lines rewritten, and static smells in what remains. It runs locally and makes no API calls, so it costs no tokens.
- `slop-cleaner` is a Claude Code subagent based on the oh-my-claudecode `ai-slop-cleaner` workflow: measure, lock behaviour, plan, one smell per pass, gates, fixed report.
- `slop-reviewer` is a read-only subagent that reviews a cleaner pass and returns a verdict, keeping writer and reviewer separate.

## Install

In Claude Code:

```
/plugin install slop-analyser --marketplace tttmaximttt/slop-analyser
```

On versions before 2.1.275, add the marketplace first:

```
/plugin marketplace add tttmaximttt/slop-analyser
/plugin install slop-analyser@slop-analyser
```

That gives you:

| Component | Use |
| --- | --- |
| `/slop-analyser:slop-report` | Prints the report for the current session |
| `slop-analyser:slop-cleaner` agent | Cleans up the session's code |
| `slop-analyser:slop-reviewer` agent | Reviews a cleanup without editing |
| `slop-report` command | On the Bash tool's PATH while the plugin is enabled |

Requires Node 20 or later. No dependencies.

To run the report outside Claude Code too, for example in a terminal or CI, without touching the session:

```sh
npx github:tttmaximttt/slop-analyser --latest
```

## slop-report

```sh
slop-report --latest                      # newest session for the current directory
slop-report --latest --project ~/code/api # newest session for another project
slop-report path/to/session.jsonl --json  # full report as JSON
```

Subagent transcripts in `<session>/subagents/*.jsonl` are included unless you pass `--no-subagents`.

What it counts:

| Measure | How |
| --- | --- |
| Cost | Each API response's usage (input, 5m and 1h cache writes, cache reads, output, fast mode) priced from `pricing.json`. A response split across several transcript lines is counted once. |
| Lines written | `+` lines from Edit, MultiEdit and Write. Blank lines and bare punctuation are ignored. |
| Rework | A line the session wrote, then removed after a tool failure (a failing command or test) in the same prompt's turn. This is normal iteration. |
| Slop | A line the session wrote, then removed with no failure prompting it. |
| Wasted cost | Each response's full cost is spread evenly over the lines it wrote; the share belonging to slop lines is wasted. |
| Smells | On surviving lines in code files: comments added to source, `any`, lint and type suppressions, debug output, TODOs, swallowed errors, duplicated 4-line blocks. |

### Limits

- The transcript format is not documented and can change between Claude Code releases.
- Edits made through Bash (`sed`, heredocs, `git checkout`, formatters, code generators) are not in the transcript as edits, so churn is undercounted.
- Removed lines are matched to earlier writes by text within the same file, so identical lines can be attributed to the wrong write.
- Per-line cost is an even split of a response's cost over the lines it wrote; one response that writes several files shares its cost among all of them.
- Prices in `pricing.json` are Anthropic first-party API rates as of October 2026. Verify them before relying on the dollar figures, and add any model the report lists as unpriced.

## Agents

Mention them with `@`, or ask for them by name:

```
@agent-slop-analyser:slop-cleaner session
@agent-slop-analyser:slop-cleaner src/orders/service.ts src/orders/mapper.ts
@agent-slop-analyser:slop-reviewer review the last slop-cleaner pass
```

`slop-cleaner` runs `slop-report` first to pick files and smells, locks behaviour with the narrowest tests, then cleans one bucket at a time (dead code, duplication, needless abstraction and boundary fixes, noise, tests), rerunning the lock after each. It ends with four sections: changed files, simplifications, behaviour lock and verification, remaining risks.

If you also run oh-my-claudecode, these agents do not replace its `ai-slop-cleaner` skill and do not collide with it: OMC blocks the `ai-slop-cleaner` subagent type, and these use different names. Avoid the words "deslop" and "anti-slop" in a prompt that should reach these agents, since OMC's keyword hook routes those to its own skill.

## Development

```sh
npm test
claude plugin validate .
claude --plugin-dir .          # try local changes without installing
```
