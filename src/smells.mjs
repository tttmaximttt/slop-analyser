import { extname } from 'node:path';

const CODE = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.py', '.go', '.rb', '.java', '.kt', '.cs', '.php', '.rs', '.sh']);
const TYPED = new Set(['.ts', '.tsx']);
const HASH_COMMENTS = new Set(['.py', '.rb', '.sh']);

const RULES = [
  {
    id: 'comment',
    label: 'comment added to source',
    test: (text, ext) => (HASH_COMMENTS.has(ext) ? /(^|\s)#(?!!)/ : /(^|\s)\/\/(\s|$)|^\s*(\/\*|\*(?![*/]))/).test(text),
  },
  { id: 'any', label: 'any type', test: (text, ext) => TYPED.has(ext) && /\bas any\b|:\s*any\b|<any>/.test(text) },
  { id: 'suppression', label: 'lint/type suppression', test: (text) => /@ts-ignore|@ts-expect-error|eslint-disable|type:\s*ignore|# noqa/.test(text) },
  { id: 'debug', label: 'debug output', test: (text) => /\bconsole\.(log|debug)\(|\bdebugger;/.test(text) },
  { id: 'todo', label: 'TODO/FIXME left behind', test: (text) => /\b(TODO|FIXME|XXX)\b/.test(text) },
  { id: 'empty-catch', label: 'swallowed error', test: (text) => /catch\s*(\([^)]*\))?\s*\{\s*\}|except(\s+\w+)?:\s*pass\b/.test(text) },
];

const WINDOW = 4;

export function findSmells(lines) {
  const code = lines.filter((line) => CODE.has(extname(line.file)));
  const surviving = code.filter((line) => !line.removedBy);
  const hits = new Map(RULES.map((rule) => [rule.id, { id: rule.id, label: rule.label, count: 0, examples: [] }]));
  for (const line of surviving) {
    const ext = extname(line.file);
    for (const rule of RULES) {
      if (!rule.test(line.text, ext)) continue;
      const hit = hits.get(rule.id);
      hit.count++;
      if (hit.examples.length < 3) hit.examples.push(`${line.file}: ${line.text.trim()}`);
    }
  }
  const duplicates = findDuplicateBlocks(code);
  return [...hits.values(), duplicates].filter((hit) => hit.count > 0);
}

// Splits the lines into runs that sit next to each other in the file: one segment of one write, cut wherever
// a line was later removed.
function contiguousRuns(lines) {
  const runs = [];
  const open = new Map();
  for (const line of lines) {
    if (line.removedBy) {
      open.delete(line.segment);
      continue;
    }
    if (!open.has(line.segment)) {
      const run = [];
      runs.push(run);
      open.set(line.segment, run);
    }
    open.get(line.segment).push(line);
  }
  return runs;
}

// A block counts as duplicated when the same WINDOW consecutive lines appear twice without overlapping,
// in another run or further along the same one. Overlapping duplicated windows form one block, counted once
// however many copies it has.
function findDuplicateBlocks(lines) {
  const runs = contiguousRuns(lines).map((run) => ({
    file: run[0].file,
    windows: Array.from({ length: Math.max(0, run.length - WINDOW + 1) }, (_, i) =>
      run.slice(i, i + WINDOW).map((line) => line.text.trim()).join('\n'),
    ),
  }));
  const seen = new Map();
  runs.forEach(({ file, windows }, r) => {
    windows.forEach((block, i) => {
      if (!seen.has(block)) seen.set(block, []);
      seen.get(block).push({ r, i, file });
    });
  });
  const blocks = new Map();
  runs.forEach(({ windows }, r) => {
    let inBlock = false;
    windows.forEach((block, i) => {
      const copies = seen.get(block);
      const duplicated = copies.some((copy) => copy.r !== r || Math.abs(copy.i - i) >= WINDOW);
      if (duplicated && !inBlock && !blocks.has(block)) blocks.set(block, copies);
      inBlock = duplicated;
    });
  });
  const hit = { id: 'duplicate', label: `duplicated ${WINDOW}-line block`, count: blocks.size, examples: [] };
  for (const [block, copies] of [...blocks].slice(0, 3)) {
    hit.examples.push(`${[...new Set(copies.map((copy) => copy.file))].join(', ')}: ${block.split('\n')[0]}`);
  }
  return hit;
}
