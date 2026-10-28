#!/usr/bin/env node
// Usage: next-version.mjs <published version or ""> [auto|patch|minor|major]
// Prints the next npm version. With "auto", the level comes from commit subjects since the last
// v* tag: "type!:" or "BREAKING CHANGE" is major, "feat:" is minor, anything else is patch.
// Nothing published yet means the first release, 0.1.0.
import { execFileSync } from 'node:child_process';

const [published = '', requested = 'auto'] = process.argv.slice(2);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function autoLevel() {
  let range = 'HEAD';
  try {
    range = `${git('describe', '--tags', '--abbrev=0', '--match', 'v*')}..HEAD`;
  } catch {
    // No release tag yet: consider every commit.
  }
  const log = git('log', '--format=%s%n%b', range);
  if (/^\w+(\(.+\))?!:|BREAKING CHANGE/m.test(log)) return 'major';
  if (/^feat(\(.+\))?:/m.test(log)) return 'minor';
  return 'patch';
}

if (!published) {
  console.log('0.1.0');
} else {
  const level = requested === 'auto' ? autoLevel() : requested;
  const [major, minor, patch] = published.split('.').map(Number);
  console.log({ major: `${major + 1}.0.0`, minor: `${major}.${minor + 1}.0`, patch: `${major}.${minor}.${patch + 1}` }[level]);
}
