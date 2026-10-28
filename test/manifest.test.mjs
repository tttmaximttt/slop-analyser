import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const version = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).version;

test('package.json and plugin.json versions match', () => {
  assert.equal(version('../.claude-plugin/plugin.json'), version('../package.json'));
});
