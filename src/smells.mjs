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
  const surviving = lines.filter((line) => !line.removedBy && CODE.has(extname(line.file)));
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
  const duplicates = findDuplicateBlocks(surviving);
  return [...hits.values(), duplicates].filter((hit) => hit.count > 0);
}

// A block counts as duplicated when the same WINDOW consecutive lines, from one write, appear in another write.
function findDuplicateBlocks(surviving) {
  const runs = new Map();
  for (const line of surviving) {
    const key = `${line.file}\0${line.writtenBy}`;
    if (!runs.has(key)) runs.set(key, []);
    runs.get(key).push(line);
  }
  const seen = new Map();
  for (const [runKey, run] of runs) {
    for (let i = 0; i + WINDOW <= run.length; i++) {
      const block = run.slice(i, i + WINDOW).map((line) => line.text.trim()).join('\n');
      if (!seen.has(block)) seen.set(block, new Map());
      seen.get(block).set(runKey, run[i].file);
    }
  }
  const hit = { id: 'duplicate', label: `duplicated ${WINDOW}-line block`, count: 0, examples: [] };
  for (const [block, where] of seen) {
    if (where.size < 2) continue;
    hit.count++;
    if (hit.examples.length < 3) hit.examples.push(`${[...new Set(where.values())].join(', ')}: ${block.split('\n')[0]}`);
  }
  return hit;
}
