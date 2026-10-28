import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));

test('package.json, plugin.json and marketplace.json versions agree', () => {
  const { version } = json('../.claude-plugin/plugin.json');
  assert.equal(version, json('../package.json').version);
  const entry = json('../.claude-plugin/marketplace.json').plugins.find((p) => p.name === 'slop-analyser');
  assert.ok(entry, 'marketplace.json has no slop-analyser entry');
  if ('version' in entry) assert.equal(entry.version, version);
});
