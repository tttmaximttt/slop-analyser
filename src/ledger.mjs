// Tracks who wrote each line and whether it survived. Matching is by trimmed text within a file,
// because transcripts give hunks, not a full file history: a removed line is attributed to the most
// recent live line with the same text. Lines that are blank or bare punctuation are not tracked.
// A removal is rework when a tool failed after the line was written and within the current prompt's turn.
// An added list may hold null where the written lines are not next to each other in the file; lines between
// two nulls share a segment, which is what the duplicate check treats as contiguous.

const TRIVIAL = /^[\s{}()[\];,]*$/;

export class Ledger {
  constructor() {
    this.files = new Map();
    this.lines = [];
    this.segments = 0;
  }

  live(file) {
    if (!this.files.has(file)) this.files.set(file, new Map());
    return this.files.get(file);
  }

  apply(file, removed, added, ctx) {
    const live = this.live(file);
    for (const text of removed) {
      const key = text.trim();
      if (TRIVIAL.test(key)) continue;
      const line = live.get(key)?.pop();
      if (!line) continue;
      line.removedBy = ctx.messageId;
      line.reactive = ctx.failures > Math.max(line.failuresAtWrite, ctx.failuresAtTurnStart);
    }
    let segment = ++this.segments;
    for (const text of added) {
      if (text === null) {
        segment = ++this.segments;
        continue;
      }
      const key = text.trim();
      if (TRIVIAL.test(key)) continue;
      const line = {
        file,
        text,
        writtenBy: ctx.messageId,
        segment,
        turn: ctx.turn,
        failuresAtWrite: ctx.failures,
        removedBy: null,
      };
      this.lines.push(line);
      if (!live.has(key)) live.set(key, []);
      live.get(key).push(line);
    }
  }

  // How many copies of a snippet the file holds, judged by its rarest tracked line; at least one.
  copies(file, lines) {
    const live = this.live(file);
    const counts = lines
      .map((text) => text.trim())
      .filter((key) => !TRIVIAL.test(key))
      .map((key) => live.get(key)?.length ?? 0);
    return counts.length ? Math.max(1, Math.min(...counts)) : 1;
  }

  liveText(file) {
    return [...this.live(file).entries()].flatMap(([key, lines]) => lines.map(() => key));
  }
}

// Marks a break in the added lines, unless one is already there.
const gap = (added) => added.length && added.at(-1) !== null && added.push(null);

// Concatenates lists of added lines that are not next to each other in the file.
export const joinRuns = (lists) => lists.flatMap((list, i) => (i ? [null, ...list] : list));

export function multisetDiff(before, after) {
  const counts = new Map();
  for (const line of before) counts.set(line, (counts.get(line) ?? 0) + 1);
  const added = [];
  for (const line of after) {
    const n = counts.get(line) ?? 0;
    if (n > 0) {
      counts.set(line, n - 1);
      gap(added);
    } else added.push(line);
  }
  const removed = [...counts.entries()].flatMap(([line, n]) => Array(n).fill(line));
  return { removed, added };
}

export function patchLines(structuredPatch) {
  const removed = [];
  const added = [];
  for (const hunk of structuredPatch) {
    gap(added);
    for (const line of hunk.lines ?? []) {
      if (line.startsWith('-')) removed.push(line.slice(1));
      else if (line.startsWith('+')) added.push(line.slice(1));
      else gap(added);
    }
  }
  return { removed, added };
}
