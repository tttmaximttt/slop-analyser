#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MARKETPLACE = 'slop-analyser';
const PLUGIN = `slop-analyser@${MARKETPLACE}`;

const USAGE = `Usage: slop-analyser <command>

Commands:
  setup    Register this package as a Claude Code plugin (rerun after npm update)
  remove   Uninstall the plugin and its marketplace

The report itself is the separate slop-report command.`;

function claude(...args) {
  return execFileSync('claude', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function hasClaude() {
  try {
    claude('--version');
    return true;
  } catch {
    return false;
  }
}

function setup() {
  // Re-add rather than update, so the marketplace always points at this installed copy.
  if (claude('plugin', 'marketplace', 'list').includes(MARKETPLACE)) claude('plugin', 'marketplace', 'remove', MARKETPLACE);
  claude('plugin', 'marketplace', 'add', ROOT);
  const installed = claude('plugin', 'list').includes(PLUGIN);
  claude('plugin', installed ? 'update' : 'install', PLUGIN);
  console.log(`${installed ? 'Updated' : 'Installed'} ${PLUGIN} from ${ROOT}`);
  console.log('Start a new Claude Code session, or run /reload-plugins in an open one.');
}

function remove() {
  claude('plugin', 'uninstall', PLUGIN);
  claude('plugin', 'marketplace', 'remove', MARKETPLACE);
  console.log(`Removed ${PLUGIN}`);
}

const command = process.argv[2];
const commands = { setup, remove };
if (!commands[command]) {
  console.log(USAGE);
  process.exit(command === '-h' || command === '--help' ? 0 : 1);
}
if (!hasClaude()) {
  console.error(`slop-analyser: the claude command is not on PATH. In Claude Code, run instead:
  /plugin marketplace add ${ROOT}
  /plugin install ${PLUGIN}`);
  process.exit(1);
}
try {
  commands[command]();
} catch (error) {
  console.error(`slop-analyser: ${error.stderr?.trim() || error.message}`);
  process.exit(1);
}
