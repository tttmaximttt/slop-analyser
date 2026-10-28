#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { analyse, readTranscript } from '../src/analyse.mjs';
import { loadPricing } from '../src/cost.mjs';
import { formatReport } from '../src/format.mjs';

const USAGE = `Usage: slop-report [transcript.jsonl ...] [options]

Reads Claude Code session transcripts and reports code churn and the spend behind it.
Runs locally; it makes no API calls.

Options:
  --latest            Use the newest session of the project in --project (default: cwd)
  --project <dir>     Project directory whose sessions to look up
  --no-subagents      Ignore <session>/subagents/*.jsonl next to each transcript
  --json              Print the full report as JSON
  --top <n>           Rows per table (default 10)
  --pricing <file>    Alternative pricing.json
  -h, --help          Show this help`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    latest: { type: 'boolean' },
    project: { type: 'string' },
    'no-subagents': { type: 'boolean' },
    json: { type: 'boolean' },
    top: { type: 'string' },
    pricing: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || (!values.latest && positionals.length === 0)) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 1);
}

function fail(message) {
  console.error(`slop-report: ${message}`);
  process.exit(1);
}

// Claude Code names a project's folder after its path with every non-alphanumeric character as '-'.
function latestTranscript(projectDir) {
  const dir = join(homedir(), '.claude', 'projects', projectDir.replace(/[^a-zA-Z0-9]/g, '-'));
  if (!existsSync(dir)) fail(`no sessions found in ${dir}`);
  const newest = readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => join(dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!newest) fail(`no .jsonl transcripts in ${dir}`);
  return newest;
}

function withSubagents(path) {
  const dir = join(dirname(path), basename(path, '.jsonl'), 'subagents');
  if (values['no-subagents'] || !existsSync(dir)) return [path];
  return [path, ...readdirSync(dir).filter((name) => name.endsWith('.jsonl')).map((name) => join(dir, name))];
}

const roots = values.latest ? [latestTranscript(values.project ?? process.cwd())] : positionals;
for (const path of roots) if (!existsSync(path)) fail(`not found: ${path}`);

const entries = roots
  .flatMap(withSubagents)
  .flatMap(readTranscript)
  .map((entry, order) => ({ entry, order, time: Date.parse(entry.timestamp ?? '') || 0 }))
  .sort((a, b) => a.time - b.time || a.order - b.order)
  .map(({ entry }) => entry);

const report = analyse(entries, loadPricing(values.pricing));
if (values.json) console.log(JSON.stringify({ transcripts: roots, ...report }, null, 2));
else console.log(`${roots.join('\n')}\n\n${formatReport(report, { top: Number(values.top ?? 10) })}`);
