import { readFileSync } from 'node:fs';
import { messageCost } from './cost.mjs';
import { joinRuns, Ledger, multisetDiff, patchLines } from './ledger.mjs';
import { findSmells } from './smells.mjs';

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write']);
// The node:test summary lines catch failures whose exit code was lost in a pipe (`node --test | tail`).
// FAIL only counts at the start of a line, where jest, vitest and go print it, so grep output that mentions it does not.
const FAILURE_TEXT = /\b[1-9]\d* (failing|failed)\b|^\s*(--- )?FAIL\b|error TS\d+|Traceback \(most recent call last\)|^(# |ℹ )fail [1-9]\d*$/m;
const REJECTED = /^The user doesn't want to proceed with this tool use/;

export function readTranscript(path) {
  const entries = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // The last line can be partial while the session is still writing.
    }
  }
  return entries;
}

const splitLines = (text) => (text ? text.split('\n') : []);

// Merges several transcripts into one stream ordered by time. A line with no timestamp keeps the time of the
// line before it in its own file (or the first timestamp after it), so it stays next to its neighbours.
export function mergeByTime(transcripts) {
  let order = 0;
  const timed = transcripts.flatMap((entries) => {
    const times = entries.map((entry) => Date.parse(entry.timestamp ?? '') || null);
    for (let i = 1; i < times.length; i++) times[i] ??= times[i - 1];
    for (let i = times.length - 2; i >= 0; i--) times[i] ??= times[i + 1];
    return entries.map((entry, i) => ({ entry, order: order++, time: times[i] ?? 0 }));
  });
  return timed.sort((a, b) => a.time - b.time || a.order - b.order).map(({ entry }) => entry);
}

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  return (block.content ?? []).map((part) => part.text ?? '').join('\n');
}

