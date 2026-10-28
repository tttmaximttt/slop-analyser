import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyse } from '../src/analyse.mjs';
import { loadPricing, messageCost } from '../src/cost.mjs';

const pricing = loadPricing();
const usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1_000_000 };

const prompt = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const call = (msgId, toolId, name, input) => ({
  type: 'assistant',
  message: { id: msgId, model: 'claude-sonnet-5-5', usage, content: [{ type: 'tool_use', id: toolId, name, input }] },
});
const result = (toolId, extra = {}, isError = false, content = isError ? 'Exit code 1' : 'ok') => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolId, content, is_error: isError }] },
  ...extra,
});

test('prices every usage bucket, including 1h cache writes and dated model ids', () => {
  const cost = messageCost(
    'claude-sonnet-4-5-20250929',
    {
      input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 1_000_000 },
    },
    pricing,
  );
  assert.equal(cost.toFixed(4), (3 + 0.3 + 15 + 3 * 1.25 + 3 * 2).toFixed(4));
  assert.equal(messageCost('claude-unknown', usage, pricing), null);
});

test('splits churn into rework after a failure and unprompted rewrites', () => {
  const file = '/repo/src/a.ts';
  const entries = [
    prompt('add helper'),
    call('m1', 't1', 'Write', { file_path: file, content: 'const a = 1;\nconst b = 2;\nconst c = 3;\n' }),
    result('t1', { toolUseResult: { type: 'create', filePath: file, content: '', structuredPatch: [] } }),
    call('m2', 't2', 'Bash', { command: 'npm test' }),
    result('t2', {}, true),
    call('m3', 't3', 'Edit', { file_path: file, old_string: 'const a = 1;', new_string: 'const a = 10;' }),
    result('t3'),
    prompt('tidy up'),
    call('m4', 't4', 'Edit', { file_path: file, old_string: 'const b = 2;', new_string: 'const b = 20; // tweak' }),
    result('t4', {
      toolUseResult: { filePath: file, structuredPatch: [{ lines: [' const a = 10;', '-const b = 2;', '+const b = 20; // tweak'] }] },
    }),
  ];
  const { summary, smells } = analyse(entries, pricing);
  assert.equal(summary.linesWritten, 5);
  assert.equal(summary.linesRework, 1);
  assert.equal(summary.linesUnprompted, 1);
  assert.equal(summary.linesSurviving, 3);
  // m1 cost $10 and wrote 3 lines, so each churned line carries $10/3.
  assert.equal(summary.wastedCost.toFixed(4), (10 / 3).toFixed(4));
  assert.equal(summary.reworkCost.toFixed(4), (10 / 3).toFixed(4));
  assert.deepEqual(smells.map((s) => s.id), ['comment']);
});

test('counts usage once when one response is split across lines', () => {
  const split = (block) => ({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-5-5', usage, content: [block] } });
  const { summary } = analyse([prompt('hi'), split({ type: 'thinking', thinking: '' }), split({ type: 'text', text: 'hello' })], pricing);
  assert.equal(summary.messages, 1);
  assert.equal(summary.totalCost, 10);
});

test('diffs MultiEdit inputs and flags a block repeated across writes', () => {
  const block = 'const x = load();\nconst y = parse(x);\nconst z = check(y);\nreturn save(z);';
  const entries = [
    prompt('copy it'),
    call('m1', 't1', 'Write', { file_path: '/repo/a.js', content: block }),
    result('t1'),
    call('m2', 't2', 'MultiEdit', {
      file_path: '/repo/b.js',
      edits: [
        { old_string: 'old();', new_string: block },
        { old_string: 'keep();', new_string: 'keep();\nextra();' },
      ],
    }),
    result('t2'),
  ];
  const { summary, smells } = analyse(entries, pricing);
  assert.equal(summary.linesWritten, 9);
  assert.deepEqual(
    smells.find((s) => s.id === 'duplicate'),
    { id: 'duplicate', label: 'duplicated 4-line block', count: 1, examples: ['/repo/a.js, /repo/b.js: const x = load();'] },
  );
});

test('a piped node:test summary with failures counts as a failure, one with none does not', () => {
  const file = '/repo/c.js';
  const run = (output) =>
    analyse(
      [
        prompt('fix it'),
        call('m1', 't1', 'Write', { file_path: file, content: 'let v = 1;' }),
        result('t1'),
        call('m2', 't2', 'Bash', { command: 'node --test | tail -2' }),
        result('t2', {}, false, output),
        call('m3', 't3', 'Edit', { file_path: file, old_string: 'let v = 1;', new_string: 'let v = 2;' }),
        result('t3'),
      ],
      pricing,
    ).summary;
  for (const output of ['# pass 1\n# fail 1', 'ℹ pass 3\nℹ fail 2', '# pass 0\n# fail 10']) {
    assert.equal(run(output).linesRework, 1, output);
  }
  for (const output of ['# pass 2\n# fail 0', '# fail 3 times then retry']) assert.equal(run(output).linesUnprompted, 1, output);
});

test('a write from a message with no id or usage is counted at no cost', () => {
  const write = call(undefined, 't1', 'Write', { file_path: '/repo/d.js', content: 'let d = 1;' });
  delete write.message.usage;
  const { summary } = analyse([prompt('go'), write, result('t1')], pricing);
  assert.equal(summary.linesWritten, 1);
  assert.equal(summary.codeCost, 0);
});

test('an overwrite with no patch removes the earlier lines it drops', () => {
  const file = '/repo/b.py';
  const entries = [
    prompt('write it'),
    call('m1', 't1', 'Write', { file_path: file, content: 'x = 1\ny = 2\n' }),
    result('t1'),
    call('m2', 't2', 'Write', { file_path: file, content: 'x = 1\nz = 3\n' }),
    result('t2'),
  ];
  const { summary } = analyse(entries, pricing);
  assert.equal(summary.linesWritten, 3);
  assert.equal(summary.linesUnprompted, 1);
});
