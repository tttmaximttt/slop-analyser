import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const bin = new URL('../bin/slop-report', import.meta.url).pathname;
const home = realpathSync(mkdtempSync(join(tmpdir(), 'slop-home-')));
const project = realpathSync(mkdtempSync(join(tmpdir(), 'slop-project-')));
const sessions = join(home, '.claude', 'projects', project.replace(/[^a-zA-Z0-9]/g, '-'));
mkdirSync(sessions, { recursive: true });
after(() => [home, project].forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const usage = { output_tokens: 1_000_000 };
const write = (n) => [
  { type: 'user', message: { role: 'user', content: `prompt ${n}` } },
  {
    type: 'assistant',
    message: { id: `m${n}`, model: 'claude-sonnet-5-5', usage, content: [{ type: 'tool_use', id: `t${n}`, name: 'Write', input: { file_path: `/repo/${n}.js`, content: `let v${n} = 1;` } }] },
  },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${n}`, content: 'ok' }] } },
];
writeFileSync(join(sessions, 's1.jsonl'), [1, 2, 3].flatMap(write).map((e) => JSON.stringify(e)).join('\n'));

const run = (...args) => spawnSync('node', [bin, ...args], { cwd: project, env: { ...process.env, HOME: home }, encoding: 'utf8' });

test('finds a session by id in the project given as a relative path, and limits tables to --top rows', () => {
  const { status, stdout } = run('--session', 's1', '--project', '.', '--top', '1');
  assert.equal(status, 0);
  assert.match(stdout, /Lines written \(Edit\/MultiEdit\/Write\)\s+3/);
  assert.equal(stdout.match(/^\d+\s+\$/gm).length, 1);
});

test('rejects a --top that is not a positive whole number', () => {
  for (const top of ['abc', '0', '-1', '1.5']) {
    const { status, stderr } = run('--latest', `--top=${top}`);
    assert.equal(status, 1, top);
    assert.match(stderr, /--top must be a positive whole number/);
  }
});