function isPrompt(entry) {
  if (entry.isMeta || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && !content.some((block) => block.type === 'tool_result');
}

function promptText(content) {
  const text = typeof content === 'string' ? content : content.find((block) => block.type === 'text')?.text ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function editLines(tool, result, ledger) {
  const { name, input } = tool;
  if (Array.isArray(result?.structuredPatch) && result.structuredPatch.length) return patchLines(result.structuredPatch);
  const diffEdit = (edit) => {
    const { removed, added } = multisetDiff(splitLines(edit.old_string), splitLines(edit.new_string));
    if (!edit.replace_all) return { removed, added };
    const copies = ledger.copies(input.file_path, splitLines(edit.old_string));
    return { removed: Array(copies).fill(removed).flat(), added: joinRuns(Array(copies).fill(added)) };
  };
  if (name === 'Edit') return diffEdit(input);
  if (name === 'MultiEdit') {
    const diffs = (input.edits ?? []).map(diffEdit);
    return { removed: diffs.flatMap((d) => d.removed), added: joinRuns(diffs.map((d) => d.added)) };
  }
  const next = splitLines(input.content);
  if (typeof result?.originalFile === 'string') return multisetDiff(splitLines(result.originalFile), next);
  return multisetDiff(ledger.liveText(input.file_path), next.map((line) => line.trim()));
}

export function analyse(entries, pricing) {
  const messages = new Map();
  const tools = new Map();
  const turns = [{ index: 0, prompt: '(before first prompt)' }];
  const ledger = new Ledger();
  let failures = 0;
  let failuresAtTurnStart = 0;

  for (const entry of entries) {
    const message = entry.message;
    if (entry.type === 'assistant' && message) {
      // One API response is split across several lines that share message.id and repeat usage.
      const existing = messages.get(message.id);
      if (existing) existing.usage = message.usage ?? existing.usage;
      else messages.set(message.id, { id: message.id, model: message.model, usage: message.usage, turn: turns.length - 1 });
      for (const block of Array.isArray(message.content) ? message.content : []) {
        if (block.type === 'tool_use') tools.set(block.id, { name: block.name, input: block.input ?? {}, messageId: message.id });
      }
      continue;
    }
    if (entry.type !== 'user' || !message) continue;
    if (isPrompt(entry)) {
      turns.push({ index: turns.length, prompt: promptText(message.content) });
      failuresAtTurnStart = failures;
      continue;
    }
    const results = (Array.isArray(message.content) ? message.content : []).filter((block) => block.type === 'tool_result');
    for (const block of results) {
      const tool = tools.get(block.tool_use_id);
      if (!tool) continue;
      // Only a failing command counts as a failure: a failed Edit or Read, or a rejected call, is not something to fix.
      const text = resultText(block);
      if (tool.name === 'Bash' && ((block.is_error && !REJECTED.test(text)) || FAILURE_TEXT.test(text))) failures++;
      if (block.is_error) continue;
      if (!EDIT_TOOLS.has(tool.name) || !tool.input.file_path) continue;
      const result = results.length === 1 ? entry.toolUseResult : null;
      const { removed, added } = editLines(tool, result, ledger);
      ledger.apply(tool.input.file_path, removed, added, {
        messageId: tool.messageId,
        turn: messages.get(tool.messageId).turn,
        failures,
        failuresAtTurnStart,
      });
    }
  }

  return summarise(messages, turns, ledger, pricing);
}

function summarise(messages, turns, ledger, pricing) {
  const unpriced = new Set();
  const costOf = new Map();
  for (const msg of messages.values()) {
    const cost = messageCost(msg.model, msg.usage, pricing);
    if (cost === null) unpriced.add(msg.model);
    costOf.set(msg.id, cost ?? 0);
  }

  // A message's whole cost (input, cache and output) is spread evenly over the lines it wrote.
  const writtenPerMessage = new Map();
  for (const line of ledger.lines) writtenPerMessage.set(line.writtenBy, (writtenPerMessage.get(line.writtenBy) ?? 0) + 1);
  const lineCost = (line) => costOf.get(line.writtenBy) / writtenPerMessage.get(line.writtenBy);

  const rows = turns.map((turn) => ({
    turn: turn.index,
    prompt: turn.prompt,
    cost: 0,
    written: 0,
    rework: 0,
    unprompted: 0,
    wastedCost: 0,
    reworkCost: 0,
  }));
  for (const msg of messages.values()) rows[msg.turn].cost += costOf.get(msg.id);
  for (const line of ledger.lines) {
    const row = rows[line.turn];
    row.written++;
    if (!line.removedBy) continue;
    if (line.reactive) {
      row.rework++;
      row.reworkCost += lineCost(line);
    } else {
      row.unprompted++;
      row.wastedCost += lineCost(line);
    }
  }

  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const totalCost = sum('cost');
  const written = sum('written');
  const rework = sum('rework');
  const unprompted = sum('unprompted');
  const wastedCost = sum('wastedCost');
  return {
    summary: {
      totalCost,
      codeCost: [...writtenPerMessage.keys()].reduce((total, id) => total + costOf.get(id), 0),
      messages: messages.size,
      turns: turns.length - 1,
      linesWritten: written,
      linesSurviving: written - unprompted - rework,
      linesRework: rework,
      linesUnprompted: unprompted,
      reworkCost: sum('reworkCost'),
      wastedCost,
      slopLineRatio: written ? unprompted / written : 0,
      slopCostRatio: totalCost ? wastedCost / totalCost : 0,
      unpricedModels: [...unpriced].filter(Boolean),
    },
    turns: rows.filter((row) => row.cost > 0 || row.written > 0),
    files: fileTable(ledger.lines),
    smells: findSmells(ledger.lines),
  };
}

function fileTable(lines) {
  const files = new Map();
  for (const line of lines) {
    if (!files.has(line.file)) files.set(line.file, { file: line.file, written: 0, surviving: 0, churned: 0 });
    const row = files.get(line.file);
    row.written++;
    if (line.removedBy) row.churned++;
    else row.surviving++;
  }
  return [...files.values()].sort((a, b) => b.churned - a.churned || b.written - a.written);
}
